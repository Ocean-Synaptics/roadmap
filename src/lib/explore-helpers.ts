// @module explore-helpers
// @exports checkVisible, checkText, checkStyle, checkSize, checkCount, checkAttribute, checkClass, checkContrast, checkOverflow
// @types ObservationResult
// @entry roadmap

import type { Page } from '@playwright/test';
import type { ObservationResult } from '../protocol.ts';

// ── Luminance & Contrast Ratio (WCAG) ───────────────────────────────────────

/** Relative luminance per WCAG 2.1 — RGB to perceptual brightness */
function getLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/** Contrast ratio between two luminance values per WCAG 2.1 */
function contrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Parse rgb(r, g, b) or rgba(r, g, b, a) or #hex to [r, g, b] */
function parseColor(color: string): [number, number, number] {
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    if (hex.length === 3) {
      // #abc → #aabbcc
      const [a, b, c] = hex;
      return [
        parseInt(a + a, 16),
        parseInt(b + b, 16),
        parseInt(c + c, 16),
      ];
    }
    if (hex.length === 6) {
      return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
      ];
    }
  }

  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (match) {
    return [parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10)];
  }

  // Fallback: return black
  return [0, 0, 0];
}

// ── Observation Helpers ─────────────────────────────────────────────────────

/** Check if element matching selector is visible in the viewport */
export async function checkVisible(
  page: Page,
  selector: string,
  label: string,
): Promise<ObservationResult> {
  const id = label.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  try {
    const locator = page.locator(selector);
    const count = await locator.count();

    if (count === 0) {
      return {
        id,
        pass: false,
        evidence: `Selector "${selector}" matched no elements`,
      };
    }

    const visible = await locator.first().isVisible();
    return {
      id,
      pass: visible,
      evidence: visible ? `Element visible at ${selector}` : `Element not visible (display:none or outside viewport)`,
      value: visible,
    };
  } catch (err: any) {
    return {
      id,
      pass: false,
      evidence: `error: ${err.message?.slice(0, 100) || String(err).slice(0, 100)}`,
    };
  }
}

/** Extract and trim rendered text content from element matching selector */
export async function checkText(
  page: Page,
  selector: string,
  label: string,
): Promise<ObservationResult> {
  const id = label.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  try {
    const locator = page.locator(selector);
    const count = await locator.count();

    if (count === 0) {
      return {
        id,
        pass: false,
        evidence: `Selector "${selector}" matched no elements`,
      };
    }

    const text = await locator.first().textContent();
    const trimmed = (text || '').trim();

    return {
      id,
      pass: trimmed.length > 0,
      evidence: trimmed.length > 0
        ? `Text content: "${trimmed.slice(0, 80)}${trimmed.length > 80 ? '...' : ''}"`
        : 'No text content (empty or whitespace-only)',
      value: trimmed,
    };
  } catch (err: any) {
    return {
      id,
      pass: false,
      evidence: `error: ${err.message?.slice(0, 100) || String(err).slice(0, 100)}`,
    };
  }
}

/** Read computed CSS property value from element matching selector */
export async function checkStyle(
  page: Page,
  selector: string,
  property: string,
  label: string,
): Promise<ObservationResult> {
  const id = label.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  try {
    const locator = page.locator(selector);
    const count = await locator.count();

    if (count === 0) {
      return {
        id,
        pass: false,
        evidence: `Selector "${selector}" matched no elements`,
      };
    }

    const value = await locator.first().evaluate((el: any, prop: string) => {
      return getComputedStyle(el).getPropertyValue(prop);
    }, property);

    return {
      id,
      pass: value !== '' && value !== null,
      evidence: value !== '' ? `${property}: ${value}` : `Property "${property}" not set`,
      value: value || undefined,
    };
  } catch (err: any) {
    return {
      id,
      pass: false,
      evidence: `error: ${err.message?.slice(0, 100) || String(err).slice(0, 100)}`,
    };
  }
}

/** Check bounding box width and height exceed minimums */
export async function checkSize(
  page: Page,
  selector: string,
  minW: number,
  minH: number,
  label: string,
): Promise<ObservationResult> {
  const id = label.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  try {
    const locator = page.locator(selector);
    const count = await locator.count();

    if (count === 0) {
      return {
        id,
        pass: false,
        evidence: `Selector "${selector}" matched no elements`,
      };
    }

    const box = await locator.first().boundingBox();

    if (!box) {
      return {
        id,
        pass: false,
        evidence: 'Element has no bounding box (display:none or removed from layout)',
      };
    }

    const pass = box.width >= minW && box.height >= minH;
    return {
      id,
      pass,
      evidence: `${box.width.toFixed(0)}x${box.height.toFixed(0)}px (min: ${minW}x${minH}px)`,
      value: `${box.width.toFixed(0)}x${box.height.toFixed(0)}`,
    };
  } catch (err: any) {
    return {
      id,
      pass: false,
      evidence: `error: ${err.message?.slice(0, 100) || String(err).slice(0, 100)}`,
    };
  }
}

