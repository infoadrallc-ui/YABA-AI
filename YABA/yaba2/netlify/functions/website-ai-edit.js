// netlify/functions/website-ai-edit.js
// Receives a plain-English prompt from the website editor,
// uses Claude to make the change to the website copy, and
// returns the updated copy along with a summary of what changed.

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  try {
    const token = req.headers.get('Authorization')?.replace('Bearer ', '')
    const { businessId, prompt, currentCopy } = await req.json()

    if (!prompt || !businessId) {
      return new Response(JSON.stringify({ error: 'prompt and businessId required' }), { status: 400 })
    }

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: `You are editing a small business website. The user wants to make this change:

"${prompt}"

Current website copy:
${JSON.stringify(currentCopy, null, 2)}

Make ONLY the change the user asked for. Keep everything else exactly the same.
Respond ONLY with valid JSON, no markdown, no backticks:
{
  "updatedCopy": { ...the full updated copy object with only the requested change made... },
  "summary": "one sentence describing what you changed",
  "applyGlobally": false,
  "consistencyMessage": "if the change should be applied sitewide, describe it here, otherwise empty string"
}`
      }]
    })

    const raw = message.content[0].text
    const clean = raw.replace(/```json|```/g, '').trim()
    const result = JSON.parse(clean)

    // Save the updated copy to Supabase
    await supabase
      .from('websites')
      .update({ copy: result.updatedCopy, last_updated: new Date().toISOString() })
      .eq('business_id', businessId)

    return new Response(JSON.stringify({ success: true, ...result }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('website-ai-edit error:', err)
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
}
