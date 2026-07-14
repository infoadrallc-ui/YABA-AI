// netlify/functions/check-limits.js
// The core two-tier cap system — called before EVERY Claude, Replicate,
// Resend, or Twilio API call. Checks daily cap first, then monthly cap.
// Whichever hits first locks that feature until reset or upgrade.

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

// Daily and monthly caps per plan per feature
const LIMITS = {
  free:    { claude: [5,50],     replicate: [2,10],    email: [5,50],     sms: [0,0] },
  starter: { claude: [20,500],   replicate: [3,50],    email: [40,1000],  sms: [5,100] },
  growth:  { claude: [80,2000],  replicate: [10,200],  email: [200,5000], sms: [20,500] },
  agency:  { claude: [400,10000],replicate: [40,1000], email: [1000,25000],sms:[80,2000] }
}

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  try {
    const { userId, feature, increment = false } = await req.json()

    if (!userId || !feature) {
      return new Response(JSON.stringify({ error: 'userId and feature required' }), { status: 400 })
    }

    const { data: usage, error: usageError } = await supabase
      .from('usage')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (usageError || !usage) {
      // No usage row yet — create one and allow
      await supabase.from('usage').insert({
        user_id: userId,
        plan: 'free',
        claude_daily: 0, replicate_daily: 0, email_daily: 0, sms_daily: 0,
        claude_monthly: 0, replicate_monthly: 0, email_monthly: 0, sms_monthly: 0,
        daily_reset_at: tomorrow().toISOString(),
        monthly_reset_at: nextMonth().toISOString(),
        period_start: new Date().toISOString(),
        period_end: nextMonth().toISOString()
      })
      return new Response(JSON.stringify({ allowed: true, plan: 'free' }), { status: 200 })
    }

    // Check if daily or monthly reset is due
    const now = new Date()
    let updatedUsage = { ...usage }

    if (usage.daily_reset_at && new Date(usage.daily_reset_at) <= now) {
      // Reset daily counters
      updatedUsage.claude_daily = 0
      updatedUsage.replicate_daily = 0
      updatedUsage.email_daily = 0
      updatedUsage.sms_daily = 0
      updatedUsage.daily_reset_at = tomorrow().toISOString()
    }

    if (usage.monthly_reset_at && new Date(usage.monthly_reset_at) <= now) {
      // Reset monthly counters
      updatedUsage.claude_monthly = 0
      updatedUsage.replicate_monthly = 0
      updatedUsage.email_monthly = 0
      updatedUsage.sms_monthly = 0
      updatedUsage.monthly_reset_at = nextMonth().toISOString()
    }

    const plan = usage.plan || 'free'
    const planLimits = LIMITS[plan] || LIMITS.free
    const [dailyLimit, monthlyLimit] = planLimits[feature] || [0, 0]

    const dailyKey = `${feature}_daily`
    const monthlyKey = `${feature}_monthly`
    const dailyUsed = updatedUsage[dailyKey] || 0
    const monthlyUsed = updatedUsage[monthlyKey] || 0

    // Check daily cap first
    if (dailyUsed >= dailyLimit) {
      const resetIn = hoursUntil(updatedUsage.daily_reset_at)
      return new Response(JSON.stringify({
        allowed: false,
        reason: 'daily',
        plan,
        used: dailyUsed,
        limit: dailyLimit,
        message: `Daily limit reached. Resets in ${resetIn} hours or upgrade to keep going.`,
        resetAt: updatedUsage.daily_reset_at
      }), { status: 200 })
    }

    // Check monthly cap
    if (monthlyUsed >= monthlyLimit) {
      const resetIn = daysUntil(updatedUsage.monthly_reset_at)
      return new Response(JSON.stringify({
        allowed: false,
        reason: 'monthly',
        plan,
        used: monthlyUsed,
        limit: monthlyLimit,
        message: `Looks like YABA is working hard for you! You've maxed out your monthly allowance. Upgrade now and never hit a limit again.`,
        resetAt: updatedUsage.monthly_reset_at
      }), { status: 200 })
    }

    // Allowed — optionally increment the counters
    if (increment) {
      updatedUsage[dailyKey] = dailyUsed + 1
      updatedUsage[monthlyKey] = monthlyUsed + 1

      await supabase
        .from('usage')
        .update({
          [dailyKey]: updatedUsage[dailyKey],
          [monthlyKey]: updatedUsage[monthlyKey],
          daily_reset_at: updatedUsage.daily_reset_at,
          monthly_reset_at: updatedUsage.monthly_reset_at
        })
        .eq('user_id', userId)

      // Send 80% warning email if just hit threshold
      const newMonthlyPct = (updatedUsage[monthlyKey] / monthlyLimit) * 100
      const oldMonthlyPct = (monthlyUsed / monthlyLimit) * 100
      if (oldMonthlyPct < 80 && newMonthlyPct >= 80) {
        // Trigger warning email (non-blocking)
        fetch(`${process.env.SITE_URL}/.netlify/functions/send-usage-warning`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, feature, plan, used: updatedUsage[monthlyKey], limit: monthlyLimit })
        }).catch(() => {})
      }
    }

    return new Response(JSON.stringify({
      allowed: true,
      plan,
      daily: { used: updatedUsage[dailyKey], limit: dailyLimit },
      monthly: { used: updatedUsage[monthlyKey], limit: monthlyLimit }
    }), { status: 200 })

  } catch (err) {
    console.error('check-limits error:', err)
    // On error — allow the request so a limits bug never blocks real usage
    return new Response(JSON.stringify({ allowed: true, error: err.message }), { status: 200 })
  }
}

function tomorrow() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(0, 0, 0, 0)
  return d
}

function nextMonth() {
  const d = new Date()
  d.setMonth(d.getMonth() + 1)
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  return d
}

function hoursUntil(dateStr) {
  if (!dateStr) return 24
  return Math.max(1, Math.ceil((new Date(dateStr) - Date.now()) / (1000 * 60 * 60)))
}

function daysUntil(dateStr) {
  if (!dateStr) return 30
  return Math.max(1, Math.ceil((new Date(dateStr) - Date.now()) / (1000 * 60 * 60 * 24)))
}
