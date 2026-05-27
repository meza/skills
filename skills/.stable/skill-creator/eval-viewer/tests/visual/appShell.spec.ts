import { expect, test } from '@playwright/test';
import {
  expectDesktopLayout,
  expectInteractiveHoverStates,
  expectNoHorizontalOverflow,
  expectPrototypeShell,
  expectResponsiveSingleColumnLayout,
  expectRunHeaderLayout,
  resetFeedbackArtifact,
  scrollContentToTop
} from './helpers.js';

test.beforeEach(async () => {
  await resetFeedbackArtifact();
});

test('success run state matches the prototype shell', async ({ page }) => {
  await page.goto('/');

  await expectPrototypeShell(page);
  await expect(page.getByRole('heading', { name: 'Executive Summary' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Expectations Breakdown' })).toBeVisible();
  await expect(page.getByText('6/6 requirements passed')).toBeVisible();
  await expect(page.getByText('Eval ID: 1')).toBeVisible();
  await expect(page.locator('.run-pager > span')).toHaveText('1 / 4');
  await expectNoHorizontalOverflow(page);
  await expectDesktopLayout(page);
  await expectInteractiveHoverStates(page);
  await scrollContentToTop(page);

  await expect(page).toHaveScreenshot('viewer-success-state.png', {
    fullPage: true
  });
});

test('failed expectation state composes evidence with the full page', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /user-visible-fix-avoids-code-narration/i }).click();

  await expect(page.locator('.run-pager > span')).toHaveText('2 / 4');
  await expect(page.getByText('3/4 requirements passed')).toBeVisible();
  await expect(page.locator('.expectation.fail')).toHaveCount(1);
  await expect(page.getByText('Run Evidence')).toBeVisible();
  await expect(page.getByText('Baseline Evidence')).toBeVisible();
  await expect(page.getByText(/Failure evidence for:/)).toHaveCount(2);
  await expectNoHorizontalOverflow(page);

  await expect(page).toHaveScreenshot('viewer-failure-evidence-state.png', {
    fullPage: true
  });
});

test('long eval title keeps pager readable', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /breaking-change-returns-full-message-when-needed/i }).click();

  await expect(page.locator('.run-pager > span')).toHaveText('3 / 4');
  await expectRunHeaderLayout(page);
  await expectNoHorizontalOverflow(page);

  await expect(page.locator('.run-header')).toHaveScreenshot('viewer-long-title-pager-state.png');
});

test('overall-heavy breakdown stays readable in the full page view', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /breaking-change-returns-full-message-when-needed/i }).click();

  await expect(page.getByText('8/8 requirements passed')).toBeVisible();
  await expect(page.getByRole('button', { name: /Overall Expectations 4\/4 expectations passed/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Turn 1 4\/4 expectations passed/i })).toBeVisible();
  await expect(page.locator('#overall-overall-expectations-expectations .expectation')).toHaveCount(4);
  await expectNoHorizontalOverflow(page);

  await expect(page).toHaveScreenshot('viewer-overall-heavy-breakdown-state.png', {
    fullPage: true
  });
});

test('missing artifact state stays reviewable without invented panels', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /missing-artifact-smoke/i }).click();

  await expect(page.locator('.run-pager > span')).toHaveText('4 / 4');
  await expect(page.getByRole('heading', { name: /missing-artifact-smoke/i })).toBeVisible();
  await expect(page.getByText('No executive summary was provided.')).toBeVisible();
  await expect(page.getByText('No evidence was recorded for this expectation.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Artifact Issues' })).toHaveCount(0);
  await expectNoHorizontalOverflow(page);

  await expect(page).toHaveScreenshot('viewer-missing-artifact-state.png', {
    fullPage: true
  });
});

test('mobile success state keeps controls visible and contained', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/');

  await expect(page.getByRole('heading', { name: /skill evaluation/i })).toBeVisible();
  await expect(page.getByRole('button', { name: 'all' })).toBeVisible();
  await expect(page.getByRole('button', { name: /internal-refactor-stays-refactor/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Executive Summary' })).toBeVisible();
  await expect(page.locator('.run-pager > span')).toHaveText('1 / 4');
  await expectNoHorizontalOverflow(page);
  await expectResponsiveSingleColumnLayout(page);

  await expect(page).toHaveScreenshot('viewer-mobile-success-state.png', {
    fullPage: true
  });
});

test('tablet baseline expectation state keeps controls visible and contained', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: /user-visible-fix-avoids-code-narration/i }).click();
  await page.getByRole('button', { name: 'baseline' }).click();

  await expect(page.getByRole('heading', { name: 'Expectations Breakdown' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'baseline' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('1/4 requirements passed')).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectResponsiveSingleColumnLayout(page);

  await expect(page).toHaveScreenshot('viewer-tablet-baseline-expectations-state.png', {
    fullPage: true
  });
});
