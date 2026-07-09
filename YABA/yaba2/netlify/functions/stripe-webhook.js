// netlify/functions/stripe-webhook.js
// Receives events from Stripe when subscriptions change.
// Handles: checkout completed, subscription activated, payment failed,
// subscription cancelled, trial ending soon.
// Updates the user's plan in Supabase based on what Stripe reports.

import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

// Map Stripe Price IDs to YABA plan names
const PRICE_TO_PLAN = {
  [process.env.STRIPE_PRICE_STARTER]: 'starter',
  [process.env.STRIPE_PRICE_GROWTH]:  'growth',
  [process.env.STRIPE_PRICE_AGENCY]:  'agency'
}

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const sig = req.headers.get('stripe-signature')
  const body = await req.text()

  let event

  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    )
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message)
    return new Response(`Webhook Error: ${err.message}`, { status: 400 })
  }

  console.log('Stripe webhook received:', event.type)

  try {
    switch (event.type) {

      // ── Customer completed checkout (new subscription) ──
      case 'checkout.session.completed': {
        const session = event.data.object
        const customerId = session.customer
        const customerEmail = session.customer_email || session.customer_details?.email
        const subscriptionId = session.subscription

        if (!subscriptionId) break

        // Get the subscription to find the price/plan
        const subscription = await stripe.subscriptions.retrieve(subscriptionId)
        const priceId = subscription.items.data[0]?.price?.id
        const plan = PRICE_TO_PLAN[priceId] || 'starter'

        // Update user in Supabase
        await updateUserPlan(customerEmail, customerId, plan, subscriptionId, 'active')
        console.log(`Checkout complete — ${customerEmail} → ${plan}`)
        break
      }

      // ── Subscription became active (after trial or payment) ──
      case 'customer.subscription.updated': {
        const sub = event.data.object
        const customerId = sub.customer
        const priceId = sub.items.data[0]?.price?.id
        const plan = PRICE_TO_PLAN[priceId] || 'starter'
        const status = sub.status // active, past_due, cancelled, trialing

        await updateUserPlanByCustomerId(customerId, plan, sub.id, status)
        console.log(`Subscription updated — customer ${customerId} → ${plan} (${status})`)
        break
      }

      // ── Subscription cancelled ──
      case 'customer.subscription.deleted': {
        const sub = event.data.object
        const customerId = sub.customer

        // Downgrade to free when subscription ends
        await updateUserPlanByCustomerId(customerId, 'free', null, 'cancelled')
        console.log(`Subscription cancelled — customer ${customerId} → free`)
        break
      }

      // ── Payment failed ──
      case 'invoice.payment_failed': {
        const invoice = event.data.object
        const customerId = invoice.customer
        const customerEmail = invoice.customer_email

        // Don't downgrade immediately — Stripe will retry
        // Just log it and optionally send a warning email
        console.log(`Payment failed — ${customerEmail || customerId}`)

        // Send payment failed email via our send-email function
        if (customerEmail) {
          await fetch(`${process.env.SITE_URL}/.netlify/functions/send-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              businessId: null,
              directTo: customerEmail,
              subject: 'Payment issue with your YABA subscription',
              html: `
                <div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1C1F3B">
                  <div style="font-family:Nunito,sans-serif;font-weight:900;font-size:1.4rem;color:#0073EA;margin-bottom:24px">YABA</div>
                  <h2 style="font-family:Nunito,sans-serif;font-weight:900;font-size:1.2rem;margin-bottom:12px">We couldn't process your payment</h2>
                  <p style="color:#676879;line-height:1.7;margin-bottom:20px">
                    We had trouble charging your card for your YABA subscription. 
                    Your account is still active while we retry, but please update 
                    your payment method to avoid any interruption.
                  </p>
                  <a href="https://yaba-ai.netlify.app/dashboard.html" 
                     style="display:inline-block;background:#FF5C35;color:#fff;padding:14px 28px;border-radius:8px;font-family:Nunito,sans-serif;font-weight:800;text-decoration:none">
                    Update Payment Method →
                  </a>
                </div>
              `
            })
          }).catch(() => {})
        }
        break
      }

      // ── Trial ending soon (3 days before) ──
      case 'customer.subscription.trial_will_end': {
        const sub = event.data.object
        const customerId = sub.customer

        const { data: user } = await supabase
          .from('users')
          .select('email')
          .eq('stripe_customer_id', customerId)
          .single()

        if (user?.email) {
          await fetch(`${process.env.SITE_URL}/.netlify/functions/send-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              businessId: null,
              directTo: user.email,
              subject: 'Your YABA free trial ends in 3 days',
              html: `
                <div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1C1F3B">
                  <div style="font-family:Nunito,sans-serif;font-weight:900;font-size:1.4rem;color:#0073EA;margin-bottom:24px">YABA</div>
                  <h2 style="font-family:Nunito,sans-serif;font-weight:900;font-size:1.2rem;margin-bottom:12px">Your free trial ends in 3 days</h2>
                  <p style="color:#676879;line-height:1.7;margin-bottom:20px">
                    Your YABA free trial ends in 3 days. Add a payment method now to 
                    keep your website, CRM, automations, and everything you've built 
                    running without interruption.
                  </p>
                  <a href="https://yaba-ai.netlify.app/dashboard.html" 
                     style="display:inline-block;background:#0073EA;color:#fff;padding:14px 28px;border-radius:8px;font-family:Nunito,sans-serif;font-weight:800;text-decoration:none">
                    Keep My Account Active →
                  </a>
                </div>
              `
            })
          }).catch(() => {})
        }
        break
      }

      default:
        console.log(`Unhandled Stripe event: ${event.type}`)
    }

    return new Response(JSON.stringify({ received: true }), { status: 200 })

  } catch (err) {
    console.error('Webhook handler error:', err)
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
}

// ── Helper: update user plan by email ──
async function updateUserPlan(email, stripeCustomerId, plan, subscriptionId, status) {
  if (!email) return

  const { data: user } = await supabase
    .from('users')
    .select('id')
    .eq('email', email.toLowerCase())
    .single()

  if (!user) return

  await supabase
    .from('users')
    .update({
      plan,
      stripe_customer_id: stripeCustomerId,
      stripe_subscription_id: subscriptionId
    })
    .eq('id', user.id)

  // Update usage table plan too
  await supabase
    .from('usage')
    .update({ plan })
    .eq('user_id', user.id)
}

// ── Helper: update user plan by Stripe customer ID ──
async function updateUserPlanByCustomerId(stripeCustomerId, plan, subscriptionId, status) {
  const { data: user } = await supabase
    .from('users')
    .select('id')
    .eq('stripe_customer_id', stripeCustomerId)
    .single()

  if (!user) return

  const update = { plan }
  if (subscriptionId) update.stripe_subscription_id = subscriptionId

  await supabase
    .from('users')
    .update(update)
    .eq('id', user.id)

  await supabase
    .from('usage')
    .update({ plan })
    .eq('user_id', user.id)
}
