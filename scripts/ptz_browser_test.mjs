import { chromium } from "playwright";

const baseUrl = "http://127.0.0.1:5173/";
const targetName = process.argv[2] ?? "Terraza";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(1500);

  const card = page
    .locator(".camera-card")
    .filter({ has: page.locator("h3", { hasText: targetName }) })
    .first();

  if ((await card.count()) === 0) {
    throw new Error(`Camera card not found: ${targetName}`);
  }

  await page.screenshot({ path: "playwright_before_ptz.png", fullPage: true });

  const rightBtn = card.locator('button[title="PTZ derecha"]').first();
  await rightBtn.click({ timeout: 10000 });
  await page.waitForTimeout(1200);

  const message = (await page.locator(".message").first().textContent())?.trim() ?? "";

  await page.screenshot({ path: "playwright_after_ptz.png", fullPage: true });

  console.log(JSON.stringify({ ok: true, targetName, message }, null, 2));
} catch (error) {
  console.log(
    JSON.stringify(
      { ok: false, targetName, error: error instanceof Error ? error.message : String(error) },
      null,
      2,
    ),
  );
  process.exitCode = 1;
} finally {
  await browser.close();
}
