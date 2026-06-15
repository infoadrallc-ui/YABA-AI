import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

export default async (req, context) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  try {
    const { firstName, lastName, email, password, plan } = await req.json()

    // Basic validation
    if (!email || !password || !firstName || !lastName) {
      return new Response(JSON.stringify({ error: 'All fields required' }), { status: 400 })
    }
    if (password.length < 8) {
      return new Response(JSON.stringify({ error: 'Password must be at least 8 characters' }), { status: 400 })
    }

    // Check if email already exists
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('email', email.toLowerCase())
      .single()

    if (existing) {
      return new Response(JSON.stringify({ error: 'Email already in use' }), { status: 400 })
    }

    // Hash password
    const salt         = crypto.randomBytes(16).toString('hex')
    const passwordHash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex')
    const storedHash   = `${salt}:${passwordHash}`

    // Set trial dates
    const trialStart = new Date()
    const trialEnd   = new Date()
    trialEnd.setDate(trialEnd.getDate() + 14)

    // Create user
    const { data: user, error: userError } = await supabase
      .from('users')
      .insert({
        email:         email.toLowerCase(),
        password_hash: storedHash,
        plan:          'free',
        trial_start:   trialStart.toISOString(),
        trial_end:     trialEnd.toISOString()
      })
      .select()
      .single()

    if (userError) throw userError

    // Create usage record
    await supabase.from('usage').insert({
      user_id:          user.id,
      plan:             'free',
      daily_reset_at:   new Date().toISOString(),
      monthly_reset_at: new Date().toISOString(),
      period_start:     trialStart.toISOString(),
      period_end:       trialEnd.toISOString()
    })

    // Generate session token
    const token = crypto.randomBytes(32).toString('hex')

    // Return user data (no password hash)
    const safeUser = {
      id:                 user.id,
      email:              user.email,
      firstName,
      lastName,
      plan:               user.plan,
      trial_end:          user.trial_end,
      onboarding_complete: false
    }

    // Store token in DB (simple session)
    await supabase.from('sessions').insert({
      user_id:    user.id,
      token,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    }).catch(() => {}) // sessions table optional — handle gracefully

    return new Response(JSON.stringify({ token, user: safeUser }), {
      status:  200,
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('Signup error:', err)
    return new Response(JSON.stringify({ error: err.message || 'Signup failed' }), { status: 500 })
  }
}
