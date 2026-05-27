import { readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, type Page, test } from '@playwright/test';

const feedbackPath = resolve('.tmp', 'visual-fixture', 'results', 'iteration-3', 'viewer_feedback.json');

test.beforeEach(async () => {
  await rm(feedbackPath, { force: true });
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

test('failed expectation state shows evidence comparison', async ({ page }) => {
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

test('successful expectation hover state gives the status bar a neon glow', async ({ page }) => {
  await page.goto('/');

  const successfulExpectation = page.locator('.expectation.pass').first();
  await expect(successfulExpectation).toBeVisible();
  await successfulExpectation.hover();
  await page.waitForTimeout(300);
  await expectNoHorizontalOverflow(page);

  await expect(page).toHaveScreenshot('viewer-successful-expectation-hover-state.png', {
    fullPage: true
  });
});

test('failed expectation hover state gives the status bar a neon glow', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /user-visible-fix-avoids-code-narration/i }).click();

  const failedExpectation = page.locator('.expectation.fail').first();
  await expect(failedExpectation).toBeVisible();
  await failedExpectation.hover();
  await page.waitForTimeout(300);
  await expectNoHorizontalOverflow(page);

  await expect(page).toHaveScreenshot('viewer-failed-expectation-hover-state.png', {
    fullPage: true
  });
});

test('feedback hover state gives the review rail a neon glow', async ({ page }) => {
  await page.goto('/');

  const feedback = page.locator('.feedback');
  await feedback.scrollIntoViewIfNeeded();
  await feedback.hover();
  await page.waitForTimeout(300);
  await expectNoHorizontalOverflow(page);

  await expect(page).toHaveScreenshot('viewer-feedback-hover-state.png', {
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

test('expectation section heading shows result toggle hover glow', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /user-visible-fix-avoids-code-narration/i }).click();
  await page.getByRole('button', { name: 'baseline' }).click();

  const sectionHeading = page.locator('.section-heading').first();
  await expect(sectionHeading).toBeVisible();
  await sectionHeading.getByRole('button', { name: 'skill' }).hover();
  await page.waitForTimeout(300);
  await expectNoHorizontalOverflow(page);

  await expect(sectionHeading).toHaveScreenshot('viewer-expectation-section-heading-toggle-hover-state.png');
});

test('expectation section heading shows active result toggle hover glow', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /user-visible-fix-avoids-code-narration/i }).click();
  await page.getByRole('button', { name: 'baseline' }).click();

  const sectionHeading = page.locator('.section-heading').first();
  await expect(sectionHeading).toBeVisible();
  await sectionHeading.getByRole('button', { name: 'baseline' }).hover();
  await page.waitForTimeout(300);
  await expectNoHorizontalOverflow(page);

  await expect(sectionHeading).toHaveScreenshot('viewer-expectation-section-heading-active-toggle-hover-state.png');
});

