#!/usr/bin/env tsx
/**
 * Diagnostic script: dump DevExpress fields and test each one individually.
 * Dry-run only — does NOT save the customer.
 */

import { ArchibaldBot } from "../archibald-bot.js";
import { logger } from "../logger.js";
import { config } from "../config.js";

type FieldMethod = "set" | "type" | "combo" | "lookup";

type FieldTest = {
  name: string;
  regex?: RegExp;
  buttonRegex?: RegExp;
  value: string;
  method: FieldMethod;
};

const FIELD_TESTS: FieldTest[] = [
  { name: "NAME", regex: /xaf_dviNAME_Edit_I$/, value: "Test SRL", method: "set" },
  { name: "DLVMODE", regex: /xaf_dviDLVMODE_Edit_dropdown_DD_I$/, value: "FedEx", method: "combo" },
  { name: "PAYMTERMID", buttonRegex: /xaf_dviPAYMTERMID_Edit_find_Edit_B0/, value: "206", method: "lookup" },
  { name: "LEGALEMAIL", regex: /xaf_dviLEGALEMAIL_Edit_I$/, value: "test@pec.it", method: "set" },
  { name: "LEGALAUTHORITY", regex: /xaf_dviLEGALAUTHORITY_Edit_I$/, value: "KRRH6B9", method: "set" },
  { name: "STREET", regex: /xaf_dviSTREET_Edit_I$/, value: "Via Roma, 1", method: "set" },
  { name: "CAP", buttonRegex: /xaf_dviLOGISTICSADDRESSZIPCODE_Edit_find_Edit_B0/, value: "80056", method: "lookup" },
  { name: "PHONE", regex: /xaf_dviPHONE_Edit_I$/, value: "+390811234567", method: "set" },
  { name: "CELLULARPHONE", regex: /xaf_dviCELLULARPHONE_Edit_I$/, value: "+393331234567", method: "set" },
  { name: "EMAIL", regex: /xaf_dviEMAIL_Edit_I$/, value: "test@example.com", method: "set" },
  { name: "URL_setter", regex: /xaf_dviURL_Edit_I$/, value: "https://www.test.com/", method: "set" },
  { name: "URL_keyboard", regex: /xaf_dviURL_Edit_I$/, value: "https://www.test.com/", method: "type" },
];

async function dumpDevExpressFields(page: any): Promise<void> {
  const fields = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll("input")) as HTMLInputElement[];
    return inputs
      .filter((el) => /^xaf_dvi/.test(el.id) && el.offsetParent !== null)
      .map((el) => {
        const row = el.closest("tr");
        const captionCell = row?.querySelector("td.dxflCaption, td.Caption");
        const label = captionCell?.textContent?.trim() ?? "";
        const hasLookupBtn = !!document.querySelector(`[id*="${el.id.replace(/_I$/, "")}_B0"]`);
        return {
          id: el.id,
          label,
          type: el.type,
          value: el.value,
          readonly: el.readOnly,
          disabled: el.disabled,
          hasLookupBtn,
        };
      });
  });

  console.log("\n=== DEVEXPRESS FIELD DUMP ===");
  console.log(`Fields found: ${fields.length}`);
  for (const f of fields) {
    const flags = [
      f.readonly ? "RO" : "",
      f.disabled ? "DIS" : "",
      f.hasLookupBtn ? "LOOKUP" : "",
    ]
      .filter(Boolean)
      .join(",");
    console.log(
      `  ${f.id.padEnd(55)} | label: ${f.label.padEnd(20)} | type: ${f.type.padEnd(8)} | value: ${JSON.stringify(f.value).padEnd(30)} ${flags ? `| ${flags}` : ""}`,
    );
  }
  console.log("");
}

async function readbackField(page: any, regex: RegExp): Promise<string> {
  return page.evaluate((regexStr: string) => {
    const re = new RegExp(regexStr);
    const inputs = Array.from(document.querySelectorAll("input")) as HTMLInputElement[];
    const match = inputs.find((el) => re.test(el.id) && el.offsetParent !== null);
    return match?.value ?? "[NOT FOUND]";
  }, regex.source);
}

