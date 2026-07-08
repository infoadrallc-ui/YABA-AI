// netlify/functions/dashboard-data.js
// Single function that fetches everything the dashboard needs in one call.
// Called on dashboard load — returns real data from Supabase for:
// overview stats, hot leads, recent orders, content due today,
// active workflows, usage meters, and business plan progress.

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  try {
    // Verify session
    const token = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

    const { data: session } = await supabase
      .from('sessions')
      .select('user_id, expires_at')
      .eq('token', token)
      .single()

    if (!session || new Date(session.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'Session expired' }), { status: 401 })
    }

    const userId = session.user_id

    // Get business record
    const { data: business } = await supabase
      .from('businesses')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (!business) {
      return new Response(JSON.stringify({ error: 'No business found', needsOnboarding: true }), { status: 404 })
    }

    const bizId = business.id
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const today = now.toISOString().split('T')[0]

    // Run all queries in parallel for speed
    const [
      leadsRes, ordersRes, contentRes,
      workflowsRes, usageRes, planRes, reviewsRes
    ] = await Promise.all([
      // Hot leads (score 7+, last 30 days)
      supabase.from('leads')
        .select('*, lead_scores(*)')
        .eq('business_id', bizId)
        .order('created_at', { ascending: false })
        .limit(20),

      // Recent orders this month
      supabase.from('orders')
        .select('*')
        .eq('business_id', bizId)
        .gte('created_at', monthStart)
        .order('created_at', { ascending: false })
        .limit(20),

      // Content due today or next 7 days
      supabase.from('content')
        .select('*')
        .eq('business_id', bizId)
        .eq('posted', false)
        .gte('scheduled_date', today)
        .order('scheduled_date', { ascending: true })
        .limit(10),

      // Active workflows
      supabase.from('workflows')
        .select('*')
        .eq('business_id', bizId)
        .order('runs_total', { ascending: false }),

      // Usage this period
      supabase.from('usage')
        .select('*')
        .eq('user_id', userId)
        .single(),

      // Business plan
      supabase.from('business_plans')
        .select('*')
        .eq('business_id', bizId)
        .single(),

      // Recent reviews
      supabase.from('reviews')
        .select('*')
        .eq('business_id', bizId)
        .order('review_date', { ascending: false })
        .limit(5)
    ])

    const leads = leadsRes.data || []
    const orders = ordersRes.data || []
    const content = contentRes.data || []
    const workflows = workflowsRes.data || []
    const usage = usageRes.data || {}
    const plan = planRes.data || {}
    const reviews = reviewsRes.data || []

    // Calculate overview stats
    const monthRevenue = orders
      .filter(o => o.status !== 'cancelled')
      .reduce((sum, o) => sum + (parseFloat(o.total) || 0), 0)

    const hotLeads = leads.filter(l => {
      const score = l.lead_scores?.[0]?.score || 0
      return score >= 7
    })

    const activeWorkflows = workflows.filter(w => w.active)
    const todayContent = content.filter(c => c.scheduled_date === today)
    const weekContent = content.slice(0, 7)

    // Get customers count
    const { count: customerCount } = await supabase
      .from('customers')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', bizId)

    // Recent activity feed (mix of leads + orders)
    const activity = [
      ...leads.slice(0, 3).map(l => ({
        type: 'lead',
        text: `New lead — ${l.name}`,
        source: l.source || 'unknown',
        time: l.created_at,
        color: 'blue'
      })),
      ...orders.slice(0, 3).map(o => ({
        type: 'order',
        text: `Order placed — $${o.total}`,
        source: o.source || 'website',
        time: o.created_at,
        color: 'green'
      }))
    ].sort((a, b) => new Date(b.time) - new Date(a.time)).slice(0, 6)

    return new Response(JSON.stringify({
      success: true,
      business,
      stats: {
        monthRevenue: monthRevenue.toFixed(2),
        newLeads: leads.length,
        ordersThisWeek: orders.filter(o => {
          const orderDate = new Date(o.created_at)
          const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000)
          return orderDate > weekAgo
        }).length,
        activeWorkflows: activeWorkflows.length,
        totalWorkflows: workflows.length,
        customers: customerCount || 0
      },
      hotLeads: hotLeads.slice(0, 5).map(l => ({
        id: l.id,
        name: l.name,
        source: l.source,
        score: l.lead_scores?.[0]?.score || 0,
        classification: l.lead_scores?.[0]?.classification || 'unknown',
        recommendedAction: l.lead_scores?.[0]?.recommended_action || '',
        createdAt: l.created_at,
        email: l.email,
        phone: l.phone
      })),
      recentOrders: orders.slice(0, 5),
      todayContent,
      weekContent,
      workflows: workflows.slice(0, 10),
      activeWorkflowCount: activeWorkflows.length,
      usage: {
        plan: usage.plan || 'free',
        claude: { daily: usage.claude_daily || 0, monthly: usage.claude_monthly || 0 },
        replicate: { daily: usage.replicate_daily || 0, monthly: usage.replicate_monthly || 0 },
        email: { daily: usage.email_daily || 0, monthly: usage.email_monthly || 0 },
        sms: { daily: usage.sms_daily || 0, monthly: usage.sms_monthly || 0 }
      },
      plan,
      reviews,
      activity
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('dashboard-data error:', err)
    return new Response(JSON.stringify({ error: err.message || 'Failed to load dashboard data' }), { status: 500 })
  }
}
