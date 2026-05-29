import { expect, test } from '@playwright/test';
import {
  expectHoverStyleChange,
  expectNoHorizontalOverflow,
  readFeedbackArtifact,
  resetFeedbackArtifact,
  showPassingRuns
} from './helpers.js';

test.beforeEach(async () => {
  await resetFeedbackArtifact();
});

test('expectation section heading shows result toggle hover glow', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /user-visible-fix-avoids-code-narration/i }).click();
  await page.getByRole('button', { name: 'baseline' }).click();

  const sectionHeading = page.locator('.section-heading').first();
  await expect(sectionHeading).toBeVisible();
  await expectHoverStyleChange(page, sectionHeading.getByRole('button', { name: 'skill' }), 'color');
  await expectNoHorizontalOverflow(page);

  await expect(sectionHeading).toHaveScreenshot('viewer-expectation-section-heading-toggle-hover-state.png');
});

test('expectation section heading shows active result toggle hover glow', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /user-visible-fix-avoids-code-narration/i }).click();
  await page.getByRole('button', { name: 'baseline' }).click();

  const sectionHeading = page.locator('.section-heading').first();
  await expect(sectionHeading).toBeVisible();
  await expectHoverStyleChange(page, sectionHeading.getByRole('button', { name: 'baseline' }), 'box-shadow');
  await expectNoHorizontalOverflow(page);

  await expect(sectionHeading).toHaveScreenshot('viewer-expectation-section-heading-active-toggle-hover-state.png');
});

test('overall expectation heading follows the grouped section treatment', async ({ page }) => {
  await page.goto('/');
  await showPassingRuns(page);
  await page.getByRole('button', { name: /breaking-change-returns-full-message-when-needed/i }).click();

  const heading = page.getByRole('button', { name: /Overall Expectations 4\/4 expectations passed/i });
  await expect(heading).toBeVisible();
  await expect(heading).toHaveAttribute('aria-expanded', 'true');

  await expect(heading).toHaveScreenshot('viewer-overall-expectations-heading.png');
});

test('passing turn section heading renders the open state', async ({ page }) => {
  await page.goto('/');
  await showPassingRuns(page);

  const heading = page.getByRole('button', { name: /Turn 1 3\/3 expectations passed/i });
  await expect(heading).toBeVisible();
  await heading.click();
  await expect(heading).toHaveAttribute('aria-expanded', 'true');

  await expect(heading).toHaveScreenshot('viewer-passing-turn-section-heading-open-state.png');
});

test('passing turn section heading renders the closed state', async ({ page }) => {
  await page.goto('/');
  await showPassingRuns(page);

  const heading = page.getByRole('button', { name: /Turn 2 3\/3 expectations passed/i });
  await expect(heading).toBeVisible();
  await expect(heading).toHaveAttribute('aria-expanded', 'false');

  await expect(heading).toHaveScreenshot('viewer-passing-turn-section-heading-closed-state.png');
});

test('passing turn section heading previews the open treatment on hover', async ({ page }) => {
  await page.goto('/');
  await showPassingRuns(page);

  const heading = page.getByRole('button', { name: /Turn 2 3\/3 expectations passed/i });
  await expect(heading).toBeVisible();
  await expectHoverStyleChange(page, heading, 'background-size');

  await expect(heading).toHaveScreenshot('viewer-passing-turn-section-heading-hover-state.png');
});

test('failing turn section heading renders the open state', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /user-visible-fix-avoids-code-narration/i }).click();

  const heading = page.getByRole('button', { name: /Turn 1 2\/3 expectations passed/i });
  await expect(heading).toBeVisible();
  await expect(heading).toHaveAttribute('aria-expanded', 'true');

  await expect(heading).toHaveScreenshot('viewer-failing-turn-section-heading-open-state.png');
});

test('failing turn section heading renders the closed state', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /user-visible-fix-avoids-code-narration/i }).click();

  const heading = page.getByRole('button', { name: /Turn 1 2\/3 expectations passed/i });
  await heading.click();
  await expect(heading).toHaveAttribute('aria-expanded', 'false');

  await expect(heading).toHaveScreenshot('viewer-failing-turn-section-heading-closed-state.png');
});

