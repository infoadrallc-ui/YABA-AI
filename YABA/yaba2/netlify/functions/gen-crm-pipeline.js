// netlify/functions/gen-crm-pipeline.js
// Step 6 of 9. Sets up CRM pipeline stages custom to their niche
// and seeds 32 pre-built workflow templates for their business type.

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

// Pipeline stages by business type
const PIPELINE_STAGES = {
  product_seller: ['New Inquiry', 'Quoted', 'Order Placed', 'Processing', 'Shipped', 'Delivered', 'Repeat Customer'],
  service:        ['New Lead', 'Contacted', 'Quoted', 'Booked', 'In Progress', 'Completed', 'Review Requested'],
  both:           ['New Lead', 'Contacted', 'Quoted', 'Order/Booking', 'Fulfillment', 'Completed', 'Loyal Customer'],
  coach:          ['New Inquiry', 'Discovery Call', 'Proposal Sent', 'Enrolled', 'Active Client', 'Completed', 'Alumni']
}

// 32 pre-built workflow templates
const WORKFLOW_TEMPLATES = [
  { name: 'New Lead from Social',         trigger_type: 'new_lead_from_social',    description: 'Keyword trigger → instant DM → CRM → AI score → SMS → email nurture' },
  { name: 'Abandoned Cart Recovery',      trigger_type: 'abandoned_cart',          description: '1hr email → 24hr SMS with discount → 72hr final email' },
  { name: 'Appointment Booked',           trigger_type: 'appointment_booked',      description: 'Confirmation email + SMS → 24hr reminder → 2hr reminder → review request' },
  { name: 'New Order Placed',             trigger_type: 'new_order',               description: 'Confirmation → inventory update → shipping notification → review request → upsell' },
  { name: 'Funnel Conversion',            trigger_type: 'funnel_conversion',       description: 'Form submit → CRM add → lead magnet → welcome sequence → owner alert' },
  { name: 'Instant Owner Alert',          trigger_type: 'hot_lead',                description: 'Hot lead detected → immediate SMS to owner with details' },
  { name: 'New Contact Form Submission',  trigger_type: 'contact_form',            description: 'Form submit → thank you email → CRM add → owner notification' },
  { name: 'Post Purchase Follow-Up',      trigger_type: 'order_delivered',         description: '3 day check-in → 7 day review request → 30 day re-engagement' },
  { name: 'No Show Follow-Up',            trigger_type: 'appointment_no_show',     description: 'Missed appointment → immediate SMS → reschedule email → 48hr final follow-up' },
  { name: 'Lead Re-Engagement',           trigger_type: 'lead_inactive_30_days',   description: '30 day dormant lead → re-engagement email → SMS → archive if no response' },
  { name: 'Review Request',               trigger_type: 'order_completed',         description: '24hr after completion → Google review request → SMS if no response' },
  { name: 'Welcome New Subscriber',       trigger_type: 'email_subscribe',         description: 'Subscribe → immediate welcome email → sequence enrollment' },
  { name: 'Birthday Message',             trigger_type: 'customer_birthday',       description: 'Birthday → personalized email with special offer → SMS reminder' },
  { name: 'Win-Back Campaign',            trigger_type: 'customer_inactive_90',    description: '90 day inactive customer → win-back email → SMS → special offer' },
  { name: 'Referral Thank You',           trigger_type: 'referral_made',           description: 'Referral converts → thank you SMS to referrer → reward delivery' },
  { name: 'Low Stock Alert',              trigger_type: 'low_inventory',           description: 'Stock hits threshold → owner SMS alert → reorder reminder' },
  { name: 'New Review Received',          trigger_type: 'new_review',              description: '5 star → share on socials prompt. 1-3 star → private follow-up to resolve' },
  { name: 'Affiliate Conversion',         trigger_type: 'affiliate_sale',          description: 'Affiliate sale → commission logged → thank you email to affiliate' },
  { name: 'Payment Failed',               trigger_type: 'payment_failed',          description: 'Failed charge → immediate email → SMS → retry notification' },
  { name: 'Subscription Renewal',         trigger_type: 'subscription_renewing',   description: '7 day reminder → renewal confirmation → thank you' },
  { name: 'Lead Scored Hot',              trigger_type: 'lead_score_hot',          description: 'AI scores lead 8+ → immediate owner SMS → auto draft follow-up message' },
  { name: 'Appointment Reminder',         trigger_type: 'appointment_reminder',    description: '24hr before → 2hr before → post appointment follow-up' },
  { name: 'First Purchase Thank You',     trigger_type: 'first_purchase',          description: 'First order → special thank you → loyalty program invite → social follow request' },
  { name: 'Cart Abandonment Stage 2',     trigger_type: 'cart_24hr',              description: '24hr after abandonment → discount offer → urgency messaging' },
  { name: 'VIP Customer Recognition',     trigger_type: 'vip_threshold',           description: 'Customer hits spend threshold → VIP status email → exclusive offer' },
  { name: 'Social Mention Alert',         trigger_type: 'social_mention',          description: 'Brand mentioned → owner notification → suggested response' },
  { name: 'Onboarding Complete',          trigger_type: 'onboarding_complete',     description: 'Customer finishes onboarding → next steps email → check-in at day 7' },
  { name: 'Quote Follow-Up',              trigger_type: 'quote_sent',              description: 'Quote sent → 24hr follow-up → 72hr final follow-up → archive if no response' },
  { name: 'Event Reminder',              trigger_type: 'event_upcoming',           description: '1 week before → 1 day before → day of → post event follow-up' },
  { name: 'Upsell After Purchase',        trigger_type: 'post_purchase_7_days',    description: '7 days after purchase → complementary product recommendation' },
  { name: 'Seasonal Campaign',            trigger_type: 'seasonal_trigger',        description: 'Holiday/season → promotional campaign → last chance reminder' },
  { name: 'Customer Survey',             trigger_type: 'survey_trigger',           description: '30 days after first purchase → satisfaction survey → follow-up on feedback' }
]

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  try {
    const { businessData } = await req.json()
    const { businessId, businessType } = businessData

    // Set up pipeline stages for their business type
    const stages = PIPELINE_STAGES[businessType] || PIPELINE_STAGES.service

    const { error: pipelineError } = await supabase
      .from('crm_pipelines')
      .upsert({ business_id: businessId, stages }, { onConflict: 'business_id' })

    if (pipelineError) throw pipelineError

    // Seed all 32 workflow templates for this business
    const workflowRows = WORKFLOW_TEMPLATES.map(wf => ({
      business_id: businessId,
      name: wf.name,
      description: wf.description,
      trigger_type: wf.trigger_type,
      active: false, // off by default — business activates the ones they want
      runs_total: 0
    }))

    const { error: workflowError } = await supabase
      .from('workflows')
      .insert(workflowRows)

    if (workflowError) throw workflowError

    return new Response(JSON.stringify({
      success: true,
      pipelineStages: stages,
      workflowsCreated: workflowRows.length
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('gen-crm-pipeline error:', err)
    return new Response(JSON.stringify({ error: err.message || 'Failed to set up CRM pipeline' }), { status: 500 })
  }
}
