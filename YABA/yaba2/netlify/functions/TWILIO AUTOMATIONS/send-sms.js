// netlify/functions/send-sms.js
// Sends an SMS FROM a business's assigned YABA number.
// Used by: workflows, CRM follow-ups, appointment reminders, broadcasts.
// Automatically checks usage limits before sending (ties into your
// two-tier cap system from the project instructions).

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

    // Get the business's assigned number + owning user_id (for usage limits)
    const { data: business, error: bizError } = await supabase
      .from('businesses')
      .select('phone_number, user_id, plan:user_id(plan)')
      .eq('id', businessId)
      .single()

    if (bizError || !business) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Business not found' }) }
    }

    if (!business.phone_number) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'This business has no phone number yet. Provision one first.' })
      }
    }

    // ── Usage limit check (two-tier cap system) ──
    const limitCheck = await checkSmsLimit(supabase, business.user_id)
    if (!limitCheck.allowed) {
      return {
        statusCode: 429,
        body: JSON.stringify({ error: limitCheck.message, reason: limitCheck.reason })
      }
    }

    // Send via Twilio using YOUR master account, FROM their assigned number
    const client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    )

    const sms = await client.messages.create({
      body: message,
      from: business.phone_number,
      to: to
    })

    // Increment usage counters
    await incrementSmsUsage(supabase, business.user_id)

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, sid: sms.sid, status: sms.status })
    }

  } catch (err) {
    console.error('Send SMS error:', err)
    return { statusCode: 500, body: JSON.stringify({ error: err.message || 'Failed to send SMS' }) }
  }
}

async function checkSmsLimit(supabase, userId) {
  const { data: usage } = await supabase
    .from('usage')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (!usage) return { allowed: true } // no usage row yet, allow + create on increment

  const DAILY_LIMITS   = { free: 3, starter: 5, growth: 20, agency: 80 }
  const MONTHLY_LIMITS = { free: 25, starter: 100, growth: 500, agency: 2000 }
  const plan = usage.plan || 'free'

  if (usage.sms_daily >= DAILY_LIMITS[plan]) {
    return { allowed: false, reason: 'daily', message: `Daily SMS limit reached for ${plan} plan. Resets in 24 hours or upgrade.` }
  }
  if (usage.sms_monthly >= MONTHLY_LIMITS[plan]) {
    return { allowed: false, reason: 'monthly', message: `Monthly SMS limit reached for ${plan} plan. Upgrade to keep sending.` }
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
