import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { expectNoHorizontalOverflow, resetFeedbackArtifact } from './helpers.js';

const gradingPath = join(
  resolve('.tmp', 'visual-fixture', 'results', 'iteration-3'),
  'eval-2',
  'skill',
  'grading.json'
);
const previousGradingPath = join(
  resolve('.tmp', 'visual-fixture', 'results', 'iteration-2'),
  'eval-2',
  'skill',
  'grading.json'
);
let originalGrading = '';
let originalPreviousGrading = '';

test.beforeEach(async () => {
  await resetFeedbackArtifact();
  originalGrading = await readFile(gradingPath, 'utf-8');
  originalPreviousGrading = await readFile(previousGradingPath, 'utf-8');
});

test.afterEach(async () => {
  await writeFile(gradingPath, originalGrading, 'utf-8');
  await writeFile(previousGradingPath, originalPreviousGrading, 'utf-8');
});

test('inconsistent grading summary visibly explains the recalculated score', async ({ page }) => {
  const grading = JSON.parse(originalGrading);
  grading.summary = { failed: 0, pass_rate: 1, passed: 4, total: 4 };
  await writeFile(gradingPath, `${JSON.stringify(grading, null, 2)}\n`, 'utf-8');
  const previousGrading = JSON.parse(originalPreviousGrading);
  previousGrading.results = grading.results;
  previousGrading.summary = { failed: 1, pass_rate: 0.75, passed: 3, total: 4 };
  await writeFile(previousGradingPath, `${JSON.stringify(previousGrading, null, 2)}\n`, 'utf-8');

  await page.goto('/');

  const warning = page.getByRole('status');
  await expect(warning).toContainText('Displayed score recalculated');
  await expect(warning).toContainText('Current grading summary fields (passed, failed, pass_rate)');
  await expect(page.getByText('75%', { exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expect(page.locator('.summary-card')).toHaveScreenshot('viewer-recalculated-score-warning-state.png', {
    maxDiffPixelRatio: 0
  });
});
