// ── HERO BACKGROUND ──
function initHeroBg() {
  const bg = document.getElementById('hero-bg')
  if (!bg) return
  const colors = ['#FF6B6B','#A78BFA','#4ECDC4','#FFD23F','#F472B6','#FF8E53']
  for (let i = 0; i < 6; i++) {
    const orb = document.createElement('div')
    orb.style.cssText = `
      position:absolute;
      width:${200 + Math.random()*300}px;
      height:${200 + Math.random()*300}px;
      border-radius:50%;
      background:${colors[i]};
      opacity:0.07;
      left:${Math.random()*100}%;
      top:${Math.random()*100}%;
      animation:orbFloat ${8+Math.random()*8}s ease-in-out infinite;
      animation-delay:${Math.random()*4}s;
      filter:blur(40px);
      pointer-events:none;
    `
    bg.appendChild(orb)
  }
}

// ── MOBILE MENU ──
function toggleMobileMenu() {
  document.getElementById('mobile-menu').classList.toggle('open')
}

// ── SMOOTH SCROLL ──
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    e.preventDefault()
    const t = document.querySelector(a.getAttribute('href'))
    if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
})

// ── NAV SHADOW ON SCROLL ──
window.addEventListener('scroll', () => {
  document.querySelector('.nav').style.boxShadow =
    window.scrollY > 20 ? '0 4px 24px rgba(0,0,0,0.08)' : 'none'
})

// ── TOAST ──
function showToast(message, type = '') {
  const c = document.getElementById('toasts')
  const t = document.createElement('div')
  t.className = `toast ${type}`
  t.textContent = message
  c.appendChild(t)
  setTimeout(() => t.remove(), 3500)
}

// ── INIT ──
initHeroBg()
