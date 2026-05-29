import { expect, test } from '@playwright/test';
import {
  expectNoHorizontalOverflow,
  openExpectationFeedback,
  readFeedbackArtifact,
  resetFeedbackArtifact,
  showPassingRuns
} from './helpers.js';

test.beforeEach(async () => {
  await resetFeedbackArtifact();
});

test('feedback hover state gives the review rail a neon glow', async ({ page }) => {
  await page.goto('/');
  await showPassingRuns(page);

  const feedback = page.locator('.feedback');
  await feedback.scrollIntoViewIfNeeded();
  await feedback.hover();
  await page.waitForTimeout(300);
  await expectNoHorizontalOverflow(page);

  await expect(page).toHaveScreenshot('viewer-feedback-hover-state.png', {
    fullPage: true
  });
});

test('feedback draft state shows unsaved reviewer input', async ({ page }) => {
  await page.goto('/');
  await showPassingRuns(page);

  await openExpectationFeedback(page.getByLabel('Feedback for turn 1 expectation 1'));
  await page.getByLabel('Feedback for turn 1 expectation 1').fill('Expectation order needs a quick reviewer check.');
  await page.getByLabel('Review comments').fill('Draft review notes before moving to the next eval.');

  await expect(page.getByLabel('Feedback for turn 1 expectation 1')).toHaveValue(
    'Expectation order needs a quick reviewer check.'
  );
  await expect(page.getByLabel('Review comments')).toHaveValue('Draft review notes before moving to the next eval.');
  await expect(page.getByText('Saved', { exact: true })).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  await page.locator('.feedback').scrollIntoViewIfNeeded();

  await expect(page).toHaveScreenshot('viewer-feedback-draft-state.png', {
    fullPage: true
  });
});

test('feedback workflow has visual coverage and persists only filled values', async ({ page }) => {
  await page.goto('/');
  await showPassingRuns(page);

  const comments = 'Reviewer confirmed this run is ready for the next iteration.';
  const expectationComment = 'Expectation order matches the first graded turn result.';
  await openExpectationFeedback(page.getByLabel('Feedback for turn 1 expectation 1'));
  await page.getByLabel('Feedback for turn 1 expectation 1').fill(expectationComment);
  await page.getByLabel('Review comments').fill(comments);

  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Feedback for turn 1 expectation 1')).toHaveValue(expectationComment);
  await expect(page.getByLabel('Review comments')).toHaveValue(comments);
  await expectNoHorizontalOverflow(page);
  await page.locator('.feedback').scrollIntoViewIfNeeded();

  await expect(page).toHaveScreenshot('viewer-feedback-saved-state.png', {
    fullPage: true
  });

  const artifact = await readFeedbackArtifact();
  const savedExpectation = artifact.reviews.flatMap((review) => review.turns.flatMap((turn) => turn.expectations))[0];
  expect(artifact.reviews).toContainEqual(
    expect.objectContaining({
      comments,
      eval_id: 1,
      updated_at: expect.any(String)
    })
  );
  expect(savedExpectation).toMatchObject({
    comment: expectationComment,
    expectation_id: expect.stringMatching(/^[0-9a-f-]{36}$/)
  });
  expect(JSON.stringify(artifact)).not.toContain('review_state');
  expect(JSON.stringify(artifact)).not.toContain('""');

  await page.reload();
  await showPassingRuns(page);

  await expect(page.getByLabel('Feedback for turn 1 expectation 1')).toHaveValue(expectationComment);
  await expect(page.getByLabel('Review comments')).toHaveValue(comments);
});

test('past feedback state loads saved review content', async ({ page }) => {
  await page.goto('/');
  await showPassingRuns(page);

  const comments = 'Past review loaded from the feedback artifact.';
  const expectationComment = 'Previously saved expectation note.';
  await openExpectationFeedback(page.getByLabel('Feedback for turn 1 expectation 1'));
  await page.getByLabel('Feedback for turn 1 expectation 1').fill(expectationComment);
  await page.getByLabel('Review comments').fill(comments);
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();

  await page.reload();
  await showPassingRuns(page);

  await expect(page.getByLabel('Feedback for turn 1 expectation 1')).toHaveValue(expectationComment);
  await expect(page.getByLabel('Review comments')).toHaveValue(comments);
  await expectNoHorizontalOverflow(page);
  await page.locator('.feedback').scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);

  await expect(page).toHaveScreenshot('viewer-past-feedback-state.png', {
    fullPage: true
  });
});
