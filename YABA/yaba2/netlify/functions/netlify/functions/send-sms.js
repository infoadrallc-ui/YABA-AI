// netlify/functions/send-sms.js
// BRING-YOUR-OWN-TWILIO VERSION
// Each business connects their OWN Twilio account via Integrations tab.
// YABA never holds a master account or buys numbers — the business
// owns their number, their billing, and their ID verification.

const twilio = require('twilio')
const { createClient } = require('@supabase/supabase-js')

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  try {
    const { businessId, to, message } = JSON.parse(event.body)

    if (!businessId || !to || !message) {
      return { statusCode: 400, body: JSON.stringify({ error: 'businessId, to, and message are required' }) }
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    )

    // Pull THIS business's own Twilio credentials from integrations table
    const { data: integration, error: intError } = await supabase
      .from('integrations')
      .select('api_key, api_secret, connected')
      .eq('business_id', businessId)
      .eq('platform', 'twilio')
      .single()

    if (intError || !integration || !integration.connected) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'Twilio not connected. Go to Integrations and connect your Twilio account first.',
          code: 'NOT_CONNECTED'
        })
      }
    }

    // Get their business record for the FROM number + usage tracking
    const { data: business } = await supabase
      .from('businesses')
      .select('phone_number, user_id')
      .eq('id', businessId)
      .single()

    if (!business?.phone_number) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'No phone number on file. Add your Twilio number in Integrations.',
          code: 'NO_NUMBER'
        })
      }
    }

    // ── Usage limit check (still applies — counts against their plan cap) ──
    const limitCheck = await checkSmsLimit(supabase, business.user_id)
    if (!limitCheck.allowed) {
      return {
        statusCode: 429,
        body: JSON.stringify({ error: limitCheck.message, reason: limitCheck.reason })
      }
    }

    // Send using THEIR Twilio credentials, not a master account
    const client = twilio(integration.api_key, integration.api_secret)

    const sms = await client.messages.create({
      body: message,
      from: business.phone_number,
      to: to
    })

    await incrementSmsUsage(supabase, business.user_id)

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, sid: sms.sid, status: sms.status })
    }

  } catch (err) {
    console.error('Send SMS error:', err)
    // Twilio auth errors are common here if they pasted the wrong keys
    if (err.code === 20003) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Invalid Twilio credentials. Please reconnect in Integrations.' }) }
    }
    return { statusCode: 500, body: JSON.stringify({ error: err.message || 'Failed to send SMS' }) }
  }
}

async function checkSmsLimit(supabase, userId) {
  const { data: usage } = await supabase
    .from('usage')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (!usage) return { allowed: true }

  const DAILY_LIMITS   = { free: 0, starter: 5, growth: 20, agency: 80 }
  const MONTHLY_LIMITS = { free: 0, starter: 100, growth: 500, agency: 2000 }
  const plan = usage.plan || 'free'

  if (plan === 'free') {
    return { allowed: false, reason: 'plan', message: 'SMS is not available on the free trial. Connect your own Twilio account or upgrade to a paid plan.' }
  }
  if (usage.sms_daily >= DAILY_LIMITS[plan]) {
    return { allowed: false, reason: 'daily', message: `Daily SMS limit reached for ${plan} plan. Resets in 24 hours.` }
  }
  if (usage.sms_monthly >= MONTHLY_LIMITS[plan]) {
    return { allowed: false, reason: 'monthly', message: `Monthly SMS limit reached for ${plan} plan. Upgrade for more capacity.` }
  }
  return { allowed: true }
}

async function incrementSmsUsage(supabase, userId) {
  const { data: usage } = await supabase
    .from('usage')
    .select('sms_daily, sms_monthly')
    .eq('user_id', userId)
    .single()

  if (usage) {
    await supabase
      .from('usage')
      .update({
        sms_daily: (usage.sms_daily || 0) + 1,
        sms_monthly: (usage.sms_monthly || 0) + 1
      })
      .eq('user_id', userId)
  }
}
