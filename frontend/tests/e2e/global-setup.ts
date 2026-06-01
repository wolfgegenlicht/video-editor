/**
 * Global setup: open the "test3" project (which has a video clip + German
 * captions) and save the storageState. All tests inherit this state so they
 * start directly in the editor with content-rich project data.
 *
 * Tests that add overlays use page.evaluate() to clear textOverlays from
 * localStorage before each test to ensure isolation.
 */
import { chromium } from "@playwright/test";
import fs from "fs";

export default async function globalSetup() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto("http://localhost:5173/");
  await page.waitForSelector("button", { timeout: 10000 });

  // Click the test3 project card. Cards are div[role="button"] containing the name.
  // "test3" should be the first and most recently updated project.
  const card = page.locator('[role="button"]').filter({ hasText: /test3/i }).first();
  if (await card.isVisible({ timeout: 5000 }).catch(() => false)) {
    await card.click();
  } else {
    // Fallback: click the first non-new-project card
    await page
      .locator('[role="button"]')
      .filter({ hasNot: page.locator("text=New Project") })
      .filter({ hasText: /.+/ })
      .first()
      .click();
  }

  await page.waitForSelector('[title="Add belly band overlay"]', { timeout: 15000 });

  // Clear any textOverlays from previous test runs before capturing state
  await page.evaluate(() => {
    const raw = localStorage.getItem("video-editor-project");
    if (raw) {
      try {
        const p = JSON.parse(raw);
        p.textOverlays = [];
        localStorage.setItem("video-editor-project", JSON.stringify(p));
      } catch {}
    }
  });

  fs.mkdirSync("tests/e2e/.auth", { recursive: true });
  await page.context().storageState({ path: "tests/e2e/.auth/state.json" });

  await browser.close();
}
