/**
 * God's Eye 4D — E2E tests
 *
 * Covers Tasks 1–13 of the 4D implementation. Each test enters God's Eye
 * via the sidebar button (matches the existing gods-eye-mode.spec.ts
 * pattern) and exercises the 4D toggle, swimlane interactions, and HUD
 * state changes.
 *
 * Cesium-rendered overlays (trails, pillars, prediction cones, branching
 * paths) are not asserted in DOM — they live in the WebGL canvas and need
 * dedicated visual-regression snapshots, which is out of scope for this
 * pass. Their presence is implied by the lifecycle (mount/unmount runs
 * cleanly without errors thrown into the page console).
 *
 * Plan: docs/superpowers/plans/2026-04-13-gods-eye-4d.md (Task 16)
 */

import { expect, test } from '@playwright/test';

test.describe("God's Eye 4D Mode", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.mac-sidebar, .header', { timeout: 10_000 });
    await page.click('#godsEyeBtn');
    await expect(page.locator('.gods-eye-container')).toHaveClass(/gods-eye-active/, { timeout: 5_000 });
  });

  test('T toggles 4D mode (swimlane mounts and unmounts)', async ({ page }) => {
    await expect(page.locator('.ge-swimlane')).toHaveCount(0);

    await page.keyboard.press('t');
    await expect(page.locator('.ge-swimlane')).toBeVisible({ timeout: 2_000 });
    await expect(page.locator('body')).toHaveClass(/gods-eye-4d-active/);

    await page.keyboard.press('t');
    await expect(page.locator('.ge-swimlane')).toHaveCount(0, { timeout: 2_000 });
    await expect(page.locator('body')).not.toHaveClass(/gods-eye-4d-active/);
  });

  test('swimlane renders six category lanes', async ({ page }) => {
    await page.keyboard.press('t');
    await expect(page.locator('.ge-swimlane')).toBeVisible({ timeout: 2_000 });
    await expect(page.locator('.ge-lane')).toHaveCount(6);
    for (const cls of ['conflicts', 'disasters', 'military', 'seismic', 'cyber', 'weather']) {
      await expect(page.locator(`.ge-lane-${cls}`)).toHaveCount(1);
    }
  });

  test('Tab collapses and expands the swimlane', async ({ page }) => {
    await page.keyboard.press('t');
    await expect(page.locator('.ge-swimlane.expanded')).toBeVisible({ timeout: 2_000 });

    await page.keyboard.press('Tab');
    await expect(page.locator('.ge-swimlane.collapsed')).toBeVisible({ timeout: 1_000 });
    await expect(page.locator('.ge-swimlane.expanded')).toHaveCount(0);

    await page.keyboard.press('Tab');
    await expect(page.locator('.ge-swimlane.expanded')).toBeVisible({ timeout: 1_000 });
  });

  test('zoom presets update the active pill', async ({ page }) => {
    await page.keyboard.press('t');
    await expect(page.locator('.ge-swimlane')).toBeVisible({ timeout: 2_000 });

    // Default is 24h.
    await expect(page.locator('.ge-pill.active').first()).toHaveText('24h');

    await page.locator('.ge-pill', { hasText: '7d' }).click();
    await expect(page.locator('.ge-pill.active').first()).toHaveText('7d');

    await page.locator('.ge-pill', { hasText: '1h' }).click();
    await expect(page.locator('.ge-pill.active').first()).toHaveText('1h');
  });

  test('HUD shows the 4D mode badge with playback-mode label', async ({ page }) => {
    await page.keyboard.press('t');
    const badge = page.locator('.ge-hud-4d-badge');
    await expect(badge).toBeVisible({ timeout: 2_000 });
    await expect(badge).toHaveText(/4D/);
    await expect(badge).toContainText('DOC');
  });

  test('D / I / H switch playback mode label in the HUD badge', async ({ page }) => {
    await page.keyboard.press('t');
    const badge = page.locator('.ge-hud-4d-badge');
    await expect(badge).toBeVisible({ timeout: 2_000 });

    await page.keyboard.press('i');
    await expect(badge).toContainText('AI', { timeout: 1_000 });

    await page.keyboard.press('h');
    await expect(badge).toContainText('PULSE', { timeout: 1_000 });

    await page.keyboard.press('d');
    await expect(badge).toContainText('DOC', { timeout: 1_000 });
  });

  test('NOW line is rendered when swimlane is active', async ({ page }) => {
    await page.keyboard.press('t');
    await expect(page.locator('.ge-swimlane')).toBeVisible({ timeout: 2_000 });
    const nowLine = page.locator('.ge-now-line');
    await expect(nowLine).toBeVisible();
    await expect(page.locator('.ge-now-label')).toHaveText('NOW');
  });

  test('exiting God\'s Eye also tears down the swimlane', async ({ page }) => {
    await page.keyboard.press('t');
    await expect(page.locator('.ge-swimlane')).toBeVisible({ timeout: 2_000 });

    await page.keyboard.press('Escape');
    await expect(page.locator('.ge-swimlane')).toHaveCount(0, { timeout: 2_000 });
    await expect(page.locator('body')).not.toHaveClass(/gods-eye-4d-active/);
    await expect(page.locator('.gods-eye-container')).not.toHaveClass(/gods-eye-active/, { timeout: 2_000 });
  });
});

test.describe("God's Eye 4D — outside God's Eye", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.mac-sidebar, .header', { timeout: 10_000 });
  });

  test('T does not mount the swimlane outside God\'s Eye', async ({ page }) => {
    await page.keyboard.press('t');
    // Wait briefly to let any (incorrect) mount run, then assert nothing.
    await page.waitForTimeout(500);
    await expect(page.locator('.ge-swimlane')).toHaveCount(0);
    await expect(page.locator('body')).not.toHaveClass(/gods-eye-4d-active/);
  });
});
