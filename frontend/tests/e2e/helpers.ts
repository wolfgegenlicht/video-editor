import type { Page } from "@playwright/test";

/**
 * Ensure the editor is loaded and textOverlays is empty.
 * Strategy: evaluate localStorage first; if overlays exist, clear + reload.
 * The reload may briefly show the project picker — we handle that by clicking
 * the first project card if the picker appears.
 */
export async function clearOverlays(page: Page) {
  // Read current overlay count from localStorage
  const count: number = await page.evaluate(() => {
    try {
      const p = JSON.parse(localStorage.getItem("video-editor-project") || "{}");
      return (p.textOverlays ?? []).length;
    } catch { return 0; }
  });

  if (count === 0) {
    // Nothing to clear, editor is already clean
    await page.waitForSelector('[title="Add belly band overlay"]', { timeout: 8000 });
    return;
  }

  // Clear overlays in localStorage, then reload
  await page.evaluate(() => {
    const raw = localStorage.getItem("video-editor-project");
    if (!raw) return;
    try {
      const p = JSON.parse(raw);
      p.textOverlays = [];
      localStorage.setItem("video-editor-project", JSON.stringify(p));
    } catch {}
  });

  await page.reload({ waitUntil: "domcontentloaded" });

  // After reload, the app reads localStorage. If active-project key is set it goes
  // straight to the editor. Wait generously.
  try {
    await page.waitForSelector('[title="Add belly band overlay"]', { timeout: 12000 });
  } catch {
    // Might be showing the project picker (race on first load)
    const card = page.locator('[role="button"]').filter({ hasText: /test3/i }).first();
    if (await card.isVisible({ timeout: 3000 }).catch(() => false)) {
      await card.click();
      await page.waitForSelector('[title="Add belly band overlay"]', { timeout: 10000 });
    } else {
      throw new Error("Could not reach editor after clearOverlays reload");
    }
  }
}
