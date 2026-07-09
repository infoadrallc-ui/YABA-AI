// netlify/functions/publish-website.js
// Marks the website as published in Supabase.
// In a full implementation this would also trigger a static site
// generation or update a CDN. For V1, "published" just means
// their storefront page loads their real generated content.

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  try {
    const { businessId } = await req.json()

    const { error } = await supabase
      .from('websites')
      .update({
        published: true,
        published_at: new Date().toISOString()
      })
      .eq('business_id', businessId)

    if (error) throw error

    return new Response(JSON.stringify({ success: true }), { status: 200 })

  } catch (err) {
    console.error('publish-website error:', err)
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
}
