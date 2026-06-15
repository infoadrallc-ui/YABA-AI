import { createClient } from '@supabase/supabase-js'

export default async (req, context) => {
  const results = {}

  // Test Supabase
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    )
    const { error } = await supabase.from('users').select('count').limit(1)
    results.supabase = error ? `❌ ${error.message}` : '✅ Connected'
  } catch (e) {
    results.supabase = `❌ ${e.message}`
  }

  // Test env vars present
  results.anthropic  = process.env.ANTHROPIC_API_KEY  ? '✅ Key present' : '❌ Missing'
  results.replicate  = process.env.REPLICATE_API_KEY  ? '✅ Key present' : '❌ Missing'
  results.stripe     = process.env.STRIPE_SECRET_KEY  ? '✅ Key present' : '❌ Missing'
  results.sendgrid   = process.env.SENDGRID_API_KEY   ? '✅ Key present' : '❌ Missing'
  results.twilio     = process.env.TWILIO_ACCOUNT_SID ? '✅ Key present' : '❌ Missing'
  results.pexels     = process.env.PEXELS_API_KEY     ? '✅ Key present' : '❌ Missing'

  const allGood = Object.values(results).every(v => v.startsWith('✅'))

  return new Response(JSON.stringify({
    status:  allGood ? 'all systems go ✨' : 'some issues found',
    results,
    timestamp: new Date().toISOString()
  }, null, 2), {
    status:  200,
    headers: { 'Content-Type': 'application/json' }
  })
}
