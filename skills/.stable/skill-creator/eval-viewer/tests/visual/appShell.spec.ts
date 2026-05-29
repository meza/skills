import { expect, test } from '@playwright/test';
import {
  expectDesktopLayout,
  expectInteractiveHoverStates,
  expectNoHorizontalOverflow,
  expectResponsiveSingleColumnLayout,
  expectRunHeaderLayout,
  resetFeedbackArtifact,
  scrollContentToTop,
  showPassingRuns
} from './helpers.js';

test.beforeEach(async () => {
  await resetFeedbackArtifact();
});

test('default state shows failed evals when failures exist', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('button', { name: 'fail', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'all' })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('navigation', { name: 'Evals' }).locator('.run-link > span:first-child')).toHaveText([
    'user-visible-fix-avoids-code-narration'
  ]);
  await expect(page.getByRole('button', { name: /internal-refactor-stays-refactor/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /breaking-change-returns-full-message-when-needed/i })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Executive Summary' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Expectations Breakdown' })).toBeVisible();
  await expect(page.getByText('3/4 requirements passed')).toBeVisible();
  await expect(page.getByText('Eval ID: 2')).toBeVisible();
  await expect(page.locator('.run-pager > span')).toHaveText('1 / 1');
  await expectNoHorizontalOverflow(page);
  await expectDesktopLayout(page);
  await expectInteractiveHoverStates(page);
  await scrollContentToTop(page);
});

test('failed expectation state composes evidence with the full page', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /user-visible-fix-avoids-code-narration/i }).click();

  await expect(page.locator('.run-pager > span')).toHaveText('1 / 1');
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
  await showPassingRuns(page);
  await page.getByRole('button', { name: /breaking-change-returns-full-message-when-needed/i }).click();

  await expect(page.locator('.run-pager > span')).toHaveText('2 / 2');
  await expectRunHeaderLayout(page);
  await expectNoHorizontalOverflow(page);

  await expect(page.locator('.run-header')).toHaveScreenshot('viewer-long-title-pager-state.png');
});

test('overall-heavy breakdown stays readable in the full page view', async ({ page }) => {
  await page.goto('/');
  await showPassingRuns(page);
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

test('mobile success state keeps controls visible and contained', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/');
  await showPassingRuns(page);

  await expect(page.getByRole('heading', { name: /skill evaluation/i })).toBeVisible();
  await expect(page.getByRole('button', { name: 'all' })).toBeVisible();
  await expect(page.getByRole('button', { name: /internal-refactor-stays-refactor/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Executive Summary' })).toBeVisible();
  await expect(page.locator('.run-pager > span')).toHaveText('1 / 2');
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
});
