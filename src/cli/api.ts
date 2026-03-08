// @module cli/api
// @description Schema discovery command: lookup schemas, list commands, dump registry.
// @exports run

import { emit, ErrorCode, type OutputOpts } from '../lib/cli-envelope.ts';
import { lookupSchema, listCommands, schemaToJsonSchema } from '../lib/schemas.ts';
import { getMakeInvariants } from '../lib/api-invariants.ts';

export function run(args: string[], outputOpts: OutputOpts): void {
  const target = args[1];
  const all = args.includes('--all');

  if (all || !target) {
    const commands = listCommands();
    if (all) {
      const registry: Record<string, unknown> = {};
      for (const { command } of commands) {
        const s = lookupSchema(command);
        if (!s) continue;
        registry[command] = {
          description: s.description,
          input: s.input ? schemaToJsonSchema(s.input) : null,
          output: s.output ? schemaToJsonSchema(s.output) : null,
          examples: s.examples,
        };
      }
      emit({ ok: true, cmd: 'api', data: { commands: registry } }, outputOpts);
    } else {
      emit({ ok: true, cmd: 'api', data: { commands } }, outputOpts);
    }
    return;
  }

  const schema = lookupSchema(target);
  if (!schema) {
    const available = listCommands().map(c => c.command);
    emit({ ok: false, cmd: 'api', error: {
      code: ErrorCode.NODE_NOT_FOUND,
      message: `No schema registered for command: ${target}`,
      fix: [`Available commands: ${available.join(', ')}`],
    } }, outputOpts);
    process.exit(1);
    return;
  }

  const data: any = {
    command: target,
    description: schema.description,
    input: schema.input ? schemaToJsonSchema(schema.input) : null,
    output: schema.output ? schemaToJsonSchema(schema.output) : null,
    examples: schema.examples,
  };

  if (target === 'make') {
    data.invariants = getMakeInvariants();
  }

  emit({ ok: true, cmd: 'api', data }, outputOpts);
}
