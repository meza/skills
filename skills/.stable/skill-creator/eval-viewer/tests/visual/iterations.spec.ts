import type { IterationNumber } from '../../src/shared/viewModel.js';
import { cp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { expectNoHorizontalOverflow, resetFeedbackArtifact, scrollContentToTop } from './helpers.js';

const visualFixtureRoot = resolve('.tmp', 'visual-fixture');
const createdIterationRoot = join(visualFixtureRoot, 'results', 'iteration-4');

test.beforeEach(async () => {
  await resetFeedbackArtifact();
  await removeCreatedIteration();
});

test.afterEach(async () => {
  await removeCreatedIteration();
});

test('latest iteration control state stays compact beside eval id', async ({ page }) => {
  await page.goto('/');

  const iterationSelector = page.getByLabel('Iteration', { exact: true });
  await expect(page.getByText('Eval ID: 2')).toBeVisible();
  await expect(iterationSelector).toHaveValue('3');
  await expect(iterationSelector).toContainText('Latest: 3');
  await expectNoHorizontalOverflow(page);

  await expect(page.locator('.run-context-row')).toHaveScreenshot('viewer-latest-iteration-control-state.png');
});

test('older iteration selected state keeps the selected iteration visible', async ({ page }) => {
  await page.goto('/');

  const iterationSelector = page.getByLabel('Iteration', { exact: true });
  await iterationSelector.selectOption('2');

  await expect(iterationSelector).toHaveValue('2');
  await expect(page.getByText('Eval ID: 2')).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await expect(page.locator('.run-context-row')).toHaveScreenshot('viewer-older-iteration-selected-state.png');
});

test('refresh no-newer status is visible without shifting the header', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: /check for newer iteration/i }).click();

  await expect(page.getByRole('status')).toHaveText('No newer iteration found');
  await expectNoHorizontalOverflow(page);
  await freezeIterationStatusFade(page);

  await expect(page.locator('.run-context-row')).toHaveScreenshot('viewer-no-newer-iteration-status-state.png');
});

test('new iteration prompt distinguishes current and latest iterations', async ({ page }) => {
  await page.addInitScript(() => {
    class FakeIterationEventSource {
      static instances: FakeIterationEventSource[] = [];
      onmessage: ((event: MessageEvent<string>) => void) | null = null;

      constructor(_url: string) {
        FakeIterationEventSource.instances.push(this);
      }

      close() {
        FakeIterationEventSource.instances = FakeIterationEventSource.instances.filter((source) => source !== this);
      }
    }

    const globalWindow = window as Window & {
      __emitIterationIndex?: (latestIteration: IterationNumber) => void;
      __iterationEventSourceCount?: () => number;
      EventSource: typeof EventSource;
    };
    globalWindow.EventSource = FakeIterationEventSource as unknown as typeof EventSource;
    globalWindow.__iterationEventSourceCount = () => FakeIterationEventSource.instances.length;
    globalWindow.__emitIterationIndex = (latestIteration: IterationNumber) => {
      for (const source of FakeIterationEventSource.instances) {
        source.onmessage?.({
          data: JSON.stringify({ iterations: [2, 3, latestIteration], latestIteration })
        } as MessageEvent<string>);
      }
    };
  });
  await page.goto('/');
  await page.waitForFunction(() => {
    const globalWindow = window as Window & { __iterationEventSourceCount?: () => number };
    return (globalWindow.__iterationEventSourceCount?.() ?? 0) > 0;
  });

  await page.evaluate(() => {
    (window as Window & { __emitIterationIndex?: (latestIteration: IterationNumber) => void }).__emitIterationIndex?.(
      4
    );
  });

  const dialog = page.getByRole('dialog', { name: 'New iteration available' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Current', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Iteration 3', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Latest', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Iteration 4', { exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await scrollContentToTop(page);

  await expect(dialog).toHaveScreenshot('viewer-new-iteration-dialog-state.png');
});

test('real iteration event stream prompts and loads a newly written iteration', async ({ page }) => {
  const eventStreamResponse = page.waitForResponse(
    (response) => response.url().endsWith('/api/iteration-events') && response.status() === 200
  );
  await page.goto('/');
  await eventStreamResponse;

  await writeReadyIteration(4);

  const dialog = page.getByRole('dialog', { name: 'New iteration available' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Iteration 3', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Iteration 4', { exact: true })).toBeVisible();

  await dialog.getByRole('button', { name: 'View latest' }).click();

  await expect(dialog).not.toBeVisible();
  await expect(page.getByLabel('Iteration', { exact: true })).toHaveValue('4');
  await expect(page.getByLabel('Iteration', { exact: true })).toContainText('Latest: 4');
});

async function freezeIterationStatusFade(page: Page) {
  await page.getByRole('status').evaluate((status) => {
    const statusElement = status as HTMLElement;
    statusElement.style.animation = 'none';
    statusElement.style.opacity = '1';
  });
}

async function writeReadyIteration(iteration: IterationNumber) {
  const previousIterationRoot = join(visualFixtureRoot, 'results', `iteration-${iteration - 1}`);
  const nextIterationRoot = join(visualFixtureRoot, 'results', `iteration-${iteration}`);
  await rm(nextIterationRoot, { force: true, recursive: true });
  await cp(previousIterationRoot, nextIterationRoot, { recursive: true });
  const manifestPath = join(nextIterationRoot, 'run_manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf-8')) as { iteration: IterationNumber };
  manifest.iteration = iteration;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');
}

async function removeCreatedIteration() {
  await rm(createdIterationRoot, { force: true, recursive: true });
}
