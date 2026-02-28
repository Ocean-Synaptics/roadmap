// @module metaflow/command-registry
// @exports COMMAND_REGISTRY, isReceiptRequired, CommandConfig

export interface CommandConfig {
  receiptRequired: boolean;
}

// Key = "mf <subcommand>" (first two CLI tokens after `roadmap`)
export const COMMAND_REGISTRY: Record<string, CommandConfig> = {
  'mf ask':  { receiptRequired: true },
  'mf step': { receiptRequired: true },
  'mf wrap': { receiptRequired: true },
  'mf mine': { receiptRequired: false },
  'mf init': { receiptRequired: false },
  'mf dispatch': { receiptRequired: false },
  'mf gantt': { receiptRequired: false },
  'mf answer': { receiptRequired: false },
  'mf opt':  { receiptRequired: false },
};

export function isReceiptRequired(argv: string[]): boolean {
  const key = `${argv[2] ?? ''} ${argv[3] ?? ''}`.trim();
  return COMMAND_REGISTRY[key]?.receiptRequired ?? false;
}
