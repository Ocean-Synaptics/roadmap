// @module explore-interactions
// @exports safeClick, typeAndSubmit, drag, waitFor, waitForTransition, connectAndFindPage, resetState, fillForm, selectFromDropdown, toggleCheckbox, getListItems, findItemBy, getTableData, waitForNetwork, waitForTextChange, capturePageState, getConsoleMessages, getNetworkCalls, screenshot
// @types Page, Locator (from @playwright/test)
// @entry roadmap

import type { Page, Locator } from '@playwright/test';

// ── safeClick ───────────────────────────────────────────────────────────────
// Click with visibility guard. Checks visible before clicking. Throws if not visible.

export async function safeClick(page: Page, selector: string): Promise<void> {
  const element = page.locator(selector);

  // Check element exists in DOM
  const count = await element.count();
  if (count === 0) {
    throw new Error(`Selector not found in DOM: ${selector}`);
  }

  // Check visibility (isVisible is false if detached, hidden, or display:none)
  const isVisible = await element.first().isVisible();
  if (!isVisible) {
    throw new Error(`Element not visible (cannot click): ${selector}`);
  }

  // Check enabled state if it's a button/input
  const isEnabled = await element.first().isEnabled();
  if (!isEnabled) {
    throw new Error(`Element disabled (cannot interact): ${selector}`);
  }

  // Perform the click
  await element.first().click();
}

// ── typeAndSubmit ───────────────────────────────────────────────────────────
// Type into field, then press key (default: Enter)

export async function typeAndSubmit(
  page: Page,
  selector: string,
  text: string,
  key: string = 'Enter',
): Promise<void> {
  const element = page.locator(selector);

  // Check element exists
  const count = await element.count();
  if (count === 0) {
    throw new Error(`Selector not found in DOM: ${selector}`);
  }

  // Clear existing value and type
  await element.first().fill(text);

  // Press the key (Enter by default)
  await element.first().press(key);
}

// ── drag ────────────────────────────────────────────────────────────────────
// Mouse drag from source to target. Smooth motion with configurable steps.

export async function drag(
  page: Page,
  sourceSelector: string,
  targetSelector: string,
  opts: { steps?: number } = {},
): Promise<void> {
  const { steps = 10 } = opts;

  const source = page.locator(sourceSelector);
  const target = page.locator(targetSelector);

  // Check both elements exist
  const sourceCount = await source.count();
  if (sourceCount === 0) {
    throw new Error(`Source selector not found in DOM: ${sourceSelector}`);
  }

  const targetCount = await target.count();
  if (targetCount === 0) {
    throw new Error(`Target selector not found in DOM: ${targetSelector}`);
  }

  // Get bounding boxes
  const sourceBbox = await source.first().boundingBox();
  const targetBbox = await target.first().boundingBox();

  if (!sourceBbox) {
    throw new Error(`Source element has no bounding box (not in viewport?): ${sourceSelector}`);
  }

  if (!targetBbox) {
    throw new Error(`Target element has no bounding box (not in viewport?): ${targetSelector}`);
  }

  // Calculate center points
  const srcX = sourceBbox.x + sourceBbox.width / 2;
  const srcY = sourceBbox.y + sourceBbox.height / 2;
  const tgtX = targetBbox.x + targetBbox.width / 2;
  const tgtY = targetBbox.y + targetBbox.height / 2;

  // Perform smooth drag with steps
  await page.mouse.move(srcX, srcY);
  await page.mouse.down();

  // Move in steps for smooth motion
  for (let i = 1; i <= steps; i++) {
    const progress = i / steps;
    const x = srcX + (tgtX - srcX) * progress;
    const y = srcY + (tgtY - srcY) * progress;
    await page.mouse.move(x, y);
  }

  await page.mouse.up();
}

// ── waitFor ─────────────────────────────────────────────────────────────────
// Wait for element to be attached + visible + enabled (default 5000ms)

export async function waitFor(
  page: Page,
  selector: string,
  timeout: number = 5000,
): Promise<Locator> {
  const element = page.locator(selector);

  try {
    await element.first().waitFor({ state: 'visible', timeout });
  } catch (err: any) {
    if (err.message?.includes('Timeout')) {
      throw new Error(`Element not visible after ${timeout}ms: ${selector}`);
    }
    throw new Error(`Wait failed for selector ${selector}: ${err.message}`);
  }

  return element;
}

// ── waitForTransition ───────────────────────────────────────────────────────
// Wait for CSS transitions/animations to settle (default 300ms)

