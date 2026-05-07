// scripts/generate-voiceover.mjs
import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const API_KEY = process.env.ELEVENLABS_API_KEY;
if (!API_KEY) throw new Error('ELEVENLABS_API_KEY non impostata');

// Matilda: XrExE9yKIg1WjnnlVkGX — voce neutra professionale EN (premade, no paid plan required)
const VOICE_ID = 'XrExE9yKIg1WjnnlVkGX';

const SCRIPTS = {
  'voiceover-1': `Two tools. Two different moments.
With ERP, the order is entered at the desk — after the meeting, back at the office.
With Formicanèra, it happens during the meeting — negotiation, confirmation, order — all in real time. Tablet in hand. Client in front of you.
The submission to ERP? Later. In the background. While you're already driving to the next client.
What follows is an unedited, real-time recording. Both systems. Same order.
Both recordings start from the beginning. Timer begins when order creation starts.
Customer selection. ERP shows active and archived records side by side. Formicanèra lets agents hide stale accounts — no confusion, no wrong clicks.
Article search. ERP can produce inconsistent results depending on how the code is typed. Formicanèra: one search, always consistent.
Seven units. This article comes in packs of five and singles. ERP requires manual calculation. Formicanèra splits automatically.
Eight units at a promotional price. On ERP, the discount percentage must be pre-calculated manually. Formicanèra: enter the target price — it handles the rest.
Formicanèra. Order confirmed.
ERP submission is happening in the background. No action required.
Meanwhile — the agent is already creating the next order. Reviewing a client. Switching device. This is not waiting time. This is time that didn't exist before.
The same order. Confirmed on both systems. Fifty-nine seconds apart — measured from the moment order creation began. The real difference isn't speed. It's when the deal was closed — during the meeting, or after it.`,

  'voiceover-2': `A new client. An on-site meeting.
With ERP, the agent drives back to the desk to create the client and place the order. Two separate sessions. Manual corrections required.
With Formicanèra — it all happens during the meeting. On tablet.
Now, the clock.
<break time="1.5s"/>
Client creation. IVA validation. ERP shows the data exists — but the agent must type every field manually. Formicanèra fills it all automatically.
<break time="2s"/>
Default settings. Every new client in ERP has a discount option pre-selected — it must be removed manually each time. Formicanèra handles this automatically.
<break time="2s"/>
Guided creation. ERP shows inline errors for missing fields — the agent identifies and fixes each one. Formicanèra's step-by-step wizard guides the entire process. Trained patterns handle edge cases automatically.
<break time="2s"/>
Formicanèra. Client confirmed in 53 seconds. Background sync to ERP is already running. The agent is free.
<break time="1.5s"/>
One tap from the client card. No re-searching. No starting over. Formicanèra opens the order form directly.
<break time="2s"/>
This also means the agent can complete the client's profile on-site — filling every detail, solving any issue, with the client right there. No guessing. No follow-up calls.
<break time="2s"/>
Order confirmed. Discount validated automatically — no hidden bugs.
<break time="1.5s"/>
Three minutes and fifty-one seconds for ERP. Two minutes and forty-eight seconds total for Formicanèra — including background sync.
The deal closed during the meeting. Not after it.`,
};

const OUTPUT_DIR = new URL('../public/komet-comparison/', import.meta.url).pathname;
mkdirSync(OUTPUT_DIR, { recursive: true });

async function generate(name, text) {
  console.log(`Generating ${name}...`);
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
    method: 'POST',
    headers: {
      'xi-api-key': API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.75,
        similarity_boost: 0.75,
        style: 0.05,
        use_speaker_boost: false,   // false = più naturale e meno aggressivo
        speed: 0.88,                // leggermente più lento
      },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`ElevenLabs error for ${name}: ${response.status} — ${err}`);
  }

  const buffer = await response.arrayBuffer();
  const outputPath = `${OUTPUT_DIR}${name}.mp3`;
  writeFileSync(outputPath, Buffer.from(buffer));
  const sizeKB = Math.round(buffer.byteLength / 1024);
  console.log(`✓ Saved ${outputPath} (${sizeKB} KB)`);
}

// Genera solo voiceover-2 per non sprecare quota ElevenLabs
await generate('voiceover-2', SCRIPTS['voiceover-2']);
console.log('Done! voiceover-2 generated.');
