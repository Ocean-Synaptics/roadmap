import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
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
  let readFileSyncSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Spy on readFileSync to track file reads
    readFileSyncSpy = vi.spyOn(fs, 'readFileSync');
  });

  afterEach(() => {
    readFileSyncSpy.mockRestore();
    vi.clearAllMocks();
  });

  it('first listTokens call reads files, second call uses cache', () => {
    const repoRoot = '/tmp/test-repo-cache';
    const type = 'claim' as TokenType;

    // Setup: mock fs.existsSync and fs.readdirSync to simulate token directories
    vi.spyOn(fs, 'existsSync').mockImplementation((path: any) => {
      const pathStr = String(path);
      return pathStr === `${repoRoot}/.roadmap/tokens` || pathStr === `${repoRoot}/.roadmap/tokens/claim`;
    });

    // Mock readdirSync to return some token filenames
    vi.spyOn(fs, 'readdirSync').mockImplementation((path: any) => {
      const pathStr = String(path);
      if (pathStr === `${repoRoot}/.roadmap/tokens/claim`) {
        return ['tok-001.json', 'tok-002.json', 'tok-003.json'] as any;
      }
      return [] as any;
    });

    // Mock readFileSync to return token JSON
    readFileSyncSpy.mockImplementation((path: any, encoding?: any) => {
      const pathStr = String(path);
      if (pathStr.includes('tok-001.json')) {
        return JSON.stringify(createMockToken('tok-001', 'claim'));
      } else if (pathStr.includes('tok-002.json')) {
        return JSON.stringify(createMockToken('tok-002', 'claim'));
      } else if (pathStr.includes('tok-003.json')) {
        return JSON.stringify(createMockToken('tok-003', 'claim'));
      }
      return '{}';
    });

    // First call should read files
    readFileSyncSpy.mockClear();
    const result1 = listTokens(repoRoot, type);
    const readCount1 = readFileSyncSpy.mock.calls.length;

    // Verify first call read the files
    expect(readCount1).toBe(3);
    expect(result1).toHaveLength(3);

    // Second call should use cache (no new reads)
    readFileSyncSpy.mockClear();
    const result2 = listTokens(repoRoot, type);
    const readCount2 = readFileSyncSpy.mock.calls.length;

    // Verify cache hit: zero additional reads
    expect(readCount2).toBe(0);
    expect(result2).toEqual(result1);
  });

  it('different root:type combinations maintain separate cache entries', () => {
    const repoRoot1 = '/tmp/test-repo-1';
    const repoRoot2 = '/tmp/test-repo-2';
    const type = 'claim' as TokenType;

    vi.spyOn(fs, 'existsSync').mockImplementation((path: any) => {
      const pathStr = String(path);
      return (
        pathStr === `${repoRoot1}/.roadmap/tokens` ||
        pathStr === `${repoRoot1}/.roadmap/tokens/claim` ||
        pathStr === `${repoRoot2}/.roadmap/tokens` ||
        pathStr === `${repoRoot2}/.roadmap/tokens/claim`
      );
    });

    vi.spyOn(fs, 'readdirSync').mockImplementation((path: any) => {
      const pathStr = String(path);
      if (pathStr.includes('claim')) {
        return ['tok-001.json'] as any;
      }
      return [] as any;
    });

    readFileSyncSpy.mockImplementation((path: any, encoding?: any) => {
      const pathStr = String(path);
      if (pathStr.includes('repoRoot-1')) {
        return JSON.stringify(createMockToken('tok-repo1', 'claim'));
      } else if (pathStr.includes('repoRoot-2')) {
        return JSON.stringify(createMockToken('tok-repo2', 'claim'));
      } else if (pathStr.includes('tok-001.json')) {
        // Return different token based on path context
        return JSON.stringify(createMockToken('tok-001', 'claim'));
      }
      return '{}';
    });

    // First call for repoRoot1
    readFileSyncSpy.mockClear();
    const result1 = listTokens(repoRoot1, type);
    const readCount1 = readFileSyncSpy.mock.calls.length;
    expect(readCount1).toBe(1);

    // First call for repoRoot2
    readFileSyncSpy.mockClear();
    const result2 = listTokens(repoRoot2, type);
    const readCount2 = readFileSyncSpy.mock.calls.length;
    expect(readCount2).toBe(1); // Should read files, not use repoRoot1's cache

    // Second call for repoRoot1 should use cache
    readFileSyncSpy.mockClear();
    const result1Again = listTokens(repoRoot1, type);
    const readCount1Again = readFileSyncSpy.mock.calls.length;
    expect(readCount1Again).toBe(0); // Cache hit

    // Second call for repoRoot2 should use cache
    readFileSyncSpy.mockClear();
    const result2Again = listTokens(repoRoot2, type);
    const readCount2Again = readFileSyncSpy.mock.calls.length;
    expect(readCount2Again).toBe(0); // Cache hit

    expect(result1).toEqual(result1Again);
    expect(result2).toEqual(result2Again);
  });

  it('writeToken invalidates cache for that type', () => {
    const repoRoot = '/tmp/test-cache-invalidate';
    const type = 'claim' as TokenType;

    // Setup mocks
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readdirSync').mockReturnValue(['tok-001.json'] as any);
    const writeFileSyncSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
    const appendFileSyncSpy = vi.spyOn(fs, 'appendFileSync').mockImplementation(() => {});

    readFileSyncSpy.mockImplementation((path: any) => {
      return JSON.stringify(createMockToken('tok-001', type));
    });

    // First listTokens populates cache
    readFileSyncSpy.mockClear();
    const result1 = listTokens(repoRoot, type);
    const readCount1 = readFileSyncSpy.mock.calls.length;
    expect(readCount1).toBeGreaterThan(0);

    // Second listTokens uses cache
    readFileSyncSpy.mockClear();
    const result2 = listTokens(repoRoot, type);
    const readCount2 = readFileSyncSpy.mock.calls.length;
    expect(readCount2).toBe(0); // Cache hit

    // Write a token (invalidates cache)
    const newToken = createMockToken('tok-new', type);
    writeToken(repoRoot, newToken);

    // Third listTokens should repopulate from disk
    readFileSyncSpy.mockClear();
    const result3 = listTokens(repoRoot, type);
    const readCount3 = readFileSyncSpy.mock.calls.length;
    expect(readCount3).toBeGreaterThan(0); // Cache was invalidated, reads files again
  });

  it('writeToken does not affect cache for different type', () => {
    const repoRoot = '/tmp/test-cache-type-isolation';

    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readdirSync').mockReturnValue(['tok-001.json'] as any);
    vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
    vi.spyOn(fs, 'appendFileSync').mockImplementation(() => {});

    readFileSyncSpy.mockImplementation((path: any) => {
      if (path.includes('claim')) {
        return JSON.stringify(createMockToken('tok-claim', 'claim'));
      } else if (path.includes('strategy')) {
        return JSON.stringify(createMockToken('tok-strategy', 'strategy'));
      }
      return '{}';
    });

    // Populate claim cache
    readFileSyncSpy.mockClear();
    listTokens(repoRoot, 'claim');
    const claimReadCount1 = readFileSyncSpy.mock.calls.length;
    expect(claimReadCount1).toBeGreaterThan(0);

    // Populate strategy cache
    readFileSyncSpy.mockClear();
    listTokens(repoRoot, 'strategy');
    const strategyReadCount1 = readFileSyncSpy.mock.calls.length;
    expect(strategyReadCount1).toBeGreaterThan(0);

    // Write a strategy token (should invalidate only strategy cache)
    const strategyToken = createMockToken('tok-new-strategy', 'strategy');
    writeToken(repoRoot, strategyToken);

    // Claim cache should still work
    readFileSyncSpy.mockClear();
    listTokens(repoRoot, 'claim');
    const claimReadCount2 = readFileSyncSpy.mock.calls.length;
    expect(claimReadCount2).toBe(0); // Claim cache not affected

    // Strategy cache should be repopulated
    readFileSyncSpy.mockClear();
    listTokens(repoRoot, 'strategy');
    const strategyReadCount2 = readFileSyncSpy.mock.calls.length;
    expect(strategyReadCount2).toBeGreaterThan(0); // Strategy cache invalidated
  });
});
