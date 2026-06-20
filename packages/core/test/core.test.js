import test from 'node:test';
import assert from 'node:assert/strict';
import { TradeSearcherClient, compactAgentResponse, compactBacktestForComparison, formatLimitNotice, limitTradesInResponse, summarizeBacktest } from '../src/index.js';

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
    strategy: { id: 456, name: 'Trend Strategy', sourceAvailability: 'available', sourceAvailable: true },
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
  assert.match(summary, /source available/);
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
    sourceAvailability: 'available',
    sourceAvailable: true,
  });
});

test('compact response keeps the agent-useful fields and removes noisy metrics by default', () => {
  const compact = compactAgentResponse({
    data: {
      id: 123,
      symbol: { id: 1, name: 'BINANCE:BTCUSD', ticker: 'BTCUSD', type: 'crypto', ignored: 'x' },
      strategy: { id: 456, name: 'Trend Strategy', sourceAvailability: 'available', sourceAvailable: true, description: 'long text' },
      timeframe: '60',
      metrics: {
        netProfitPercent: 22.1,
        profitFactor: 1.91,
        sharpeRatio: 1.45,
        maxDrawdownPercent: 0.44,
        totalTrades: 84,
        grossProfit: 999,
      },
    },
    account: { tier: 'premium', internal: true },
    limits: { isLimited: false },
  });

  assert.deepEqual(compact.data.metrics, {
    netProfitPercent: 22.1,
    profitFactor: 1.91,
    sharpeRatio: 1.45,
    maxDrawdownPercent: 0.44,
    totalTrades: 84,
  });
  assert.equal(compact.data.strategy.sourceAvailability, 'available');
  assert.equal(compact.data.symbol.ignored, undefined);
  assert.equal(compact.account.internal, undefined);
});

test('compact response preserves compare rows', () => {
  const compact = compactAgentResponse({
    data: [{
      id: 84,
      symbol: 'BINANCE:BTCUSD',
      strategy: 'Advanced MA Cross',
      timeframe: '15',
      netProfitPercent: 1.2,
      profitFactor: 1.4,
      sharpeRatio: 0.3,
      maxDrawdownPercent: 0.2,
      totalTrades: 50,
      sourceAvailability: 'available',
      sourceAvailable: true,
      noisy: 'drop me',
    }],
  });

  assert.deepEqual(compact.data[0], {
    id: 84,
    symbol: 'BINANCE:BTCUSD',
    strategy: 'Advanced MA Cross',
    timeframe: '15',
    netProfitPercent: 1.2,
    profitFactor: 1.4,
    sharpeRatio: 0.3,
    maxDrawdownPercent: 0.2,
    totalTrades: 50,
    sourceAvailability: 'available',
    sourceAvailable: true,
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
