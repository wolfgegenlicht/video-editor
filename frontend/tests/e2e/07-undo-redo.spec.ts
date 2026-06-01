import { test, expect } from "@playwright/test";
import { clearOverlays } from "./helpers";

// Scoped belly-band clip locator — the draggable timeline item with "T " prefix
const bellyBandClip = (page: import("@playwright/test").Page) =>
  page
    .locator('[role="button"][class*="cursor-grab"]')
    .filter({ hasText: /T\s+Your text here/i });

const lastBellyBandClip = (page: import("@playwright/test").Page) =>
  bellyBandClip(page).last();

test.describe("Undo / Redo", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await clearOverlays(page);
  });

  test("Undo and Redo buttons are present in the header", async ({ page }) => {
    await expect(page.getByRole("button", { name: /undo/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /redo/i })).toBeVisible();
  });

  test("Undo button becomes enabled after adding an overlay", async ({ page }) => {
    const undoBtn = page.getByRole("button", { name: /undo/i });
    await page.getByTitle("Add belly band overlay").click();
    await expect(undoBtn).toBeEnabled({ timeout: 2000 });
    await page.keyboard.press("Meta+z");
  });

  test("Redo button becomes enabled after undo", async ({ page }) => {
    const redoBtn = page.getByRole("button", { name: /redo/i });
    await page.getByTitle("Add belly band overlay").click();
    await page.getByRole("button", { name: /undo/i }).click();
    await expect(redoBtn).toBeEnabled({ timeout: 2000 });
    await page.keyboard.press("Meta+z");
  });

  test("Cmd+Z undoes adding a belly band overlay", async ({ page }) => {
    const before = await bellyBandClip(page).count();
    await page.getByTitle("Add belly band overlay").click();
    await expect(lastBellyBandClip(page)).toBeVisible({ timeout: 4000 });
    await page.keyboard.press("Meta+z");
    await expect(bellyBandClip(page)).toHaveCount(before, { timeout: 3000 });
  });

  test("Cmd+Shift+Z redoes after undo", async ({ page }) => {
    const before = await bellyBandClip(page).count();
    await page.getByTitle("Add belly band overlay").click();
    await expect(lastBellyBandClip(page)).toBeVisible({ timeout: 4000 });
    await page.keyboard.press("Meta+z");
    await expect(bellyBandClip(page)).toHaveCount(before, { timeout: 3000 });
    await page.keyboard.press("Meta+Shift+z");
    await expect(bellyBandClip(page)).toHaveCount(before + 1, { timeout: 3000 });
    await page.keyboard.press("Meta+z");
  });

  test("multiple Cmd+Z walks back multiple adds", async ({ page }) => {
    const before = await bellyBandClip(page).count();
    await page.getByTitle("Add belly band overlay").click();
    await page.getByTitle("Add belly band overlay").click();
    await expect(bellyBandClip(page)).toHaveCount(before + 2, { timeout: 4000 });
    await page.keyboard.press("Meta+z");
    await page.keyboard.press("Meta+z");
    await expect(bellyBandClip(page)).toHaveCount(before, { timeout: 3000 });
  });
});
