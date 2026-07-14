// netlify/functions/send-email.js
// Sends emails for every business on YABA using YOUR Resend account.
// Unlike Twilio, this is a master-account model — Resend doesn't 
// require per-business identity verification, so YABA sends on 
// behalf of every business through one shared sending domain.
//
// Used by: welcome sequences, abandoned cart emails, post-purchase
// follow-ups, broadcasts, review requests, and any workflow step
// that needs to send email.

const { Resend } = require('resend')
const { createClient } = require('@supabase/supabase-js')

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  try {
    const { businessId, to, subject, html, replyTo } = JSON.parse(event.body)

    if (!businessId || !to || !subject || !html) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'businessId, to, subject, and html are required' })
      }
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    )

    // Get the business's info — used for the FROM name and usage limits
    const { data: business, error: bizError } = await supabase
      .from('businesses')
      .select('business_name, user_id')
      .eq('id', businessId)
      .single()

    if (bizError || !business) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Business not found' }) }
    }

    // ── Usage limit check (two-tier cap system) ──
    const limitCheck = await checkEmailLimit(supabase, business.user_id)
    if (!limitCheck.allowed) {
      return {
        statusCode: 429,
        body: JSON.stringify({ error: limitCheck.message, reason: limitCheck.reason })
      }
    }

    // Send via Resend — FROM address shows the business name,
    // but sends through YABA's shared verified domain
    const resend = new Resend(process.env.RESEND_API_KEY)

    const fromName = business.business_name || 'YABA'
    const fromAddress = `${fromName} <hello@notifications.yaba.app>`

    const emailPayload = {
      from: fromAddress,
      to: Array.isArray(to) ? to : [to],
      subject: subject,
      html: html
    }

    // Let customer replies go to the business, not YABA, if a reply-to is given
    if (replyTo) {
      emailPayload.reply_to = replyTo
    }

    const result = await resend.emails.send(emailPayload)

    if (result.error) {
      console.error('Resend error:', result.error)
      return { statusCode: 500, body: JSON.stringify({ error: result.error.message || 'Failed to send email' }) }
    }

    // Increment usage counters
    await incrementEmailUsage(supabase, business.user_id)

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, id: result.data?.id })
    }

  } catch (err) {
    console.error('Send email error:', err)
    return { statusCode: 500, body: JSON.stringify({ error: err.message || 'Failed to send email' }) }
  }
}

async function checkEmailLimit(supabase, userId) {
  const { data: usage } = await supabase
    .from('usage')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (!usage) return { allowed: true } // no usage row yet — allow, row created on increment

  const DAILY_LIMITS   = { free: 5, starter: 40, growth: 200, agency: 1000 }
  const MONTHLY_LIMITS = { free: 50, starter: 1000, growth: 5000, agency: 25000 }
  const plan = usage.plan || 'free'

  if (usage.email_daily >= DAILY_LIMITS[plan]) {
    return {
      allowed: false,
      reason: 'daily',
      message: `Daily email limit reached for ${plan} plan. Resets in 24 hours or upgrade.`
    }
  }
  if (usage.email_monthly >= MONTHLY_LIMITS[plan]) {
    return {
      allowed: false,
      reason: 'monthly',
      message: `Monthly email limit reached for ${plan} plan. Upgrade to keep sending.`
    }
  }
  return { allowed: true }
}

async function incrementEmailUsage(supabase, userId) {
  const { data: usage } = await supabase
    .from('usage')
    .select('email_daily, email_monthly')
    .eq('user_id', userId)
    .single()

  if (usage) {
    await supabase
      .from('usage')
      .update({
        email_daily: (usage.email_daily || 0) + 1,
        email_monthly: (usage.email_monthly || 0) + 1
      })
      .eq('user_id', userId)
  } else {
    // Create a usage row if one doesn't exist yet
    await supabase
      .from('usage')
      .insert({
        user_id: userId,
        plan: 'free',
        email_daily: 1,
        email_monthly: 1,
        daily_reset_at: new Date(Date.now() + 24*60*60*1000).toISOString(),
        monthly_reset_at: new Date(Date.now() + 30*24*60*60*1000).toISOString()
      })
  }
}
