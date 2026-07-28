import 'dotenv/config';
import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn('\n⚠️  ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add your key.\n');
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Allow the Capacitor app (served from capacitor://localhost, not this domain) to call this API
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Images come in as base64 data URLs from the camera capture, so allow a generous body size
app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const SYSTEM_PROMPT = `You are helping a bedside nurse quickly identify medical equipment or supplies from a photo, at the point of care.

For the item in the photo, respond ONLY with JSON in this exact shape, no markdown fences, no extra text:
{
  "identified": true | false,
  "name": "common name of the item",
  "category": "short category, e.g. 'IV Access', 'Wound Care', 'Monitoring', 'Airway', 'PPE'",
  "purpose": "1-2 plain-language sentences on what it's designed to do",
  "typical_spec": "general product specification such as volume, size, or count printed on standard packaging (e.g., '10 mL vial', 'box of 50', '4x4 inch pad'). Leave as an empty string if not applicable or not confidently known",
  "how_to_use": ["short step", "short step", "short step"],
  "watch_outs": ["brief safety or common-error note", "..."],
  "confidence": "high" | "medium" | "low"
}

Before naming the item, examine the photo closely for any printed text, label, model number, or barcode on the item or its packaging, and read it if legible. Many medical supplies look nearly identical by shape alone (for example, suction catheters, endotracheal tubes, and urinary catheters are all similar clear plastic tubing) and are only reliably distinguished by their printed label. Prioritize that printed information over a guess based on shape or general appearance alone.

Set "confidence" using these criteria, not a general impression:
- "high": a printed label, model number, or other legible text on the item or packaging directly confirms the identification.
- "medium": no confirming text is visible, but the shape, packaging, and context strongly and specifically match this item over other plausible candidates.
- "low": the item is visually consistent with more than one plausible identification, or key identifying details are not visible or legible.

If you cannot identify the item with reasonable confidence, set "identified" to false, leave other fields as short best guesses or empty arrays, and set "confidence" to "low".

Keep "how_to_use" to the general, universal steps for this category of item (e.g. how a standard IV extension set is generally primed and connected), not instructions specific to a patient, dose, or clinical scenario. This is orientation for someone who has the clinical training but may not recognize this specific item, not a substitute for the manufacturer's instructions or facility policy. Do not include drug dosing, titration, or patient-specific clinical decision-making of any kind.

Keep "typical_spec" limited to the general product specification as it would appear on standard packaging (volume, size, count). Never estimate or suggest a quantity, dose, or size appropriate for a specific patient, wound, or clinical scenario.`;

app.post('/api/identify', async (req, res) => {
  try {
    const { image, mediaType } = req.body;
    if (!image) {
      return res.status(400).json({ error: 'No image provided.' });
    }

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 700,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType || 'image/jpeg',
                data: image,
              },
            },
            {
              type: 'text',
              text: 'Identify this item and respond with the JSON described in your instructions.',
            },
          ],
        },
      ],
    });

    const textBlock = message.content.find((block) => block.type === 'text');
    const raw = textBlock ? textBlock.text.trim() : '{}';
    const cleaned = raw.replace(/^```json\s*|\s*```$/g, '');

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error('Failed to parse model response:', raw);
      return res.status(502).json({ error: 'Could not parse the identification result. Try again.' });
    }

    res.json(parsed);
  } catch (err) {
    console.error('Identify error:', err);
    res.status(500).json({ error: 'Something went wrong identifying that item.' });
  }
});

app.listen(PORT, () => {
  console.log(`NurseLens running at http://localhost:${PORT}`);
});
