// netlify/functions/trigger-workflow.js
// UPDATED VERSION — wait steps actually schedule remaining steps
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }
  try {
    const { businessId, workflowType, contactId, contactType } = await req.json()

    if (!businessId || !workflowType || !contactId) {
      return new Response(JSON.stringify({ error: 'businessId, workflowType, and contactId required' }), { status: 400 })
    }

    const { data: workflow } = await supabase
      .from('workflows')
      .select('*, workflow_steps(*)')
      .eq('business_id', businessId)
      .eq('trigger_type', workflowType)
      .eq('active', true)
      .single()

    if (!workflow) {
      return new Response(JSON.stringify({ ran: false, reason: 'no_active_workflow' }), { status: 200 })
    }

    const contact = await getContact(supabase, contactType, contactId)
    if (!contact) {
      return new Response(JSON.stringify({ error: 'Contact not found' }), { status: 404 })
    }

    const { data: business } = await supabase
      .from('businesses')
      .select('business_name, owner_name, phone_number')
      .eq('id', businessId)
      .single()

    const { data: run, error: runError } = await supabase
      .from('workflow_runs')
      .insert({
        workflow_id: workflow.id,
        business_id: businessId,
        contact_id: contactId,
        contact_type: contactType,
        status: 'running',
        current_step: 0,
        log: []
      })
      .select()
      .single()

    if (runError) throw runError

    const steps = (workflow.workflow_steps || []).sort((a, b) => a.step_number - b.step_number)
    const runLog = []

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]

      if (step.type === 'wait') {
        const hours = (step.config || {}).hours || 0
        const runAt = new Date(Date.now() + hours * 60 * 60 * 1000)
        const remainingSteps = steps.slice(i + 1)

        await supabase.from('scheduled_steps').insert({
          workflow_id: workflow.id,
          business_id: businessId,
          run_id: run.id,
          contact_id: contactId,
          contact_type: contactType,
          remaining_steps: remainingSteps,
          run_at: runAt.toISOString(),
          status: 'pending'
        })

        runLog.push({ step: step.step_number, type: 'wait', status: 'scheduled', runAt: runAt.toISOString() })
        break
      }

      try {
        const result = await runStep(step, { businessId, business, contact })
        runLog.push({ step: step.step_number, type: step.type, status: 'success', result })
      } catch (stepErr) {
        runLog.push({ step: step.step_number, type: step.type, status: 'failed', error: stepErr.message })
      }
    }

    await supabase
      .from('workflow_runs')
      .update({ status: 'completed', completed_at: new Date().toISOString(), current_step: steps.length, log: runLog })
      .eq('id', run.id)

    await supabase
      .from('workflows')
      .update({ runs_total: (workflow.runs_total || 0) + 1, last_run: new Date().toISOString() })
      .eq('id', workflow.id)

    return new Response(JSON.stringify({ ran: true, workflowId: workflow.id, stepsRun: steps.length, log: runLog }), { status: 200 })

  } catch (err) {
    console.error('Workflow engine error:', err)
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
}

async function getContact(supabase, contactType, contactId) {
  const table = contactType === 'customer' ? 'customers' : 'leads'
  const { data } = await supabase.from(table).select('*').eq('id', contactId).single()
  return data
}

async function runStep(step, { businessId, business, contact }) {
  const config = step.config || {}
  switch (step.type) {
    case 'send_sms': {
      const message = personalize(config.message, { business, contact })
      const res = await fetch(`${process.env.SITE_URL}/.netlify/functions/send-sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId, to: contact.phone, message })
      })
      return await res.json()
    }
    case 'send_email': {
      const subject = personalize(config.subject, { business, contact })
      const html = personalize(config.html, { business, contact })
      const res = await fetch(`${process.env.SITE_URL}/.netlify/functions/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId, to: contact.email, subject, html })
      })
      return await res.json()
    }
    case 'alert_owner': {
      if (!business?.phone_number) return { skipped: true }
      const message = personalize(config.message, { business, contact })
      const res = await fetch(`${process.env.SITE_URL}/.netlify/functions/send-sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId, to: business.phone_number, message })
      })
      return await res.json()
    }
    case 'update_lead_status': {
      const { createClient } = await import('@supabase/supabase-js')
      const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
      await sb.from('leads').update({ status: config.newStatus }).eq('id', contact.id)
      return { updated: true }
    }
    default:
      return { skipped: true, reason: 'unknown_step_type' }
  }
}

function personalize(template, { business, contact }) {
  if (!template) return ''
  return template
    .replace(/{{business_name}}/g, business?.business_name || 'Your Business')
    .replace(/{{owner_name}}/g, business?.owner_name || '')
    .replace(/{{contact_name}}/g, contact?.name || 'there')
    .replace(/{{contact_first_name}}/g, (contact?.name || 'there').split(' ')[0])
}
