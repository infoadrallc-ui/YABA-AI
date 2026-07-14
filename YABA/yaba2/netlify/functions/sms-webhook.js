// netlify/functions/sms-webhook.js
// Receives INCOMING SMS replies from customers texting a business's
// YABA number. Twilio calls this automatically — you set this as the
// smsUrl when the number was purchased (already wired in provision-phone-number.js).
// Saves the message to sms_conversations and can trigger AI auto-reply later.

const { createClient } = require('@supabase/supabase-js')

exports.handler = async (event) => {
  try {
    const businessId = event.queryStringParameters?.businessId
    const params = new URLSearchParams(event.body)
    const from = params.get('From')
    const to = params.get('To')
    const body = params.get('Body')

    if (!businessId) {
      return { statusCode: 400, body: 'Missing businessId' }
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    )

    // Find or create the conversation thread for this phone number
    const { data: existing } = await supabase
      .from('sms_conversations')
      .select('*')
      .eq('business_id', businessId)
      .eq('customer_phone', from)
      .single()

    const newMessage = { from: 'customer', body, timestamp: new Date().toISOString() }

    if (existing) {
      const updatedMessages = [...(existing.messages || []), newMessage]
      await supabase
        .from('sms_conversations')
        .update({ messages: updatedMessages, last_message_at: new Date().toISOString() })
        .eq('id', existing.id)
    } else {
      await supabase
        .from('sms_conversations')
        .insert({
          business_id: businessId,
          customer_phone: from,
          messages: [newMessage],
          last_message_at: new Date().toISOString()
        })
    }

    // Respond with empty TwiML so Twilio doesn't auto-reply
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/xml' },
      body: '<?xml version="1.0" encoding="UTF-8"?><Response></Response>'
    }

  } catch (err) {
    console.error('SMS webhook error:', err)
    return { statusCode: 500, body: 'Error processing message' }
  }
}
