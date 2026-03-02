import { describe, it, expect } from 'vitest';
import { cmdRepairInteractive, cmdRepairStatus } from '../../bin/cli-repairs';

describe('CLI Repair Commands', () => {
  it('has repair interactive command', async () => {
    expect(cmdRepairInteractive).toBeDefined();
  });

  it('has repair status command', async () => {
    expect(cmdRepairStatus).toBeDefined();
  });
});
