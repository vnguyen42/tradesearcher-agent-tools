import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { main } from '../src/index.js';

test('help mentions simple setup and commands', async () => {
  const lines = [];
  await main(['help'], {
    log: (message) => lines.push(message),
    error: (message) => lines.push(message),
  });

  const output = lines.join('\n');
  assert.match(output, /tradesearcher auth login/);
  assert.match(output, /tradesearcher search BTCUSD/);
  assert.match(output, /--api-key/);
  assert.match(output, /--sort <value>/);
  assert.match(output, /sharpeRatio/);
  assert.match(output, /profitFactor/);
  assert.match(output, /netProfitPercent/);
  assert.match(output, /tradesearcher export 12345 --pine --out strategy\.pine/);
  assert.match(output, /tradesearcher schema backtest/);
});

test('symbols command prints readable symbol matches', async () => {
  const lines = [];
  process.env.TRADESEARCHER_API_URL = 'https://example.test';
  process.env.TRADESEARCHER_API_KEY = 'ts_test_from_env';

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    async text() {
      return JSON.stringify({
        data: [
          {
            id: 10,
            name: 'NASDAQ:AAPL',
            ticker: 'AAPL',
            type: 'stock',
            description: 'Apple Inc.',
            backtestsCount: 42,
            matchReason: 'ticker_exact',
            recommended: true,
          },
        ],
        account: { tier: 'premium' },
        limits: { isLimited: false },
      });
    },
  });

  try {
    await main(['symbols', 'AAPL'], {
      log: (message) => lines.push(message),
      error: (message) => lines.push(message),
    });
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.TRADESEARCHER_API_URL;
    delete process.env.TRADESEARCHER_API_KEY;
  }

  const output = lines.join('\n');
  assert.match(output, /symbol #10/);
  assert.match(output, /NASDAQ:AAPL/);
  assert.match(output, /42 backtests/);
  assert.match(output, /recommended most backtests/);
});

test('search prints automatic symbol match metadata', async () => {
  const lines = [];
  process.env.TRADESEARCHER_API_URL = 'https://example.test';
  process.env.TRADESEARCHER_API_KEY = 'ts_test_from_env';

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    async text() {
      return JSON.stringify({
        data: [],
        meta: {
          symbolMatch: {
            input: 'AAPL',
            matched: { id: 10, name: 'NASDAQ:AAPL', ticker: 'AAPL' },
            recommended: { id: 12, name: 'NASDAQ:AAPL', ticker: 'AAPL', backtestsCount: 42 },
            alternatives: [{ id: 11, name: 'MIL:AAPL', ticker: 'AAPL' }],
            isAutomatic: true,
            message: 'Matched AAPL to NASDAQ:AAPL.',
          },
        },
        account: { tier: 'premium' },
        limits: { isLimited: false },
      });
    },
  });

  try {
    await main(['search', 'AAPL'], {
      log: (message) => lines.push(message),
      error: (message) => lines.push(message),
    });
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.TRADESEARCHER_API_URL;
    delete process.env.TRADESEARCHER_API_KEY;
  }

  const output = lines.join('\n');
  assert.match(output, /Symbol match: AAPL -> NASDAQ:AAPL \(AAPL\)/);
  assert.match(output, /Alternatives: MIL:AAPL/);
});

test('search prints recommended symbol when it has more backtests than the exact match', async () => {
  const lines = [];
  process.env.TRADESEARCHER_API_URL = 'https://example.test';
  process.env.TRADESEARCHER_API_KEY = 'ts_test_from_env';

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    async text() {
      return JSON.stringify({
        data: [],
        meta: {
          symbolMatch: {
            input: 'BTCUSD',
            matched: { id: 10, name: 'BINANCE:BTCUSD', ticker: 'BTCUSD', backtestsCount: 2 },
            recommended: { id: 12, name: 'BINANCE:BTCUSDT', ticker: 'BTCUSDT', backtestsCount: 200 },
            alternatives: [],
            isAutomatic: false,
            message: 'Matched BTCUSD to BINANCE:BTCUSD. Recommended match with more backtests: BINANCE:BTCUSDT.',
          },
        },
        account: { tier: 'premium' },
        limits: { isLimited: false },
      });
    },
  });

  try {
    await main(['search', 'BTCUSD'], {
      log: (message) => lines.push(message),
      error: (message) => lines.push(message),
    });
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.TRADESEARCHER_API_URL;
    delete process.env.TRADESEARCHER_API_KEY;
  }

  const output = lines.join('\n');
  assert.match(output, /Recommended match with more backtests: BINANCE:BTCUSDT \(200 backtests\)/);
});

