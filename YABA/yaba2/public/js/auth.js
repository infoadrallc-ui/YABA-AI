// ── SUPABASE CLIENT ──
// Replace these with your actual Supabase credentials
const SUPABASE_URL  = 'YOUR_SUPABASE_URL'
const SUPABASE_ANON = 'YOUR_SUPABASE_ANON_KEY'

// ── TOAST ──
function showToast(message, type = '') {
  const c = document.getElementById('toasts')
  if (!c) return
  const t = document.createElement('div')
  t.className = `toast ${type}`
  t.textContent = message
  c.appendChild(t)
  setTimeout(() => t.remove(), 3500)
}

// ── TOGGLE PASSWORD VISIBILITY ──
function togglePassword() {
  const inputs = document.querySelectorAll('input[type="password"], input[type="text"].pw')
  inputs.forEach(input => {
    if (input.id === 'password' || input.id === 'confirmPassword') {
      input.type = input.type === 'password' ? 'text' : 'password'
    }
  })
  const pwd = document.getElementById('password')
  if (pwd) pwd.type = pwd.type === 'password' ? 'text' : 'password'
  const cpwd = document.getElementById('confirmPassword')
  if (cpwd) cpwd.type = cpwd.type === 'password' ? 'text' : 'password'
}

// ── PLAN SELECTION ──
let selectedPlan = 'growth'

function selectPlan(plan, el) {
  selectedPlan = plan
  document.querySelectorAll('.plan-opt').forEach(o => o.classList.remove('active'))
  if (el) el.classList.add('active')
}

// ── SIGNUP ──
async function handleSignup() {
  const firstName       = document.getElementById('firstName')?.value?.trim()
  const lastName        = document.getElementById('lastName')?.value?.trim()
  const email           = document.getElementById('email')?.value?.trim()
  const password        = document.getElementById('password')?.value
  const confirmPassword = document.getElementById('confirmPassword')?.value
  const terms           = document.getElementById('terms')?.checked

  // Validate
  if (!firstName || !lastName) return showToast('Please enter your full name', 'error')
  if (!email)                   return showToast('Please enter your email', 'error')
  if (!password)                return showToast('Please enter a password', 'error')
  if (password.length < 8)      return showToast('Password must be at least 8 characters', 'error')
  if (password !== confirmPassword) return showToast('Passwords do not match', 'error')
  if (!terms)                   return showToast('Please agree to the terms', 'error')

  // Loading state
  const btn = document.getElementById('signup-btn')
  btn.textContent = 'Creating your account...'
  btn.classList.add('btn-loading')
  btn.disabled = true

  try {
    const res = await fetch('/.netlify/functions/auth-signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName, lastName, email, password, plan: selectedPlan })
    })

    const data = await res.json()

    if (!res.ok) throw new Error(data.error || 'Signup failed')

    // Store session token
    localStorage.setItem('yaba_token', data.token)
    localStorage.setItem('yaba_user',  JSON.stringify(data.user))

    showToast('Account created! Taking you to onboarding... ✨', 'success')

    setTimeout(() => {
      window.location.href = '/onboarding'
    }, 1000)

  } catch (err) {
    showToast(err.message, 'error')
    btn.textContent = 'Start Free Trial →'
    btn.classList.remove('btn-loading')
    btn.disabled = false
  }
}

// ── LOGIN ──
async function handleLogin() {
  const email    = document.getElementById('email')?.value?.trim()
  const password = document.getElementById('password')?.value
  const remember = document.getElementById('remember')?.checked

  if (!email)    return showToast('Please enter your email', 'error')
  if (!password) return showToast('Please enter your password', 'error')

  const btn = document.getElementById('login-btn')
  btn.textContent = 'Logging in...'
  btn.classList.add('btn-loading')
  btn.disabled = true

  try {
    const res = await fetch('/.netlify/functions/auth-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, remember })
    })

    const data = await res.json()

    if (!res.ok) throw new Error(data.error || 'Login failed')

    localStorage.setItem('yaba_token', data.token)
    localStorage.setItem('yaba_user',  JSON.stringify(data.user))

    showToast('Welcome back! ✨', 'success')

    setTimeout(() => {
      // If onboarding not complete go there first
      if (!data.user.onboarding_complete) {
        window.location.href = '/onboarding'
      } else {
        window.location.href = '/dashboard'
      }
    }, 800)

  } catch (err) {
    showToast(err.message, 'error')
    btn.textContent = 'Log In →'
    btn.classList.remove('btn-loading')
    btn.disabled = false
  }
}

// ── FORGOT PASSWORD ──
async function handleForgotPassword() {
  const email = document.getElementById('email')?.value?.trim()
  if (!email) return showToast('Enter your email first', 'error')

  try {
    await fetch('/.netlify/functions/auth-forgot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    })
    showToast('Reset link sent if that email exists ✅', 'success')
  } catch {
    showToast('Something went wrong', 'error')
  }
}

// ── AUTH GUARD (call on protected pages) ──
function requireAuth() {
  const token = localStorage.getItem('yaba_token')
  if (!token) {
    window.location.href = '/login'
    return null
  }
  return JSON.parse(localStorage.getItem('yaba_user') || '{}')
}

// ── GET CURRENT USER ──
function getCurrentUser() {
  const u = localStorage.getItem('yaba_user')
  return u ? JSON.parse(u) : null
}

// ── LOGOUT ──
function logout() {
  localStorage.removeItem('yaba_token')
  localStorage.removeItem('yaba_user')
  window.location.href = '/'
}

// ── ENTER KEY SUPPORT ──
document.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    if (document.getElementById('signup-btn')) handleSignup()
    if (document.getElementById('login-btn'))  handleLogin()
  }
})
