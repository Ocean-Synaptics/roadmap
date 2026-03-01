// @module cli
// @exports emit, json, maybeJSON
// @types OutputOptions

import { writeSync } from 'fs';

/**
 * CLI output envelope system.
 * Ensures consistent, JSON-compatible output format.
 * Separates JSON from text (documentation, progress) via different streams.
 */

export interface OutputOptions {
  format?: 'json' | 'text';
  cmd?: string;
  render?: boolean;
}

const _outputOpts: OutputOptions = {
  format: process.argv.includes('--json') ? 'json' : 'text',
  render: !process.argv.includes('--json'),
};

/**
 * Set output format globally.
 */
export function setOutputFormat(opts: OutputOptions) {
  Object.assign(_outputOpts, opts);
}

/**
 * Emit JSON output to stdout (with render text to stderr if needed).
 */
export function emit(data: any, opts?: OutputOptions) {
  const mergedOpts = { ..._outputOpts, ...opts };
  
  if (mergedOpts.format === 'json') {
    // JSON to stdout
    console.log(JSON.stringify(data, null, 2));
  } else if (data.render && mergedOpts.render) {
    // Render text to stderr
    console.error(data.render);
  }
}

/**
 * Convenience: emit JSON object.
 */
export function json(data: any) {
  emit(data, { format: 'json' });
}

/**
 * Emit both JSON (stdout) and text (stderr).
 */
export function maybeJSON(textOutput: string, jsonData: any, opts?: OutputOptions) {
  const mergedOpts = { ..._outputOpts, ...opts };
  
  // Always output JSON to stdout
  console.log(JSON.stringify(jsonData, null, 2));
  
  // Output render text to stderr (optional)
  if (mergedOpts.render && textOutput) {
    console.error(textOutput);
  }
}

/**
 * Create a structured response object.
 */
export function createResponse<T>(data: T, opts: { cmd: string; ok?: boolean; error?: any }) {
  return {
    schema_version: 1,
    ok: opts.ok !== undefined ? opts.ok : !opts.error,
    cmd: opts.cmd,
    data: opts.ok !== false ? data : undefined,
    error: opts.error,
  };
}
