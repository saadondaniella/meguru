
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import Stripe from "npm:stripe";

// Initialize Stripe
const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");

if (!stripeSecretKey) {
  throw new Error("STRIPE_SECRET_KEY is missing");
}

const stripe = new Stripe(stripeSecretKey);

// Frontend URLs
const frontendUrl = "http://localhost:4200";
const successUrl = `${frontendUrl}/checkout/success`;
const cancelUrl = `${frontendUrl}/checkout/cancel`;

export default {
  fetch: withSupabase({ auth: ["user"] }, async (req, ctx) => {
    // 1. Get the listing ID
    const { listingId } = await req.json();

    if (!listingId || typeof listingId !== "string") {
      return Response.json(
        { error: "Listing ID is required" },
        { status: 400 },
      );
    }

    // 2. Get the authenticated buyer
    const buyerId = ctx.userClaims?.id ?? null;

    if (!buyerId) {
      return Response.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }

    // 3. Fetch listing details from Supabase
    const { data: listing, error: listingError } =
      await ctx.supabaseAdmin
        .from("listings")
        .select("id, title, price, status")
        .eq("id", listingId)
        .single();

    if (listingError || !listing) {
      return Response.json(
        { error: "Listing not found" },
        { status: 404 },
      );
    }

    // 4. Convert SEK to öre
    const priceInOre = Math.round(Number(listing.price) * 100);

    if (!Number.isSafeInteger(priceInOre) || priceInOre <= 0) {
      return Response.json(
        { error: "Invalid listing price" },
        { status: 400 },
      );
    }

    // 5. Reserve the listing
    const { data: reservationId, error: reservationError } =
      await ctx.supabaseAdmin.rpc("create_checkout_reservation", {
        p_listing_id: listingId,
        p_buyer_id: buyerId,
      });

    if (reservationError) {
      console.error("Reservation failed:", reservationError.message);

      return Response.json(
        { error: reservationError.message },
        { status: 409 },
      );
    }

    if (!reservationId) {
      return Response.json(
        { error: "Could not create reservation" },
        { status: 500 },
      );
    }

    // 6. Create a Stripe Checkout session
    let session: Stripe.Checkout.Session;

    try {
      session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [
          {
            price_data: {
              currency: "sek",
              product_data: {
                name: listing.title,
              },
              unit_amount: priceInOre,
            },
            quantity: 1,
          },
        ],
        client_reference_id: reservationId,
        metadata: {
          reservation_id: reservationId,
          listing_id: listingId,
          buyer_id: buyerId,
        },
        success_url: successUrl,
        cancel_url: cancelUrl,
       expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      });
    } catch (error) {
      console.error("Stripe Checkout failed:", error);

      // Release the reservation if Stripe fails
      const { error: cancelError } = await ctx.supabaseAdmin
        .from("checkout_reservations")
        .update({ status: "cancelled" })
        .eq("id", reservationId)
        .eq("buyer_id", buyerId)
        .eq("status", "pending")
        .is("stripe_session_id", null);

      if (cancelError) {
        console.error(
          "Failed to cancel reservation:",
          cancelError.message,
        );
      }

      return Response.json(
        { error: "Could not create checkout session" },
        { status: 500 },
      );
    }

    // 7. Save the Stripe session ID
    const { error: updateError } = await ctx.supabaseAdmin
      .from("checkout_reservations")
    .update({
    stripe_session_id: session.id,
     expires_at: new Date(session.expires_at * 1000).toISOString(),
    })
      .eq("id", reservationId);

      if (updateError) {
  console.error(
    "Failed to save Stripe session:",
    updateError.message,
  );

  try {
    await stripe.checkout.sessions.expire(session.id);

    const { error: cancelError } = await ctx.supabaseAdmin
      .from("checkout_reservations")
      .update({ status: "cancelled" })
      .eq("id", reservationId)
      .eq("status", "pending");

    if (cancelError) {
      console.error(
        "Failed to cancel reservation:",
        cancelError.message,
      );
    }
  } catch (error) {
    console.error("Failed to expire Stripe session:", error);
  }

  return Response.json(
    { error: "Could not save checkout session" },
    { status: 500 },
  );
}

return Response.json({
  reservationId,
  checkoutUrl: session.url,
});
  }),
};