test('search prints symbol suggestions when no exact symbol matched', async () => {
  const lines = [];
  const requestedUrls = [];
  process.env.TRADESEARCHER_API_URL = 'https://example.test';
  process.env.TRADESEARCHER_API_KEY = 'ts_test_from_env';

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    requestedUrls.push(String(url));
    if (String(url).includes('/api/agent/symbols')) {
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({
            data: [{ id: 10, name: 'NASDAQ:AAPL', ticker: 'AAPL', type: 'stock', description: 'Apple Inc.' }],
            account: { tier: 'premium' },
            limits: { isLimited: false },
          });
        },
      };
    }
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({
          data: [],
          meta: {
            symbolMatch: {
              input: 'Apple',
              matched: null,
              alternatives: [],
              isAutomatic: false,
              message: 'No symbol matched Apple. Try the symbols command to search symbols.',
            },
          },
          account: { tier: 'premium' },
          limits: { isLimited: false },
        });
      },
    };
  };

  try {
    await main(['search', 'Apple'], {
      log: (message) => lines.push(message),
      error: (message) => lines.push(message),
    });
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.TRADESEARCHER_API_URL;
    delete process.env.TRADESEARCHER_API_KEY;
  }

  const output = lines.join('\n');
  assert.equal(requestedUrls.length, 2);
  assert.match(output, /No results found/);
  assert.match(output, /Try one of these exact symbols: NASDAQ:AAPL/);
});

test('auth status can print JSON', async () => {
  const lines = [];
  process.env.TRADESEARCHER_API_URL = 'https://example.test';
  process.env.TRADESEARCHER_API_KEY = '';

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    async text() {
      return JSON.stringify({
        data: null,
        account: { tier: 'public', limitSummary: 'Public access is limited.', upgradeUrl: 'https://tradesearcher.ai/app/premium' },
        limits: { isLimited: true },
      });
    },
  });

  try {
    await main(['auth', 'status', '--json'], {
      log: (message) => lines.push(message),
      error: (message) => lines.push(message),
    });
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.TRADESEARCHER_API_URL;
    delete process.env.TRADESEARCHER_API_KEY;
  }

  const parsed = JSON.parse(lines.join('\n'));
  assert.equal(parsed.account.tier, 'public');
  assert.equal(parsed.savedApiKey, false);
  assert.equal(parsed.apiKeySource, 'missing');
});

test('auth status explains environment API key source', async () => {
  const lines = [];
  process.env.TRADESEARCHER_API_URL = 'https://example.test';
  process.env.TRADESEARCHER_API_KEY = 'ts_test_from_env';

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    async text() {
      return JSON.stringify({
        data: null,
        account: {
          tier: 'premium',
          limitSummary: 'Premium accounts can view more results, recent trades, and full strategy details.',
          upgradeUrl: 'https://tradesearcher.ai/app/premium',
        },
        limits: { isLimited: false },
      });
    },
  });

  try {
    await main(['auth', 'status'], {
      log: (message) => lines.push(message),
      error: (message) => lines.push(message),
    });
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.TRADESEARCHER_API_URL;
    delete process.env.TRADESEARCHER_API_KEY;
  }

  const output = lines.join('\n');
  assert.match(output, /API key: from TRADESEARCHER_API_KEY \(not saved\)/);
  assert.match(output, /Account: premium/);
});

test('auth status reports request errors without a raw stack', async () => {
  const lines = [];
  const errors = [];
  process.exitCode = 0;
  process.env.TRADESEARCHER_API_URL = 'https://example.test';
  process.env.TRADESEARCHER_API_KEY = 'ts_test_from_env';

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error('fetch failed');
  };

  try {
    await main(['auth', 'status'], {
      log: (message) => lines.push(message),
      error: (message) => errors.push(message),
    });
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.TRADESEARCHER_API_URL;
    delete process.env.TRADESEARCHER_API_KEY;
  }

  assert.equal(lines.length, 0);
  assert.deepEqual(errors, ['TradeSearcher error: fetch failed']);
  assert.equal(process.exitCode, 1);
  process.exitCode = 0;
});