/** Count elements matching selector and verify against expected count */
export async function checkCount(
  page: Page,
  selector: string,
  expected: number,
  label: string,
): Promise<ObservationResult> {
  const id = label.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  try {
    const count = await page.locator(selector).count();
    const pass = count === expected;

    return {
      id,
      pass,
      evidence: `Found ${count} element(s), expected ${expected}`,
      value: count,
    };
  } catch (err: any) {
    return {
      id,
      pass: false,
      evidence: `error: ${err.message?.slice(0, 100) || String(err).slice(0, 100)}`,
    };
  }
}

/** Check if element's attribute matches expected value */
export async function checkAttribute(
  page: Page,
  selector: string,
  attr: string,
  expected: string,
  label: string,
): Promise<ObservationResult> {
  const id = label.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  try {
    const locator = page.locator(selector);
    const count = await locator.count();

    if (count === 0) {
      return {
        id,
        pass: false,
        evidence: `Selector "${selector}" matched no elements`,
      };
    }

    const value = await locator.first().getAttribute(attr);
    const pass = value === expected;

    return {
      id,
      pass,
      evidence: `${attr}="${value || '(not set)'}" (expected: "${expected}")`,
      value: value || undefined,
    };
  } catch (err: any) {
    return {
      id,
      pass: false,
      evidence: `error: ${err.message?.slice(0, 100) || String(err).slice(0, 100)}`,
    };
  }
}

/** Check if element has a specific CSS class */
export async function checkClass(
  page: Page,
  selector: string,
  className: string,
  label: string,
): Promise<ObservationResult> {
  const id = label.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  try {
    const locator = page.locator(selector);
    const count = await locator.count();

    if (count === 0) {
      return {
        id,
        pass: false,
        evidence: `Selector "${selector}" matched no elements`,
      };
    }

    const pass = await locator.first().evaluate((el: any, cls: string) => {
      return el.classList.contains(cls);
    }, className);

    return {
      id,
      pass,
      evidence: pass ? `Class "${className}" present` : `Class "${className}" not found`,
      value: pass,
    };
  } catch (err: any) {
    return {
      id,
      pass: false,
      evidence: `error: ${err.message?.slice(0, 100) || String(err).slice(0, 100)}`,
    };
  }
}

/** Measure text contrast ratio between text and background elements per WCAG 2.1 */
export async function checkContrast(
  page: Page,
  textSel: string,
  bgSel: string,
  minRatio: number,
  label: string,
): Promise<ObservationResult> {
  const id = label.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  try {
    const textLoc = page.locator(textSel);
    const bgLoc = page.locator(bgSel);

    if (await textLoc.count() === 0) {
      return {
        id,
        pass: false,
        evidence: `Text selector "${textSel}" matched no elements`,
      };
    }

    if (await bgLoc.count() === 0) {
      return {
        id,
        pass: false,
        evidence: `Background selector "${bgSel}" matched no elements`,
      };
    }

    const textColor = await textLoc.first().evaluate((el: any) => {
      return getComputedStyle(el).color;
    });

    const bgColor = await bgLoc.first().evaluate((el: any) => {
      return getComputedStyle(el).backgroundColor;
    });

    const [tr, tg, tb] = parseColor(textColor);
    const [br, bg, bb] = parseColor(bgColor);

    const tLum = getLuminance(tr, tg, tb);
    const bLum = getLuminance(br, bg, bb);
    const ratio = contrastRatio(tLum, bLum);

    const pass = ratio >= minRatio;
    return {
      id,
      pass,
      evidence: `Contrast ratio: ${ratio.toFixed(2)}:1 (min: ${minRatio}:1) — text: ${textColor}, bg: ${bgColor}`,
      value: parseFloat(ratio.toFixed(2)),
    };
  } catch (err: any) {
    return {
      id,
      pass: false,
      evidence: `error: ${err.message?.slice(0, 100) || String(err).slice(0, 100)}`,
    };
  }
}

/** Check if element has scrollable overflow (scroll height/width > client height/width) */
export async function checkOverflow(
  page: Page,
  selector: string,
  label: string,
): Promise<ObservationResult> {
  const id = label.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  try {
    const locator = page.locator(selector);
    const count = await locator.count();

    if (count === 0) {
      return {
        id,
        pass: false,
        evidence: `Selector "${selector}" matched no elements`,
      };
    }

    const overflow = await locator.first().evaluate((el: any) => {
      return {
        overflowY: el.scrollHeight > el.clientHeight,
        overflowX: el.scrollWidth > el.clientWidth,
      };
    });

    const hasOverflow = overflow.overflowX || overflow.overflowY;
    return {
      id,
      pass: hasOverflow,
      evidence: `Overflow: ${overflow.overflowY ? 'vertical' : ''}${overflow.overflowX && overflow.overflowY ? ' + ' : ''}${overflow.overflowX ? 'horizontal' : 'none'}`,
      value: hasOverflow,
    };
  } catch (err: any) {
    return {
      id,
      pass: false,
      evidence: `error: ${err.message?.slice(0, 100) || String(err).slice(0, 100)}`,
    };
  }
}
