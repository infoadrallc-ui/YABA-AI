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
    const { email, password } = await req.json()

    if (!email || !password) {
      return new Response(JSON.stringify({ error: 'Email and password required' }), { status: 400 })
    }

    // Get user
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email.toLowerCase())
      .single()

    if (error || !user) {
      return new Response(JSON.stringify({ error: 'Invalid email or password' }), { status: 401 })
    }

    // Verify password
    const [salt, hash] = user.password_hash.split(':')
    const testHash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex')

    if (testHash !== hash) {
      return new Response(JSON.stringify({ error: 'Invalid email or password' }), { status: 401 })
    }

    // Get business to check onboarding status
    const { data: business } = await supabase
      .from('businesses')
      .select('id, onboarding_complete')
      .eq('user_id', user.id)
      .single()

    // Generate token
    const token = crypto.randomBytes(32).toString('hex')

    const safeUser = {
      id:                  user.id,
      email:               user.email,
      plan:                user.plan,
      trial_end:           user.trial_end,
      onboarding_complete: business?.onboarding_complete || false,
      business_id:         business?.id || null
    }

    return new Response(JSON.stringify({ token, user: safeUser }), {
      status:  200,
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('Login error:', err)
    return new Response(JSON.stringify({ error: 'Login failed' }), { status: 500 })
  }
}
