import { test, expect } from "@playwright/test";
import { clearOverlays } from "./helpers";

// Timeline overlay clips are div[role="button"][class*="cursor-grab"].
// Their label spans render "T {text}" — the "T " prefix is unique to the timeline
// clip label and does NOT appear in the video preview overlay.
function overlayClip(page: import("@playwright/test").Page, text: string) {
  return page
    .locator('[role="button"][class*="cursor-grab"]')
    .filter({ hasText: new RegExp(`T\\s+${text}`, "i") })
    .last(); // last = most recently added (rendered on top in the timeline)
}

async function addBellyBandAndSelect(page: import("@playwright/test").Page) {
  await page.getByTitle("Add belly band overlay").click();
  const clip = overlayClip(page, "Your text here");
  await expect(clip).toBeVisible({ timeout: 4000 });
  await clip.click();
  await expect(page.locator("text=Shape").first()).toBeVisible({ timeout: 4000 });
}

test.describe("Belly band overlay", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await clearOverlays(page);
  });

  test("clicking Belly Band adds overlay to text track and opens Properties", async ({ page }) => {
    await addBellyBandAndSelect(page);
    await expect(overlayClip(page, "Your text here")).toBeVisible();
    await expect(page.locator("text=Shape").first()).toBeVisible();
  });

  test("shape picker shows all 5 shapes and Pill is active by default", async ({ page }) => {
    await addBellyBandAndSelect(page);
    for (const shape of ["Pill", "Rounded", "Rectangle", "Tab", "Accent"]) {
      await expect(page.getByRole("button", { name: shape, exact: true })).toBeVisible();
    }
    await expect(page.getByRole("button", { name: "Pill", exact: true })).toHaveAttribute("aria-pressed", "true");
  });

  test("switching to Rectangle resets corner radius to 0%", async ({ page }) => {
    await addBellyBandAndSelect(page);
    await page.getByRole("button", { name: "Rectangle", exact: true }).click();
    await expect(page.getByRole("button", { name: "Rectangle", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "Pill", exact: true })).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByText("0%", { exact: true })).toBeVisible();
  });

  test("switching to Tab shape changes slider label to Cut corner", async ({ page }) => {
    await addBellyBandAndSelect(page);
    await page.getByRole("button", { name: "Tab", exact: true }).click();
    await expect(page.getByText("Cut corner")).toBeVisible();
  });

  test("switching to Accent shape shows Accent color input", async ({ page }) => {
    await addBellyBandAndSelect(page);
    await page.getByRole("button", { name: "Accent", exact: true }).click();
    await expect(page.getByLabel("Accent color")).toBeVisible();
  });

  test("Pill has corner radius 50% by default", async ({ page }) => {
    await addBellyBandAndSelect(page);
    await expect(page.getByText("Corner radius")).toBeVisible();
    // Corner radius shows "50%" — scope to the right panel to avoid X/Y position sliders
    await expect(page.locator("text=Corner radius").locator("..").getByText("50%")).toBeVisible();
  });

  test("editing overlay text updates the clip label", async ({ page }) => {
    await addBellyBandAndSelect(page);
    const textarea = page.locator('textarea[aria-label="Overlay text"]');
    await textarea.click({ clickCount: 3 });
    await textarea.fill("Playwright Overlay");
    await expect(overlayClip(page, "Playwright Overlay")).toBeVisible({ timeout: 2000 });
  });

  test("color template buttons update background color", async ({ page }) => {
    await addBellyBandAndSelect(page);
    const bgInput = page.getByLabel("Background color");
    const before = await bgInput.inputValue();
    await page.getByRole("button", { name: "Teal" }).click();
    const after = await bgInput.inputValue();
    expect(after).not.toBe(before);
  });

  test("padding sliders are present", async ({ page }) => {
    await addBellyBandAndSelect(page);
    await expect(page.getByText("Horizontal")).toBeVisible();
    await expect(page.getByText("Vertical")).toBeVisible();
    await expect(page.getByText("20px")).toBeVisible();
    await expect(page.getByText("8px")).toBeVisible();
  });

  test("animate duration slider is present", async ({ page }) => {
    await addBellyBandAndSelect(page);
    await expect(page.getByText("Animate duration")).toBeVisible();
    await expect(page.getByText("0.40s")).toBeVisible();
  });

  test("undo removes the overlay", async ({ page }) => {
    const clips = page.locator('[role="button"][class*="cursor-grab"]').filter({ hasText: /T\s+Your text here/i });
    const before = await clips.count();
    await page.getByTitle("Add belly band overlay").click();
    await expect(clips).toHaveCount(before + 1, { timeout: 4000 });
    await page.keyboard.press("Meta+z");
    await expect(clips).toHaveCount(before, { timeout: 3000 });
  });

  test("redo re-adds the overlay after undo", async ({ page }) => {
    const clips = page.locator('[role="button"][class*="cursor-grab"]').filter({ hasText: /T\s+Your text here/i });
    const before = await clips.count();
    await page.getByTitle("Add belly band overlay").click();
    await expect(clips).toHaveCount(before + 1, { timeout: 4000 });
    await page.keyboard.press("Meta+z");
    await expect(clips).toHaveCount(before, { timeout: 3000 });
    await page.keyboard.press("Meta+Shift+z");
    await expect(clips).toHaveCount(before + 1, { timeout: 3000 });
    await page.keyboard.press("Meta+z");
  });
});
