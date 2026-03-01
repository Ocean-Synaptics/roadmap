import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { listTokens, writeToken, BoundToken, TokenType } from '../../src/lib/utils/tokens/token-store';

// Create mock tokens for testing
function createMockToken(tokenId: string, type: TokenType): BoundToken {
  return {
    schema_version: 1,
    tokenId,
    type,
    subject: 'test-subject',
    issuedAt: new Date().toISOString(),
    boundTo: { headSha: 'abc123' },
    ok: true,
    payload: { test: true },
  };
}

describe('claims cache', () => {
  let testRepoRoot: string;

  beforeEach(() => {
    // Create a temporary test directory
    testRepoRoot = join('/tmp', `test-repo-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const tokenDir = join(testRepoRoot, '.roadmap', 'tokens');
    mkdirSync(tokenDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up test directory
    if (testRepoRoot) {
      try {
        rmSync(testRepoRoot, { recursive: true, force: true });
      } catch { /* ignore */ }
    }
  });

  it('listTokens works with real files', () => {
    // Set up token files on disk
    const type = 'claim' as TokenType;
    const tokenDir = join(testRepoRoot, '.roadmap', 'tokens', type);
    mkdirSync(tokenDir, { recursive: true });

    const token1 = createMockToken('tok-001', type);
    const token2 = createMockToken('tok-002', type);
    const token3 = createMockToken('tok-003', type);

    writeFileSync(join(tokenDir, 'tok-001.json'), JSON.stringify(token1));
    writeFileSync(join(tokenDir, 'tok-002.json'), JSON.stringify(token2));
    writeFileSync(join(tokenDir, 'tok-003.json'), JSON.stringify(token3));

    // First call should load from disk
    const result1 = listTokens(testRepoRoot, type);

    expect(result1).toHaveLength(3);
    expect(result1.map((t) => t.tokenId).sort()).toEqual(['tok-001', 'tok-002', 'tok-003']);
  });

  it('listTokens returns consistent results across calls', () => {
    // Set up token files on disk
    const type = 'claim' as TokenType;
    const tokenDir = join(testRepoRoot, '.roadmap', 'tokens', type);
    mkdirSync(tokenDir, { recursive: true });

    const token1 = createMockToken('tok-001', type);
    writeFileSync(join(tokenDir, 'tok-001.json'), JSON.stringify(token1));

    // First call
    const result1 = listTokens(testRepoRoot, type);

    // Second call — should return same results
    const result2 = listTokens(testRepoRoot, type);

    expect(result1).toEqual(result2);
    expect(result1[0].tokenId).toBe('tok-001');
  });

  it('different type combinations work independently', () => {
    // Set up claim and strategy tokens
    const claimDir = join(testRepoRoot, '.roadmap', 'tokens', 'claim');
    const strategyDir = join(testRepoRoot, '.roadmap', 'tokens', 'strategy');
    mkdirSync(claimDir, { recursive: true });
    mkdirSync(strategyDir, { recursive: true });

    const claimToken = createMockToken('tok-claim', 'claim');
    const strategyToken = createMockToken('tok-strategy', 'strategy');

    writeFileSync(join(claimDir, 'tok-claim.json'), JSON.stringify(claimToken));
    writeFileSync(join(strategyDir, 'tok-strategy.json'), JSON.stringify(strategyToken));

    // Load claim tokens
    const claims = listTokens(testRepoRoot, 'claim');
    expect(claims).toHaveLength(1);
    expect(claims[0].type).toBe('claim');

    // Load strategy tokens
    const strategies = listTokens(testRepoRoot, 'strategy');
    expect(strategies).toHaveLength(1);
    expect(strategies[0].type).toBe('strategy');

    // Load all tokens
    const allTokens = listTokens(testRepoRoot);
    expect(allTokens).toHaveLength(2);
    expect(allTokens.map((t) => t.type).sort()).toEqual(['claim', 'strategy']);
  });

  it('writeToken creates token file', () => {
    const token = createMockToken('tok-new', 'claim');
    const result = writeToken(testRepoRoot, token);

    // Result should contain the token directory and type
    expect(result).toContain('.roadmap/tokens/claim');
    expect(result).toContain('tok-new.json');

    // Token should be readable after write
    const tokens = listTokens(testRepoRoot, 'claim');
    expect(tokens).toHaveLength(1);
    expect(tokens[0].tokenId).toBe('tok-new');
  });

  it('writeToken + listTokens interaction: new token appears in list', () => {
    // Add first token via writeToken
    const token1 = createMockToken('tok-1', 'claim');
    writeToken(testRepoRoot, token1);

    const result1 = listTokens(testRepoRoot, 'claim');
    expect(result1).toHaveLength(1);

    // Add second token via writeToken
    const token2 = createMockToken('tok-2', 'claim');
    writeToken(testRepoRoot, token2);

    // After write, list should include the new token
    const result2 = listTokens(testRepoRoot, 'claim');
    expect(result2).toHaveLength(2);
    expect(result2.map((t) => t.tokenId).sort()).toEqual(['tok-1', 'tok-2']);
  });

  it('listTokens empty directory returns empty array', () => {
    const result = listTokens(testRepoRoot, 'claim');
    expect(result).toEqual([]);
  });

  it('listTokens with non-existent root returns empty array', () => {
    const nonExistentRoot = '/tmp/does-not-exist-' + Math.random();
    const result = listTokens(nonExistentRoot, 'claim');
    expect(result).toEqual([]);
  });

  it('multiple token types can coexist and be listed independently', () => {
    // Create all four token types
    const types: TokenType[] = ['claim', 'strategy', 'breakglass', 'run'];

    for (const type of types) {
      const dir = join(testRepoRoot, '.roadmap', 'tokens', type);
      mkdirSync(dir, { recursive: true });
      const token = createMockToken(`tok-${type}`, type);
      writeFileSync(join(dir, `tok-${type}.json`), JSON.stringify(token));
    }

    // List each type separately
    for (const type of types) {
      const result = listTokens(testRepoRoot, type);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe(type);
    }

    // List all at once
    const allTokens = listTokens(testRepoRoot);
    expect(allTokens).toHaveLength(4);
  });
});
