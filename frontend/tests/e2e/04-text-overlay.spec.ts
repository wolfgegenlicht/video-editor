import { test, expect } from "@playwright/test";
import { clearOverlays } from "./helpers";

// Text overlay clips render "T {text}" in the timeline label span.
// Scope by cursor-grab class to avoid matching non-timeline elements.
function textClip(page: import("@playwright/test").Page, text: string) {
  return page
    .locator('[role="button"][class*="cursor-grab"]')
    .filter({ hasText: new RegExp(`T\\s+${text}`, "i") })
    .last(); // last = most recently added
}

async function addTextAndSelect(page: import("@playwright/test").Page) {
  await page.getByTitle("Add text overlay").click();
  const clip = textClip(page, "Text");
  await expect(clip).toBeVisible({ timeout: 4000 });
  await clip.click();
  await expect(page.locator('textarea[aria-label="Overlay text"]')).toBeVisible({ timeout: 3000 });
}

test.describe("Text overlay (T button)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await clearOverlays(page);
  });

  test("adds a plain text overlay to the timeline", async ({ page }) => {
    await page.getByTitle("Add text overlay").click();
    await expect(textClip(page, "Text")).toBeVisible({ timeout: 4000 });
  });

  test("plain text overlay does NOT show Shape section in properties", async ({ page }) => {
    await addTextAndSelect(page);
    await expect(page.getByRole("button", { name: "Pill", exact: true })).toHaveCount(0);
  });

  test("font selector works", async ({ page }) => {
    await addTextAndSelect(page);
    const fontSelect = page.locator("select#overlay-font");
    await expect(fontSelect).toBeVisible({ timeout: 3000 });
    await fontSelect.selectOption("serif");
    await expect(fontSelect).toHaveValue("serif");
    await fontSelect.selectOption("sans-serif");
  });

  test("font size slider shows 32px", async ({ page }) => {
    await addTextAndSelect(page);
    await expect(page.getByText("Font size")).toBeVisible({ timeout: 3000 });
    await expect(page.getByText("32px")).toBeVisible();
  });

  test("undo removes text overlay", async ({ page }) => {
    const clips = page.locator('[role="button"][class*="cursor-grab"]').filter({ hasText: /T\s+Text/i });
    const before = await clips.count();
    await page.getByTitle("Add text overlay").click();
    await expect(clips).toHaveCount(before + 1, { timeout: 4000 });
    await page.keyboard.press("Meta+z");
    await expect(clips).toHaveCount(before, { timeout: 3000 });
  });
});
