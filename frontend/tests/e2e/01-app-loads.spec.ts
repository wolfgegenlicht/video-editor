import { test, expect } from "@playwright/test";

test.describe("App shell", () => {
  test("loads the editor with all key panels visible", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector('[title="Add belly band overlay"]', { timeout: 10000 });
    // Header controls
    await expect(page.getByRole("button", { name: /projects/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /undo/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /redo/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /export/i })).toBeVisible();

    // Aspect ratio selector
    const ar = page.getByRole("combobox");
    await expect(ar).toBeVisible();

    // Timeline toolbar
    await expect(page.getByTitle("Add belly band overlay")).toBeVisible();
    await expect(page.getByTitle("Add text overlay")).toBeVisible();
    await expect(page.getByRole("button", { name: /split/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /\+ video/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /\+ audio/i })).toBeVisible();

    // Right-panel icon strip
    await expect(page.getByRole("button", { name: /properties/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /effects/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /media/i })).toBeVisible();

    // Timeline tracks
    await expect(page.locator("text=video co").first()).toBeVisible();
    await expect(page.locator("text=captions").first()).toBeVisible();
  });

  test("project name is editable in the header", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector('[title="Add belly band overlay"]', { timeout: 10000 });
    const nameInput = page.getByRole("textbox", { name: /project name/i });
    await expect(nameInput).toBeVisible();
    const original = await nameInput.inputValue();
    await nameInput.click({ clickCount: 3 });
    await nameInput.fill("Playwright Test");
    await page.keyboard.press("Enter");
    await expect(nameInput).toHaveValue("Playwright Test");
    // Restore
    await nameInput.click({ clickCount: 3 });
    await nameInput.fill(original);
    await page.keyboard.press("Enter");
  });

  test("aspect ratio dropdown changes value", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector('[title="Add belly band overlay"]', { timeout: 10000 });
    const select = page.getByRole("combobox");
    await select.selectOption("9:16");
    await expect(select).toHaveValue("9:16");
    await select.selectOption("16:9");
    await expect(select).toHaveValue("16:9");
  });
});
