// netlify/functions/gen-automations.js
// Step 8 of 9. Activates the most relevant workflows for this business
// and sets up their ManyChat keyword triggers (if connected).
// The 32 workflows were all created in gen-crm-pipeline.js — this
// step just turns the right ones ON based on business type and goal.

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

// Which workflows to auto-activate per business type and goal
const AUTO_ACTIVATE = {
  product_seller: [
    'new_lead_from_social', 'abandoned_cart', 'new_order', 'post_purchase_7_days',
    'hot_lead', 'review_request', 'first_purchase', 'low_inventory', 'cart_24hr'
  ],
  service: [
    'new_lead_from_social', 'appointment_booked', 'appointment_reminder',
    'no_show', 'hot_lead', 'review_request', 'quote_sent', 'contact_form'
  ],
  both: [
    'new_lead_from_social', 'abandoned_cart', 'new_order', 'appointment_booked',
    'hot_lead', 'review_request', 'first_purchase', 'quote_sent'
  ],
  coach: [
    'new_lead_from_social', 'contact_form', 'funnel_conversion',
    'hot_lead', 'onboarding_complete', 'lead_inactive_30_days', 'customer_survey'
  ]
}

// Default keyword triggers by niche category
const KEYWORD_TRIGGERS = {
  food_beverage:        ['PRICE', 'ORDER', 'MENU', 'DELIVERY', 'CATERING'],
  home_services:        ['QUOTE', 'PRICE', 'ESTIMATE', 'BOOK', 'AVAILABLE'],
  beauty_wellness:      ['BOOK', 'PRICE', 'APPOINTMENT', 'AVAILABLE', 'RATES'],
  fashion_accessories:  ['PRICE', 'SIZE', 'ORDER', 'SHIPPING', 'BUY'],
  professional_services:['INFO', 'CONSULT', 'PRICE', 'AVAILABLE', 'QUOTE'],
  content_creative:     ['COLLAB', 'RATES', 'BOOK', 'INFO', 'AVAILABLE'],
  pet_services:         ['BOOK', 'PRICE', 'AVAILABLE', 'RATES', 'APPOINTMENT'],
  author_publishing:    ['BUY', 'ORDER', 'SIGNED', 'BOOK', 'PRICE'],
  health_fitness:       ['BOOK', 'PRICE', 'SCHEDULE', 'TRIAL', 'JOIN'],
  real_estate:          ['INFO', 'PRICE', 'LISTING', 'AVAILABLE', 'TOUR'],
  events:               ['BOOK', 'PRICE', 'AVAILABLE', 'QUOTE', 'INFO'],
  education:            ['ENROLL', 'PRICE', 'SCHEDULE', 'INFO', 'TRIAL'],
  automotive:           ['QUOTE', 'PRICE', 'BOOK', 'AVAILABLE', 'APPOINTMENT'],
  other:                ['PRICE', 'INFO', 'BOOK', 'ORDER', 'AVAILABLE']
}

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  try {
    const { businessData } = await req.json()
    const { businessId, businessType, nicheCategory } = businessData

    // Get all workflows for this business
    const { data: workflows, error: wfError } = await supabase
      .from('workflows')
      .select('id, trigger_type')
      .eq('business_id', businessId)

    if (wfError) throw wfError

    // Activate the right ones for their business type
    const toActivate = AUTO_ACTIVATE[businessType] || AUTO_ACTIVATE.service
    const activateIds = workflows
      .filter(wf => toActivate.includes(wf.trigger_type))
      .map(wf => wf.id)

    if (activateIds.length > 0) {
      await supabase
        .from('workflows')
        .update({ active: true })
        .in('id', activateIds)
    }

    // Set up keyword trigger automations for their niche
    const keywords = KEYWORD_TRIGGERS[nicheCategory] || KEYWORD_TRIGGERS.other
    const automationRows = keywords.map(keyword => ({
      business_id: businessId,
      type: 'keyword_trigger',
      keyword,
      platform: 'instagram',
      action: 'add_to_crm_and_notify',
      response: `Thanks for reaching out! We'll get back to you shortly about "${keyword}". 🙌`,
      active: false // activates when they connect ManyChat
    }))

    const { error: autoError } = await supabase
      .from('automations')
      .insert(automationRows)

    if (autoError) throw autoError

    return new Response(JSON.stringify({
      success: true,
      workflowsActivated: activateIds.length,
      keywordsConfigured: keywords.length
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('gen-automations error:', err)
    return new Response(JSON.stringify({ error: err.message || 'Failed to configure automations' }), { status: 500 })
  }
}
