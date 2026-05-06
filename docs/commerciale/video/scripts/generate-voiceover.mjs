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
With Formicanera, it happens during the meeting — negotiation, confirmation, order — all in real time. Tablet in hand. Client in front of you.
The submission to ERP? Later. In the background. While you're already driving to the next client.
What follows is an unedited, real-time recording. Both systems. Same order.
Both recordings start from the beginning. Timer begins when order creation starts.
Customer selection. ERP shows active and archived records side by side. Formicanera lets agents hide stale accounts — no confusion, no wrong clicks.
Article search. ERP can produce inconsistent results depending on how the code is typed. Formicanera: one search, always consistent.
Seven units. This article comes in packs of five and singles. ERP requires manual calculation. Formicanera splits automatically.
Eight units at a promotional price. On ERP, the discount percentage must be pre-calculated manually. Formicanera: enter the target price — it handles the rest.
Formicanera. Order confirmed.
ERP submission is happening in the background. No action required.
Meanwhile — the agent is already creating the next order. Reviewing a client. Switching device. This is not waiting time. This is time that didn't exist before.
The same order. Confirmed on both systems. Fifty-nine seconds apart — measured from the moment order creation began. The real difference isn't speed. It's when the deal was closed — during the meeting, or after it.`,

  'voiceover-2': `A new client. An on-site meeting.
With ERP, the agent returns to the desk — to create the customer, then the order. Two separate sessions.
With Formicanera — it all happens during the meeting. Customer created. Order placed. Client confirms on the spot.
The submission to ERP? Automatic. In the background. Whenever.
Creating a new customer. Same data. Two different workflows.
Formicanera works on tablet and mobile. The customer is created during the meeting — no desk required.
A single guided form. No navigating between screens.
Customer created. Already ready for the order.
Order placed. Customer created and order confirmed — in three minutes and seven seconds.
Complete. The full end-to-end workflow.
Eighty-three seconds faster from the moment of creation. But more importantly — done during the meeting. Not after it.`,
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
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.0,
        use_speaker_boost: true,
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

for (const [name, text] of Object.entries(SCRIPTS)) {
  await generate(name, text);
}
console.log('Done! Both voiceover files generated.');
