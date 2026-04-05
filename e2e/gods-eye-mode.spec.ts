import { expect, test } from '@playwright/test';

test.describe("God's Eye Mode", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.mac-sidebar, .header', { timeout: 10000 });
  });

  test("God's Eye button exists in sidebar", async ({ page }) => {
    const btn = page.locator('#godsEyeBtn');
    await expect(btn).toBeVisible();
  });

  test('activates on button click and deactivates on ESC', async ({ page }) => {
    await page.click('#godsEyeBtn');

    const container = page.locator('.gods-eye-container');
    await expect(container).toHaveClass(/gods-eye-active/, { timeout: 5000 });

    await expect(page.locator('#geExitBtn')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(container).not.toHaveClass(/gods-eye-active/, { timeout: 2000 });
  });

  test('activates on G key press', async ({ page }) => {
    await page.keyboard.press('g');

    const container = page.locator('.gods-eye-container');
    await expect(container).toHaveClass(/gods-eye-active/, { timeout: 5000 });
  });

  test('HUD displays camera information', async ({ page }) => {
    await page.click('#godsEyeBtn');
    await page.waitForSelector('.gods-eye-active', { timeout: 5000 });

    await expect(page.locator('.ge-hud-threat')).toBeVisible();
    await expect(page.locator('.ge-hud-camera')).toBeVisible();
    await expect(page.locator('#geLayerBar')).toBeVisible();
  });

  test('layer toggle bar has expected layers', async ({ page }) => {
    await page.click('#godsEyeBtn');
    await page.waitForSelector('.gods-eye-active', { timeout: 5000 });

    const layerButtons = page.locator('.ge-layer-btn');
    const count = await layerButtons.count();
    expect(count).toBeGreaterThanOrEqual(5);
  });
});