async function probeLookupPopup(
  page: any,
  buttonRegex: RegExp,
  fieldName: string,
): Promise<void> {
  const clicked = await page.evaluate((regexStr: string) => {
    const re = new RegExp(regexStr);
    const elements = Array.from(
      document.querySelectorAll("td, img, button, a, div"),
    ) as HTMLElement[];
    const btn = elements.find((el) => re.test(el.id) && el.offsetParent !== null);
    if (!btn) return false;
    btn.click();
    return true;
  }, buttonRegex.source);

  if (!clicked) {
    console.log(`  [INFO] ${fieldName}: lookup button not found`);
    return;
  }

  const startMs = Date.now();
  let iframeInfo: { found: boolean; elapsed: number; src: string; inputCount: number; htmlSnippet: string } | null = null;

  for (let attempt = 0; attempt < 17; attempt++) {
    await new Promise((r) => setTimeout(r, 300));
    const probe = await page.evaluate(() => {
      const iframes = Array.from(document.querySelectorAll("iframe")) as HTMLIFrameElement[];
      const visible = iframes.filter((f) => f.offsetParent !== null);
      for (const iframe of visible) {
        try {
          const doc = iframe.contentDocument;
          if (!doc) continue;
          const inputs = doc.querySelectorAll("input");
          return {
            found: true,
            src: iframe.src || "(no src)",
            inputCount: inputs.length,
            htmlSnippet: doc.body?.innerHTML?.substring(0, 500) ?? "",
          };
        } catch {
          return {
            found: true,
            src: iframe.src || "(cross-origin)",
            inputCount: -1,
            htmlSnippet: "(inaccessible)",
          };
        }
      }
      return null;
    });

    if (probe) {
      iframeInfo = { ...probe, elapsed: Date.now() - startMs };
      break;
    }
  }

  if (iframeInfo) {
    console.log(`  [INFO] ${fieldName} (lookup): iframe found in ${iframeInfo.elapsed}ms, src=${iframeInfo.src}`);
    console.log(`         inputs in iframe: ${iframeInfo.inputCount}, HTML snippet: ${iframeInfo.htmlSnippet.substring(0, 200)}`);
  } else {
    const elapsed = Date.now() - startMs;
    console.log(`  [WARN] ${fieldName} (lookup): NO iframe found after ${elapsed}ms`);

    const popupDump = await page.evaluate(() => {
      const popups = Array.from(
        document.querySelectorAll('[id*="_DDD"], .dxpcLite, .dxpc-mainDiv, [id*="PopupControl"], [id*="_PW"]'),
      ) as HTMLElement[];
      return popups
        .filter((el) => el.offsetParent !== null)
        .map((el) => ({
          id: el.id,
          className: el.className,
          htmlSnippet: el.innerHTML?.substring(0, 300) ?? "",
        }));
    });

    if (popupDump.length > 0) {
      console.log(`         Visible popups found: ${popupDump.length}`);
      for (const p of popupDump) {
        console.log(`         - id=${p.id}, class=${p.className}`);
        console.log(`           HTML: ${p.htmlSnippet.substring(0, 200)}`);
      }
    }
  }

  await page.keyboard.press("Escape");
  await new Promise((r) => setTimeout(r, 500));
  await page.keyboard.press("Escape");
  await new Promise((r) => setTimeout(r, 500));
}

