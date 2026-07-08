// netlify/functions/gen-content-calendar.js
// Step 4 of 9. Claude generates 30 days of platform-specific content —
// hooks, captions, scripts, hashtags, and best posting times.

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
    const { businessId, businessName, nicheSpecific, products,
            targetCustomer, platforms, primaryGoal, style } = businessData

    const activePlatforms = (platforms || ['instagram', 'tiktok']).slice(0, 3)

    const prompt = `You are a social media strategist creating 30 days of content for a small business.

Business: ${businessName} — ${nicheSpecific}
Products/Services: ${products}
Target Customer: ${targetCustomer}
Active Platforms: ${activePlatforms.join(', ')}
Primary Goal: ${primaryGoal}
Brand Style: ${style}

Create exactly 30 days of content. Mix content types: educational, promotional, behind the scenes, testimonial, entertainment. Respond ONLY with valid JSON array, no markdown, no backticks:
[
  {
    "day": 1,
    "platform": "instagram",
    "content_type": "reel",
    "content_pillar": "educational",
    "hook": "attention-grabbing first line — should make them stop scrolling",
    "caption": "full caption 3-5 sentences with call to action",
    "script": "if video — first 30 seconds script outline",
    "hashtags": ["hashtag1", "hashtag2", "hashtag3", "hashtag4", "hashtag5"],
    "best_time": "6:00 PM",
    "day_of_week": "Monday"
  }
]
Generate all 30 items. Vary platforms across the days based on: ${activePlatforms.join(', ')}.`

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }]
    })

    const raw = message.content[0].text
    const clean = raw.replace(/```json|```/g, '').trim()
    const posts = JSON.parse(clean)

    // Save each post to the content table
    const today = new Date()
    const contentRows = posts.map((post, i) => {
      const schedDate = new Date(today)
      schedDate.setDate(today.getDate() + i)
      return {
        business_id: businessId,
        platform: post.platform,
        content_type: post.content_type,
        content_pillar: post.content_pillar,
        hook: post.hook,
        caption: post.caption,
        script: post.script || null,
        hashtags: post.hashtags || [],
        scheduled_date: schedDate.toISOString().split('T')[0],
        scheduled_time: post.best_time || '12:00 PM',
        best_time: post.best_time || '12:00 PM',
        posted: false
      }
    })

    const { error } = await supabase.from('content').insert(contentRows)
    if (error) throw error

    return new Response(JSON.stringify({ success: true, postsCreated: contentRows.length }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('gen-content-calendar error:', err)
    return new Response(JSON.stringify({ error: err.message || 'Failed to generate content calendar' }), { status: 500 })
  }
}
