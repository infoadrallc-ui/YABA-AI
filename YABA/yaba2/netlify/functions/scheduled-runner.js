// netlify/functions/scheduled-runner.js
// Runs every 15 minutes via netlify.toml cron schedule
// Checks for pending scheduled workflow steps and executes them

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

export default async (req) => {
  try {
    const now = new Date().toISOString()

    const { data: dueSteps, error } = await supabase
      .from('scheduled_steps')
      .select('*')
      .eq('status', 'pending')
      .lte('run_at', now)
      .limit(50)

    if (error) throw error
    if (!dueSteps || dueSteps.length === 0) {
      return new Response(JSON.stringify({ processed: 0, message: 'Nothing due' }), { status: 200 })
    }

    let processed = 0
    let failed = 0

    for (const scheduled of dueSteps) {
      try {
        await runRemainingSteps(scheduled)
        await supabase
          .from('scheduled_steps')
          .update({ status: 'completed', completed_at: new Date().toISOString() })
          .eq('id', scheduled.id)
        processed++
      } catch (err) {
        console.error(`Scheduled step ${scheduled.id} failed:`, err.message)
        await supabase
          .from('scheduled_steps')
          .update({ status: 'failed', completed_at: new Date().toISOString() })
          .eq('id', scheduled.id)
        failed++
      }
    }

    return new Response(JSON.stringify({ processed, failed, total: dueSteps.length }), { status: 200 })

  } catch (err) {
    console.error('Scheduled runner error:', err)
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
}

async function runRemainingSteps(scheduled) {
  const { business_id, contact_id, contact_type, remaining_steps } = scheduled

  const { data: business } = await supabase
    .from('businesses')
    .select('business_name, owner_name, phone_number')
    .eq('id', business_id)
    .single()

  const table = contact_type === 'customer' ? 'customers' : 'leads'
  const { data: contact } = await supabase.from(table).select('*').eq('id', contact_id).single()

  if (!contact) throw new Error('Contact no longer exists')

  for (let i = 0; i < remaining_steps.length; i++) {
    const step = remaining_steps[i]

    if (step.type === 'wait') {
      const hours = (step.config || {}).hours || 0
      const runAt = new Date(Date.now() + hours * 60 * 60 * 1000)

      await supabase.from('scheduled_steps').insert({
        workflow_id: scheduled.workflow_id,
        business_id,
        run_id: scheduled.run_id,
        contact_id,
        contact_type,
        remaining_steps: remaining_steps.slice(i + 1),
        run_at: runAt.toISOString(),
        status: 'pending'
      })
      return
    }

    const config = step.config || {}

    if (step.type === 'send_sms' && contact.phone) {
      const message = personalize(config.message, { business, contact })
      await fetch(`${process.env.SITE_URL}/.netlify/functions/send-sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId: business_id, to: contact.phone, message })
      })
    }

    if (step.type === 'send_email' && contact.email) {
      const subject = personalize(config.subject, { business, contact })
      const html = personalize(config.html, { business, contact })
      await fetch(`${process.env.SITE_URL}/.netlify/functions/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId: business_id, to: contact.email, subject, html })
      })
    }

    if (step.type === 'alert_owner' && business?.phone_number) {
      const message = personalize(config.message, { business, contact })
      await fetch(`${process.env.SITE_URL}/.netlify/functions/send-sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId: business_id, to: business.phone_number, message })
      })
    }
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