async function testCustomerFields() {
  logger.info("=== TEST CUSTOMER FIELDS - DevExpress Diagnostic ===");

  const bot = new ArchibaldBot();
  let exitCode = 0;
  let passCount = 0;
  let failCount = 0;
  let totalTests = 0;

  try {
    // --- Phase 1: Setup & navigation ---
    logger.info("PHASE 1: Setup and navigation");
    await bot.initialize();
    await bot.login();

    const page = (bot as any).page;

    await page.goto(`${config.archibald.url}/CUSTTABLE_ListView_Agent/`, {
      waitUntil: "networkidle2",
      timeout: 60000,
    });
    await (bot as any).waitForDevExpressReady({ timeout: 10000 });
    logger.info("Customer list loaded");

    const nuovoClicked = await (bot as any).clickElementByText("Nuovo", {
      selectors: ["a", "span", "button"],
    });
    if (!nuovoClicked) throw new Error("'Nuovo' button not found");

    await page.waitForFunction(
      () => !window.location.href.includes("ListView"),
      { timeout: 15000, polling: 200 },
    );
    await (bot as any).waitForDevExpressReady({ timeout: 10000 });
    logger.info("Customer form loaded");

    // --- Phase 2: Dump all DevExpress fields ---
    logger.info("PHASE 2: Dumping all DevExpress fields");
    await dumpDevExpressFields(page);

    // --- Phase 3: Test each field individually ---
    logger.info("PHASE 3: Testing each field individually");
    console.log("\n=== FIELD TESTS ===");

    for (const test of FIELD_TESTS) {
      totalTests++;
      try {
        if (test.method === "lookup" && test.buttonRegex) {
          await probeLookupPopup(page, test.buttonRegex, test.name);

          await (bot as any).selectFromDevExpressLookup(test.buttonRegex, test.value);

          const readback = await page.evaluate((btnRegexStr: string) => {
            const allInputs = Array.from(document.querySelectorAll("input")) as HTMLInputElement[];
            const fieldName = btnRegexStr.replace(/_find_Edit_B0.*/, "").replace(/.*xaf_dvi/, "");
            const match = allInputs.find(
              (el) => el.id.includes(fieldName) && el.id.endsWith("_I") && el.offsetParent !== null,
            );
            return match?.value ?? "[NOT FOUND]";
          }, test.buttonRegex.source);

          if (readback && readback !== "[NOT FOUND]" && readback !== "") {
            console.log(`  [PASS] ${test.name}: value after lookup = ${JSON.stringify(readback)}`);
            passCount++;
          } else {
            console.log(`  [FAIL] ${test.name}: value after lookup = ${JSON.stringify(readback)} (expected non-empty)`);
            failCount++;
          }
          continue;
        }

        const fieldRegex = test.regex!;

        if (test.method === "set") {
          await (bot as any).setDevExpressField(fieldRegex, test.value);
        } else if (test.method === "type") {
          await (bot as any).typeDevExpressField(fieldRegex, test.value);
        } else if (test.method === "combo") {
          await (bot as any).setDevExpressComboBox(fieldRegex, test.value);
        }

        const readback = await readbackField(page, fieldRegex);

        if (readback === test.value) {
          console.log(`  [PASS] ${test.name} (${test.method}): ${JSON.stringify(test.value)} → ${JSON.stringify(readback)}`);
          passCount++;
        } else {
          console.log(`  [FAIL] ${test.name} (${test.method}): ${JSON.stringify(test.value)} → ${JSON.stringify(readback)}${readback === "" ? " (empty!)" : ""}`);
          failCount++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`  [ERROR] ${test.name} (${test.method}): ${msg}`);
        failCount++;
      }
    }

    console.log(`\nResults: ${passCount}/${totalTests} PASS, ${failCount}/${totalTests} FAIL\n`);

    // --- Phase 4: Final dump & cleanup ---
    logger.info("PHASE 4: Final dump and cleanup");
    console.log("\n=== POST-TEST FIELD DUMP ===");
    await dumpDevExpressFields(page);

    await page.screenshot({
      path: "logs/test-customer-fields-final.png",
      fullPage: true,
    });
    logger.info("Screenshot saved to logs/test-customer-fields-final.png");

    logger.info("Navigating away (abandoning form without saving)...");
    await page.goto(`${config.archibald.url}/CUSTTABLE_ListView_Agent/`, {
      waitUntil: "networkidle2",
      timeout: 60000,
    });

    if (failCount > 0) exitCode = 1;
    logger.info("=== TEST CUSTOMER FIELDS COMPLETE ===");
  } catch (error) {
    logger.error("TEST FAILED", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    exitCode = 1;
  } finally {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    await bot.close();
  }

  process.exit(exitCode);
}

testCustomerFields();
