// @module explore-helpers
// @exports checkVisible, checkText, checkStyle, checkSize, checkCount, checkAttribute, checkClass, checkContrast, checkOverflow, checkDisabled, checkChecked, checkContainsText, checkInputValue, checkUrl, checkTitle, checkComputedStyle, checkInViewport
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

/** Check if element is disabled */
export async function checkDisabled(
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

    const disabled = await locator.first().isDisabled();
    return {
      id,
      pass: disabled,
      evidence: disabled ? 'Element is disabled' : 'Element is enabled',
      value: disabled,
    };
  } catch (err: any) {
    return {
      id,
      pass: false,
      evidence: `error: ${err.message?.slice(0, 100) || String(err).slice(0, 100)}`,
    };
  }
}

/** Check if checkbox or radio is checked */
export async function checkChecked(
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

    const checked = await locator.first().isChecked();
    return {
      id,
      pass: checked,
      evidence: checked ? 'Element is checked' : 'Element is unchecked',
      value: checked,
    };
  } catch (err: any) {
    return {
      id,
      pass: false,
      evidence: `error: ${err.message?.slice(0, 100) || String(err).slice(0, 100)}`,
    };
  }
}

/** Get element's inner text and verify it contains expected substring */
export async function checkContainsText(
  page: Page,
  selector: string,
  expectedText: string,
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
    const pass = text?.includes(expectedText) ?? false;

    return {
      id,
      pass,
      evidence: pass
        ? `Text contains "${expectedText}"`
        : `Text "${text?.slice(0, 50) || '(empty)'}" does not contain "${expectedText}"`,
      value: text || undefined,
    };
  } catch (err: any) {
    return {
      id,
      pass: false,
      evidence: `error: ${err.message?.slice(0, 100) || String(err).slice(0, 100)}`,
    };
  }
}

/** Check form field value */
export async function checkInputValue(
  page: Page,
  selector: string,
  expectedValue: string,
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

    const value = await locator.first().inputValue();
    const pass = value === expectedValue;

    return {
      id,
      pass,
      evidence: pass
        ? `Input value matches "${expectedValue}"`
        : `Input value "${value}" does not match "${expectedValue}"`,
      value,
    };
  } catch (err: any) {
    return {
      id,
      pass: false,
      evidence: `error: ${err.message?.slice(0, 100) || String(err).slice(0, 100)}`,
    };
  }
}

/** Check if URL matches pattern */
export async function checkUrl(
  page: Page,
  pattern: string | RegExp,
  label: string,
): Promise<ObservationResult> {
  const id = label.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  try {
    const url = page.url();
    const pass = typeof pattern === 'string' ? url.includes(pattern) : pattern.test(url);

    return {
      id,
      pass,
      evidence: pass ? `URL matches pattern` : `URL "${url}" does not match pattern`,
      value: url,
    };
  } catch (err: any) {
    return {
      id,
      pass: false,
      evidence: `error: ${err.message?.slice(0, 100) || String(err).slice(0, 100)}`,
    };
  }
}

/** Check page title */
export async function checkTitle(
  page: Page,
  expectedTitle: string,
  label: string,
): Promise<ObservationResult> {
  const id = label.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  try {
    const title = await page.title();
    const pass = title.includes(expectedTitle);

    return {
      id,
      pass,
      evidence: pass
        ? `Title contains "${expectedTitle}"`
        : `Title "${title}" does not contain "${expectedTitle}"`,
      value: title,
    };
  } catch (err: any) {
    return {
      id,
      pass: false,
      evidence: `error: ${err.message?.slice(0, 100) || String(err).slice(0, 100)}`,
    };
  }
}

/** Check element's computed CSS property value */
export async function checkComputedStyle(
  page: Page,
  selector: string,
  property: string,
  expectedValue: string,
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

    const value = await locator.first().evaluate(
      (el: any, prop: string) => window.getComputedStyle(el).getPropertyValue(prop),
      property,
    );

    const pass = value.trim() === expectedValue.trim();

    return {
      id,
      pass,
      evidence: pass
        ? `${property}: ${value}`
        : `${property}: "${value}" (expected "${expectedValue}")`,
      value,
    };
  } catch (err: any) {
    return {
      id,
      pass: false,
      evidence: `error: ${err.message?.slice(0, 100) || String(err).slice(0, 100)}`,
    };
  }
}

/** Check if element is in viewport */
export async function checkInViewport(
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

    const inViewport = await locator.first().evaluate((el: any) => {
      const rect = el.getBoundingClientRect();
      return (
        rect.top < window.innerHeight &&
        rect.bottom > 0 &&
        rect.left < window.innerWidth &&
        rect.right > 0
      );
    });

    return {
      id,
      pass: inViewport,
      evidence: inViewport ? 'Element is in viewport' : 'Element is outside viewport',
      value: inViewport,
    };
  } catch (err: any) {
    return {
      id,
      pass: false,
      evidence: `error: ${err.message?.slice(0, 100) || String(err).slice(0, 100)}`,
    };
  }
}
