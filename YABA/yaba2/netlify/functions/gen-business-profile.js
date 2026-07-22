// netlify/functions/gen-business-profile.js
// Step 1 of 9 in the generation engine.
// Takes the raw onboarding answers and uses Claude to build a
// structured brand profile — the foundation every other gen function
// reads from. Saved to the businesses table in Supabase.

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
    const { businessId, businessName, ownerName, nicheCategory, nicheSpecific,
            products, targetCustomer, location, style, brandColors,
            primaryGoal, revenueGoal, currentRevenue, platforms } = businessData

    const prompt = `You are a world-class brand strategist building a complete business profile for a new YABA client.

Business Details:
- Business Name: ${businessName}
- Owner: ${ownerName}
- Category: ${nicheCategory}
- Specific Business: ${nicheSpecific}
- Products/Services: ${products}
- Target Customer: ${targetCustomer}
- Location: ${location}
- Brand Style: ${style}
- Primary Goal: ${primaryGoal}
- Revenue Goal: ${revenueGoal}
- Current Revenue: ${currentRevenue}
- Social Platforms: ${(platforms || []).join(', ')}

Create a comprehensive brand profile. Respond ONLY with valid JSON, no markdown, no backticks:
{
  "tagline": "a punchy one-line tagline for this business",
  "brand_voice": "describe the tone and personality of this brand in 2 sentences",
  "unique_value_proposition": "what makes this business different from competitors",
  "target_customer_profile": {
    "demographics": "age, income, lifestyle description",
    "pain_points": ["pain point 1", "pain point 2", "pain point 3"],
    "desires": ["desire 1", "desire 2", "desire 3"]
  },
  "content_themes": ["theme 1", "theme 2", "theme 3", "theme 4", "theme 5"],
  "keywords": ["keyword 1", "keyword 2", "keyword 3", "keyword 4", "keyword 5"],
  "competitor_positioning": "how to position against typical competitors in this niche",
  "hero_image_prompt": "a detailed Replicate/Flux image generation prompt for this business's hero image, using their style and products. Be specific about lighting, composition, and mood.",
  "animation_concept": "describe what niche-specific animation would work for this business's website hero"
}`

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }]
    })

    const raw = message.content[0].text
    const clean = raw.replace(/```json|```/g, '').trim()
    const profile = JSON.parse(clean)

    // Save the full profile to the businesses table
    const { error: updateError } = await supabase
      .from('businesses')
      .update({
        business_name: businessName,
        owner_name: ownerName,
        niche: nicheSpecific,
        products,
        target_customer: targetCustomer,
        location,
        style,
        brand_colors: brandColors || [],
        primary_goal: primaryGoal,
        platforms: platforms || []
      })
      .eq('id', businessId)

    if (updateError) throw updateError

    // Save the AI-generated profile to business_plans as the foundation doc
    await supabase.from('business_plans').upsert({
      business_id: businessId,
      revenue_goal: revenueGoal,
      current_revenue: currentRevenue
    }, { onConflict: 'business_id' })

    return new Response(JSON.stringify({ success: true, profile }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('gen-business-profile error:', err)
    return new Response(JSON.stringify({ error: err.message || 'Failed to generate profile' }), { status: 500 })
  }
}
