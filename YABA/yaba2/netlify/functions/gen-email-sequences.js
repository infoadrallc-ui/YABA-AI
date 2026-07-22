// netlify/functions/gen-email-sequences.js
// Step 5 of 9. Claude writes 3 complete email sequences:
// 1. Welcome sequence (5 emails)
// 2. Abandoned cart recovery (3 emails)
// 3. Post-purchase follow-up (3 emails)

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  try {
    const { businessData } = await req.json()
    const { businessId, businessName, ownerName, nicheSpecific,
            products, targetCustomer, style } = businessData

    const prompt = `You are an email copywriter creating 3 email sequences for a small business.

Business: ${businessName} — ${nicheSpecific}
Owner: ${ownerName}
Products/Services: ${products}
Target Customer: ${targetCustomer}
Brand Style: ${style}

Write 3 complete email sequences. Respond ONLY with valid JSON, no markdown, no backticks:
{
  "welcome_sequence": {
    "name": "Welcome to ${businessName}",
    "emails": [
      {
        "position": 1,
        "delay_hours": 0,
        "subject": "email subject line",
        "preview_text": "preview text shown in inbox",
        "body": "full email HTML body — warm, personal, introduces the business and owner. Sets expectations. Short — under 200 words."
      },
      {
        "position": 2,
        "delay_hours": 24,
        "subject": "subject",
        "preview_text": "preview",
        "body": "shares the business story or a customer success story"
      },
      {
        "position": 3,
        "delay_hours": 72,
        "subject": "subject",
        "preview_text": "preview",
        "body": "showcases best products/services with soft sell"
      },
      {
        "position": 4,
        "delay_hours": 120,
        "subject": "subject",
        "preview_text": "preview",
        "body": "social proof email — testimonials, reviews, results"
      },
      {
        "position": 5,
        "delay_hours": 168,
        "subject": "subject",
        "preview_text": "preview",
        "body": "offer email — special discount or bonus for new subscribers"
      }
    ]
  },
  "abandoned_cart": {
    "name": "Abandoned Cart Recovery",
    "emails": [
      {
        "position": 1,
        "delay_hours": 1,
        "subject": "You left something behind...",
        "preview_text": "preview",
        "body": "friendly reminder — they left items in their cart. No pressure."
      },
      {
        "position": 2,
        "delay_hours": 24,
        "subject": "subject",
        "preview_text": "preview",
        "body": "follow up — address possible objections. Answer why they should come back."
      },
      {
        "position": 3,
        "delay_hours": 72,
        "subject": "Last chance — your cart expires soon",
        "preview_text": "preview",
        "body": "urgency email — cart expiring. Optional small discount offer."
      }
    ]
  },
  "post_purchase": {
    "name": "Post Purchase Follow-Up",
    "emails": [
      {
        "position": 1,
        "delay_hours": 1,
        "subject": "Thank you for your order!",
        "preview_text": "preview",
        "body": "warm thank you. Order confirmation details. What to expect next."
      },
      {
        "position": 2,
        "delay_hours": 72,
        "subject": "subject",
        "preview_text": "preview",
        "body": "check-in email. Are they happy? Any questions? Builds relationship."
      },
      {
        "position": 3,
        "delay_hours": 168,
        "subject": "Would you leave us a review?",
        "preview_text": "preview",
        "body": "review request email. Makes it easy. Links to Google/Yelp."
      }
    ]
  }
}`

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }]
    })

    const raw = message.content[0].text
    const clean = raw.replace(/```json|```/g, '').trim()
    const sequences = JSON.parse(clean)

    // Save each sequence to email_sequences table
    const sequenceRows = [
      { business_id: businessId, name: sequences.welcome_sequence.name, active: true, emails: sequences.welcome_sequence.emails },
      { business_id: businessId, name: sequences.abandoned_cart.name, active: true, emails: sequences.abandoned_cart.emails },
      { business_id: businessId, name: sequences.post_purchase.name, active: true, emails: sequences.post_purchase.emails }
    ]

    const { error } = await supabase.from('email_sequences').insert(sequenceRows)
    if (error) throw error

    return new Response(JSON.stringify({ success: true, sequencesCreated: 3 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('gen-email-sequences error:', err)
    return new Response(JSON.stringify({ error: err.message || 'Failed to generate email sequences' }), { status: 500 })
  }
}
