// netlify/functions/save-website-edits.js
// Saves manual edits (colors, fonts, copy) from the editor sidebar
// to the websites table in Supabase.

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  try {
    const { businessId, copy, colors, fonts, animationsEnabled } = await req.json()

    const { error } = await supabase
      .from('websites')
      .update({
        copy,
        brand_colors: colors ? [colors.primary, colors.accent] : [],
        font_heading: fonts?.heading,
        font_body: fonts?.body,
        last_updated: new Date().toISOString()
      })
      .eq('business_id', businessId)

    if (error) throw error

    // Also update business animations_enabled
    await supabase
      .from('businesses')
      .update({ animations_enabled: animationsEnabled })
      .eq('id', businessId)

    return new Response(JSON.stringify({ success: true }), { status: 200 })

  } catch (err) {
    console.error('save-website-edits error:', err)
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
}
