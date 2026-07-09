// netlify/functions/send-usage-warning.js
// Sends an 80% usage warning email when a user hits 80% of their
// monthly cap on any feature. Encourages upgrade before they hit the wall.

import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'

const resend = new Resend(process.env.RESEND_API_KEY)
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

const FEATURE_LABELS = {
  claude:    'AI Requests',
  replicate: 'Image Generations',
  email:     'Emails Sent',
  sms:       'SMS Messages'
}

const UPGRADE_LINKS = {
  free:    'https://yaba-ai.netlify.app/signup.html?upgrade=starter',
  starter: 'https://yaba-ai.netlify.app/signup.html?upgrade=growth',
  growth:  'https://yaba-ai.netlify.app/signup.html?upgrade=agency'
}

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  try {
    const { userId, feature, plan, used, limit } = await req.json()

    // Get user email
    const { data: user } = await supabase
      .from('users')
      .select('email')
      .eq('id', userId)
      .single()

    if (!user?.email) {
      return new Response(JSON.stringify({ skipped: true, reason: 'no email' }), { status: 200 })
    }

    const featureLabel = FEATURE_LABELS[feature] || feature
    const upgradeLink = UPGRADE_LINKS[plan] || UPGRADE_LINKS.growth
    const pct = Math.round((used / limit) * 100)
    const remaining = limit - used

    await resend.emails.send({
      from: 'YABA <hello@notifications.yaba.app>',
      to: [user.email],
      subject: `⚠️ You've used ${pct}% of your monthly ${featureLabel}`,
      html: `
        <div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1C1F3B">
          <div style="font-family:Nunito,sans-serif;font-weight:900;font-size:1.4rem;color:#0073EA;margin-bottom:24px">YABA</div>
          
          <h2 style="font-family:Nunito,sans-serif;font-weight:900;font-size:1.3rem;margin-bottom:12px">
            Heads up — you're at ${pct}% of your monthly ${featureLabel}
          </h2>
          
          <p style="color:#676879;line-height:1.7;margin-bottom:20px">
            You have <strong style="color:#1C1F3B">${remaining} ${featureLabel.toLowerCase()}</strong> left this month on your 
            <strong style="color:#1C1F3B">${plan.charAt(0).toUpperCase() + plan.slice(1)}</strong> plan.
            If you hit the limit, that feature pauses until your next billing cycle.
          </p>

          <div style="background:#F6F7FB;border-radius:10px;padding:20px;margin-bottom:24px">
            <div style="font-family:Nunito,sans-serif;font-weight:800;font-size:0.85rem;color:#1C1F3B;margin-bottom:8px">Your usage this month</div>
            <div style="background:#E6E9EF;border-radius:100px;height:8px;overflow:hidden;margin-bottom:6px">
              <div style="background:${pct >= 90 ? '#FF5C35' : '#0073EA'};height:100%;width:${pct}%;border-radius:100px"></div>
            </div>
            <div style="font-size:0.78rem;color:#676879">${used} of ${limit} ${featureLabel.toLowerCase()} used</div>
          </div>

          <p style="color:#676879;line-height:1.7;margin-bottom:24px">
            Upgrade now to get more capacity and make sure nothing stops while you're growing.
          </p>

          <a href="${upgradeLink}" style="display:inline-block;background:#0073EA;color:#fff;padding:14px 28px;border-radius:8px;font-family:Nunito,sans-serif;font-weight:800;font-size:0.95rem;text-decoration:none;margin-bottom:24px">
            Upgrade My Plan →
          </a>

          <p style="font-size:0.78rem;color:#C3C6D4;line-height:1.6">
            You're receiving this because you have an active YABA account. 
            <a href="#" style="color:#C3C6D4">Manage email preferences</a>
          </p>
        </div>
      `
    })

    return new Response(JSON.stringify({ success: true, sentTo: user.email }), { status: 200 })

  } catch (err) {
    console.error('send-usage-warning error:', err)
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
}