test('backtest details and trades print readable sections', async () => {
  const lines = [];
  const requestedUrls = [];
  process.env.TRADESEARCHER_API_URL = 'https://example.test';
  process.env.TRADESEARCHER_API_KEY = 'ts_test_from_env';

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    requestedUrls.push(String(url));
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({
          data: {
            id: 839,
            symbol: { name: 'BINANCE:LTCUSD' },
            strategy: { name: 'Bollinger + RSI' },
            timeframe: '15',
            strategyType: 'intraday',
            period: { from: '2024-01-01', to: '2024-12-31' },
            metrics: {
              netProfitPercent: 0.93,
              buyHoldReturnPercent: 0.12,
              profitFactor: 2.86,
              sharpeRatio: 0.79,
              sortinoRatio: 1.1,
              maxDrawdownPercent: 0.3,
              percentProfitable: 0.62,
              totalTrades: 22,
              winningTrades: 14,
              losingTrades: 8,
              avgTradePercent: 0.04,
            },
            recentTrades: [
              {
                entry: { type: 'long', value: 100, time: 1710000000 },
                exit: { value: 105, time: 1710100000 },
                profit: { p: 5 },
              },
              {
                entry: { type: 'long', value: 106, time: 1710200000 },
                exit: { value: 108, time: 1710300000 },
                profit: { p: 2 },
              },
            ],
          },
          account: { tier: 'premium' },
          limits: { isLimited: false },
        });
      },
    };
  };

  try {
    await main(['backtest', '839', '--details', '--trades', '--trade-limit', '1'], {
      log: (message) => lines.push(message),
      error: (message) => lines.push(message),
    });
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.TRADESEARCHER_API_URL;
    delete process.env.TRADESEARCHER_API_KEY;
  }

  const output = lines.join('\n');
  assert.match(requestedUrls[0], /includeTrades=true/);
  assert.match(output, /Performance/);
  assert.match(output, /Risk \/ quality/);
  assert.match(output, /Recent trades/);
  assert.match(output, /long/);
  assert.match(output, /profit 5%/);
  assert.match(output, /Reported closed trades: 22/);
  assert.match(output, /Returned rows can include open trades/);
});

test('backtest JSON respects trade limit', async () => {
  const lines = [];
  process.env.TRADESEARCHER_API_URL = 'https://example.test';
  process.env.TRADESEARCHER_API_KEY = 'ts_test_from_env';

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    async text() {
      return JSON.stringify({
        data: {
          id: 839,
          symbol: { name: 'BINANCE:LTCUSD' },
          strategy: { name: 'Bollinger + RSI' },
          timeframe: '15',
          metrics: { netProfitPercent: 0.93, profitFactor: 2.86, sharpeRatio: 0.79, maxDrawdownPercent: 0.3, totalTrades: 22 },
          recentTrades: [{ id: 1 }, { id: 2 }, { id: 3 }],
          trades: [{ id: 1 }, { id: 2 }],
        },
        account: { tier: 'premium' },
        limits: { isLimited: false },
      });
    },
  });

  try {
    await main(['backtest', '839', '--json', '--trades', '--trade-limit', '1'], {
      log: (message) => lines.push(message),
      error: (message) => lines.push(message),
    });
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.TRADESEARCHER_API_URL;
    delete process.env.TRADESEARCHER_API_KEY;
  }

  const parsed = JSON.parse(lines.join('\n'));
  assert.equal(parsed.data.recentTrades.length, 1);
  assert.equal(parsed.data.trades.length, 1);
  assert.equal(parsed.data.tradeResultInfo.recentTradesTotalBeforeLimit, 3);
});

