// netlify/functions/connect-manychat.js
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }
  try {
    const { businessId, apiKey } = await req.json()
    if (!businessId || !apiKey) {
      return new Response(JSON.stringify({ error: 'businessId and apiKey required' }), { status: 400 })
    }

    const testRes = await fetch('https://api.manychat.com/fb/page/getInfo', {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    })
    if (!testRes.ok) {
      return new Response(JSON.stringify({ error: 'Invalid ManyChat API key.' }), { status: 401 })
    }
    const pageInfo = await testRes.json()

    const { error } = await supabase.from('integrations').upsert({
      business_id: businessId,
      platform: 'manychat',
      api_key: apiKey,
      connected: true,
      connected_at: new Date().toISOString()
    }, { onConflict: 'business_id,platform' })

    if (error) throw error

    return new Response(JSON.stringify({
      success: true,
      pageName: pageInfo?.data?.name || null
    }), { status: 200 })

  } catch (err) {
    console.error('Connect ManyChat error:', err)
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
}
