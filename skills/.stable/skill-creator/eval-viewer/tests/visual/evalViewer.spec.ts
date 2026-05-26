import { readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

const feedbackPath = resolve('.tmp', 'visual-fixture', 'results', 'iteration-3', 'viewer_feedback.json');

test.beforeEach(async () => {
  await rm(feedbackPath, { force: true });
});

test('eval viewer visual target', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: /skill evaluation/i })).toBeVisible();
  await expect(page.locator('.metadata').getByText('Working Directory')).toBeVisible();
  await expect(page.locator('.metadata').getByText('Provider UUID')).toBeVisible();
  await expect(page.locator('.metadata').getByRole('link', { name: /raw json output/i })).toBeVisible();
  await expect(page.locator('.metadata').getByRole('link', { name: /view all artifacts/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /internal-refactor-stays-refactor/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /missing-artifact-smoke/i })).toBeVisible();
  await expect(page.getByText('artifact_error')).toBeVisible();
  await expect(page.locator('body')).not.toContainText('with_skill');
  await expect(page.locator('body')).not.toContainText('without_skill');
  await expect(page.getByRole('button', { name: 'all' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'pass' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'fail' })).toBeVisible();
  await expect(page.locator('.filters .material-symbols-outlined')).toHaveText(['list', 'check_circle', 'error']);
  await expect(page.getByRole('radio')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Executive Summary' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Expectations Breakdown' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Feedback' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Submit Review & Finalize' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Execution History' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Metadata' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Artifact Issues' })).toHaveCount(0);

  const layout = await page.evaluate(() => {
    const box = (selector: string) => {
      const element = document.querySelector(selector);
      if (!element) {
        throw new Error(`Missing ${selector}`);
      }
      const rect = element.getBoundingClientRect();
      return {
        bottom: rect.bottom,
        height: rect.height,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        width: rect.width
      };
    };
    return {
      content: box('.content'),
      expectations: box('.expectations'),
      feedback: box('.feedback'),
      header: box('.top-bar'),
      history: box('.history'),
      sidebar: box('.side-nav'),
      summary: box('.summary-card')
    };
  });

  expect(layout.header.height).toBe(64);
  expect(layout.sidebar.left).toBe(0);
  expect(layout.sidebar.top).toBe(64);
  expect(layout.sidebar.width).toBe(288);
  expect(layout.content.left).toBeGreaterThanOrEqual(288);
  expect(layout.summary.top).toBeLessThan(layout.expectations.top);
  expect(layout.expectations.bottom).toBeLessThan(layout.feedback.top);
  expect(layout.feedback.bottom).toBeLessThan(layout.history.top);

  await expectHoverChange(page, '.filters .filter-pass', 'background-color');
  await expectHoverChange(page, '.run-list .run-link:nth-child(2)', 'background-color');
  await expectHoverChange(page, '.run-pager button:not(:disabled)', 'background-color');
  await expectHoverChange(page, '.finalize-button', 'filter');
  await page.mouse.move(0, 0);

  await page.getByRole('button', { name: /breaking-change-returns-full-message-when-needed/i }).click();
  await expect(page.locator('.run-pager > span')).toHaveText('3 / 4');
  const lastRunHeader = await page.evaluate(() => {
    const box = (selector: string) => {
      const element = document.querySelector(selector);
      if (!element) {
        throw new Error(`Missing ${selector}`);
      }
      const rect = element.getBoundingClientRect();
      return {
        bottom: rect.bottom,
        height: rect.height,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        width: rect.width
      };
    };
    return {
      heading: box('.run-header h2'),
      pager: box('.run-pager'),
      pagerCount: box('.run-pager > span'),
      pagerCountWhiteSpace: getComputedStyle(document.querySelector('.run-pager > span') as Element).whiteSpace
    };
  });

  expect(lastRunHeader.heading.height).toBeLessThanOrEqual(40);
  expect(lastRunHeader.heading.right).toBeLessThan(lastRunHeader.pager.left);
  expect(lastRunHeader.pagerCount.width).toBeGreaterThanOrEqual(72);
  expect(lastRunHeader.pagerCountWhiteSpace).toBe('nowrap');
  expect(lastRunHeader.pager.right).toBeLessThanOrEqual(layout.content.right);

  await expect(page).toHaveScreenshot('eval-viewer.png', {
    fullPage: true,
    maxDiffPixelRatio: 0.02
  });
});

test('feedback workflow writes and reloads reviewer feedback', async ({ page }) => {
  await page.goto('/');

  const comments = 'Reviewer confirmed this run is ready for the next iteration.';
  const expectationComment = 'Expectation order matches the first graded turn result.';
  await page.getByLabel('Feedback for turn 1 expectation 1').fill(expectationComment);
  await page.getByLabel('Review comments').fill(comments);
  await page.getByRole('button', { name: 'Submit Review & Finalize' }).click();

  await expect(page.getByText('Saved')).toBeVisible();
  await expect(page.getByText('Reviewed With Comments')).toBeVisible();

  const artifact = JSON.parse(await readFile(feedbackPath, 'utf-8')) as {
    reviews: Array<{
      comments: string;
      eval_id: number;
      review_state: string;
      turns: Array<{ expectations: Array<{ comment: string }>; turn: number }>;
      updated_at: string;
    }>;
  };
  expect(artifact.reviews).toContainEqual(
    expect.objectContaining({
      comments,
      eval_id: 1,
      review_state: 'reviewed_with_comments',
      turns: [
        { expectations: [{ comment: expectationComment }, { comment: '' }, { comment: '' }], turn: 1 },
        { expectations: [{ comment: '' }, { comment: '' }, { comment: '' }], turn: 2 }
      ],
      updated_at: expect.any(String)
    })
  );

  await page.reload();

  await expect(page.getByLabel('Feedback for turn 1 expectation 1')).toHaveValue(expectationComment);
  await expect(page.getByLabel('Review comments')).toHaveValue(comments);
  await expect(page.getByText('Reviewed With Comments')).toBeVisible();
});

async function expectHoverChange(page: import('@playwright/test').Page, selector: string, property: string) {
  const element = page.locator(selector).first();
  await page.mouse.move(0, 0);
  await page.waitForTimeout(200);
  const before = await element.evaluate(
    (node, styleProperty) => getComputedStyle(node).getPropertyValue(styleProperty),
    property
  );
  await element.hover();
  await page.waitForTimeout(200);
  const after = await element.evaluate(
    (node, styleProperty) => getComputedStyle(node).getPropertyValue(styleProperty),
    property
  );
  expect(after).not.toBe(before);
}
