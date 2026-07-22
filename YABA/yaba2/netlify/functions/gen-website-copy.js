// netlify/functions/gen-website-copy.js
// Step 3 of 9. Claude writes all website copy — headline, subheadline,
// about section, services/products, testimonial placeholders, CTA text,
// and SEO meta. Saved to the websites table.

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

const STYLE_TOKENS = {
  modern:      { tone: 'clean, confident, professional, minimal words', font_heading: 'Inter', font_body: 'Inter' },
  luxury:      { tone: 'sophisticated, elegant, exclusive, refined language', font_heading: 'Cormorant Garamond', font_body: 'Montserrat' },
  playful:     { tone: 'fun, energetic, warm, approachable, exclamation points ok', font_heading: 'Nunito', font_body: 'Nunito' },
  streetwear:  { tone: 'bold, raw, culture-driven, short punchy lines', font_heading: 'Bebas Neue', font_body: 'Inter' },
  bohemian:    { tone: 'earthy, artisanal, soulful, handcrafted feeling', font_heading: 'Josefin Sans', font_body: 'Lora' },
  dark_moody:  { tone: 'dramatic, cinematic, brooding, powerful', font_heading: 'Syne', font_body: 'Inter' },
  classic:     { tone: 'timeless, trustworthy, established, traditional', font_heading: 'Playfair Display', font_body: 'Lato' },
  eclectic:    { tone: 'bold, colorful, maximalist, high energy, expressive', font_heading: 'Syne', font_body: 'Nunito' }
}

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  try {
    const { businessData } = await req.json()
    const { businessId, businessName, ownerName, nicheSpecific, products,
            targetCustomer, location, style, primaryGoal } = businessData

    const styleToken = STYLE_TOKENS[style] || STYLE_TOKENS.modern

    const prompt = `You are a world-class copywriter writing website copy for a small business.

Business: ${businessName}
Owner: ${ownerName}
Type: ${nicheSpecific}
Products/Services: ${products}
Target Customer: ${targetCustomer}
Location: ${location}
Brand Style: ${style} — tone should be: ${styleToken.tone}
Primary Goal: ${primaryGoal}

Write compelling website copy. Respond ONLY with valid JSON, no markdown, no backticks:
{
  "hero": {
    "headline": "powerful main headline — max 8 words",
    "subheadline": "supporting line that adds context — max 15 words",
    "cta_primary": "primary button text — max 4 words",
    "cta_secondary": "secondary button text — max 4 words"
  },
  "about": {
    "heading": "about section heading",
    "body": "3-4 sentences about this business. Personal, warm, builds trust. Mention the owner by name.",
    "owner_quote": "a short authentic quote from the owner about why they do what they do"
  },
  "services_or_products": [
    {
      "name": "product or service name",
      "description": "2 sentence description that sells the benefit not just the feature",
      "price_label": "Starting at $X or $X or Call for pricing"
    },
    {
      "name": "second product or service",
      "description": "2 sentence description",
      "price_label": "price"
    },
    {
      "name": "third product or service",
      "description": "2 sentence description",
      "price_label": "price"
    }
  ],
  "social_proof": {
    "heading": "testimonials section heading",
    "stat_1": { "number": "a credibility stat like 500+", "label": "Happy Customers" },
    "stat_2": { "number": "another stat", "label": "label" },
    "stat_3": { "number": "another stat", "label": "label" }
  },
  "cta_section": {
    "heading": "final call to action heading — urgent, compelling",
    "subtext": "one line of supporting text",
    "button": "CTA button text"
  },
  "seo": {
    "meta_title": "SEO title tag — include business name and main keyword — max 60 chars",
    "meta_description": "SEO meta description — compelling, includes location if relevant — max 155 chars"
  },
  "font_heading": "${styleToken.font_heading}",
  "font_body": "${styleToken.font_body}"
}`

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }]
    })

    const raw = message.content[0].text
    const clean = raw.replace(/```json|```/g, '').trim()
    const copy = JSON.parse(clean)

    // Save to websites table
    const { error } = await supabase
      .from('websites')
      .upsert({
        business_id: businessId,
        style,
        font_heading: copy.font_heading,
        font_body: copy.font_body,
        copy,
        published: false
      }, { onConflict: 'business_id' })

    if (error) throw error

    return new Response(JSON.stringify({ success: true, copy }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('gen-website-copy error:', err)
    return new Response(JSON.stringify({ error: err.message || 'Failed to generate website copy' }), { status: 500 })
  }
}
