// @module cli/registry
// @exports CommandDef, CommandRegistry, registry, registerCommand
// @entry roadmap/cli/registry

// --- Types ---

export interface CommandDef {
  name: string;
  description: string;
  usage?: string;
  handler: (args: string[]) => Promise<void> | void;
}

export type CommandRegistry = Map<string, CommandDef>;

// --- Singleton registry ---

export const registry: CommandRegistry = new Map();

export function registerCommand(def: CommandDef): void {
  if (registry.has(def.name)) {
    throw new Error(`Command "${def.name}" already registered`);
  }
  registry.set(def.name, def);
}
