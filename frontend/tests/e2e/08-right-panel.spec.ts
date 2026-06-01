import { test, expect } from "@playwright/test";

test.describe("Right panel – Properties / Effects / Media", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector('[title="Add belly band overlay"]');
  });

  test("clicking a clip opens the Properties panel", async ({ page }) => {
    const clip = page.getByTitle("Drag to move · Drag edges to trim").first();
    await clip.click();
    // Properties panel opens — shows at least Speed
    await expect(page.getByText("Speed").first()).toBeVisible({ timeout: 4000 });
  });

  test("Properties panel shows Speed slider", async ({ page }) => {
    await page.getByTitle("Drag to move · Drag edges to trim").first().click();
    await expect(page.getByText("Speed").first()).toBeVisible({ timeout: 3000 });
  });

  test("Effects tab is reachable from the right panel strip", async ({ page }) => {
    await page.getByTitle("Drag to move · Drag edges to trim").first().click();
    await page.getByRole("button", { name: /effects/i }).click();
    await expect(page.locator("text=Effects").first()).toBeVisible({ timeout: 3000 });
  });

  test("Media tab is reachable from the right panel strip", async ({ page }) => {
    await page.getByRole("button", { name: /media/i }).click();
    await expect(page.locator("text=Media, text=Upload").first().or(page.getByText(/media|upload/i).first())).toBeVisible({ timeout: 3000 });
  });

  test("clicking Properties icon while open collapses the panel", async ({ page }) => {
    const clip = page.getByTitle("Drag to move · Drag edges to trim").first();
    await clip.click();
    await expect(page.getByText("Speed").first()).toBeVisible({ timeout: 3000 });

    // Toggle closed
    await page.getByRole("button", { name: /properties/i }).click();
    await expect(page.getByText("Speed")).toHaveCount(0, { timeout: 2000 });
  });
});
