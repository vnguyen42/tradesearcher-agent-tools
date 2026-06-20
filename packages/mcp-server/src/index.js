#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createClient, limitTradesInResponse } from '@tradesearcher/core';

const client = createClient();

const tools = [
  {
    name: 'search_symbols',
    description: 'Search TradeSearcher symbols and see how a ticker like AAPL maps to a full prefixed symbol like NASDAQ:AAPL.',
    inputSchema: {
      type: 'object',
      required: ['query'],
      properties: {
        query: { type: 'string' },
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'search_backtests',
    description: 'Search existing TradeSearcher backtests by symbol, market, timeframe, strategy type, and metrics.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string' },
        market: { type: 'string', enum: ['crypto', 'stock', 'forex', 'futures'] },
        timeframe: { type: 'string' },
        strategyType: { type: 'string', enum: ['intraday', 'swing', 'longTerm'] },
        minSharpe: { type: 'number' },
        minProfitFactor: { type: 'number' },
        maxDrawdown: { type: 'number' },
        sort: { type: 'string', enum: ['sharpe', 'sharpeRatio', 'profitFactor', 'roi', 'netProfitPercent', 'latestTradeDate', 'robustness'] },
        order: { type: 'string', enum: ['desc', 'asc'] },
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'get_backtest',
    description: 'Get one TradeSearcher backtest. Trades and equity curves may require Premium.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'number' },
        includeTrades: { type: 'boolean' },
        tradeLimit: { type: 'number', description: 'Maximum returned trade rows. Default 20 when includeTrades is true.' },
        includeEquityCurve: { type: 'boolean' },
      },
    },
  },
  {
    name: 'get_strategy',
    description: 'Get one TradeSearcher strategy. Source code may require Premium.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'number' },
        includeSourceCode: { type: 'boolean' },
      },
    },
  },
  {
    name: 'get_best_for_symbol',
    description: 'Get top ranked TradeSearcher backtests for a symbol.',
    inputSchema: {
      type: 'object',
      required: ['symbol'],
      properties: {
        symbol: { type: 'string' },
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'compare_backtests',
    description: 'Compare several TradeSearcher backtests in a compact table.',
    inputSchema: {
      type: 'object',
      required: ['ids'],
      properties: {
        ids: { type: 'array', items: { type: 'number' } },
      },
    },
  },
  {
    name: 'get_account_status',
    description: 'Show the current TradeSearcher account tier, limits, and upgrade link.',
    inputSchema: { type: 'object', properties: {} },
  },
];

const server = new Server(
  { name: 'tradesearcher', version: '0.1.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const args = request.params.arguments || {};
  let result;
  switch (request.params.name) {
    case 'search_symbols':
      result = await client.searchSymbols(args);
      break;
    case 'search_backtests':
      result = await client.searchBacktests(args);
      result = await withSymbolSuggestions(result, args.symbol);
      break;
    case 'get_backtest':
      result = await client.getBacktest(args.id, args);
      if (args.includeTrades) result = limitTradesInResponse(result, args.tradeLimit || 20);
      break;
    case 'get_strategy':
      result = await client.getStrategy(args.id, args);
      break;
    case 'get_best_for_symbol':
      result = await client.getBestForSymbol(args.symbol, args);
      result = await withSymbolSuggestions(result, args.symbol);
      break;
    case 'compare_backtests':
      result = await client.compareBacktests(args.ids);
      break;
    case 'get_account_status':
      result = await client.getAccountStatus();
      break;
    default:
      throw new Error(`Unknown tool: ${request.params.name}`);
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
});

const transport = new StdioServerTransport();
await server.connect(transport);

async function withSymbolSuggestions(response, input) {
  if (!input || hasRows(response) || response?.meta?.symbolMatch?.matched) return response;
  const suggestions = await client.searchSymbols({ query: input, limit: 5 });
  const data = Array.isArray(suggestions?.data) ? suggestions.data : [];
  if (data.length === 0) return response;
  return {
    ...response,
    meta: {
      ...(response.meta || {}),
      symbolSuggestions: data,
    },
  };
}

function hasRows(response) {
  return Array.isArray(response?.data) ? response.data.length > 0 : Boolean(response?.data);
}
