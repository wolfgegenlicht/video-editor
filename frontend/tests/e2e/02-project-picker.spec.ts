import { test, expect } from "@playwright/test";

test.describe("Project picker — from editor", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector('[title="Add belly band overlay"]');
  });

  test("Projects button returns to the project picker", async ({ page }) => {
    await page.getByRole("button", { name: /projects/i }).click();
    // The New Project card is always present in the picker
    await expect(page.locator('[role="button"]').filter({ hasText: "New Project" }).last()).toBeVisible({ timeout: 5000 });
  });

  test("project list shows at least one existing project", async ({ page }) => {
    await page.getByRole("button", { name: /projects/i }).click();

    // Project cards are div[role="button"] that contain a project name (known names)
    // We look for any card that has text matching known project names
    const cards = page.locator('[role="button"]').filter({ hasText: /test|claude/i });
    await expect(cards.first()).toBeVisible({ timeout: 5000 });
    expect(await cards.count()).toBeGreaterThan(0);
  });

  test("clicking a project card opens it in the editor", async ({ page }) => {
    await page.getByRole("button", { name: /projects/i }).click();

    // Click the first project card that has a known project name
    const card = page.locator('[role="button"]').filter({ hasText: /test|claude/i }).first();
    await expect(card).toBeVisible({ timeout: 5000 });
    await card.click();

    // Editor shell should appear
    await expect(page.getByTitle("Add belly band overlay")).toBeVisible({ timeout: 8000 });
  });

  test("can create a new project and it opens in editor", async ({ page }) => {
    await page.getByRole("button", { name: /projects/i }).click();

    // Click the New Project card (the dashed one at the end of the grid)
    const newCard = page.locator('[role="button"]').filter({ hasText: "New Project" }).last();
    await expect(newCard).toBeVisible({ timeout: 5000 });
    await newCard.click();

    // A text input to name the project appears
    const nameInput = page.locator('input[placeholder], input[type="text"]').last();
    if (await nameInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await nameInput.fill("PW Test Project");
      await page.getByRole("button", { name: /create/i }).click();
    }

    // Editor shell loads
    await expect(page.getByTitle("Add belly band overlay")).toBeVisible({ timeout: 8000 });
  });
});
