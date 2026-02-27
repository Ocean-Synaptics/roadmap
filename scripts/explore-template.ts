#!/usr/bin/env npx tsx
// Exploration script template — CDP-based behavioral observation
//
// Usage:
//   CDP_URL=http://localhost:9222 npx tsx scripts/explore-template.ts
//
// This script connects to a running Electron app via Chrome DevTools Protocol,
// performs interactions, captures structured observations, and emits JSON to stdout.
//
// Adapt the observations below to match your spec acceptance scenarios.

import { chromium } from '@playwright/test';

const CDP_URL = process.env.CDP_URL ?? `http://localhost:${process.env.CDP_PORT ?? '9222'}`;

interface ObservationResult {
  id: string;
  pass: boolean;
  value?: string | number | boolean;
  evidence: string;
}

async function explore() {
  const start = Date.now();
  const observations: ObservationResult[] = [];

  // Connect to running app via CDP
  const browser = await chromium.connectOverCDP(CDP_URL);
  const contexts = browser.contexts();
  if (contexts.length === 0) throw new Error('No browser contexts found');

  const page = contexts[0].pages().find(p => !p.url().startsWith('devtools://'));
  if (!page) throw new Error('No application page found (only devtools pages)');

  // ── Observation: app-launches ──────────────────────────────────────────────
  observations.push({
    id: 'app-launches',
    pass: true,
    evidence: `Page loaded at ${page.url()}`,
  });

  // ── Observation: text-visible ──────────────────────────────────────────────
  // Check that primary text content is visible (not white-on-white, not zero-size)
  const bodyText = page.locator('body');
  const bodyStyles = await bodyText.evaluate(el => {
    const s = getComputedStyle(el);
    return { color: s.color, bg: s.backgroundColor };
  });
  const textVisible = bodyStyles.color !== bodyStyles.bg;
  observations.push({
    id: 'text-visible',
    pass: textVisible,
    evidence: `color: ${bodyStyles.color}, bg: ${bodyStyles.bg}`,
  });

  // ── Observation: no-console-errors ─────────────────────────────────────────
  // Attach console listener and check for errors during page idle
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.waitForTimeout(1000); // let any startup errors surface

  observations.push({
    id: 'no-console-errors',
    pass: errors.length === 0,
    value: errors.length,
    evidence: errors.length === 0
      ? 'No uncaught errors during 1s idle'
      : `${errors.length} error(s): ${errors.slice(0, 3).join('; ')}`,
  });

  // ── Add more observations here ─────────────────────────────────────────────
  // Map each spec acceptance scenario to an observation:
  //
  // const element = page.locator('css-selector');
  // const visible = await element.isVisible();
  // const styles = await element.evaluate(el => getComputedStyle(el).propertyName);
  // const count = await page.locator('.items').count();
  //
  // observations.push({
  //   id: 'scenario-id',
  //   pass: /* boolean condition */,
  //   value: /* optional measured value */,
  //   evidence: /* human-readable description of what was observed */,
  // });

  // ── Emit result ────────────────────────────────────────────────────────────
  const result = {
    observations,
    duration: Date.now() - start,
  };

  console.log(JSON.stringify(result));
  await browser.close();
}

explore().catch((err) => {
  console.error(err);
  process.exit(1);
});
