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

const OVERALL_HEAVY_EXPECTATION_COUNT = 4;
const PASSING_RUN_BUTTON_NAME = /internal-refactor-stays-refactor/i;
const BREAKING_CHANGE_RUN_BUTTON_NAME = /breaking-change-returns-full-message-when-needed/i;
const FAILING_RUN_BUTTON_NAME = /user-visible-fix-avoids-code-narration/i;
const FAILURE_EVIDENCE_TEXT = /Failure evidence for:/;
const OVERALL_EXPECTATIONS_HEADING_NAME = /Overall Expectations 4\/4 expectations passed/i;
const TURN_ONE_OVERALL_HEAVY_HEADING_NAME = /Turn 1 4\/4 expectations passed/i;
const SKILL_EVALUATION_HEADING_NAME = /skill evaluation/i;

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
  await expect(page.getByRole('button', { name: PASSING_RUN_BUTTON_NAME })).toHaveCount(0);
  await expect(page.getByRole('button', { name: BREAKING_CHANGE_RUN_BUTTON_NAME })).toHaveCount(0);
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
  await page.getByRole('button', { name: FAILING_RUN_BUTTON_NAME }).click();

  await expect(page.locator('.run-pager > span')).toHaveText('1 / 1');
  await expect(page.getByText('3/4 requirements passed')).toBeVisible();
  await expect(page.locator('.expectation.fail')).toHaveCount(1);
  await expect(page.getByText('Run Evidence')).toBeVisible();
  await expect(page.getByText('Baseline Evidence')).toBeVisible();
  await expect(page.getByText(FAILURE_EVIDENCE_TEXT)).toHaveCount(2);
  await expectNoHorizontalOverflow(page);

  await expect(page).toHaveScreenshot('viewer-failure-evidence-state.png', {
    fullPage: true
  });
});

test('long eval title keeps pager readable', async ({ page }) => {
  await page.goto('/');
  await showPassingRuns(page);
  await page.getByRole('button', { name: BREAKING_CHANGE_RUN_BUTTON_NAME }).click();

  await expect(page.locator('.run-pager > span')).toHaveText('2 / 2');
  await expectRunHeaderLayout(page);
  await expectNoHorizontalOverflow(page);

  await expect(page.locator('.run-header')).toHaveScreenshot('viewer-long-title-pager-state.png');
});

test('overall-heavy breakdown stays readable in the full page view', async ({ page }) => {
  await page.goto('/');
  await showPassingRuns(page);
  await page.getByRole('button', { name: BREAKING_CHANGE_RUN_BUTTON_NAME }).click();

  await expect(page.getByText('8/8 requirements passed')).toBeVisible();
  await expect(page.getByRole('button', { name: OVERALL_EXPECTATIONS_HEADING_NAME })).toBeVisible();
  await expect(page.getByRole('button', { name: TURN_ONE_OVERALL_HEAVY_HEADING_NAME })).toBeVisible();
  await expect(page.locator('#overall-overall-expectations-expectations .expectation')).toHaveCount(
    OVERALL_HEAVY_EXPECTATION_COUNT
  );
  await expectNoHorizontalOverflow(page);

  await expect(page).toHaveScreenshot('viewer-overall-heavy-breakdown-state.png', {
    fullPage: true
  });
});

test('mobile success state keeps controls visible and contained', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/');
  await showPassingRuns(page);

  await expect(page.getByRole('heading', { name: SKILL_EVALUATION_HEADING_NAME })).toBeVisible();
  await expect(page.getByRole('button', { name: 'all' })).toBeVisible();
  await expect(page.getByRole('button', { name: PASSING_RUN_BUTTON_NAME })).toBeVisible();
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
  await page.getByRole('button', { name: FAILING_RUN_BUTTON_NAME }).click();
  await page.getByRole('button', { name: 'baseline' }).click();

  await expect(page.getByRole('heading', { name: 'Expectations Breakdown' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'baseline' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('1/4 requirements passed')).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectResponsiveSingleColumnLayout(page);
});
