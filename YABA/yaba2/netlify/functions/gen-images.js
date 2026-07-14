// netlify/functions/gen-images.js
// Step 7 of 9. Uses Replicate (Flux 1.1 Pro) to generate the hero image
// based on the brand profile's hero_image_prompt built in step 1.
// Falls back to a Pexels video search if image generation fails.

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  try {
    const { businessData } = await req.json()
    const { businessId, nicheSpecific, style, brandColors } = businessData

    // Build the image prompt from their niche and style
    const stylePromptMap = {
      modern:     'clean minimal product photography, white background, soft lighting, professional',
      luxury:     'editorial luxury photography, high contrast cinematic lighting, sophisticated composition',
      playful:    'bright colorful fun photography, vibrant saturated colors, energetic composition',
      streetwear: 'urban gritty photography, high contrast black and white with one color accent, raw texture',
      bohemian:   'warm earthy tones, natural lighting, organic textures, artisanal feel',
      dark_moody: 'dramatic dark photography, deep shadows, cinematic, rich jewel tones',
      classic:    'timeless professional photography, warm neutrals, symmetrical composition',
      eclectic:   'maximalist colorful photography, bold color blocking, layered composition'
    }

    const stylePrompt = stylePromptMap[style] || stylePromptMap.modern
    const colorPrompt = brandColors?.length > 0 ? `color palette: ${brandColors.join(', ')}` : ''
    const imagePrompt = `${nicheSpecific} business hero image, ${stylePrompt}, ${colorPrompt}, high quality commercial photography, 8K resolution, no people, product focused, professional website hero image`

    // Try Replicate Flux 1.1 Pro first
    let heroImageUrl = null

    try {
      const replicateRes = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-1.1-pro/predictions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.REPLICATE_API_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'wait'
        },
        body: JSON.stringify({
          input: {
            prompt: imagePrompt,
            width: 1440,
            height: 900,
            output_format: 'webp',
            output_quality: 90
          }
        })
      })

      const replicateData = await replicateRes.json()

      if (replicateData.output) {
        heroImageUrl = Array.isArray(replicateData.output)
          ? replicateData.output[0]
          : replicateData.output
      }
    } catch (replicateErr) {
      console.log('Replicate failed, falling back to Pexels:', replicateErr.message)
    }

    // Fallback — search Pexels for a relevant video/image
    if (!heroImageUrl) {
      try {
        const pexelsRes = await fetch(
          `https://api.pexels.com/videos/search?query=${encodeURIComponent(nicheSpecific)}&per_page=1&orientation=landscape`,
          { headers: { 'Authorization': process.env.PEXELS_API_KEY } }
        )
        const pexelsData = await pexelsRes.json()
        if (pexelsData.videos?.length > 0) {
          const video = pexelsData.videos[0]
          const hdFile = video.video_files?.find(f => f.quality === 'hd') || video.video_files?.[0]
          heroImageUrl = hdFile?.link || null
        }
      } catch (pexelsErr) {
        console.log('Pexels fallback also failed:', pexelsErr.message)
      }
    }

    // Save to businesses and websites tables
    if (heroImageUrl) {
      await supabase
        .from('businesses')
        .update({ hero_image_url: heroImageUrl })
        .eq('id', businessId)

      await supabase
        .from('websites')
        .update({ hero_image_url: heroImageUrl })
        .eq('business_id', businessId)
    }

    return new Response(JSON.stringify({
      success: true,
      heroImageUrl,
      imagePrompt,
      source: heroImageUrl ? (heroImageUrl.includes('pexels') ? 'pexels' : 'replicate') : 'none'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('gen-images error:', err)
    return new Response(JSON.stringify({ error: err.message || 'Failed to generate images' }), { status: 500 })
  }
}
