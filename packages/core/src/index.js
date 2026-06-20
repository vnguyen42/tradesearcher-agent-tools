const DEFAULT_API_BASE_URL = 'https://strapi.tradesearcher.ai';

export class TradeSearcherError extends Error {
  constructor(message, { status, response } = {}) {
    super(message);
    this.name = 'TradeSearcherError';
    this.status = status;
    this.response = response;
  }
}

export class TradeSearcherClient {
  constructor(options = {}) {
    this.apiBaseUrl = stripTrailingSlash(
      options.apiBaseUrl || process.env.TRADESEARCHER_API_URL || DEFAULT_API_BASE_URL,
    );
    this.apiKey = options.apiKey || process.env.TRADESEARCHER_API_KEY || null;
    this.fetchImpl = options.fetch || globalThis.fetch;
    if (!this.fetchImpl) {
      throw new TradeSearcherError('Node 18+ is required because TradeSearcher uses fetch.');
    }
  }

  async getAccountStatus() {
    return this.request('/api/agent/account');
  }

  async searchBacktests(params = {}) {
    return this.request('/api/agent/search-backtests', params);
  }

  async searchSymbols(params = {}) {
    return this.request('/api/agent/symbols', params);
  }

  async getBacktest(id, params = {}) {
    requireValue(id, 'backtest id');
    return this.request(`/api/agent/backtests/${encodeURIComponent(id)}`, params);
  }

  async getStrategy(id, params = {}) {
    requireValue(id, 'strategy id');
    return this.request(`/api/agent/strategies/${encodeURIComponent(id)}`, params);
  }

  async getBestForSymbol(symbol, params = {}) {
    requireValue(symbol, 'symbol');
    return this.request('/api/agent/best-for-symbol', { ...params, symbol });
  }

  async compareBacktests(ids = [], params = {}) {
    const backtestIds = Array.isArray(ids) ? ids : String(ids).split(',');
    const responses = [];
    for (const id of backtestIds.map((value) => String(value).trim()).filter(Boolean)) {
      const response = await this.getBacktest(id, params);
      responses.push(response);
    }
    return {
      data: responses.map((response) => compactBacktestForComparison(response.data)),
      account: responses[0]?.account,
      limits: mergeLimitNotices(responses.map((response) => response?.limits)),
    };
  }

  async request(path, params = {}) {
    const url = new URL(`${this.apiBaseUrl}${path}`);
    for (const [key, value] of Object.entries(params || {})) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, String(value));
    }

    const headers = { Accept: 'application/json' };
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;

    const response = await this.fetchImpl(url, { headers });
    const body = await readJsonResponse(response);
    if (!response.ok) {
      throw new TradeSearcherError(body?.error?.message || body?.limits?.message || body?.message || `TradeSearcher request failed (${response.status})`, {
        status: response.status,
        response: body,
      });
    }
    return body;
  }
}

export function createClient(options = {}) {
  return new TradeSearcherClient(options);
}

export function formatLimitNotice(response) {
  const limits = response?.limits;
  if (!limits || !limits.isLimited) return '';
  const parts = [limits.message, limits.upgradeCallToAction, limits.upgradeUrl].filter(Boolean);
  return parts.join(' ');
}

export function compactBacktestForComparison(backtest) {
  if (!backtest) return null;
  return {
    id: backtest.id,
    symbol: backtest.symbol?.name,
    strategy: backtest.strategy?.name,
    timeframe: backtest.timeframe,
    strategyType: backtest.strategyType,
    netProfitPercent: backtest.metrics?.netProfitPercent,
    profitFactor: backtest.metrics?.profitFactor,
    sharpeRatio: backtest.metrics?.sharpeRatio,
    sortinoRatio: backtest.metrics?.sortinoRatio,
    maxDrawdownPercent: backtest.metrics?.maxDrawdownPercent,
    totalTrades: backtest.metrics?.totalTrades,
    latestTradeDate: backtest.latestTradeDate,
    hiddenStrategyDetails: backtest.premium?.hiddenStrategyDetails,
    sourceAvailability: backtest.strategy?.sourceAvailability,
  };
}

export function limitTradesInResponse(response, limit = 20) {
  const parsedLimit = Math.max(1, parseInt(limit, 10) || 20);
  const limitBacktest = (backtest) => limitBacktestTrades(backtest, parsedLimit);
  const data = Array.isArray(response?.data)
    ? response.data.map((item) => item?.backtest ? { ...item, backtest: limitBacktest(item.backtest) } : limitBacktest(item))
    : response?.data?.backtest ? { ...response.data, backtest: limitBacktest(response.data.backtest) } : limitBacktest(response?.data);

  return {
    ...response,
    data,
  };
}

export function summarizeBacktest(backtest) {
  if (!backtest) return 'No backtest found.';
  const metric = backtest.metrics || {};
  return [
    `backtest #${backtest.id}`,
    backtest.strategy?.id ? `strategy #${backtest.strategy.id}` : null,
    backtest.symbol?.name,
    backtest.strategy?.name,
    backtest.timeframe,
    backtest.latestTradeDate ? `latest ${formatDate(backtest.latestTradeDate)}` : backtest.period?.to ? `to ${formatDate(backtest.period.to)}` : null,
    `ROI ${formatNumber(metric.netProfitPercent)}%`,
    `PF ${formatNumber(metric.profitFactor)}`,
    `Sharpe ${formatNumber(metric.sharpeRatio)}`,
    `DD ${formatNumber(metric.maxDrawdownPercent)}%`,
    `${metric.totalTrades ?? '?'} trades`,
    backtest.strategy?.sourceAvailability ? `source ${backtest.strategy.sourceAvailability}` : null,
  ].filter(Boolean).join(' | ');
}

function limitBacktestTrades(backtest, limit) {
  if (!backtest || typeof backtest !== 'object') return backtest;
  const next = { ...backtest };
  for (const key of ['recentTrades', 'trades']) {
    if (!Array.isArray(backtest[key])) continue;
    next[key] = backtest[key].slice(0, limit);
    next.tradeResultInfo = {
      ...(next.tradeResultInfo || {}),
      [`${key}Returned`]: next[key].length,
      [`${key}TotalBeforeLimit`]: backtest[key].length,
      appliedTradeLimit: limit,
    };
  }
  return next;
}

function mergeLimitNotices(limits) {
  return limits.find((limit) => limit?.isLimited) || limits.find(Boolean) || null;
}

function stripTrailingSlash(value) {
  return String(value).replace(/\/+$/, '');
}

function requireValue(value, label) {
  if (value === undefined || value === null || value === '') {
    throw new TradeSearcherError(`Missing ${label}.`);
  }
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (error) {
    return { message: text };
  }
}

function formatNumber(value) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return '?';
  return Number(value).toFixed(2);
}

function formatDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString().slice(0, 10);
}
