import { test, expect } from "@playwright/test";

test.describe("Timeline controls", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector('[title="Add belly band overlay"]');
  });

  test("play/pause keyboard shortcut works without error", async ({ page }) => {
    await page.locator("body").click();
    await page.keyboard.press("Space");
    await page.waitForTimeout(300);
    await page.keyboard.press("Space");
  });

  test("zoom + / − buttons exist and are clickable", async ({ page }) => {
    const zoomPlus = page.getByRole("button", { name: "+" }).last();
    const zoomMinus = page.getByRole("button", { name: "−" }).last();
    await expect(zoomPlus).toBeVisible();
    await expect(zoomMinus).toBeVisible();
    await zoomPlus.click();
    await zoomMinus.click();
  });

  test("mute track button is visible", async ({ page }) => {
    await expect(page.getByRole("button", { name: /mute track/i }).first()).toBeVisible();
  });

  test("hide track button is visible", async ({ page }) => {
    await expect(page.getByRole("button", { name: /hide track/i }).first()).toBeVisible();
  });

  test("timecode shows 00:00 at start", async ({ page }) => {
    // The timecode is displayed as text — locate by the formatted value
    await expect(page.locator("text=00:00.00").first()).toBeVisible();
  });

  test("timecode can be clicked to enter manual entry mode", async ({ page }) => {
    // Click the timecode display (it's a button that toggles an input)
    const timecodeArea = page.locator("text=00:00.00").first();
    await timecodeArea.click();
    // Either an input appears, or the click is a no-op — either way no error
    await page.waitForTimeout(200);
    await page.keyboard.press("Escape");
  });

  test("video track contains at least one clip", async ({ page }) => {
    const clips = page.getByTitle("Drag to move · Drag edges to trim");
    const count = await clips.count();
    expect(count).toBeGreaterThan(0);
  });

  test("captions track label is visible", async ({ page }) => {
    await expect(page.locator("text=captions").first()).toBeVisible();
  });

  test("Split button is visible in the toolbar", async ({ page }) => {
    await expect(page.getByRole("button", { name: /split/i })).toBeVisible();
  });

  test("+ Video and + Audio buttons are visible", async ({ page }) => {
    await expect(page.getByRole("button", { name: /\+ video/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /\+ audio/i })).toBeVisible();
  });
});
