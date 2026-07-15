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

// Images come in as base64 data URLs from the camera capture — allow a generous body size
app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const SYSTEM_PROMPT = `You are helping a bedside nurse quickly identify medical equipment or supplies from a photo, at the point of care.

For the item in the photo, respond ONLY with JSON in this exact shape, no markdown fences, no extra text:
{
  "identified": true | false,
  "name": "common name of the item",
  "category": "short category, e.g. 'IV Access', 'Wound Care', 'Monitoring', 'Airway', 'PPE'",
  "purpose": "1-2 plain-language sentences on what it's designed to do",
  "how_to_use": ["short step", "short step", "short step"],
  "watch_outs": ["brief safety or common-error note", "..."],
  "confidence": "high" | "medium" | "low"
}

If you cannot identify the item with reasonable confidence, set "identified" to false, leave other fields as short best guesses or empty arrays, and set "confidence" to "low".

Keep "how_to_use" to the general, universal steps for this category of item (e.g. how a standard IV extension set is generally primed and connected) — NOT instructions specific to a patient, dose, or clinical scenario. This is orientation for someone who has the clinical training but may not recognize this specific item, not a substitute for the manufacturer's instructions for use (IFU) or facility policy. Do not include drug dosing, titration, or patient-specific clinical decision-making of any kind.`;

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
