import { test, expect, devices } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const iPhone = devices["iPhone 13"];
const iPad = devices["iPad (gen 7)"];

test.describe("PWA screen orientation", () => {
  test("built manifest declares orientation as any", async () => {
    const manifestPath = resolve(__dirname, "../dist/manifest.webmanifest");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));

    expect(manifest.orientation).toBe("any");
    expect(manifest.display).toBe("standalone");
  });

  test("app renders correctly in landscape on mobile", async ({ browser }) => {
    const portrait = await browser.newContext({
      ...iPhone,
      viewport: { width: 390, height: 844 },
    });
    const landscape = await browser.newContext({
      ...iPhone,
      viewport: { width: 844, height: 390 },
    });

    const portraitPage = await portrait.newPage();
    const landscapePage = await landscape.newPage();

    await portraitPage.goto("/");
    await landscapePage.goto("/");

    await portraitPage.waitForLoadState("domcontentloaded");
    await landscapePage.waitForLoadState("domcontentloaded");

    const portraitBody = await portraitPage.evaluate(() => ({
      scrollWidth: document.body.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));

    const landscapeBody = await landscapePage.evaluate(() => ({
      scrollWidth: document.body.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));

    expect(portraitBody.scrollWidth).toBeLessThanOrEqual(
      portraitBody.clientWidth + 1,
    );
    expect(landscapeBody.scrollWidth).toBeLessThanOrEqual(
      landscapeBody.clientWidth + 1,
    );
    expect(landscapeBody.clientWidth).toBeGreaterThan(
      portraitBody.clientWidth,
    );

    await portrait.close();
    await landscape.close();
  });

  test("app renders correctly in landscape on tablet", async ({ browser }) => {
    const portrait = await browser.newContext({
      ...iPad,
      viewport: { width: 810, height: 1080 },
    });
    const landscape = await browser.newContext({
      ...iPad,
      viewport: { width: 1080, height: 810 },
    });

    const portraitPage = await portrait.newPage();
    const landscapePage = await landscape.newPage();

    await portraitPage.goto("/");
    await landscapePage.goto("/");

    await portraitPage.waitForLoadState("domcontentloaded");
    await landscapePage.waitForLoadState("domcontentloaded");

    const portraitBody = await portraitPage.evaluate(() => ({
      scrollWidth: document.body.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));

    const landscapeBody = await landscapePage.evaluate(() => ({
      scrollWidth: document.body.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));

    expect(portraitBody.scrollWidth).toBeLessThanOrEqual(
      portraitBody.clientWidth + 1,
    );
    expect(landscapeBody.scrollWidth).toBeLessThanOrEqual(
      landscapeBody.clientWidth + 1,
    );
    expect(landscapeBody.clientWidth).toBeGreaterThan(
      portraitBody.clientWidth,
    );

    await portrait.close();
    await landscape.close();
  });

  test("viewport meta tag does not lock orientation", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    const viewportContent = await page.evaluate(() => {
      const meta = document.querySelector('meta[name="viewport"]');
      return meta ? (meta as HTMLMetaElement).content : "";
    });

    expect(viewportContent).toBeTruthy();
    expect(viewportContent).not.toContain("orientation");
  });
});
