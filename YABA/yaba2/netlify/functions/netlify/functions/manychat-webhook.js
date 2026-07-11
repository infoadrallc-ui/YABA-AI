// netlify/functions/manychat-webhook.js
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }
  try {
    const businessId = new URL(req.url).searchParams.get('businessId')
    if (!businessId) {
      return new Response(JSON.stringify({ error: 'Missing businessId' }), { status: 400 })
    }

    const payload = await req.json()
    const { first_name, last_name, keyword, platform = 'instagram' } = payload

    const { data: automation } = await supabase
      .from('automations')
      .select('*')
      .eq('business_id', businessId)
      .eq('keyword', keyword)
      .eq('active', true)
      .single()

    if (!automation) {
      return new Response(JSON.stringify({ received: true, matched: false }), { status: 200 })
    }

    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .insert({
        business_id: businessId,
        name: `${first_name || ''} ${last_name || ''}`.trim() || 'New Lead',
        status: 'new',
        source: platform,
        notes: `Triggered by keyword: "${keyword}"`
      })
      .select()
      .single()

    if (leadError) throw leadError

    await supabase
      .from('automations')
      .update({ trigger_count: (automation.trigger_count || 0) + 1 })
      .eq('id', automation.id)

    await fetch(`${process.env.SITE_URL}/.netlify/functions/trigger-workflow`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        businessId,
        workflowType: 'new_lead_from_social',
        contactId: lead.id,
        contactType: 'lead'
      })
    }).catch(err => console.log('Workflow trigger failed:', err.message))

    return new Response(JSON.stringify({ received: true, matched: true, leadId: lead.id }), { status: 200 })

  } catch (err) {
    console.error('ManyChat webhook error:', err)
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
}
