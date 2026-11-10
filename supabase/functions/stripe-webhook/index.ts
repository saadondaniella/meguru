
import "@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "npm:stripe";
import { createClient } from "npm:@supabase/supabase-js@2";

// -----------------------------------------
// ENVIRONMENT VARIABLES
// -----------------------------------------

const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!stripeSecretKey || !webhookSecret) {
  throw new Error("Missing Stripe environment variables");
}

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing Supabase environment variables");
}

// -----------------------------------------
// CLIENTS
// -----------------------------------------

const stripe = new Stripe(stripeSecretKey);
const supabase = createClient(supabaseUrl, serviceRoleKey);

// -----------------------------------------
// TYPES
// -----------------------------------------

type CheckoutReservation = {
  id: string;
  listing_id: string;
  buyer_id: string;
  status: string;
  stripe_session_id: string | null;
};

// -----------------------------------------
// EXPIRED CHECKOUT
// -----------------------------------------

async function handleExpiredCheckout(
  session: Stripe.Checkout.Session,
): Promise<void> {
  const reservationId = session.metadata?.reservation_id;

  console.log("Expired Checkout session:", session.id);

  if (!reservationId) {
    console.log("Ignoring session without MEGURU reservation");
    return;
  }

  const { data: reservation, error } = await supabase
    .from("checkout_reservations")
    .select("id, status, stripe_session_id")
    .eq("id", reservationId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch reservation: ${error.message}`);
  }

  if (!reservation) {
    console.log("Reservation not found:", reservationId);
    return;
  }

  if (reservation.stripe_session_id !== session.id) {
    console.error("Stripe session does not match reservation");
    return;
  }

  if (reservation.status !== "pending") {
    console.log("Reservation already processed:", reservation.status);
    return;
  }

  const { data: expiredReservation, error: updateError } = await supabase
    .from("checkout_reservations")
    .update({ status: "expired" })
    .eq("id", reservation.id)
    .eq("stripe_session_id", session.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (updateError) {
    throw new Error(
      `Failed to expire reservation: ${updateError.message}`,
    );
  }

  if (expiredReservation) {
    console.log("MEGURU reservation expired:", expiredReservation.id);
  } else {
    console.log("Reservation was already processed");
  }
}

// -----------------------------------------
// SUCCESSFUL PAYMENT
// -----------------------------------------

async function handleSuccessfulPayment(
  session: Stripe.Checkout.Session,
): Promise<void> {
  console.log("Checkout session:", session.id);
  console.log("Payment status:", session.payment_status);

  const reservationId = session.metadata?.reservation_id;

  if (!reservationId) {
    console.log("Ignoring payment without MEGURU reservation");
    return;
  }

  // Retrieve the latest session state directly from Stripe.
  const verifiedSession = await stripe.checkout.sessions.retrieve(session.id);

  if (
    verifiedSession.mode !== "payment" ||
    verifiedSession.status !== "complete" ||
    verifiedSession.payment_status !== "paid"
  ) {
    console.log("Checkout is not confirmed as paid. Skipping.");
    return;
  }

  if (
    verifiedSession.amount_total === null ||
    verifiedSession.amount_total <= 0 ||
    verifiedSession.currency?.toLowerCase() !== "sek"
  ) {
    throw new Error("Invalid payment amount or currency");
  }

  const paymentIntent = verifiedSession.payment_intent;

  const paymentIntentId =
    typeof paymentIntent === "string"
      ? paymentIntent
      : paymentIntent?.id;

  if (!paymentIntentId) {
    throw new Error("Missing Stripe payment intent");
  }

  // Retrieve the reservation from Supabase.
  const { data, error } = await supabase
    .from("checkout_reservations")
    .select("id, listing_id, buyer_id, status, stripe_session_id")
    .eq("id", reservationId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch reservation: ${error.message}`);
  }

  if (!data) {
    throw new Error(`Reservation not found: ${reservationId}`);
  }

  const reservation = data as CheckoutReservation;

  // Verify that the Stripe session belongs to this reservation.
  if (reservation.stripe_session_id !== verifiedSession.id) {
    throw new Error("Stripe session does not match reservation");
  }

  if (
    verifiedSession.metadata?.reservation_id !== reservation.id ||
    verifiedSession.metadata?.listing_id !== reservation.listing_id ||
    verifiedSession.metadata?.buyer_id !== reservation.buyer_id ||
    verifiedSession.client_reference_id !== reservation.id
  ) {
    throw new Error("Stripe metadata does not match reservation");
  }

  // The RPC handles idempotency and database transactions.
  // We also call it for completed reservations so it can
  // verify that the existing order is present.
  if (
    reservation.status !== "pending" &&
    reservation.status !== "completed"
  ) {
    throw new Error(
      `Paid reservation requires reconciliation: ${reservation.status}`,
    );
  }

  const { data: orderId, error: orderError } = await supabase.rpc(
    "complete_checkout_order",
    {
      p_reservation_id: reservation.id,
      p_stripe_session_id: verifiedSession.id,
      p_stripe_payment_intent_id: paymentIntentId,
      p_amount_ore: verifiedSession.amount_total,
      p_currency: verifiedSession.currency,
    },
  );

  if (orderError) {
    throw new Error(`Failed to complete order: ${orderError.message}`);
  }

  console.log("MEGURU order completed:", orderId);
}

// -----------------------------------------
// WEBHOOK
// -----------------------------------------

export default {
  async fetch(req: Request): Promise<Response> {
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const signature = req.headers.get("stripe-signature");

    if (!signature) {
      return new Response("Missing Stripe signature", { status: 400 });
    }

    const body = await req.text();

    let event: Stripe.Event;

    try {
      event = await stripe.webhooks.constructEventAsync(
        body,
        signature,
        webhookSecret,
      );
    } catch (error) {
      console.error("Invalid Stripe webhook signature:", error);
      return new Response("Invalid signature", { status: 400 });
    }

    console.log("Verified Stripe event:", event.type);

    try {
      switch (event.type) {
        case "checkout.session.expired": {
          const session = event.data.object as Stripe.Checkout.Session;
          await handleExpiredCheckout(session);
          break;
        }

        case "checkout.session.completed":
        case "checkout.session.async_payment_succeeded": {
          const session = event.data.object as Stripe.Checkout.Session;
          await handleSuccessfulPayment(session);
          break;
        }

        case "checkout.session.async_payment_failed": {
          const session = event.data.object as Stripe.Checkout.Session;

          console.log("Asynchronous payment failed:", session.id);

          // Failed asynchronous payments need separate handling.
          // We will implement this before testing those methods.
          break;
        }

        default:
          console.log("Unhandled Stripe event:", event.type);
      }

      return new Response("Webhook processed", { status: 200 });
    } catch (error) {
      console.error("Webhook processing failed:", error);

      // Stripe can retry the event after a server error.
      return new Response("Webhook processing failed", { status: 500 });
    }
  },
};
