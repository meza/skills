import { expect, test } from '@playwright/test';
import { expectNoHorizontalOverflow, resetFeedbackArtifact } from './helpers.js';

test.beforeEach(async () => {
  await resetFeedbackArtifact();
});

test('successful expectation hover state gives the status bar a neon glow', async ({ page }) => {
  await page.goto('/');

  const expectation = page.locator('.expectation.pass').first();
  await expect(expectation).toBeVisible();
  await expectation.hover();
  await page.waitForTimeout(300);
  await expectNoHorizontalOverflow(page);

  await expect(expectation).toHaveScreenshot('viewer-successful-expectation-hover-state.png');
});

test('passing expectation card starts with feedback collapsed', async ({ page }) => {
  await page.goto('/');

  const expectation = page.locator('.expectation.pass').first();
  await expect(expectation).toBeVisible();
  await expect(expectation.locator('.inline-feedback')).toHaveAttribute('aria-hidden', 'true');
  await expect(expectation.getByLabel('Feedback for turn 1 expectation 1')).toHaveAttribute('tabindex', '-1');

  await expect(expectation).toHaveScreenshot('viewer-passing-expectation-collapsed-state.png');
});

test('passing expectation card shows feedback after toggling open', async ({ page }) => {
  await page.goto('/');

  const expectation = page.locator('.expectation.pass').first();
  await expect(expectation).toBeVisible();
  await expectation.getByRole('button', { name: /toggle feedback/i }).click();
  await page.waitForTimeout(300);

  await expect(expectation.locator('.inline-feedback')).toHaveAttribute('aria-hidden', 'false');
  await expect(expectation.getByLabel('Feedback for turn 1 expectation 1')).not.toHaveAttribute('tabindex', '-1');

  await expect(expectation).toHaveScreenshot('viewer-passing-expectation-open-state.png');
});

test('failed expectation hover state gives the status bar a neon glow', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /user-visible-fix-avoids-code-narration/i }).click();

  const expectation = page.locator('.expectation.fail').first();
  await expect(expectation).toBeVisible();
  await expectation.hover();
  await page.waitForTimeout(300);
  await expectNoHorizontalOverflow(page);

  await expect(expectation).toHaveScreenshot('viewer-failed-expectation-hover-state.png');
});

test('failed expectation card starts with feedback and evidence open', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /user-visible-fix-avoids-code-narration/i }).click();

  const expectation = page.locator('.expectation.fail').first();
  await expect(expectation).toBeVisible();
  await expect(expectation.locator('.inline-feedback')).toHaveAttribute('aria-hidden', 'false');
  await expect(expectation.getByText('Run Evidence')).toBeVisible();
  await expect(expectation.getByText('Baseline Evidence')).toBeVisible();

  await expect(expectation).toHaveScreenshot('viewer-failed-expectation-open-state.png');
});

test('baseline expectation cards suppress editable feedback', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /user-visible-fix-avoids-code-narration/i }).click();
  await page.getByRole('button', { name: 'baseline' }).click();
  await page.getByRole('button', { name: /Turn 2 1\/1 expectations passed/i }).click();

  const expectation = page.locator('.expectation.pass').first();
  await expect(expectation).toBeVisible();
  await expect(page.getByLabel('Feedback for turn 1 expectation 1')).toHaveCount(0);
  await expect(expectation.getByText('Skill: PASS').first()).toBeVisible();

  await expect(expectation).toHaveScreenshot('viewer-baseline-expectation-card-state.png');
});
