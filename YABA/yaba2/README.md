# YABA ✨ — Your AI Business Assistant

Build once. Run everything.

## What Is YABA?
YABA is an AI-powered business operating system. Users describe their business and YABA automatically generates their website, business plan, content calendar, CRM, funnels, email sequences, and 32 automated workflows — in under 90 seconds.

---

## Tech Stack
- **Frontend:** HTML, CSS, Vanilla JavaScript
- **Hosting:** Netlify
- **Backend:** Netlify Functions (Node.js)
- **Database:** Supabase (PostgreSQL)
- **AI:** Anthropic Claude (Sonnet 4.6)
- **Images:** Replicate (Flux 1.1 Pro)
- **Video:** Pexels API
- **Email:** SendGrid
- **SMS:** Twilio
- **Payments:** Stripe
- **Social:** ManyChat (client-connected)

---

## Setup Instructions

### 1. Clone the repo
```bash
git clone https://github.com/YOURNAME/yaba.git
cd yaba
```

### 2. Install dependencies
```bash
npm install
```

### 3. Create your .env file
```bash
cp .env.example .env
```
Fill in all API keys in `.env`

### 4. Add environment variables to Netlify
Go to: Site Configuration → Environment Variables
Add every key from your `.env` file

### 5. Set up Supabase
- Create a new Supabase project
- Run all SQL files from `/supabase/` folder in SQL Editor
- Enable Row Level Security on all tables

### 6. Run locally
```bash
netlify dev
```
Opens at: http://localhost:8888

### 7. Deploy
```bash
git add .
git commit -m "your message"
git push
```
Netlify auto-deploys on every push.

---

## Test Your Connection
After deploying visit:
```
https://your-site.netlify.app/.netlify/functions/test-connection
```
Should show all green checkmarks.

---

## Build Phases
- **Phase 1** ✅ Foundation — file structure, landing page, config
- **Phase 2** 🔄 Auth & Payments — signup, login, Stripe
- **Phase 3** ⏳ Onboarding — AI interview, 9 generation chunks
- **Phase 4** ⏳ Website Generator — hero video, animations, copy
- **Phase 5** ⏳ Dashboard — all 16 sections, 89 sub-tabs
- **Phase 6** ⏳ CRM — AI scoring, pipeline, workflows
- **Phase 7** ⏳ Commerce — products, orders, bookings, funnels
- **Phase 8** ⏳ Marketing — email, SMS, automations, affiliates
- **Phase 9** ⏳ Launch — beta users, feedback, iterate

---

## Pricing Plans
| Plan | Price | Contacts | Products |
|---|---|---|---|
| Starter | $49/mo | 500 | 20 |
| Growth | $97/mo | 2,500 | Unlimited |
| Agency | $197/mo | Unlimited | Unlimited |

All plans include 14-day free trial.

---

© 2026 YABA Inc. — Build once. Run everything.
