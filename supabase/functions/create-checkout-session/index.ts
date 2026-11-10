import '@supabase/functions-js/edge-runtime.d.ts';
import { withSupabase } from '@supabase/server';
import Stripe from 'npm:stripe';

// -----------------------------------------
// STRIPE CLIENT
// -----------------------------------------

const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');

if (!stripeSecretKey) {
  throw new Error('STRIPE_SECRET_KEY is missing');
}

const stripe = new Stripe(stripeSecretKey);

// -----------------------------------------
// FRONTEND URLS
// -----------------------------------------

const frontendUrl = 'http://localhost:4200';
const successUrl = `${frontendUrl}/dashboard?session_id={CHECKOUT_SESSION_ID}#my-purchases`;
const cancelUrl = `${frontendUrl}/checkout/cancel`;

// -----------------------------------------
// CREATE CHECKOUT SESSION
// -----------------------------------------

export default {
  fetch: withSupabase({ auth: ['user'] }, async (req, ctx) => {
    // 1. Validate request data
    let listingId: unknown;
    let deliveryMethod: unknown;

    try {
      const body = await req.json();
      listingId = body?.listingId;
      deliveryMethod = body?.deliveryMethod;
    } catch {
      return Response.json({ error: 'Invalid request body' }, { status: 400 });
    }

    if (!listingId || typeof listingId !== 'string') {
      return Response.json({ error: 'Listing ID is required' }, { status: 400 });
    }

    if (deliveryMethod !== 'shipping' && deliveryMethod !== 'pickup') {
      return Response.json({ error: 'Please select a delivery method' }, { status: 400 });
    }

    // 2. Get the authenticated buyer
    const buyerId = ctx.userClaims?.id ?? null;

    if (!buyerId) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    // 3. Fetch listing details
    const { data: listing, error: listingError } = await ctx.supabaseAdmin
      .from('listings')
      .select('id, title, price, status')
      .eq('id', listingId)
      .single();

    if (listingError || !listing) {
      return Response.json({ error: 'Listing not found' }, { status: 404 });
    }

    // 4. Convert SEK to öre
    const priceInOre = Math.round(Number(listing.price) * 100);

    if (!Number.isSafeInteger(priceInOre) || priceInOre <= 0) {
      return Response.json({ error: 'Invalid listing price' }, { status: 400 });
    }

    // 5. Reserve the listing with delivery method
    const { data: reservationId, error: reservationError } = await ctx.supabaseAdmin.rpc(
      'create_checkout_reservation',
      {
        p_listing_id: listingId,
        p_buyer_id: buyerId,
        p_delivery_method: deliveryMethod,
      },
    );

    if (reservationError) {
      console.error('Reservation failed:', reservationError.message);

      return Response.json({ error: reservationError.message }, { status: 409 });
    }

    if (!reservationId) {
      return Response.json({ error: 'Could not create reservation' }, { status: 500 });
    }

    // 6. Create Stripe Checkout session
    let session: Stripe.Checkout.Session;

    try {
      session = await stripe.checkout.sessions.create({
        mode: 'payment',

        // Collect shipping address only for shipping orders
        ...(deliveryMethod === 'shipping' && {
          shipping_address_collection: {
            allowed_countries: ['SE'] as ['SE'],
          },
        }),

        line_items: [
          {
            price_data: {
              currency: 'sek',
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
          delivery_method: deliveryMethod,
        },

        success_url: successUrl,
        cancel_url: cancelUrl,

        expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      });
    } catch (error) {
      console.error('Stripe Checkout failed:', error);

      // Release reservation if Stripe session creation fails
      const { error: cancelError } = await ctx.supabaseAdmin
        .from('checkout_reservations')
        .update({ status: 'cancelled' })
        .eq('id', reservationId)
        .eq('buyer_id', buyerId)
        .eq('status', 'pending')
        .is('stripe_session_id', null);

      if (cancelError) {
        console.error('Failed to cancel reservation:', cancelError.message);
      }

      return Response.json({ error: 'Could not create checkout session' }, { status: 500 });
    }

    // 7. Save Stripe session ID and expiration
    const { error: updateError } = await ctx.supabaseAdmin
      .from('checkout_reservations')
      .update({
        stripe_session_id: session.id,
        expires_at: new Date(session.expires_at * 1000).toISOString(),
      })
      .eq('id', reservationId);

    if (updateError) {
      console.error('Failed to save Stripe session:', updateError.message);

      try {
        // Expire Stripe session before releasing reservation
        await stripe.checkout.sessions.expire(session.id);

        const { error: cancelError } = await ctx.supabaseAdmin
          .from('checkout_reservations')
          .update({ status: 'cancelled' })
          .eq('id', reservationId)
          .eq('status', 'pending');

        if (cancelError) {
          console.error('Failed to cancel reservation:', cancelError.message);
        }
      } catch (error) {
        console.error('Failed to expire Stripe session:', error);
      }

      return Response.json({ error: 'Could not save checkout session' }, { status: 500 });
    }

    // 8. Return Checkout URL to frontend
    return Response.json({
      reservationId,
      checkoutUrl: session.url,
    });
  }),
};
