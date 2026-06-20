import test from 'node:test';
import assert from 'node:assert/strict';
import { TradeSearcherClient, compactBacktestForComparison, formatLimitNotice, limitTradesInResponse, summarizeBacktest } from '../src/index.js';

test('client sends API key and query params', async () => {
  const seen = {};
  const client = new TradeSearcherClient({
    apiBaseUrl: 'https://example.test',
    apiKey: 'ts_test',
    fetch: async (url, options) => {
      seen.url = String(url);
      seen.headers = options.headers;
      return jsonResponse({ data: [], account: { tier: 'free' }, limits: { isLimited: false } });
    },
  });

  await client.searchBacktests({ symbol: 'BTCUSD', limit: 3 });

  assert.equal(seen.url, 'https://example.test/api/agent/search-backtests?symbol=BTCUSD&limit=3');
  assert.equal(seen.headers.Authorization, 'Bearer ts_test');
});

test('client can search symbols', async () => {
  const seen = {};
  const client = new TradeSearcherClient({
    apiBaseUrl: 'https://example.test',
    apiKey: 'ts_test',
    fetch: async (url) => {
      seen.url = String(url);
      return jsonResponse({ data: [], account: { tier: 'free' }, limits: { isLimited: false } });
    },
  });

  await client.searchSymbols({ query: 'AAPL', limit: 5 });

  assert.equal(seen.url, 'https://example.test/api/agent/symbols?query=AAPL&limit=5');
});

test('client uses agent limit message for API errors', async () => {
  const client = new TradeSearcherClient({
    apiBaseUrl: 'https://example.test',
    apiKey: 'ts_bad',
    fetch: async () => jsonResponse({
      data: null,
      limits: {
        isLimited: true,
        reason: 'invalid_api_key',
        message: 'This TradeSearcher API key is invalid. Create a new key in your account page.',
      },
    }, { ok: false, status: 401 }),
  });

  await assert.rejects(
    () => client.getAccountStatus(),
    /This TradeSearcher API key is invalid/,
  );
});

test('format helpers produce compact trader-readable output', () => {
  const backtest = {
    id: 123,
    symbol: { name: 'BTCUSD' },
    strategy: { id: 456, name: 'Trend Strategy' },
    timeframe: '60',
    latestTradeDate: '2026-01-02T00:00:00.000Z',
    metrics: {
      netProfitPercent: 22.1234,
      profitFactor: 1.91,
      sharpeRatio: 1.456,
      maxDrawdownPercent: 0.44,
      totalTrades: 84,
    },
    premium: { hiddenStrategyDetails: false },
  };

  const summary = summarizeBacktest(backtest);
  assert.match(summary, /backtest #123/);
  assert.match(summary, /strategy #456/);
  assert.match(summary, /BTCUSD/);
  assert.match(summary, /latest 2026-01-02/);
  assert.deepEqual(compactBacktestForComparison(backtest), {
    id: 123,
    symbol: 'BTCUSD',
    strategy: 'Trend Strategy',
    timeframe: '60',
    strategyType: undefined,
    netProfitPercent: 22.1234,
    profitFactor: 1.91,
    sharpeRatio: 1.456,
    sortinoRatio: undefined,
    maxDrawdownPercent: 0.44,
    totalTrades: 84,
    latestTradeDate: '2026-01-02T00:00:00.000Z',
    hiddenStrategyDetails: false,
  });
});

test('limit notice includes upgrade wording', () => {
  const notice = formatLimitNotice({
    limits: {
      isLimited: true,
      message: 'Some details are hidden.',
      upgradeCallToAction: 'Upgrade to Premium.',
      upgradeUrl: 'https://tradesearcher.ai/app/premium',
    },
  });

  assert.match(notice, /Upgrade to Premium/);
  assert.match(notice, /tradesearcher.ai/);
});

test('trade limiter trims backtest trade arrays and records totals', () => {
  const response = {
    data: {
      id: 1,
      recentTrades: [{ id: 1 }, { id: 2 }, { id: 3 }],
      trades: [{ id: 1 }, { id: 2 }],
    },
  };

  const limited = limitTradesInResponse(response, 1);

  assert.equal(limited.data.recentTrades.length, 1);
  assert.equal(limited.data.trades.length, 1);
  assert.equal(limited.data.tradeResultInfo.recentTradesTotalBeforeLimit, 3);
  assert.equal(limited.data.tradeResultInfo.tradesTotalBeforeLimit, 2);
  assert.equal(limited.data.tradeResultInfo.appliedTradeLimit, 1);
});

function jsonResponse(body, init = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    async text() {
      return JSON.stringify(body);
    },
  };
}