test('strategy prints human-readable details and source code', async () => {
  const lines = [];
  process.env.TRADESEARCHER_API_URL = 'https://example.test';
  process.env.TRADESEARCHER_API_KEY = 'ts_test_from_env';

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    async text() {
      return JSON.stringify({
        data: {
          id: 31,
          tvId: 'PUB;1',
          name: 'Range Filter Buy and Sell 5min [Strategy]',
          description: 'Range filter strategy.',
          symbol: { name: 'BINANCE:LTCUSD' },
          author: { name: 'TradeSearcher' },
          strategyType: 'intraday',
          summary: 'Looks for range breakouts.',
          entryCriteria: ['Break above range'],
          exitCriteria: ['Stop loss or take profit'],
          indicators: ['Range filter'],
          repainting: { repainting: false, totalChecks: 5, passedChecks: 5, warningChecks: 0, errorChecks: 0 },
          averages: { tests: 12, netProfitPercent: 2.5, profitFactor: 1.8, sharpeRatio: 0.7, maxDrawdownPercent: 0.4 },
          sourceAvailability: 'available',
          sourceAvailable: true,
          sourceCode: 'strategy("Range Filter")',
        },
        account: { tier: 'premium' },
        limits: { isLimited: false },
      });
    },
  });

  try {
    await main(['strategy', '31', '--source'], {
      log: (message) => lines.push(message),
      error: (message) => lines.push(message),
    });
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.TRADESEARCHER_API_URL;
    delete process.env.TRADESEARCHER_API_KEY;
  }

  const output = lines.join('\n');
  assert.match(output, /strategy #31/);
  assert.match(output, /source available/);
  assert.doesNotMatch(output, /symbol #31/);
  assert.match(output, /Averages/);
  assert.match(output, /Source code/);
  assert.match(output, /strategy\("Range Filter"\)/);
});

test('schema command prints command JSON schemas', async () => {
  const lines = [];

  await main(['schema', 'backtest'], {
    log: (message) => lines.push(message),
    error: (message) => lines.push(message),
  });

  const parsed = JSON.parse(lines.join('\n'));
  assert.equal(parsed.backtest.flags.trades.type, 'boolean');
  assert.equal(parsed.backtest.flags.equity.type, 'boolean');
  assert.match(parsed.backtest.responseHints.join(' '), /machine-readable trades/);
});

test('export writes Pine source for a backtest strategy', async () => {
  const lines = [];
  const requestedUrls = [];
  const outFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tradesearcher-cli-')), 'strategy.pine');
  process.env.TRADESEARCHER_API_URL = 'https://example.test';
  process.env.TRADESEARCHER_API_KEY = 'ts_test_from_env';

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    requestedUrls.push(String(url));
    const isBacktest = String(url).includes('/api/agent/backtests/839');
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify(isBacktest
          ? {
              data: {
                id: 839,
                strategy: { id: 31, name: 'Range Filter', sourceAvailability: 'available', sourceAvailable: true },
                symbol: { name: 'BINANCE:LTCUSD' },
                metrics: { netProfitPercent: 1, profitFactor: 2, sharpeRatio: 0.5, maxDrawdownPercent: 0.2, totalTrades: 20 },
              },
              account: { tier: 'premium' },
              limits: { isLimited: false },
            }
          : {
              data: {
                id: 31,
                name: 'Range Filter',
                sourceAvailability: 'available',
                sourceAvailable: true,
                sourceCode: 'strategy("Range Filter")',
              },
              account: { tier: 'premium' },
              limits: { isLimited: false },
            });
      },
    };
  };

  try {
    await main(['export', '839', '--pine', '--out', outFile], {
      log: (message) => lines.push(message),
      error: (message) => lines.push(message),
    });
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.TRADESEARCHER_API_URL;
    delete process.env.TRADESEARCHER_API_KEY;
  }

  assert.match(requestedUrls[0], /backtests\/839/);
  assert.match(requestedUrls[1], /strategies\/31/);
  assert.match(requestedUrls[1], /includeSourceCode=true/);
  assert.equal(fs.readFileSync(outFile, 'utf8'), 'strategy("Range Filter")');
  assert.match(lines.join('\n'), /Exported Pine source/);
});

test('strategy source message is specific for premium accounts when missing', async () => {
  const lines = [];
  process.env.TRADESEARCHER_API_URL = 'https://example.test';
  process.env.TRADESEARCHER_API_KEY = 'ts_test_from_env';

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    async text() {
      return JSON.stringify({
        data: {
          id: 83,
          name: 'Advanced MA Cross/MACD Strategy',
          averages: { netProfitPercent: 1.2, profitFactor: 1.3, sharpeRatio: 0.4 },
          repainting: { repainting: false },
        },
        account: { tier: 'premium' },
        limits: { isLimited: false },
      });
    },
  });

  try {
    await main(['strategy', '83', '--source'], {
      log: (message) => lines.push(message),
      error: (message) => lines.push(message),
    });
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.TRADESEARCHER_API_URL;
    delete process.env.TRADESEARCHER_API_KEY;
  }

  const output = lines.join('\n');
  assert.match(output, /Source code is not available for this strategy/);
  assert.doesNotMatch(output, /require Premium/);
});

