# NurseLens

Point your phone camera at a piece of medical equipment or supply, snap a photo, and get back what it's for and how it's generally used — a quick-reference "spec card" for unfamiliar gear at the bedside.

**This is an orientation tool, not clinical decision support.** It's meant for the "what is this thing and how does it generally work" moment, not for patient-specific dosing, titration, or care decisions. Always defer to the manufacturer's instructions for use (IFU) and your facility's policy.

## How it works

- The frontend (`/public`) accesses the phone/laptop camera in the browser, captures a still frame, and sends it to a small backend.
- The backend (`server.js`) calls Claude's vision API with the photo and a prompt constrained to general identification and orientation — no patient-specific advice.
- No image is stored; each photo is sent for one request and discarded.

## Setup

1. Install [Node.js](https://nodejs.org) 18 or later.
2. In this folder, install dependencies:
   ```
   npm install
   ```
3. Copy `.env.example` to `.env` and add your Anthropic API key (get one at https://console.anthropic.com/settings/keys):
   ```
   cp .env.example .env
   ```
4. Start the server:
   ```
   npm start
   ```
5. Open `http://localhost:3000` in your browser. On a phone, camera access requires either `localhost` or HTTPS — see deployment note below.

## Trying it on your phone

Browsers only allow camera access over `localhost` or a secure (HTTPS) connection. Easiest paths:

- **Deploy it** to a host with free HTTPS, e.g. [Render](https://render.com), [Railway](https://railway.app), or [Vercel](https://vercel.com) (Node/Express apps deploy in a few clicks on any of these).
- **Or tunnel it locally** while testing, e.g. `npx localtunnel --port 3000`, and open the HTTPS URL it gives you on your phone.

## Where to take this next

- Swap the in-memory prompt for a small curated database of your unit's actual equipment (pumps, dressings, tubing sets) so answers are specific to what your nurses see day to day — this is where it'd start to look like a real Magnet/AI-readiness pilot.
- Add a "flag this answer" button that routes uncertain identifications to your clinical educator or supply chain team — turns the app into a feedback loop, not just a lookup tool.
- Log anonymized scan categories (not images) to see which equipment nurses are most often unsure about — useful data for orientation curriculum design.
- Add offline caching for the most common items on your unit, since hospital wifi in equipment rooms can be spotty.

## Project structure

```
nurselens/
├── server.js           Express backend, calls Claude's vision API
├── package.json
├── .env.example
├── public/
│   ├── index.html       App shell
│   ├── style.css        Visual design
│   └── app.js            Camera capture + result rendering
└── README.md
```
