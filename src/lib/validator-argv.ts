// @module validator-argv
// @exports toArgv, isArgvCommand, shellescape
// @types ArgvCommand
// @entry roadmap

/** A shell-injection-free command specified as argv array. */
export type ArgvCommand = string[];

/** Returns true if command is an argv array (not a shell string). */
export function isArgvCommand(command: string | string[]): command is string[] {
  return Array.isArray(command);
}

/** Convert a shell string to argv (best-effort, simple space split — prefer native argv arrays). */
export function toArgv(command: string): string[] {
  return command.split(/\s+/).filter(Boolean);
}
