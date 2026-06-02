import { expect, test } from '@playwright/test';
import {
  expectHoverStyleChange,
  expectNoHorizontalOverflow,
  readComputedStyle,
  resetFeedbackArtifact,
  showPassingRuns
} from './helpers.js';

const PAGE_EDGE_BLUR_TARGET_X = 8;
const PAGE_EDGE_BLUR_TARGET_Y = 8;

test.beforeEach(async () => {
  await resetFeedbackArtifact();
});

test('successful expectation hover state gives the status bar a neon glow', async ({ page }) => {
  await page.goto('/');
  await showPassingRuns(page);
  await page.getByRole('button', { name: /Turn 1 3\/3 expectations passed/i }).click();

  const expectation = page.locator('.expectation.pass').first();
  await expect(expectation).toBeVisible();
  await expectHoverStyleChange(page, expectation, 'background-image');
  await expectNoHorizontalOverflow(page);

  await expect(expectation).toHaveScreenshot('viewer-successful-expectation-hover-state.png');
});

test('passing expectation card starts with feedback collapsed', async ({ page }) => {
  await page.goto('/');
  await showPassingRuns(page);
  await page.getByRole('button', { name: /Turn 1 3\/3 expectations passed/i }).click();

  const expectation = page.locator('.expectation.pass').first();
  await expect(expectation).toBeVisible();
  await expect(expectation.locator('.inline-feedback')).toHaveAttribute('aria-hidden', 'true');
  await expect(expectation.getByLabel('Feedback for turn 1 expectation 1')).toHaveAttribute('tabindex', '-1');

  await expect(expectation).toHaveScreenshot('viewer-passing-expectation-collapsed-state.png');
});

test('passing expectation card shows feedback after toggling open', async ({ page }) => {
  await page.goto('/');
  await showPassingRuns(page);
  await page.getByRole('button', { name: /Turn 1 3\/3 expectations passed/i }).click();

  const expectation = page.locator('.expectation.pass').first();
  await expect(expectation).toBeVisible();
  await expectation.getByRole('button', { name: /toggle feedback/i }).click();

  await expect(expectation.locator('.inline-feedback')).toHaveAttribute('aria-hidden', 'false');
  await expect(expectation.getByLabel('Feedback for turn 1 expectation 1')).not.toHaveAttribute('tabindex', '-1');

  await expect(expectation).toHaveScreenshot('viewer-passing-expectation-open-state.png');
});

test('expectation card surface toggles feedback outside of the header', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /user-visible-fix-avoids-code-narration/i }).click();

  const expectation = page.locator('.expectation.fail').first();
  const feedback = expectation.locator('.inline-feedback');
  await expect(expectation).toBeVisible();
  await expect(feedback).toHaveAttribute('aria-hidden', 'false');

  await expectation.locator('.evidence').first().click();

  await expect(feedback).toHaveAttribute('aria-hidden', 'true');
  await expect(expectation.locator('textarea')).toHaveAttribute('tabindex', '-1');
});

test('expectation feedback textarea keeps the card open while editing', async ({ page }) => {
  await page.goto('/');
  await showPassingRuns(page);
  await page.getByRole('button', { name: /Turn 1 3\/3 expectations passed/i }).click();

  const expectation = page.locator('.expectation.pass').first();
  const feedback = expectation.getByLabel('Feedback for turn 1 expectation 1');
  await expectation.click();
  await expect(expectation.locator('.inline-feedback')).toHaveAttribute('aria-hidden', 'false');

  await feedback.fill('Textarea interaction should not collapse the expectation.');
  await feedback.click();

  await expect(expectation.locator('.inline-feedback')).toHaveAttribute('aria-hidden', 'false');
  await expect(feedback).toHaveValue('Textarea interaction should not collapse the expectation.');
});

test('expectation feedback active border animates over the inactive frame', async ({ page }) => {
  await page.goto('/');
  await showPassingRuns(page);
  await page.getByRole('button', { name: /Turn 1 3\/3 expectations passed/i }).click();

  const expectation = page.locator('.expectation.pass').first();
  await expectation.click();

  const feedback = expectation.getByLabel('Feedback for turn 1 expectation 1');
  const feedbackFrame = expectation.locator('.feedback-input-frame');
  await feedback.focus();

  await expect(feedback).toBeFocused();
  await expect(feedbackFrame).toHaveScreenshot('viewer-expectation-feedback-active-border-state.png');
});

test('expectation feedback active left border returns to inactive after blur', async ({ page }) => {
  await page.goto('/');
  await showPassingRuns(page);
  await page.getByRole('button', { name: /Turn 1 3\/3 expectations passed/i }).click();

  const expectation = page.locator('.expectation.pass').first();
  await expectation.click();

  const feedback = expectation.getByLabel('Feedback for turn 1 expectation 1');
  const inactiveLeftBorder = await readComputedStyle(feedback, 'border-left-color');

  await feedback.focus();
  await expect(feedback).toBeFocused();
  await expect.poll(() => readComputedStyle(feedback, 'border-left-color')).not.toBe(inactiveLeftBorder);

  await page.mouse.click(PAGE_EDGE_BLUR_TARGET_X, PAGE_EDGE_BLUR_TARGET_Y);
  await expect(feedback).not.toBeFocused();
  await expect.poll(() => readComputedStyle(feedback, 'border-left-color')).toBe(inactiveLeftBorder);
});

test('failed expectation hover state gives the status bar a neon glow', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /user-visible-fix-avoids-code-narration/i }).click();

  const expectation = page.locator('.expectation.fail').first();
  await expect(expectation).toBeVisible();
  await expectHoverStyleChange(page, expectation, 'background-image');
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
