// This is a shared helper — NOT a Netlify function itself.
// Import this inside any function that needs to check limits before an API call.
// Usage:
//   import { checkAndIncrement } from './limits-helper.js'
//   const check = await checkAndIncrement(userId, 'claude')
//   if (!check.allowed) return limitError(check)

export async function checkAndIncrement(userId, feature) {
  try {
    const res = await fetch(`${process.env.SITE_URL}/.netlify/functions/check-limits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, feature, increment: true })
    })
    return await res.json()
  } catch (err) {
    // On error — allow (never block on limits bug)
    return { allowed: true }
  }
}

export function limitErrorResponse(check) {
  return new Response(JSON.stringify({
    error: check.message || 'Limit reached',
    reason: check.reason,
    plan: check.plan,
    upgradeUrl: 'https://yaba-ai.netlify.app/signup.html?upgrade=true'
  }), {
    status: 429,
    headers: { 'Content-Type': 'application/json' }
  })
}
