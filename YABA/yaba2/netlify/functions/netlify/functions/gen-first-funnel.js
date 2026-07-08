// netlify/functions/gen-first-funnel.js
// Step 9 of 9. Claude builds a complete first conversion funnel
// based on the business's primary goal. Saves to the funnels table.

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

const FUNNEL_TYPES = {
  get_more_customers:   'lead_capture',
  sell_products_online: 'product_sales',
  book_appointments:    'appointment_booking',
  grow_social:          'lead_capture',
  build_email_list:     'lead_capture',
  get_more_reviews:     'review_funnel',
  find_affiliates:      'affiliate_signup',
  launch_business:      'lead_capture'
}

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  try {
    const { businessData } = await req.json()
    const { businessId, businessName, ownerName, nicheSpecific, products,
            targetCustomer, primaryGoal, style } = businessData

    const funnelType = FUNNEL_TYPES[primaryGoal] || 'lead_capture'

    const prompt = `You are a conversion funnel expert building a high-converting funnel for a small business.

Business: ${businessName} — ${nicheSpecific}
Owner: ${ownerName}
Products/Services: ${products}
Target Customer: ${targetCustomer}
Primary Goal: ${primaryGoal}
Funnel Type: ${funnelType}
Brand Style: ${style}

Build a complete conversion funnel. Respond ONLY with valid JSON, no markdown, no backticks:
{
  "name": "funnel name",
  "type": "${funnelType}",
  "headline": "main funnel headline — bold, benefit-focused, stops scrolling",
  "subheadline": "supporting line that adds specificity",
  "hero_bullet_points": ["benefit 1", "benefit 2", "benefit 3"],
  "lead_magnet": "what free thing they get for signing up (if lead capture funnel)",
  "cta_text": "button text",
  "form_fields": ["First Name", "Email", "Phone (optional)"],
  "sections": [
    {
      "type": "hero",
      "headline": "headline",
      "copy": "opening copy that speaks directly to the target customer's pain point"
    },
    {
      "type": "problem_agitate",
      "headline": "headline about their problem",
      "copy": "agitate the problem — make them feel understood"
    },
    {
      "type": "solution",
      "headline": "introduce the solution",
      "copy": "how this business solves their problem specifically"
    },
    {
      "type": "social_proof",
      "headline": "what others are saying",
      "copy": "3 specific testimonial-style statements (can be placeholder for now)"
    },
    {
      "type": "offer",
      "headline": "here is exactly what you get",
      "copy": "breakdown of what they receive"
    },
    {
      "type": "cta",
      "headline": "final call to action headline",
      "copy": "urgency or scarcity element if applicable"
    }
  ],
  "thank_you_page": {
    "headline": "thank you headline",
    "copy": "what happens next — sets expectation",
    "next_step": "what you want them to do immediately after converting"
  }
}`

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }]
    })

    const raw = message.content[0].text
    const clean = raw.replace(/```json|```/g, '').trim()
    const funnel = JSON.parse(clean)

    // Generate a URL slug from business name
    const slug = `${businessName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now()}`

    const { error } = await supabase
      .from('funnels')
      .insert({
        business_id: businessId,
        name: funnel.name,
        type: funnelType,
        headline: funnel.headline,
        subheadline: funnel.subheadline,
        sections: funnel.sections,
        cta_text: funnel.cta_text,
        slug,
        published: false
      })

    if (error) throw error

    // Mark onboarding as complete
    await supabase
      .from('businesses')
      .update({ onboarding_complete: true })
      .eq('id', businessId)

    return new Response(JSON.stringify({ success: true, funnel, slug }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('gen-first-funnel error:', err)
    return new Response(JSON.stringify({ error: err.message || 'Failed to generate funnel' }), { status: 500 })
  }
}