export async function waitForTransition(page: Page, ms: number = 300): Promise<void> {
  await page.waitForTimeout(ms);
}

// ── connectAndFindPage ──────────────────────────────────────────────────────
// Connect via CDP, filter out DevTools pages, return app page

export async function connectAndFindPage(
  cdpUrl: string,
): Promise<{ page: Page; browser: any }> {
  // chromium is imported dynamically to avoid issues in non-browser contexts
  const { chromium } = await import('@playwright/test');

  const browser = await chromium.connectOverCDP(cdpUrl);

  // Get all contexts (usually just one)
  const contexts = browser.contexts();
  if (contexts.length === 0) {
    throw new Error('No browser contexts found via CDP');
  }

  // Find the first non-DevTools page
  let appPage: Page | null = null;
  for (const context of contexts) {
    for (const page of context.pages()) {
      const url = page.url();
      if (!url.startsWith('devtools://') && !url.startsWith('chrome://')) {
        appPage = page;
        break;
      }
    }
    if (appPage) break;
  }

  if (!appPage) {
    throw new Error('No application page found (only devtools/chrome pages detected)');
  }

  return { page: appPage, browser };
}

// ── resetState ──────────────────────────────────────────────────────────────
// Call window.__DEMO_RESET__() if available for test isolation

export async function resetState(page: Page): Promise<void> {
  try {
    const exists = await page.evaluate(() => {
      return typeof (window as any).__DEMO_RESET__ === 'function';
    });

    if (exists) {
      await page.evaluate(() => {
        (window as any).__DEMO_RESET__();
      });
    }
  } catch (err: any) {
    throw new Error(`Failed to reset state: ${err.message}`);
  }
}

// ── fillForm ────────────────────────────────────────────────────────────────
// Fill multiple form fields at once

export async function fillForm(
  page: Page,
  fields: Record<string, string>,
): Promise<void> {
  for (const [selector, value] of Object.entries(fields)) {
    const element = page.locator(selector);
    const count = await element.count();
    if (count === 0) {
      throw new Error(`Form field not found: ${selector}`);
    }
    await element.first().fill(value);
  }
}

// ── selectFromDropdown ──────────────────────────────────────────────────────
// Select option from dropdown/select element

export async function selectFromDropdown(
  page: Page,
  selectSelector: string,
  optionText: string,
): Promise<void> {
  const select = page.locator(selectSelector);
  const count = await select.count();
  if (count === 0) {
    throw new Error(`Select element not found: ${selectSelector}`);
  }

  // Check if it's a native select or custom select
  const tagName = await select.first().evaluate((el) => el.tagName.toLowerCase());

  if (tagName === 'select') {
    // Native select
    await select.first().selectOption(optionText);
  } else {
    // Custom select — click to open, then click option
    await select.first().click();
    const option = page.locator(`text="${optionText}"`).first();
    const optionCount = await option.count();
    if (optionCount === 0) {
      throw new Error(`Option not found in dropdown: ${optionText}`);
    }
    await option.click();
  }
}

// ── toggleCheckbox ─────────────────────────────────────────────────────────
// Check or uncheck a checkbox

export async function toggleCheckbox(
  page: Page,
  selector: string,
  shouldBeChecked: boolean,
): Promise<void> {
  const checkbox = page.locator(selector);
  const count = await checkbox.count();
  if (count === 0) {
    throw new Error(`Checkbox not found: ${selector}`);
  }

  const isChecked = await checkbox.first().isChecked();
  if (isChecked !== shouldBeChecked) {
    await checkbox.first().click();
  }
}

// ── getListItems ────────────────────────────────────────────────────────────
// Get all text content from list items matching selector

export async function getListItems(
  page: Page,
  itemSelector: string,
): Promise<string[]> {
  const items = page.locator(itemSelector);
  const count = await items.count();

  if (count === 0) {
    return [];
  }

  const texts: string[] = [];
  for (let i = 0; i < count; i++) {
    const text = await items.nth(i).textContent();
    if (text) texts.push(text.trim());
  }

  return texts;
}

// ── findItemBy ──────────────────────────────────────────────────────────────
// Find list item by partial text match

export async function findItemBy(
  page: Page,
  itemSelector: string,
  partialText: string,
): Promise<Locator | null> {
  const items = page.locator(itemSelector);
  const count = await items.count();

  for (let i = 0; i < count; i++) {
    const text = await items.nth(i).textContent();
    if (text && text.includes(partialText)) {
      return items.nth(i);
    }
  }

  return null;
}

// ── getTableData ────────────────────────────────────────────────────────────
// Extract table data as array of objects

