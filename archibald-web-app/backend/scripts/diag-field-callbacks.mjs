/**
 * diag-field-callbacks.mjs
 * Phase 1: sonda callback XHR dei campi del form nuovo cliente ERP
 * Phase 2: corregge Palmese (erp_id 57396) con i dati corretti
 * Usage: node scripts/diag-field-callbacks.mjs  (dalla dir backend)
 */

import puppeteer from 'puppeteer';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const ERP_URL = 'https://4.231.124.90/Archibald';
const USERNAME = 'ikiA0930';
const PASSWORD = 'Fresis26@';
const LOGS_DIR = join(__dirname, '..', 'logs');

const PROBE_FIELDS = {
  NAME: {
    inputIdPattern: /dviNAME_Edit_I$/,
    value: 'Dr. Test Palmese',
  },
  FISCALCODE: {
    inputIdPattern: /dviFISCALCODE_Edit_I$/,
    value: 'PLMCLD76T10A390T',
  },
  VATNUM: {
    inputIdPattern: /dviVATNUM_Edit_I$/,
    value: '13890640967',
  },
};

const PALMESE_ERP_ID = '57396';
const PALMESE_FIX = {
  CAP: '80038',
  FISCALCODE: 'PLMCLD76T10A390T',
  NAMEALIAS: 'Dr. Claudio Palmese',
  SDI: 'C3UCNRB',
};

function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function cssEscape(s) {
  return s.replace(/([.#[\]()])/g, '\\$1');
}

async function login(page) {
  console.log('[LOGIN] navigating...');
  await page.goto(`${ERP_URL}/`, { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForSelector('input[name="UserName"]', { timeout: 10000 });
  await page.type('input[name="UserName"]', USERNAME, { delay: 50 });
  await page.type('input[name="Password"]', PASSWORD, { delay: 50 });
  await page.keyboard.press('Enter');
  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
  console.log('[LOGIN] OK —', page.url());
}

async function waitForDevExpressReady(page, { timeout = 15000, label = '' } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const ready = await page.evaluate(() => {
      try {
        return (window.ASPx?._pendingCallbacks ?? 0) === 0
          && document.readyState === 'complete';
      } catch { return false; }
    }).catch(() => false);
    if (ready) return;
    await wait(200);
  }
  console.warn(`[waitForDevExpressReady] timeout${label ? ` (${label})` : ''}`);
}
