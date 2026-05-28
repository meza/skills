import { readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, type Locator, type Page } from '@playwright/test';

export const feedbackPath = resolve('.tmp', 'visual-fixture', 'results', 'iteration-3', 'viewer_feedback.json');

export async function resetFeedbackArtifact() {
  await rm(feedbackPath, { force: true });
}

export async function expectPrototypeShell(page: Page) {
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
  await expect(page.getByRole('button', { name: 'pass', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'fail', exact: true })).toBeVisible();
  await expect(page.locator('.filters .material-symbols-outlined')).toHaveText(['list', 'check_circle', 'error']);
  await expect(page.getByRole('radio')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Feedback' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Submit Review & Finalize' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Execution History' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Metadata' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Artifact Issues' })).toHaveCount(0);
}

export async function expectDesktopLayout(page: Page) {
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

export async function expectRunHeaderLayout(page: Page) {
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

export async function expectInteractiveHoverStates(page: Page) {
  await expectHoverChange(page, '.filters .filter-pass', 'background-color');
  await expectHoverChange(page, '.run-list .run-link:nth-child(2)', 'background-color');
  await expectHoverChange(page, '.run-pager button:not(:disabled)', 'background-color');
  await expectHoverChange(page, '.finalize-button', 'filter');
  await page.mouse.move(0, 0);
}

export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () =>
      Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

export async function expectResponsiveSingleColumnLayout(page: Page) {
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

export async function scrollContentToTop(page: Page) {
  await page.locator('.content').evaluate((element) => {
    element.scrollTop = 0;
  });
}

export async function openExpectationFeedback(feedback: Locator) {
  const sectionHeading = feedback.locator(
    'xpath=ancestor::section[contains(concat(" ", normalize-space(@class), " "), " expectation-section ")]/button[contains(concat(" ", normalize-space(@class), " "), " expectation-section-heading ")]'
  );
  if ((await sectionHeading.getAttribute('aria-expanded')) === 'false') {
    await sectionHeading.click();
    await expect(sectionHeading).toHaveAttribute('aria-expanded', 'true');
  }

  const isOpen = await feedback.evaluate((element) => element.closest('.inline-feedback')?.getAttribute('aria-hidden'));
  if (isOpen !== 'false') {
    await feedback
      .locator('xpath=ancestor::article[contains(concat(" ", normalize-space(@class), " "), " expectation ")]')
      .getByRole('button', { name: /toggle feedback/i })
      .click();
    await expect(feedback.locator('xpath=ancestor::div[contains(@class, "inline-feedback")]')).toHaveAttribute(
      'aria-hidden',
      'false'
    );
  }
}

export async function readFeedbackArtifact() {
  return JSON.parse(await readFile(feedbackPath, 'utf-8')) as {
    reviews: Array<{
      comments: string;
      eval_id: number;
      turns: Array<{ expectations: Array<{ comment: string; expectation_id: string }>; turn: number }>;
      updated_at: string;
    }>;
  };
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
