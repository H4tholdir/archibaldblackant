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
  'voiceover-1': `Two systems. Two workflows.
With ERP, the order is entered after the meeting — back at the desk.
With Formicanera, the order is created during the meeting, on tablet, closing the deal in real time.
Now — the clock starts.
Same order, same customer. The clock starts now.
Formicanera automatically filters inactive customer records — eliminating selection errors before they happen.
A single, consistent search engine. Articles are always findable — regardless of punctuation or product coding.
Seven units. The packaging engine calculates the optimal split automatically. No arithmetic, no errors.
Enter the target price — Formicanera calculates the exact discount and VAT in real time.
Order submitted. Formicanera is done.
While ERP processes the submission in the background — the agent is already queuing the next orders. Not downtime. Parallel productivity.
Four minutes and twenty-two seconds. Same result.
Same result. More intelligence. Sixty-seven seconds faster — from any device.`,

  'voiceover-2': `A new client. An on-site meeting.
With ERP, the agent returns to the desk to create the customer and place the order.
With Formicanera — it all happens during the meeting, on tablet.
Now, the clock.
Creating a new customer. Same data, two workflows.
Formicanera works on tablet and mobile. The customer is created during the meeting — no desk required.
A single guided form with smart defaults. No navigating between screens.
Customer created. Already ready for the order.
Customer created and order placed — in three minutes and seven seconds.
Complete. The full end-to-end workflow.
Eighty-three seconds faster — end to end. From any device. During the meeting.`,
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
