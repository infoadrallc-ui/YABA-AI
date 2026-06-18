// netlify/functions/provision-phone-number.js
// Automatically buys a Twilio phone number for a new business
// and saves it to their record in Supabase.
// Called automatically during the generation flow (one of the gen- steps)
// or manually triggered from the dashboard if a business needs a number later.

const twilio = require('twilio')
const { createClient } = require('@supabase/supabase-js')

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  try {
    const { businessId, areaCode } = JSON.parse(event.body)

    if (!businessId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'businessId is required' }) }
    }

    // Init Supabase (service key = full access, server-side only)
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    )

    // Check if this business already has a number
    const { data: existing } = await supabase
      .from('businesses')
      .select('phone_number')
      .eq('id', businessId)
      .single()

    if (existing?.phone_number) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          phoneNumber: existing.phone_number,
          message: 'Business already has a number'
        })
      }
    }

    // Init Twilio with YOUR master account credentials
    const client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    )

    // Get the business's location to pick a sensible area code if none given
    let searchAreaCode = areaCode
    if (!searchAreaCode) {
      const { data: biz } = await supabase
        .from('businesses')
        .select('location')
        .eq('id', businessId)
        .single()
      // Very simple default — falls back to a generic search if no match
      searchAreaCode = guessAreaCodeFromLocation(biz?.location)
    }

    // Search for an available local number
    let availableNumbers = await client
      .availablePhoneNumbers('US')
      .local
      .list({
        areaCode: searchAreaCode || undefined,
        smsEnabled: true,
        voiceEnabled: true,
        limit: 1
      })

    // Fallback — no numbers in that area code, search nationally
    if (availableNumbers.length === 0) {
      availableNumbers = await client
        .availablePhoneNumbers('US')
        .local
        .list({ smsEnabled: true, voiceEnabled: true, limit: 1 })
    }

    if (availableNumbers.length === 0) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'No available phone numbers found' })
      }
    }

    const numberToBuy = availableNumbers[0].phoneNumber

    // Purchase the number and point it at your webhook handlers
    const purchasedNumber = await client.incomingPhoneNumbers.create({
      phoneNumber: numberToBuy,
      smsUrl: `${process.env.SITE_URL}/.netlify/functions/sms-webhook?businessId=${businessId}`,
      smsMethod: 'POST',
      voiceUrl: `${process.env.SITE_URL}/.netlify/functions/voice-webhook?businessId=${businessId}`,
      voiceMethod: 'POST',
      friendlyName: `YABA-${businessId}`
    })

    // Save the number to the business record in Supabase
    const { error: updateError } = await supabase
      .from('businesses')
      .update({
        phone_number: purchasedNumber.phoneNumber,
        twilio_sid: purchasedNumber.sid
      })
      .eq('id', businessId)

    if (updateError) throw updateError

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        phoneNumber: purchasedNumber.phoneNumber,
        message: 'Phone number provisioned successfully'
      })
    }

  } catch (err) {
    console.error('Provision number error:', err)
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || 'Failed to provision number' })
    }
  }
}

// Very rough city/state -> area code lookup for common cases.
// Extend this list over time, or swap for a real geo->area-code API later.
function guessAreaCodeFromLocation(location) {
  if (!location) return null
  const loc = location.toLowerCase()
  const map = {
    'atlanta': '404', 'new york': '212', 'los angeles': '213',
    'chicago': '312', 'houston': '713', 'dallas': '214',
    'miami': '305', 'philadelphia': '215', 'phoenix': '602',
    'san antonio': '210', 'san diego': '619', 'austin': '512',
    'jacksonville': '904', 'san francisco': '415', 'columbus': '614',
    'charlotte': '704', 'indianapolis': '317', 'seattle': '206',
    'denver': '303', 'washington': '202', 'boston': '617',
    'nashville': '615', 'detroit': '313', 'memphis': '901',
    'baltimore': '410', 'milwaukee': '414', 'las vegas': '702'
  }
  for (const city in map) {
    if (loc.includes(city)) return map[city]
  }
  return null
}
