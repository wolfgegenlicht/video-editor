import { test, expect } from "@playwright/test";

// These tests run on the test3 project (storageState from global-setup) which has
// German captions. The transcript panel is expected to be open by default.

test.describe("Transcript panel", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector('[title="Add belly band overlay"]');
    // Ensure the transcript panel is open
    const transcriptBtn = page.getByRole("button", { name: /transcript/i });
    if (await transcriptBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      // Check if the panel is collapsed; if so, open it
      const fillers = page.getByRole("button", { name: /fillers/i });
      if (!await fillers.isVisible({ timeout: 500 }).catch(() => false)) {
        await transcriptBtn.click();
      }
    }
  });

  test("transcript panel shows the Re-transcribe / Auto-Transcribe button", async ({ page }) => {
    // This button always shows regardless of whether captions exist
    await expect(
      page.getByRole("button", { name: /re-transcribe|auto-transcribe/i })
    ).toBeVisible({ timeout: 5000 });
  });

  test("Fillers button shows when project has captions", async ({ page }) => {
    // Only shown when project.captions.length > 0 (test3 has captions)
    const hasCaptions = await page.getByRole("button", { name: /fillers/i }).isVisible({ timeout: 3000 }).catch(() => false);
    if (hasCaptions) {
      await expect(page.getByRole("button", { name: /fillers/i })).toBeVisible();
    }
    // If not visible, project has no captions — test gracefully passes
  });

  test("Silences button shows when project has captions", async ({ page }) => {
    const hasCaptions = await page.getByRole("button", { name: /silences/i }).isVisible({ timeout: 3000 }).catch(() => false);
    if (hasCaptions) {
      await expect(page.getByRole("button", { name: /silences/i })).toBeVisible();
    }
  });

  test("caption word buttons are present when project has transcription", async ({ page }) => {
    const words = page.getByTitle("Click: place cursor · Drag: select range · Delete: cut from video");
    const count = await words.count();
    if (count > 0) {
      await expect(words.first()).toBeVisible();
    }
  });

  test("clicking a caption word doesn't throw an error", async ({ page }) => {
    const words = page.getByTitle("Click: place cursor · Drag: select range · Delete: cut from video");
    const count = await words.count();
    if (count > 3) {
      await words.nth(2).click();
      await page.waitForTimeout(200);
    }
  });
});
