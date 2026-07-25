import type { IterationView, RunView } from '../../src/shared/viewModel.js';
import { readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, type Locator, type Page } from '@playwright/test';
import { isPassingRun } from '../../src/client/runFilters.js';

export const feedbackPath = resolve('.tmp', 'visual-fixture', 'results', 'iteration-3', 'viewer_feedback.json');
const SKILL_EVALUATION_HEADING_NAME = /skill evaluation/i;
const RAW_JSON_OUTPUT_LINK_NAME = /raw json output/i;
const VIEW_ALL_ARTIFACTS_LINK_NAME = /view all artifacts/i;
const INTERNAL_REFACTOR_RUN_NAME = /internal-refactor-stays-refactor/i;
const SCROLLABLE_OVERFLOW_PATTERN = /auto|scroll/u;
const TOGGLE_FEEDBACK_BUTTON_NAME = /toggle feedback/i;
const DESKTOP_TOP_BAR_HEIGHT_PX = 64;
const DESKTOP_SIDEBAR_WIDTH_PX = 288;
const MAX_RUN_HEADER_HEADING_HEIGHT_PX = 40;
const MIN_RUN_PAGER_COUNT_WIDTH_PX = 72;

export async function resetFeedbackArtifact() {
  await rm(feedbackPath, { force: true });
}

export function passingSkillRuns(iteration: IterationView): RunView[] {
  return iteration.runs.filter((run) => run.runType === 'skill' && isPassingRun(run));
}

export async function showPassingRuns(page: Page) {
  await page.getByRole('button', { name: 'pass', exact: true }).click();
}

export async function expectPrototypeShell(page: Page) {
  await expect(page.getByRole('heading', { name: SKILL_EVALUATION_HEADING_NAME })).toBeVisible();
  await expect(page.locator('.metadata').getByText('Working Directory')).toBeVisible();
  await expect(page.locator('.metadata').getByText('Provider UUID')).toBeVisible();
  await expect(page.locator('.metadata').getByRole('link', { name: RAW_JSON_OUTPUT_LINK_NAME })).toBeVisible();
  await expect(page.locator('.metadata').getByRole('link', { name: VIEW_ALL_ARTIFACTS_LINK_NAME })).toBeVisible();
  await expect(page.getByRole('button', { name: INTERNAL_REFACTOR_RUN_NAME })).toBeVisible();
  await expect(page.getByText('Evals', { exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Evals' }).locator('.run-link > span:first-child')).toHaveText([
    'internal-refactor-stays-refactor',
    'user-visible-fix-avoids-code-narration',
    'breaking-change-returns-full-message-when-needed'
  ]);
  await expect(page.locator('body')).not.toContainText('with_skill');
  await expect(page.locator('body')).not.toContainText('without_skill');
  await expect(page.getByRole('button', { name: 'all' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'pass', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'fail', exact: true })).toBeVisible();
  await expect(page.locator('.filters .material-symbols-outlined')).toHaveText(['list', 'check_circle', 'error']);
  await expect(page.getByRole('radio')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Feedback' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save & Next' })).toBeVisible();
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

  expect(layout.header.height).toBe(DESKTOP_TOP_BAR_HEIGHT_PX);
  expect(layout.sidebar.left).toBe(0);
  expect(layout.sidebar.top).toBeGreaterThanOrEqual(DESKTOP_TOP_BAR_HEIGHT_PX);
  expect(layout.sidebar.width).toBe(DESKTOP_SIDEBAR_WIDTH_PX);
  expect(layout.content.left).toBeGreaterThanOrEqual(DESKTOP_SIDEBAR_WIDTH_PX);
  expect(layout.contentOverflowY).not.toMatch(SCROLLABLE_OVERFLOW_PATTERN);
  expect(layout.sidebarOverflowY).not.toMatch(SCROLLABLE_OVERFLOW_PATTERN);
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

  expect(header.heading.height).toBeLessThanOrEqual(MAX_RUN_HEADER_HEADING_HEIGHT_PX);
  expect(header.heading.right).toBeLessThan(header.pager.left);
  expect(header.pagerCount.width).toBeGreaterThanOrEqual(MIN_RUN_PAGER_COUNT_WIDTH_PX);
  expect(header.pagerCountWhiteSpace).toBe('nowrap');
  expect(header.pager.right).toBeLessThanOrEqual(header.content.right);
}

export async function expectInteractiveHoverStates(page: Page) {
  await expectHoverStyleChange(page, page.locator('.filters .filter-pass'), 'background-color');
  await expectHoverStyleChange(page, page.locator('.run-list .run-link:first-child'), 'background-color');
  await expectOptionalHoverStyleChange(page, '.run-pager button:not(:disabled)', 'background-color');
  await expectHoverStyleChange(page, page.locator('.finalize-button'), 'filter');
  await page.mouse.move(0, 0);
}

export async function expectHoverStyleChange(page: Page, locator: Locator, property: string, pseudoElement?: string) {
  await page.mouse.move(0, 0);
  const before = await readComputedStyle(locator, property, pseudoElement);

  await locator.hover();
  await expect.poll(() => readComputedStyle(locator, property, pseudoElement)).not.toBe(before);
}

export function readComputedStyle(locator: Locator, property: string, pseudoElement?: string) {
  return locator.evaluate(
    (node, { cssProperty, pseudo }) => getComputedStyle(node, pseudo).getPropertyValue(cssProperty),
    { cssProperty: property, pseudo: pseudoElement }
  );
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
      .getByRole('button', { name: TOGGLE_FEEDBACK_BUTTON_NAME })
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

async function expectOptionalHoverStyleChange(page: Page, selector: string, property: string) {
  if ((await page.locator(selector).count()) === 0) {
    return;
  }
  await expectHoverStyleChange(page, page.locator(selector).first(), property);
}