test('failing turn section heading previews the open treatment on hover', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /user-visible-fix-avoids-code-narration/i }).click();

  const heading = page.getByRole('button', { name: /Turn 1 2\/3 expectations passed/i });
  await heading.click();
  await expect(heading).toHaveAttribute('aria-expanded', 'false');
  await expectHoverStyleChange(page, heading, 'background-size');

  await expect(heading).toHaveScreenshot('viewer-failing-turn-section-heading-hover-state.png');
});

test('collapsed turn section heading keeps expectations hidden', async ({ page }) => {
  await page.goto('/');
  await showPassingRuns(page);

  const heading = page.getByRole('button', { name: /Turn 2 3\/3 expectations passed/i });
  const body = page.locator('#turn-turn-2-expectations');
  await expect(heading).toBeVisible();
  await expect(heading).toHaveAttribute('aria-expanded', 'false');
  await expect(body).toBeHidden();

  await expect(page.locator('.expectation-section').filter({ has: heading })).toHaveScreenshot(
    'viewer-collapsed-turn-section-state.png'
  );
});

test('turn section state persists when switching between skill and baseline', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /user-visible-fix-avoids-code-narration/i }).click();

  const skillHeading = page.getByRole('button', { name: /Turn 1 2\/3 expectations passed/i });
  await expect(skillHeading).toHaveAttribute('aria-expanded', 'true');
  await skillHeading.click();
  await expect(skillHeading).toHaveAttribute('aria-expanded', 'false');

  await page.getByRole('button', { name: 'baseline' }).click();

  const baselineHeading = page.getByRole('button', { name: /Turn 1 0\/3 expectations passed/i });
  await expect(baselineHeading).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.expectation-section').filter({ has: baselineHeading })).toHaveScreenshot(
    'viewer-baseline-section-preserved-closed-state.png'
  );
});

test('turn section state resets when moving between evals', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /user-visible-fix-avoids-code-narration/i }).click();

  const failingEvalHeading = page.getByRole('button', { name: /Turn 1 2\/3 expectations passed/i });
  await expect(failingEvalHeading).toHaveAttribute('aria-expanded', 'true');
  await failingEvalHeading.click();
  await expect(failingEvalHeading).toHaveAttribute('aria-expanded', 'false');

  await page.getByRole('button', { name: 'all' }).click();
  await page.getByRole('button', { name: /internal-refactor-stays-refactor/i }).click();
  await expect(page.getByRole('button', { name: /Turn 1 3\/3 expectations passed/i })).toHaveAttribute(
    'aria-expanded',
    'false'
  );

  await page.getByRole('button', { name: /user-visible-fix-avoids-code-narration/i }).click();
  await expect(page.getByRole('button', { name: /Turn 1 2\/3 expectations passed/i })).toHaveAttribute(
    'aria-expanded',
    'true'
  );
});

test('passing turn section opens by default when saved feedback exists', async ({ page }) => {
  await page.goto('/');
  await showPassingRuns(page);

  const heading = page.getByRole('button', { name: /Turn 1 3\/3 expectations passed/i });
  await heading.click();
  await page
    .getByRole('button', { name: /Toggle feedback for The message classifies internal-only restructuring/i })
    .click();
  const saveResponse = page.waitForResponse(
    (response) => response.url().includes('/api/feedback/1') && response.request().method() === 'PUT'
  );
  await page.getByLabel('Feedback for turn 1 expectation 1').fill('Saved note for this passing turn.');
  await expect((await saveResponse).ok()).toBe(true);
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await expect
    .poll(async () => readFeedbackArtifact())
    .toMatchObject({
      reviews: [
        {
          eval_id: 1,
          turns: [
            {
              expectations: [{ comment: 'Saved note for this passing turn.' }],
              turn: 1
            }
          ]
        }
      ]
    });

  await page.reload();
  await showPassingRuns(page);

  const reloadedHeading = page.getByRole('button', { name: /Turn 1 3\/3 expectations passed/i });
  await expect(reloadedHeading).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByLabel('Feedback for turn 1 expectation 1')).toBeVisible();
  await expect(page.getByLabel('Feedback for turn 1 expectation 1')).toHaveValue('Saved note for this passing turn.');
  await expect(page.locator('.expectation-section').filter({ has: reloadedHeading })).toHaveScreenshot(
    'viewer-feedback-opens-passing-section-state.png'
  );
});
