'use strict';

// ── Mock fetch + dependencies ────────────────────────────────────────────────

const mockFetch = jest.fn();
global.fetch = mockFetch;

jest.mock('../backend/utils/logger', () => ({
  info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn(),
}));

jest.mock('../backend/utils/cu-budget', () => ({
  canSpend: jest.fn(() => true),
  spend:    jest.fn(),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeTrendingResponse(tokens) {
  return { success: true, data: { tokens } };
}

function makeToken(i) {
  return {
    address: `mint${String(i).padStart(3, '0')}`,
    symbol:  `TKN${i}`,
    name:    `Token ${i}`,
  };
}

function okResponse(body) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  });
}

function failResponse(status) {
  return Promise.resolve({
    ok: false,
    status,
    json: () => Promise.resolve({}),
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('birdeye fetchTrending', () => {
  let birdeye;

  beforeEach(() => {
    jest.resetModules();
    mockFetch.mockReset();
    process.env.BIRDEYE_API_KEY = 'test-key';
    jest.isolateModules(() => {
      birdeye = require('../backend/fetchers/birdeye');
    });
  });

  afterEach(() => {
    delete process.env.BIRDEYE_API_KEY;
  });

  test('returns [] when no API key', async () => {
    delete process.env.BIRDEYE_API_KEY;
    jest.isolateModules(() => {
      birdeye = require('../backend/fetchers/birdeye');
    });
    const result = await birdeye.fetchTrending();
    expect(result).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('merges 3 paginated results correctly', async () => {
    const page1 = Array.from({ length: 20 }, (_, i) => makeToken(i));
    const page2 = Array.from({ length: 20 }, (_, i) => makeToken(i + 20));
    const page3 = Array.from({ length: 10 }, (_, i) => makeToken(i + 40));

    mockFetch
      .mockReturnValueOnce(okResponse(makeTrendingResponse(page1)))
      .mockReturnValueOnce(okResponse(makeTrendingResponse(page2)))
      .mockReturnValueOnce(okResponse(makeTrendingResponse(page3)));

    const result = await birdeye.fetchTrending();
    expect(result).toHaveLength(50);
    expect(result[0].address).toBe('mint000');
    expect(result[49].address).toBe('mint049');
  });

  test('caps at trendingTopN', async () => {
    const page = Array.from({ length: 20 }, (_, i) => makeToken(i));

    mockFetch
      .mockReturnValueOnce(okResponse(makeTrendingResponse(page)))
      .mockReturnValueOnce(okResponse(makeTrendingResponse(page)))
      .mockReturnValueOnce(okResponse(makeTrendingResponse(page)));

    // 60 total tokens, should be capped at 50
    const result = await birdeye.fetchTrending();
    expect(result.length).toBeLessThanOrEqual(50);
  });

  test('handles partial page failures gracefully', async () => {
    const page1 = Array.from({ length: 20 }, (_, i) => makeToken(i));

    mockFetch
      .mockReturnValueOnce(okResponse(makeTrendingResponse(page1)))
      .mockReturnValueOnce(failResponse(500))
      .mockReturnValueOnce(okResponse(makeTrendingResponse([])));

    const result = await birdeye.fetchTrending();
    expect(result).toHaveLength(20);
  });

  test('handles all pages failing', async () => {
    mockFetch
      .mockReturnValueOnce(failResponse(500))
      .mockReturnValueOnce(failResponse(500))
      .mockReturnValueOnce(failResponse(500));

    const result = await birdeye.fetchTrending();
    expect(result).toHaveLength(0);
  });

  test('sends correct query params for pagination', async () => {
    mockFetch
      .mockReturnValue(okResponse(makeTrendingResponse([])));

    await birdeye.fetchTrending();

    // 3 paginated calls
    expect(mockFetch).toHaveBeenCalledTimes(3);
    const urls = mockFetch.mock.calls.map(c => c[0]);
    expect(urls[0]).toContain('offset=0&limit=20');
    expect(urls[1]).toContain('offset=20&limit=20');
    expect(urls[2]).toContain('offset=40&limit=20');
  });
});

describe('birdeye normalizeEntry', () => {
  let birdeye;

  beforeEach(() => {
    jest.resetModules();
    process.env.BIRDEYE_API_KEY = 'test-key';
    mockFetch.mockReturnValue(okResponse({ success: true, data: { tokens: [] } }));
    jest.isolateModules(() => {
      birdeye = require('../backend/fetchers/birdeye');
    });
  });

  afterEach(() => {
    delete process.env.BIRDEYE_API_KEY;
  });

  test('maps fields and sets birdeyeRank from index', () => {
    const entry = { address: 'abc123', symbol: 'TEST', name: 'Test Token' };
    const stub = birdeye.normalizeEntry(entry, 4);

    expect(stub.mint).toBe('abc123');
    expect(stub.symbol).toBe('TEST');
    expect(stub.name).toBe('Test Token');
    expect(stub.birdeyeRank).toBe(5); // 0-indexed → 1-based
    expect(stub.trendingRank).toBeNull();
  });

  test('handles missing fields with defaults', () => {
    const stub = birdeye.normalizeEntry({}, 0);

    expect(stub.mint).toBeNull();
    expect(stub.symbol).toBe('UNKNOWN');
    expect(stub.name).toBe('Unknown');
    expect(stub.birdeyeRank).toBe(1);
  });
});
