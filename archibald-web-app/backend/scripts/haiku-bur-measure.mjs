#!/usr/bin/env node
/**
 * Chiama Haiku con la foto della fresa H251ACR.104.060
 * e chiede di misurare le sezioni usando il gambo Ø 2,35 mm come riferimento.
 *
 * Uso: ANTHROPIC_API_KEY=sk-... node haiku-bur-measure.mjs
 */

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const IMAGE_PATH = '/Users/hatholdir/Downloads/01tc_H251ACR_104_060_450.png';

const PROMPT = `Questa è una foto di una fresa dentale HP (Handpiece) Komet, codice H251ACR.104.060.

Informazioni note:
- Il gambo (shank) cilindrico ha diametro esatto Ø 2,35 mm — usalo come righello di calibrazione
- La dimensione della testa lavorante è 060 (cioè Ø 6,0 mm al punto più largo)
- Il gambo HP standard è sempre 44,5 mm di lunghezza

Analizza le proporzioni nella foto e rispondi con:
1. Larghezza del gambo in pixel (stima)
2. Scala calcolata (mm per pixel)
3. Lunghezza totale stimata della fresa in mm
4. Lunghezza della testa lavorante (dalla punta fino all'anello colorato) in mm
5. Lunghezza del gambo visibile in mm
6. Posizione dell'anello arancione (a quanti mm dalla punta) in mm
7. Diametro massimo della testa calcolato dalla foto — confronta con il valore atteso 6,0 mm

Sii preciso e mostra i calcoli passo per passo.`;

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('Errore: ANTHROPIC_API_KEY non impostata');
    process.exit(1);
  }

  const client = new Anthropic({ apiKey });

  const imageData = readFileSync(IMAGE_PATH);
  const base64Image = imageData.toString('base64');

  console.log(`Immagine: ${IMAGE_PATH}`);
  console.log(`Dimensione: ${imageData.length} bytes`);
  console.log('Chiamata Haiku in corso...\n');

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: base64Image,
            },
          },
          {
            type: 'text',
            text: PROMPT,
          },
        ],
      },
    ],
  });

  console.log('=== RISPOSTA HAIKU ===\n');
  console.log(response.content[0].text);
  console.log('\n=== USAGE ===');
  console.log(`Input tokens: ${response.usage.input_tokens}`);
  console.log(`Output tokens: ${response.usage.output_tokens}`);
}

main().catch(console.error);