export async function getTableData(
  page: Page,
  tableSelector: string,
): Promise<Record<string, string>[]> {
  const table = page.locator(tableSelector);
  const count = await table.count();
  if (count === 0) {
    throw new Error(`Table not found: ${tableSelector}`);
  }

  const data = await table.first().evaluate((el) => {
    const headers: string[] = [];
    const rows: Record<string, string>[] = [];

    // Extract header row
    const headerCells = el.querySelectorAll('thead th, thead td');
    headerCells.forEach((cell) => {
      headers.push((cell.textContent || '').trim());
    });

    // Extract data rows
    const dataCells = el.querySelectorAll('tbody tr');
    dataCells.forEach((row) => {
      const rowObj: Record<string, string> = {};
      const cells = row.querySelectorAll('td');
      cells.forEach((cell, idx) => {
        rowObj[headers[idx] || `col-${idx}`] = (cell.textContent || '').trim();
      });
      rows.push(rowObj);
    });

    return rows;
  });

  return data;
}

// ── waitForNetwork ──────────────────────────────────────────────────────────
// Wait for network to be idle (no pending requests)

export async function waitForNetwork(page: Page, timeout: number = 5000): Promise<void> {
  try {
    await page.waitForLoadState('networkidle', { timeout });
  } catch (err: any) {
    throw new Error(`Network did not idle within ${timeout}ms: ${err.message}`);
  }
}

// ── waitForTextChange ───────────────────────────────────────────────────────
// Wait for element text to change from initial value

export async function waitForTextChange(
  page: Page,
  selector: string,
  timeout: number = 5000,
): Promise<string> {
  const element = page.locator(selector);
  const initialText = await element.first().textContent();

  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    const currentText = await element.first().textContent();
    if (currentText !== initialText) {
      return currentText || '';
    }
    await page.waitForTimeout(100);
  }

  throw new Error(`Text did not change for ${selector} within ${timeout}ms`);
}

// ── capturePageState ────────────────────────────────────────────────────────
// Capture full page state: URL, title, DOM size, console errors

export async function capturePageState(page: Page): Promise<{
  url: string;
  title: string;
  domSize: number;
  consoleMessages: string[];
  consoleErrors: string[];
}> {
  const consoleMessages: string[] = [];
  const consoleErrors: string[] = [];

  const messageListener = (msg: any) => {
    consoleMessages.push(msg.text());
  };

  const errorListener = (err: Error) => {
    consoleErrors.push(err.message);
  };

  page.on('console', messageListener);
  page.on('pageerror', errorListener);

  const state = {
    url: page.url(),
    title: await page.title(),
    domSize: await page.evaluate(() => document.documentElement.outerHTML.length),
    consoleMessages: [...consoleMessages],
    consoleErrors: [...consoleErrors],
  };

  page.off('console', messageListener);
  page.off('pageerror', errorListener);

  return state;
}

// ── getConsoleMessages ──────────────────────────────────────────────────────
// Collect all console messages during a callback

export async function getConsoleMessages(
  page: Page,
  fn: () => Promise<void>,
): Promise<Array<{ type: string; text: string }>> {
  const messages: Array<{ type: string; text: string }> = [];

  const handler = (msg: any) => {
    messages.push({
      type: msg.type(),
      text: msg.text(),
    });
  };

  page.on('console', handler);

  try {
    await fn();
  } finally {
    page.off('console', handler);
  }

  return messages;
}

// ── getNetworkCalls ────────────────────────────────────────────────────────
// Capture all network requests during a callback

export async function getNetworkCalls(
  page: Page,
  fn: () => Promise<void>,
): Promise<
  Array<{
    url: string;
    method: string;
    status?: number;
    resourceType: string;
  }>
> {
  const calls: Array<{
    url: string;
    method: string;
    status?: number;
    resourceType: string;
  }> = [];

  const handler = (response: any) => {
    calls.push({
      url: response.url(),
      method: response.request().method(),
      status: response.status(),
      resourceType: response.request().resourceType(),
    });
  };

  page.on('response', handler);

  try {
    await fn();
  } finally {
    page.off('response', handler);
  }

  return calls;
}

// ── screenshot ──────────────────────────────────────────────────────────────
// Take screenshot with optional clip region

export async function screenshot(
  page: Page,
  path: string,
  opts: { clip?: { x: number; y: number; width: number; height: number } } = {},
): Promise<void> {
  try {
    await page.screenshot({ path, ...opts });
  } catch (err: any) {
    throw new Error(`Failed to take screenshot: ${err.message}`);
  }
}
