import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ArchibaldBot } from './archibald-bot';

const ARCHIBALD_URL = process.env.ARCHIBALD_URL;
const VIA_TO_SEARCH = 'Via Francesco Petrarca';

// Opt-in only: set ARCHIBALD_E2E=true to run these tests against the real ERP.
// Never runs in CI (ARCHIBALD_E2E is not set there).
describe.skipIf(!process.env.ARCHIBALD_E2E)('selectDeliveryAddress — E2E diagnostic', () => {
  let bot: ArchibaldBot;

  beforeAll(async () => {
    if (!ARCHIBALD_URL) return;
    bot = new ArchibaldBot();
    await (bot as any).initialize();
    await (bot as any).login();
  }, 60_000);

  afterAll(async () => {
    await (bot as any).browser?.close().catch(() => {});
  });

  it('finds SELEZIONARE_L_INDIRIZZO field after selecting Indelli Enrico (55.227)', async () => {
    const page = (bot as any).page;
    await page.goto(`${ARCHIBALD_URL}/Archibald/SALESTABLE_EditForm_Agent/`);
    await (bot as any).waitForDevExpressReady?.();
    await (bot as any).selectCustomer('55.227');
    await (bot as any).waitForDevExpressIdle({ label: 'after-customer-select' });

    const fieldInfo = await page.evaluate(() => {
      const field = document.querySelector('[id*="SELEZIONARE_L_INDIRIZZO"]');
      if (!field) return { found: false, fieldId: '', rowCount: 0, rowTexts: [] as string[] };
      const rows = Array.from(document.querySelectorAll('.dxgvDataRow'));
      return {
        found: true,
        fieldId: field.id,
        rowCount: rows.length,
        rowTexts: rows.map((r) => (r.textContent ?? '').trim()),
      };
    });

    console.log('SELEZIONARE_L_INDIRIZZO dump:', JSON.stringify(fieldInfo, null, 2));
    expect(fieldInfo.found).toBe(true);
  }, 120_000);

  it('filters to exactly 1 row when typing Via Francesco Petrarca', async () => {
    const page = (bot as any).page;
    const fieldContainer = await page.$('[id*="SELEZIONARE_L_INDIRIZZO"]');
    expect(fieldContainer).not.toBeNull();

    await fieldContainer!.click();
    await (bot as any).waitForDevExpressIdle({ label: 'field-open' });
    await page.keyboard.type(VIA_TO_SEARCH);
    await (bot as any).waitForDevExpressIdle({ label: 'search-typed' });

    const rowCount = await page.evaluate(
      () => document.querySelectorAll('.dxgvDataRow').length,
    );
    console.log('Row count after typing:', rowCount);
    expect(rowCount).toBe(1);
  }, 60_000);

  it('updates field value after clicking the first row', async () => {
    const page = (bot as any).page;
    await page.evaluate(() => {
      const row = document.querySelector('.dxgvDataRow') as HTMLElement | null;
      row?.click();
    });
    await (bot as any).waitForDevExpressIdle({ label: 'row-clicked' });

    const fieldValue = await page.evaluate(() => {
      const input = document.querySelector('[id*="SELEZIONARE_L_INDIRIZZO"] input') as HTMLInputElement | null;
      return input?.value ?? '';
    });
    console.log('Field value after selection:', fieldValue);
    expect(fieldValue).toContain('Petrarca');
  }, 30_000);
});
