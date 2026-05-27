import { expect, test } from '@playwright/test';
import { expectNoHorizontalOverflow, resetFeedbackArtifact, scrollContentToTop } from './helpers.js';

test.beforeEach(async () => {
  await resetFeedbackArtifact();
});

test('baseline expectation toggle shows baseline grading results', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /user-visible-fix-avoids-code-narration/i }).click();
  await page.getByRole('button', { name: 'baseline' }).click();

  await expect(page.getByRole('button', { name: 'baseline' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('1/4 requirements passed')).toBeVisible();
  await expect(page.getByText('Skill: PASS').first()).toBeVisible();
  await expect(page.getByText('Baseline Evidence').first()).toBeVisible();
  await expect(page.getByLabel('Feedback for turn 1 expectation 1')).toHaveCount(0);
  await expectNoHorizontalOverflow(page);

  await expect(page).toHaveScreenshot('viewer-baseline-expectations-state.png', {
    fullPage: true
  });
});

test('pass filter state shows only successful evals', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'pass', exact: true }).click();

  await expect(page.getByRole('button', { name: 'pass', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: /internal-refactor-stays-refactor/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /breaking-change-returns-full-message-when-needed/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /user-visible-fix-avoids-code-narration/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /missing-artifact-smoke/i })).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  await scrollContentToTop(page);

  await expect(page).toHaveScreenshot('viewer-pass-filter-state.png', {
    fullPage: true
  });
});

test('fail filter state shows only artifact error evals', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'fail', exact: true }).click();

  await expect(page.getByRole('button', { name: 'fail', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: /missing-artifact-smoke/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /internal-refactor-stays-refactor/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /missing-artifact-smoke fail/i })).toBeVisible();
  await page.getByRole('button', { name: /missing-artifact-smoke/i }).click();
  await expect(page.getByRole('heading', { name: /missing-artifact-smoke/i })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await scrollContentToTop(page);

  await expect(page).toHaveScreenshot('viewer-fail-filter-state.png', {
    fullPage: true
  });
});

test('execution history and metadata state stays aligned', async ({ page }) => {
  await page.goto('/');

  await page.locator('.history').scrollIntoViewIfNeeded();
  await expect(page.getByRole('heading', { name: 'Execution History' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Metadata' })).toBeVisible();
  await expect(page.locator('.metadata').getByRole('link', { name: /raw json output/i })).toBeVisible();
  await expect(page.locator('.metadata').getByRole('link', { name: /view all artifacts/i })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await expect(page).toHaveScreenshot('viewer-history-metadata-state.png', {
    fullPage: true
  });
});