test('long run title keeps pager readable', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /breaking-change-returns-full-message-when-needed/i }).click();

  await expect(page.locator('.run-pager > span')).toHaveText('3 / 4');
  await expectRunHeaderLayout(page);
  await expectNoHorizontalOverflow(page);

  await expect(page).toHaveScreenshot('viewer-long-title-pager-state.png', {
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

test('pass filter state shows only successful runs', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'pass' }).click();

  await expect(page.getByRole('button', { name: 'pass' })).toHaveAttribute('aria-pressed', 'true');
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

test('fail filter state shows only artifact error runs', async ({ page }) => {
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

test('feedback draft state shows unsaved reviewer input', async ({ page }) => {
  await page.goto('/');

  await page.getByLabel('Feedback for turn 1 expectation 1').fill('Expectation order needs a quick reviewer check.');
  await page.getByLabel('Review comments').fill('Draft review notes before finalizing this run.');

  await expect(page.getByLabel('Feedback for turn 1 expectation 1')).toHaveValue(
    'Expectation order needs a quick reviewer check.'
  );
  await expect(page.getByLabel('Review comments')).toHaveValue('Draft review notes before finalizing this run.');
  await expect(page.getByText('Saved', { exact: true })).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  await page.locator('.feedback').scrollIntoViewIfNeeded();

  await expect(page).toHaveScreenshot('viewer-feedback-draft-state.png', {
    fullPage: true
  });
});

test('feedback workflow has visual coverage and persists only filled values', async ({ page }) => {
  await page.goto('/');

  const comments = 'Reviewer confirmed this run is ready for the next iteration.';
  const expectationComment = 'Expectation order matches the first graded turn result.';
  await page.getByLabel('Feedback for turn 1 expectation 1').fill(expectationComment);
  await page.getByLabel('Review comments').fill(comments);
  await page.getByRole('button', { name: 'Submit Review & Finalize' }).click();

  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Feedback for turn 1 expectation 1')).toHaveValue(expectationComment);
  await expect(page.getByLabel('Review comments')).toHaveValue(comments);
  await expectNoHorizontalOverflow(page);
  await page.locator('.feedback').scrollIntoViewIfNeeded();

  await expect(page).toHaveScreenshot('viewer-feedback-saved-state.png', {
    fullPage: true
  });

  const artifact = JSON.parse(await readFile(feedbackPath, 'utf-8')) as {
    reviews: Array<{
      comments: string;
      eval_id: number;
      turns: Array<{ expectations: Array<{ comment: string; expectation_id: string }>; turn: number }>;
      updated_at: string;
    }>;
  };
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

  await expect(page.getByLabel('Feedback for turn 1 expectation 1')).toHaveValue(expectationComment);
  await expect(page.getByLabel('Review comments')).toHaveValue(comments);
});

test('past feedback state loads saved review content', async ({ page }) => {
  await page.goto('/');

  const comments = 'Past review loaded from the feedback artifact.';
  const expectationComment = 'Previously saved expectation note.';
  await page.getByLabel('Feedback for turn 1 expectation 1').fill(expectationComment);
  await page.getByLabel('Review comments').fill(comments);
  await page.getByRole('button', { name: 'Submit Review & Finalize' }).click();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();

  await page.reload();

  await expect(page.getByLabel('Feedback for turn 1 expectation 1')).toHaveValue(expectationComment);
  await expect(page.getByLabel('Review comments')).toHaveValue(comments);
  await expectNoHorizontalOverflow(page);
  await page.locator('.feedback').scrollIntoViewIfNeeded();

  await expect(page).toHaveScreenshot('viewer-past-feedback-state.png', {
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

async function expectPrototypeShell(page: Page) {
  await expect(page.getByRole('heading', { name: /skill evaluation/i })).toBeVisible();
  await expect(page.locator('.metadata').getByText('Working Directory')).toBeVisible();
  await expect(page.locator('.metadata').getByText('Provider UUID')).toBeVisible();
  await expect(page.locator('.metadata').getByRole('link', { name: /raw json output/i })).toBeVisible();
  await expect(page.locator('.metadata').getByRole('link', { name: /view all artifacts/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /internal-refactor-stays-refactor/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /missing-artifact-smoke/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /missing-artifact-smoke fail/i })).toBeVisible();
  await expect(page.getByText('Evals', { exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Evals' }).locator('.run-link > span:first-child')).toHaveText([
    'internal-refactor-stays-refactor',
    'user-visible-fix-avoids-code-narration',
    'breaking-change-returns-full-message-when-needed',
    'missing-artifact-smoke'
  ]);
  await expect(page.locator('body')).not.toContainText('with_skill');
  await expect(page.locator('body')).not.toContainText('without_skill');
  await expect(page.getByRole('button', { name: 'all' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'pass' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'fail', exact: true })).toBeVisible();
  await expect(page.locator('.filters .material-symbols-outlined')).toHaveText(['list', 'check_circle', 'error']);
  await expect(page.getByRole('radio')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Feedback' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Submit Review & Finalize' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Execution History' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Metadata' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Artifact Issues' })).toHaveCount(0);
}

async function expectDesktopLayout(page: Page) {
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
      contentOverflowY: getComputedStyle(document.querySelector('.content') as Element).overflowY,
      expectations: box('.expectations'),
      feedback: box('.feedback'),
      header: box('.top-bar'),
      history: box('.history'),
      sidebar: box('.side-nav'),
      sidebarOverflowY: getComputedStyle(document.querySelector('.side-nav') as Element).overflowY,
      summary: box('.summary-card')
    };
  });

  expect(layout.header.height).toBe(64);
  expect(layout.sidebar.left).toBe(0);
  expect(layout.sidebar.top).toBeGreaterThanOrEqual(64);
  expect(layout.sidebar.width).toBe(288);
  expect(layout.content.left).toBeGreaterThanOrEqual(288);
  expect(layout.contentOverflowY).not.toMatch(/auto|scroll/u);
  expect(layout.sidebarOverflowY).not.toMatch(/auto|scroll/u);
  expect(layout.summary.top).toBeLessThan(layout.expectations.top);
  expect(layout.expectations.bottom).toBeLessThan(layout.feedback.top);
  expect(layout.feedback.bottom).toBeLessThan(layout.history.top);
}

async function expectRunHeaderLayout(page: Page) {
  const header = await page.evaluate(() => {
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
      heading: box('.run-header h2'),
      pager: box('.run-pager'),
      pagerCount: box('.run-pager > span'),
      pagerCountWhiteSpace: getComputedStyle(document.querySelector('.run-pager > span') as Element).whiteSpace
    };
  });

  expect(header.heading.height).toBeLessThanOrEqual(40);
  expect(header.heading.right).toBeLessThan(header.pager.left);
  expect(header.pagerCount.width).toBeGreaterThanOrEqual(72);
  expect(header.pagerCountWhiteSpace).toBe('nowrap');
  expect(header.pager.right).toBeLessThanOrEqual(header.content.right);
}

async function expectInteractiveHoverStates(page: Page) {
  await expectHoverChange(page, '.filters .filter-pass', 'background-color');
  await expectHoverChange(page, '.run-list .run-link:nth-child(2)', 'background-color');
  await expectHoverChange(page, '.run-pager button:not(:disabled)', 'background-color');
  await expectHoverChange(page, '.finalize-button', 'filter');
  await page.mouse.move(0, 0);
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () =>
      Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

async function expectResponsiveSingleColumnLayout(page: Page) {
  const layout = await page.evaluate(() => {
    const sideNav = document.querySelector('.side-nav');
    const content = document.querySelector('.content');
    if (!sideNav || !content) {
      throw new Error('Missing responsive layout elements');
    }
    const sideNavRect = sideNav.getBoundingClientRect();
    const contentRect = content.getBoundingClientRect();
    return {
      contentLeft: contentRect.left,
      contentWidth: contentRect.width,
      sideNavLeft: sideNavRect.left,
      sideNavWidth: sideNavRect.width,
      viewportWidth: document.documentElement.clientWidth
    };
  });

  expect(layout.sideNavLeft).toBe(0);
  expect(layout.contentLeft).toBe(0);
  expect(layout.sideNavWidth).toBeGreaterThanOrEqual(layout.viewportWidth - 1);
  expect(layout.contentWidth).toBeGreaterThanOrEqual(layout.viewportWidth - 1);
}

async function scrollContentToTop(page: Page) {
  await page.locator('.content').evaluate((element) => {
    element.scrollTop = 0;
  });
}

async function expectHoverChange(page: Page, selector: string, property: string) {
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