test('compare prints a readable table by default', async () => {
  const lines = [];
  process.env.TRADESEARCHER_API_URL = 'https://example.test';
  process.env.TRADESEARCHER_API_KEY = 'ts_test_from_env';

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const id = String(url).includes('/84') ? 84 : 203;
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({
          data: {
            id,
            symbol: { name: id === 84 ? 'BINANCE:BTCUSD' : 'NASDAQ:AAPL' },
            strategy: {
              name: id === 84 ? 'Advanced MA Cross' : 'VWAP Strategy',
              sourceAvailability: id === 84 ? 'available' : 'no',
              sourceAvailable: id === 84,
            },
            timeframe: id === 84 ? '15' : '60',
            metrics: {
              netProfitPercent: id === 84 ? 1.2 : 2.3,
              profitFactor: id === 84 ? 1.4 : 1.8,
              sharpeRatio: id === 84 ? 0.3 : 0.6,
              maxDrawdownPercent: id === 84 ? 0.2 : 0.4,
              totalTrades: id === 84 ? 50 : 80,
            },
          },
          account: { tier: 'premium' },
          limits: { isLimited: false },
        });
      },
    };
  };

  try {
    await main(['compare', '84', '203'], {
      log: (message) => lines.push(message),
      error: (message) => lines.push(message),
    });
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.TRADESEARCHER_API_URL;
    delete process.env.TRADESEARCHER_API_KEY;
  }

  const output = lines.join('\n');
  assert.match(output, /Backtest/);
  assert.match(output, /#84/);
  assert.match(output, /BINANCE:BTCUSD/);
  assert.match(output, /VWAP Strategy/);
  assert.match(output, /Source/);
  assert.match(output, /available/);
  assert.doesNotMatch(output, /^\{/m);
});

test('invalid flags and values fail before request', async () => {
  const errors = [];
  process.exitCode = 0;
  process.env.TRADESEARCHER_API_URL = 'https://example.test';
  process.env.TRADESEARCHER_API_KEY = 'ts_test_from_env';

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error('fetch should not run');
  };

  try {
    await main(['search', 'BTCUSD', '--sort', 'bad-sort'], {
      log: () => {},
      error: (message) => errors.push(message),
    });
    await main(['search', 'BTCUSD', '--unknown'], {
      log: () => {},
      error: (message) => errors.push(message),
    });
    await main(['backtest', 'abc'], {
      log: () => {},
      error: (message) => errors.push(message),
    });
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.TRADESEARCHER_API_URL;
    delete process.env.TRADESEARCHER_API_KEY;
  }

  assert.match(errors[0], /Bad --sort value/);
  assert.match(errors[1], /Unknown option: --unknown/);
  assert.match(errors[2], /Bad backtest id/);
  assert.equal(process.exitCode, 1);
  process.exitCode = 0;
});

test('backtest accepts spaced trades typo', async () => {
  const lines = [];
  const requestedUrls = [];
  process.env.TRADESEARCHER_API_URL = 'https://example.test';
  process.env.TRADESEARCHER_API_KEY = 'ts_test_from_env';

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    requestedUrls.push(String(url));
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({
          data: {
            id: 839,
            symbol: { name: 'BINANCE:LTCUSD' },
            strategy: { name: 'Bollinger + RSI' },
            timeframe: '15',
            metrics: { netProfitPercent: 0.93, profitFactor: 2.86, sharpeRatio: 0.79, maxDrawdownPercent: 0.3, totalTrades: 22 },
            recentTrades: [],
          },
          account: { tier: 'premium' },
          limits: { isLimited: false },
        });
      },
    };
  };

  try {
    await main(['backtest', '839', '--', 'trades'], {
      log: (message) => lines.push(message),
      error: (message) => lines.push(message),
    });
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.TRADESEARCHER_API_URL;
    delete process.env.TRADESEARCHER_API_KEY;
  }

  assert.match(requestedUrls[0], /includeTrades=true/);
});
