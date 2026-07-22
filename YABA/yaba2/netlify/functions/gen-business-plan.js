// netlify/functions/gen-business-plan.js
// Step 2 of 9. Claude writes a realistic 3-phase financial roadmap
// based on the business's current revenue, goal, budget, and hours.

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  try {
    const { businessData } = await req.json()
    const { businessId, businessName, nicheSpecific, products, primaryGoal,
            revenueGoal, currentRevenue, budget, hoursPerWeek, targetCustomer } = businessData

    const prompt = `You are a business strategist creating a realistic financial roadmap for a small business owner.

Business: ${businessName} — ${nicheSpecific}
What they sell: ${products}
Target customer: ${targetCustomer}
Current monthly revenue: ${currentRevenue}
12-month revenue goal: ${revenueGoal}
Available investment budget: ${budget}
Hours per week available: ${hoursPerWeek}
Primary goal: ${primaryGoal}

Create a realistic, specific 3-phase business plan. Be honest — if their goal is ambitious, say so but show the path. Respond ONLY with valid JSON, no markdown, no backticks:
{
  "summary": "2-3 sentence honest assessment of their situation and what it will take",
  "monthly_target": "what they need to make per month to hit the annual goal",
  "leads_needed_monthly": "realistic number of leads needed per month based on typical conversion rates for this niche",
  "phase_one": {
    "title": "Phase 1 title",
    "timeframe": "Month 1-3",
    "focus": "one sentence description",
    "monthly_revenue_target": "dollar amount",
    "milestones": ["milestone 1", "milestone 2", "milestone 3", "milestone 4"],
    "key_actions": ["action 1", "action 2", "action 3"],
    "budget_allocation": "how to spend their budget in this phase"
  },
  "phase_two": {
    "title": "Phase 2 title",
    "timeframe": "Month 4-6",
    "focus": "one sentence description",
    "monthly_revenue_target": "dollar amount",
    "milestones": ["milestone 1", "milestone 2", "milestone 3", "milestone 4"],
    "key_actions": ["action 1", "action 2", "action 3"],
    "budget_allocation": "how to spend their budget in this phase"
  },
  "phase_three": {
    "title": "Phase 3 title",
    "timeframe": "Month 7-12",
    "focus": "one sentence description",
    "monthly_revenue_target": "dollar amount",
    "milestones": ["milestone 1", "milestone 2", "milestone 3", "milestone 4"],
    "key_actions": ["action 1", "action 2", "action 3"],
    "budget_allocation": "how to spend their budget in this phase"
  },
  "revenue_streams": ["primary revenue stream", "secondary stream", "potential third stream"],
  "biggest_risks": ["risk 1", "risk 2"],
  "quick_wins": ["something they can do this week to generate revenue", "another quick win"]
}`

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }]
    })

    const raw = message.content[0].text
    const clean = raw.replace(/```json|```/g, '').trim()
    const plan = JSON.parse(clean)

    // Save to business_plans table
    const { error } = await supabase
      .from('business_plans')
      .upsert({
        business_id: businessId,
        revenue_goal: revenueGoal,
        current_revenue: currentRevenue,
        budget,
        phase_one: plan.phase_one,
        phase_two: plan.phase_two,
        phase_three: plan.phase_three,
        leads_needed: parseInt(plan.leads_needed_monthly) || 0,
        revenue_streams: plan.revenue_streams,
        milestones: { summary: plan.summary, quick_wins: plan.quick_wins }
      }, { onConflict: 'business_id' })

    if (error) throw error

    return new Response(JSON.stringify({ success: true, plan }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('gen-business-plan error:', err)
    return new Response(JSON.stringify({ error: err.message || 'Failed to generate business plan' }), { status: 500 })
  }
}
