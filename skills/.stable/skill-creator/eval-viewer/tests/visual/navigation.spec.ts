import { expect, test } from '@playwright/test';
import { expectNoHorizontalOverflow, resetFeedbackArtifact, scrollContentToTop } from './helpers.js';

test.beforeEach(async () => {
  await resetFeedbackArtifact();
});

test('default state shows all evals when every eval passed', async ({ page }) => {
  const response = await page.request.get('/api/iteration');
  const iteration = await response.json();
  const passingRuns = iteration.runs.filter(
    (run: { issues: Array<{ severity: string }>; passRate: number; runType: string }) =>
      run.runType === 'skill' && run.passRate === 1 && run.issues.every((issue) => issue.severity !== 'error')
  );
  await page.route('**/api/iteration', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        ...iteration,
        runs: passingRuns,
        summary: {
          ...iteration.summary,
          runCount: passingRuns.length
        }
      }),
      contentType: 'application/json'
    });
  });

  await page.goto('/');

  await expect(page.getByRole('button', { name: 'all' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'fail', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('navigation', { name: 'Evals' }).locator('.run-link > span:first-child')).toHaveText([
    'internal-refactor-stays-refactor',
    'breaking-change-returns-full-message-when-needed'
  ]);
  await expectNoHorizontalOverflow(page);
  await scrollContentToTop(page);

  await expect(page).toHaveScreenshot('viewer-all-passed-default-state.png', {
    fullPage: true
  });
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

test('default state shows failed evals when failures exist', async ({ page }) => {
  await page.goto('/');

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
