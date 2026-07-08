// netlify/functions/save-onboarding.js
// Called at the end of the onboarding flow before generating.html starts.
// Creates the business record in Supabase so all gen- functions have
// a business_id to save data against.

import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  try {
    // Verify the user's session token
    const authHeader = req.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '')

    if (!token) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
    }

    // Look up the session
    const { data: session } = await supabase
      .from('sessions')
      .select('user_id, expires_at')
      .eq('token', token)
      .single()

    if (!session || new Date(session.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'Session expired — please log in again' }), { status: 401 })
    }

    const userId = session.user_id
    const data = await req.json()

    // Check if this user already has a business (returning through onboarding again)
    const { data: existingBiz } = await supabase
      .from('businesses')
      .select('id')
      .eq('user_id', userId)
      .single()

    let businessId

    if (existingBiz) {
      // Update existing business record
      businessId = existingBiz.id
      await supabase
        .from('businesses')
        .update({
          business_name:      data.businessName,
          owner_name:         data.ownerName,
          business_type:      data.businessType,
          niche:              data.nicheSpecific,
          products:           data.products,
          target_customer:    data.targetCustomer,
          location:           data.location,
          service_area:       data.serviceArea,
          platforms:          data.platforms || [],
          primary_goal:       data.primaryGoal,
          style:              data.style,
          brand_colors:       data.brandColors || [],
          animations_enabled: data.animationsEnabled !== false,
          onboarding_complete: false
        })
        .eq('id', businessId)
    } else {
      // Create new business record
      const { data: newBiz, error: bizError } = await supabase
        .from('businesses')
        .insert({
          user_id:            userId,
          business_name:      data.businessName,
          owner_name:         data.ownerName,
          business_type:      data.businessType,
          niche:              data.nicheSpecific,
          products:           data.products,
          target_customer:    data.targetCustomer,
          location:           data.location,
          service_area:       data.serviceArea,
          platforms:          data.platforms || [],
          primary_goal:       data.primaryGoal,
          style:              data.style,
          brand_colors:       data.brandColors || [],
          animations_enabled: data.animationsEnabled !== false,
          onboarding_complete: false
        })
        .select()
        .single()

      if (bizError) throw bizError
      businessId = newBiz.id
    }

    return new Response(JSON.stringify({ success: true, businessId }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('save-onboarding error:', err)
    return new Response(JSON.stringify({ error: err.message || 'Failed to save onboarding data' }), { status: 500 })
  }
}
