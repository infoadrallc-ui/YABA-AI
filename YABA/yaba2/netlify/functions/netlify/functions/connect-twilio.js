// netlify/functions/connect-twilio.js
// Called when a business pastes their Twilio Account SID + Auth Token
// + phone number into the Integrations modal. Validates the credentials
// actually work before saving them.

const twilio = require('twilio')
const { createClient } = require('@supabase/supabase-js')

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  try {
    const { businessId, accountSid, authToken, phoneNumber } = JSON.parse(event.body)

    if (!businessId || !accountSid || !authToken || !phoneNumber) {
      return { statusCode: 400, body: JSON.stringify({ error: 'All fields are required' }) }
    }

    // Validate credentials actually work by pinging Twilio's API
    const client = twilio(accountSid, authToken)
    try {
      await client.api.accounts(accountSid).fetch()
    } catch (twilioErr) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Invalid Twilio credentials. Double check your Account SID and Auth Token.' })
      }
    }

    // Validate the phone number belongs to their account
    try {
      const numbers = await client.incomingPhoneNumbers.list({ phoneNumber })
      if (numbers.length === 0) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'That phone number was not found in your Twilio account.' })
        }
      }
    } catch (numErr) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Could not verify that phone number.' }) }
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    )

    // Save credentials to integrations table
    const { error: intError } = await supabase
      .from('integrations')
      .upsert({
        business_id: businessId,
        platform: 'twilio',
        api_key: accountSid,
        api_secret: authToken,
        connected: true,
        connected_at: new Date().toISOString()
      }, { onConflict: 'business_id,platform' })

    if (intError) throw intError

    // Save the phone number to their business record
    const { error: bizError } = await supabase
      .from('businesses')
      .update({ phone_number: phoneNumber })
      .eq('id', businessId)

    if (bizError) throw bizError

    // Optionally — set the SMS webhook on their number to point at YABA
    try {
      const numbers = await client.incomingPhoneNumbers.list({ phoneNumber })
      if (numbers.length > 0) {
        await client.incomingPhoneNumbers(numbers[0].sid).update({
          smsUrl: `${process.env.SITE_URL}/.netlify/functions/sms-webhook?businessId=${businessId}`,
          smsMethod: 'POST'
        })
      }
    } catch (webhookErr) {
      // Non-fatal — connection still succeeds even if webhook update fails
      console.log('Webhook update failed (non-fatal):', webhookErr.message)
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, message: 'Twilio connected successfully' })
    }

  } catch (err) {
    console.error('Connect Twilio error:', err)
    return { statusCode: 500, body: JSON.stringify({ error: err.message || 'Failed to connect Twilio' }) }
  }
}
