#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { createClient, formatLimitNotice, summarizeBacktest, compactBacktestForComparison, limitTradesInResponse } from '@tradesearcher/core';

const CONFIG_DIR = path.join(os.homedir(), '.tradesearcher');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const ALLOWED_SORTS = ['sharpe', 'sharpeRatio', 'profitFactor', 'roi', 'netProfitPercent', 'latestTradeDate', 'robustness'];
const ALLOWED_MARKETS = ['crypto', 'stock', 'forex', 'futures'];
const ALLOWED_STRATEGY_TYPES = ['intraday', 'swing', 'longTerm'];
const ALLOWED_ORDERS = ['asc', 'desc'];
const VALUE_FLAGS = new Set([
  'apiKey',
  'apiUrl',
  'limit',
  'tradeLimit',
  'market',
  'timeframe',
  'strategyType',
  'minSharpe',
  'minProfitFactor',
  'maxDrawdown',
  'sort',
  'order',
  'out',
]);
const BOOLEAN_FLAGS = new Set(['json', 'help', 'details', 'trades', 'equity', 'curves', 'source', 'pine']);
const ALLOWED_FLAGS = new Set([...VALUE_FLAGS, ...BOOLEAN_FLAGS]);
const COMMAND_SCHEMAS = {
  auth: {
    description: 'Save or inspect the TradeSearcher API key.',
    positional: [{ name: 'subcommand', enum: ['login', 'status'], required: false }],
    flags: commonFlags(),
  },
  symbols: {
    description: 'Search symbols before searching backtests.',
    positional: [{ name: 'query', type: 'string', required: true }],
    flags: { ...commonFlags(), limit: numberFlag('Number of symbols to return.') },
  },
  search: {
    description: 'Search existing backtests.',
    positional: [{ name: 'symbol', type: 'string', required: true }],
    flags: {
      ...commonFlags(),
      limit: numberFlag('Number of backtests to return.'),
      market: enumFlag(ALLOWED_MARKETS),
      timeframe: stringFlag('Example: 60, 240, D.'),
      strategyType: enumFlag(ALLOWED_STRATEGY_TYPES),
      minSharpe: numberFlag('Minimum Sharpe ratio.'),
      minProfitFactor: numberFlag('Minimum profit factor.'),
      maxDrawdown: numberFlag('Maximum drawdown percent.'),
      sort: enumFlag(ALLOWED_SORTS),
      order: enumFlag(ALLOWED_ORDERS),
    },
    responseHints: ['Use --json for full response shape.', 'Rows include strategy.sourceAvailability when the backend knows it.'],
  },
  best: {
    description: 'Get top ranked backtests for a symbol.',
    positional: [{ name: 'symbol', type: 'string', required: true }],
    flags: { ...commonFlags(), limit: numberFlag('Number of backtests to return.') },
    responseHints: ['Rows include strategy.sourceAvailability when the backend knows it.'],
  },
  backtest: {
    description: 'Get one backtest with optional performance details, trades, and curves.',
    positional: [{ name: 'backtestId', type: 'integer', required: true }],
    flags: {
      ...commonFlags(),
      details: booleanFlag('Print all performance metric groups.'),
      trades: booleanFlag('Request and print trades. Premium may be required.'),
      tradeLimit: numberFlag('Number of trades to print.'),
      equity: booleanFlag('Request equity and drawdown curves. Can be large in JSON.'),
      curves: booleanFlag('Alias for --equity.'),
    },
    responseHints: ['Use --json --trades for machine-readable trades.', 'Use --json --equity for machine-readable equity and drawdown curves.'],
  },
  strategy: {
    description: 'Get one strategy and optionally source code.',
    positional: [{ name: 'strategyId', type: 'integer', required: true }],
    flags: { ...commonFlags(), source: booleanFlag('Request Pine source code. Premium and source availability may be required.') },
    responseHints: ['Use --json --source for machine-readable sourceCode.', 'sourceAvailability is yes, no, or private.'],
  },
  export: {
    description: 'Export Pine source for a backtest strategy.',
    positional: [{ name: 'backtestId', type: 'integer', required: true }],
    flags: {
      ...commonFlags(),
      pine: booleanFlag('Export Pine source code. Required for now.'),
      out: stringFlag('Output file path, for example file.pine. Required.'),
    },
    responseHints: ['Fails clearly if the backtest has no strategy id or the strategy source is unavailable.'],
  },
  compare: {
    description: 'Compare several backtests in a compact table.',
    positional: [{ name: 'backtestIds', type: 'integer[]', required: true, minItems: 2 }],
    flags: commonFlags(),
  },
  schema: {
    description: 'Print JSON schemas for CLI commands.',
    positional: [{ name: 'command', type: 'string', required: false }],
    flags: commonFlags(),
  },
};

export async function main(argv = process.argv.slice(2), io = console) {
  try {
    const { command, args, flags } = parseArgs(argv);
    validateArgs(command, args, flags);
    const config = readConfig();
    const client = createClient({
      apiKey: flags.apiKey || process.env.TRADESEARCHER_API_KEY || config.apiKey,
      apiBaseUrl: flags.apiUrl || process.env.TRADESEARCHER_API_URL || config.apiBaseUrl,
    });

    if (!command || command === 'help' || flags.help) return printHelp(io);
    if (command === 'schema' || command === 'schemas') return printSchemas(args[0], io);
    if (command === 'auth') return await handleAuth(args, flags, client, io);
    if (command === 'symbols' || command === 'symbol') return printResponse(await client.searchSymbols({ query: args[0], limit: flags.limit }), flags, io);
    if (command === 'search') {
      const response = await withSymbolSuggestions(client, await client.searchBacktests({ symbol: args[0], ...pickSearchFlags(flags) }), args[0]);
      return printResponse(response, flags, io);
    }
    if (command === 'best') {
      const response = await withSymbolSuggestions(client, await client.getBestForSymbol(args[0], { limit: flags.limit }), args[0]);
      return printResponse(response, flags, io);
    }
    if (command === 'backtest') return printResponse(await client.getBacktest(args[0], {
      includeTrades: flags.trades || args.includes('trades'),
      includeEquityCurve: flags.equity || flags.curves || args.includes('equity') || args.includes('curves'),
    }), flags, io);
    if (command === 'strategy') return printResponse(await client.getStrategy(args[0], {
      includeSourceCode: flags.source,
    }), flags, io);
    if (command === 'export') return await handleExport(args, flags, client, io);
    if (command === 'compare') {
      const responses = [];
      for (const id of args) responses.push(await client.getBacktest(id));
      const response = {
        data: responses.map((item) => compactBacktestForComparison(item.data)),
        account: responses[0]?.account,
        limits: responses.find((item) => item?.limits?.isLimited)?.limits || responses[0]?.limits,
      };
      return printResponse(response, flags, io);
    }
    throw new Error(`Unknown command: ${command}`);
  } catch (error) {
    io.error(`TradeSearcher error: ${error.message}`);
    process.exitCode = 1;
  }
}

async function handleAuth(args, flags, client, io) {
  const subcommand = args[0] || 'status';
  if (subcommand === 'status') {
    const config = readConfig();
    const response = await client.getAccountStatus();
    const apiKeySource = getApiKeySource(flags, config);
    if (flags.json) {
      io.log(JSON.stringify({ savedApiKey: Boolean(config.apiKey), apiKeySource, ...response }, null, 2));
      return;
    }
    io.log(`API key: ${formatApiKeyStatus(apiKeySource)}`);
    io.log(`Account: ${response.account?.tier || 'unknown'}`);
    if (response.account?.limitSummary) io.log(response.account.limitSummary);
    return;
  }
  if (subcommand === 'login') {
    let apiKey = args[1] || flags.apiKey;
    if (!apiKey) {
      const rl = readline.createInterface({ input, output });
      apiKey = await rl.question('Paste your TradeSearcher API key: ');
      rl.close();
    }
    writeConfig({ ...readConfig(), apiKey: apiKey.trim() });
    io.log('TradeSearcher API key saved.');
    return;
  }
  throw new Error(`Unknown auth command: ${subcommand}`);
}

async function handleExport(args, flags, client, io) {
  if (!flags.pine) throw new Error('Missing --pine. Example: tradesearcher export 12345 --pine --out strategy.pine');
  if (!flags.out) throw new Error('Missing --out file. Example: tradesearcher export 12345 --pine --out strategy.pine');

  const backtestResponse = await client.getBacktest(args[0]);
  const backtest = backtestResponse.data;
  const strategyId = backtest?.strategy?.id;
  if (!strategyId) {
    throw new Error('This backtest does not expose a strategy id. Try another backtest or use a Premium API key.');
  }

  const strategyResponse = await client.getStrategy(strategyId, { includeSourceCode: true });
  const strategy = strategyResponse.data;
  if (!strategy?.sourceCode) {
    const availability = strategy?.sourceAvailability || 'unknown';
    throw new Error(`Pine source is not available for strategy ${strategyId}. Source availability: ${availability}.`);
  }

  fs.writeFileSync(flags.out, strategy.sourceCode, 'utf8');
  io.log(`Exported Pine source for strategy #${strategyId} from backtest #${backtest.id} to ${flags.out}.`);
}

function printSchemas(command, io) {
  if (command) {
    if (!COMMAND_SCHEMAS[command]) throw new Error(`Unknown schema command: ${command}`);
    io.log(JSON.stringify({ [command]: COMMAND_SCHEMAS[command] }, null, 2));
    return;
  }
  io.log(JSON.stringify(COMMAND_SCHEMAS, null, 2));
}

function printResponse(response, flags, io) {
  if (flags.json) {
    io.log(JSON.stringify(formatJsonResponse(response, flags), null, 2));
    return;
  }

  const rows = Array.isArray(response.data) ? response.data : [response.data];
  const matchNotice = formatSymbolMatchNotice(response.meta?.symbolMatch);
  if (matchNotice) io.log(matchNotice);
  const rankingNotice = formatRankingNotice(response.meta);
  if (rankingNotice) io.log(rankingNotice);
  if (rows.filter(Boolean).length === 0) {
    io.log('No results found.');
    const suggestions = formatSymbolSuggestions(response.meta?.symbolSuggestions);
    if (suggestions) io.log(suggestions);
  }
  const nonEmptyRows = rows.filter(Boolean);
  if (nonEmptyRows.length > 0 && nonEmptyRows.every(isComparisonRow)) {
    io.log(formatComparisonTable(nonEmptyRows));
  }
  for (const row of nonEmptyRows) {
    if (nonEmptyRows.every(isComparisonRow)) break;
    if (row.backtest) printBacktest(row.backtest, flags, io);
    else if (row.metrics) printBacktest(row, flags, io);
    else if (isStrategy(row)) printStrategy(row, flags, io, response.account);
    else if (row.ticker !== undefined || row.name !== undefined) io.log(formatSymbol(row));
    else io.log(JSON.stringify(row, null, 2));
  }
  const notice = formatLimitNotice(response);
  if (notice) io.log(`\n${notice}`);
}

function printHelp(io) {
  io.log(`TradeSearcher CLI

Usage:
  tradesearcher auth login
  tradesearcher auth status
  tradesearcher symbols AAPL
  tradesearcher search BTCUSD --limit 5
  tradesearcher best AAPL
  tradesearcher backtest 12345 --details
  tradesearcher backtest 12345 --trades
  tradesearcher backtest 12345 --trades --trade-limit 20
  tradesearcher strategy 6789 --source
  tradesearcher export 12345 --pine --out strategy.pine
  tradesearcher compare 12345 67890
  tradesearcher schema
  tradesearcher schema backtest

Options:
  --json                 Print JSON
  --api-key <key>         Use an API key once
  --api-url <url>         Use another TradeSearcher API URL
  --limit <n>             Number of results
  --details               Print full performance details for one backtest
  --trades                Include recent trades for one backtest
  --trade-limit <n>       Number of recent trades to print, default 10
  --equity                Include equity and drawdown curves, can be large in JSON
  --market <market>       crypto, stock, forex, or futures
  --timeframe <value>     Example: 60, 240, D
  --strategy-type <type>  intraday, swing, or longTerm
  --sort <value>          sharpe, sharpeRatio, profitFactor, roi, netProfitPercent, latestTradeDate, robustness
  --order <value>         desc or asc
  --min-sharpe <n>
  --min-profit-factor <n>
  --max-drawdown <n>
  --pine                 Export Pine source code
  --out <file>           Output file for export
`);
}

function formatSymbol(symbol) {
  return [
    `symbol #${symbol.id}`,
    symbol.name,
    symbol.ticker ? `ticker ${symbol.ticker}` : null,
    symbol.type,
    symbol.description,
    symbol.backtestsCount != null ? `${symbol.backtestsCount} backtests` : null,
    symbol.matchReason ? `match ${symbol.matchReason}` : null,
  ].filter(Boolean).join(' | ');
}

function formatSymbolMatchNotice(match) {
  if (!match) return '';
  if (!match.matched) return `Symbol match: ${match.message}`;
  const matched = match.matched;
  const alternatives = Array.isArray(match.alternatives) && match.alternatives.length > 0
    ? ` Alternatives: ${match.alternatives.map((item) => item.name).join(', ')}.`
    : '';
  return `Symbol match: ${match.input} -> ${matched.name}${matched.ticker ? ` (${matched.ticker})` : ''}.${alternatives}`;
}

function formatRankingNotice(meta) {
  if (!meta?.ranking) return '';
  return `Ranking: ${meta.ranking}`;
}

function formatSymbolSuggestions(suggestions) {
  if (!Array.isArray(suggestions) || suggestions.length === 0) return '';
  const values = suggestions.map((symbol) => symbol.name).filter(Boolean);
  if (values.length === 0) return '';
  return `Try one of these exact symbols: ${values.join(', ')}.`;
}

function printBacktest(backtest, flags, io) {
  io.log(summarizeBacktest(backtest));
  if (flags.details) {
    io.log(formatBacktestDetails(backtest));
  }
  if (flags.trades) {
    io.log(formatBacktestTrades(backtest, flags));
  }
  if (flags.equity || flags.curves) {
    io.log(formatCurveSummary(backtest));
  }
}

function printStrategy(strategy, flags, io, account) {
  io.log(formatStrategySummary(strategy));
  const details = formatStrategyDetails(strategy);
  if (details) io.log(details);
  if (flags.source) {
    io.log(formatStrategySource(strategy, account));
  }
}

function formatStrategySummary(strategy) {
  const averages = strategy.averages || {};
  return [
    `strategy #${strategy.id}`,
    strategy.name,
    strategy.symbol?.name,
    strategy.strategyType || strategy.mainType,
    strategy.author?.name ? `by ${strategy.author.name}` : null,
    averages.tests != null ? `${formatInteger(averages.tests)} tests` : null,
    averages.netProfitPercent != null ? `avg ROI ${formatPercent(averages.netProfitPercent)}` : null,
    averages.profitFactor != null ? `avg PF ${formatNumber(averages.profitFactor)}` : null,
    averages.sharpeRatio != null ? `avg Sharpe ${formatNumber(averages.sharpeRatio)}` : null,
    averages.maxDrawdownPercent != null ? `avg DD ${formatPercent(averages.maxDrawdownPercent)}` : null,
    strategy.sourceAvailability ? `source ${strategy.sourceAvailability}` : null,
  ].filter(Boolean).join(' | ');
}

function formatStrategyDetails(strategy) {
  const averages = strategy.averages || {};
  const repainting = strategy.repainting || {};
  const groups = [
    ['Overview', [
      ['Description', strategy.description],
      ['Summary', strategy.summary],
      ['Tradeability', strategy.tradeability],
      ['Access', strategy.access],
      ['TradingView URL', strategy.tradingViewUrl],
      ['Path', strategy.path],
    ]],
    ['Averages', [
      ['Tests', formatInteger(averages.tests)],
      ['Net profit', formatPercent(averages.netProfitPercent)],
      ['Profit factor', formatNumber(averages.profitFactor)],
      ['Sharpe', formatNumber(averages.sharpeRatio)],
      ['Max drawdown', formatPercent(averages.maxDrawdownPercent)],
      ['Last 60d net profit', formatPercent(averages.last60DaysNetProfitPercent)],
      ['Last 60d profit factor', formatNumber(averages.last60DaysProfitFactor)],
      ['Profitable tests', formatRatioPercent(averages.percentProfitable)],
      ['Beat market', formatRatioPercent(averages.percentBeatMarket)],
      ['Robustness score', formatNumber(averages.robustnessScore)],
      ['Quality gate', averages.qualityGatePass == null ? null : String(averages.qualityGatePass)],
    ]],
    ['Repainting', [
      ['Repainting', repainting.repainting == null ? null : String(repainting.repainting)],
      ['Passed checks', repainting.passedChecks == null || repainting.totalChecks == null ? null : `${repainting.passedChecks}/${repainting.totalChecks}`],
      ['Warnings', formatInteger(repainting.warningChecks)],
      ['Errors', formatInteger(repainting.errorChecks)],
    ]],
    ['Rules', [
      ['Entry', formatList(strategy.entryCriteria)],
      ['Exit', formatList(strategy.exitCriteria)],
      ['Indicators', formatList(strategy.indicators)],
      ['Timeframes', formatList(strategy.timeframes)],
      ['Tags', formatList(strategy.tags)],
    ]],
  ];

  return groups
    .map(([title, rows]) => formatDetailGroup(title, rows))
    .filter(Boolean)
    .join('\n');
}

function formatStrategySource(strategy, account) {
  if (strategy.sourceCode) {
    return `\nSource code\n${strategy.sourceCode}`;
  }
  if (account?.tier === 'premium') {
    return '\nSource code\n  Source code is not available for this strategy.';
  }
  return '\nSource code\n  No source code was returned. It may require Premium or may not be available for this strategy.';
}

function isComparisonRow(row) {
  return Boolean(row && row.id !== undefined && row.symbol !== undefined && row.netProfitPercent !== undefined && !row.metrics && !row.backtest);
}

function formatComparisonTable(rows) {
  const headers = ['Backtest', 'Symbol', 'Strategy', 'TF', 'ROI', 'PF', 'Sharpe', 'DD', 'Trades'];
  const tableRows = rows.map((row) => [
    `#${row.id}`,
    row.symbol || '-',
    row.strategy || '-',
    row.timeframe || '-',
    formatPercent(row.netProfitPercent) || '-',
    formatNumber(row.profitFactor) || '-',
    formatNumber(row.sharpeRatio) || '-',
    formatPercent(row.maxDrawdownPercent) || '-',
    formatInteger(row.totalTrades) || '-',
  ]);
  const widths = headers.map((header, index) => Math.max(header.length, ...tableRows.map((row) => String(row[index]).length)));
  const renderRow = (row) => row.map((cell, index) => String(cell).padEnd(widths[index], ' ')).join(' | ');
  return [
    renderRow(headers),
    widths.map((width) => '-'.repeat(width)).join('-|-'),
    ...tableRows.map(renderRow),
  ].join('\n');
}

function formatBacktestDetails(backtest) {
  const metric = backtest.metrics || {};
  const groups = [
    ['Performance', [
      ['Net profit', formatPercent(metric.netProfitPercent)],
      ['Buy and hold', formatPercent(metric.buyHoldReturnPercent)],
      ['Risk adjusted net profit', formatPercent(metric.riskAdjustedNetProfitPercent)],
      ['Open P/L', formatPercent(metric.openPLPercent)],
      ['Gross profit', formatPercent(metric.grossProfitPercent)],
      ['Gross loss', formatPercent(metric.grossLossPercent)],
      ['Max drawdown', formatPercent(metric.maxDrawdownPercent)],
      ['Max run-up', formatPercent(metric.maxRunUpPercent)],
      ['Alpha', formatNumber(metric.alpha)],
    ]],
    ['Risk / quality', [
      ['Profit factor', formatNumber(metric.profitFactor)],
      ['Sharpe', formatNumber(metric.sharpeRatio)],
      ['Sortino', formatNumber(metric.sortinoRatio)],
      ['Win rate', formatRatioPercent(metric.percentProfitable)],
      ['T-statistic', formatNumber(metric.tStatistic)],
      ['P-value', formatNumber(metric.pValue)],
      ['Statistical relevancy', formatNumber(metric.statisticalRelevancyScore)],
      ['Robustness score', formatNumber(metric.robustnessScore)],
      ['Quality gate', metric.qualityGatePass == null ? null : String(metric.qualityGatePass)],
    ]],
    ['Recent performance', [
      ['Net profit 1m', formatPercent(metric.netProfitPercent1m)],
      ['Net profit 3m', formatPercent(metric.netProfitPercent3m)],
      ['Net profit 6m', formatPercent(metric.netProfitPercent6m)],
      ['Net profit 1y', formatPercent(metric.netProfitPercent1y)],
      ['Net profit 2y', formatPercent(metric.netProfitPercent2y)],
      ['Profit factor 1m', formatNumber(metric.profitFactor1m)],
      ['Profit factor 3m', formatNumber(metric.profitFactor3m)],
      ['Profit factor 6m', formatNumber(metric.profitFactor6m)],
      ['Profit factor 1y', formatNumber(metric.profitFactor1y)],
      ['Profit factor 2y', formatNumber(metric.profitFactor2y)],
      ['Last 60d net profit', formatPercent(metric.last60DaysNetProfitPercent)],
      ['Last 60d profit factor', formatNumber(metric.last60DaysProfitFactor)],
      ['Last 60d trades', formatInteger(metric.last60DaysTotalTrades)],
    ]],
    ['Trades', [
      ['Total trades', formatInteger(metric.totalTrades)],
      ['Winning trades', formatInteger(metric.winningTrades)],
      ['Losing trades', formatInteger(metric.losingTrades)],
      ['Open trades', formatInteger(metric.openTrades)],
      ['Long trades', formatInteger(metric.totalTradesLong)],
      ['Short trades', formatInteger(metric.totalTradesShort)],
      ['Long win rate', formatRatioPercent(metric.percentProfitableLong)],
      ['Short win rate', formatRatioPercent(metric.percentProfitableShort)],
      ['Long profit factor', formatNumber(metric.profitFactorLong)],
      ['Short profit factor', formatNumber(metric.profitFactorShort)],
    ]],
    ['Trade stats', [
      ['Avg trade', formatPercent(metric.avgTradePercent)],
      ['Avg winning trade', formatPercent(metric.avgWinTradePercent)],
      ['Avg losing trade', formatPercent(metric.avgLossTradePercent)],
      ['Largest win', formatPercent(metric.largestWinTradePercent)],
      ['Largest loss', formatPercent(metric.largestLossTradePercent)],
      ['Avg bars in trade', formatNumber(metric.avgBarsInTrade)],
      ['Avg trade duration', formatDuration(metric.avgTradeDurationMs)],
      ['Pyramiding', formatInteger(metric.pyramiding)],
      ['Avg pyramiding long', formatNumber(metric.avgPyramidingLong)],
      ['Avg pyramiding short', formatNumber(metric.avgPyramidingShort)],
    ]],
    ['Settings', [
      ['Strategy type', backtest.strategyType],
      ['From', backtest.period?.from],
      ['To', backtest.period?.to],
      ['Trading to', backtest.period?.tradingTo],
      ['Default quantity', [metric.defaultQuantityValue, metric.defaultQuantityType].filter(Boolean).join(' ') || null],
      ['Commission', [metric.commissionValue, metric.commissionType].filter(Boolean).join(' ') || null],
      ['Commission paid', formatNumber(metric.commissionPaid)],
      ['Bar magnifier', metric.useBarMagnifier == null ? null : String(metric.useBarMagnifier)],
    ]],
  ];

  return groups
    .map(([title, rows]) => formatDetailGroup(title, rows))
    .filter(Boolean)
    .join('\n');
}

function formatDetailGroup(title, rows) {
  const lines = rows
    .map(([label, value]) => [label, normalizeDisplayValue(value)])
    .filter(([, value]) => value !== null)
    .map(([label, value]) => `  ${label}: ${value}`);
  if (lines.length === 0) return '';
  return `\n${title}\n${lines.join('\n')}`;
}

function formatBacktestTrades(backtest, flags) {
  const trades = Array.isArray(backtest.recentTrades) && backtest.recentTrades.length > 0
    ? backtest.recentTrades
    : Array.isArray(backtest.trades) ? backtest.trades : [];
  if (trades.length === 0) {
    return '\nRecent trades\n  No trades returned. Use a Premium API key and check that this backtest has trades.';
  }

  const limit = Math.max(1, parseInt(flags.tradeLimit || flags.tradesLimit || 10, 10) || 10);
  const lines = trades.slice(0, limit).map((trade, index) => formatTrade(trade, index + 1));
  const totalTrades = backtest.metrics?.totalTrades;
  const totalText = totalTrades != null ? ` Reported closed trades: ${formatInteger(totalTrades)}.` : '';
  const suffix = trades.length > limit
    ? `\n  Showing ${limit} of ${formatInteger(trades.length)} returned trade rows.${totalText} Returned rows can include open trades. Use --trade-limit ${trades.length} to print more.`
    : totalText ? `\n  Returned trade rows: ${formatInteger(trades.length)}.${totalText} Returned rows can include open trades.` : '';
  return `\nRecent trades\n${lines.join('\n')}${suffix}`;
}

function formatTrade(trade, index) {
  const entry = trade?.entry || {};
  const exit = trade?.exit || {};
  const profit = trade?.profit || {};
  const direction = entry.type || entry.name || 'trade';
  return [
    `  ${index}.`,
    direction,
    formatDate(entry.time),
    `entry ${formatNumber(entry.value)}`,
    '->',
    formatDate(exit.time),
    `exit ${formatNumber(exit.value)}`,
    `profit ${formatPercent(profit.p)}`,
  ].filter(Boolean).join(' ');
}

function formatCurveSummary(backtest) {
  const equity = Array.isArray(backtest.equityCurve) ? backtest.equityCurve.length : 0;
  const drawdown = Array.isArray(backtest.drawdownCurve) ? backtest.drawdownCurve.length : 0;
  const buyHold = Array.isArray(backtest.buyHoldCurve) ? backtest.buyHoldCurve.length : 0;
  return `\nCurves\n  Equity points: ${equity}\n  Drawdown points: ${drawdown}\n  Buy-and-hold points: ${buyHold}\n  Use --json to inspect curve values.`;
}

function parseArgs(argv) {
  const args = [];
  const flags = {};
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index];
    if (value === '--') continue;
    if (!value.startsWith('--')) {
      args.push(value);
      continue;
    }
    const key = camelCase(value.slice(2));
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      flags[key] = true;
    } else {
      flags[key] = next;
      index++;
    }
  }
  return { command: args.shift(), args, flags };
}

function validateArgs(command, args, flags) {
  validateFlags(flags);
  if (!command || command === 'help' || flags.help) return;

  const knownCommands = ['auth', 'symbols', 'symbol', 'search', 'best', 'backtest', 'strategy', 'export', 'compare', 'schema', 'schemas'];
  if (!knownCommands.includes(command)) throw new Error(`Unknown command: ${command}`);

  if ((command === 'symbols' || command === 'symbol') && !args[0]) throw new Error('Missing symbol search text. Example: tradesearcher symbols AAPL');
  if (command === 'search' && !args[0]) throw new Error('Missing symbol. Example: tradesearcher search BTCUSD');
  if (command === 'best' && !args[0]) throw new Error('Missing symbol. Example: tradesearcher best AAPL');
  if (command === 'backtest' && !args[0]) throw new Error('Missing backtest id. Example: tradesearcher backtest 12345');
  if (command === 'strategy' && !args[0]) throw new Error('Missing strategy id. Example: tradesearcher strategy 6789');
  if (command === 'export' && !args[0]) throw new Error('Missing backtest id. Example: tradesearcher export 12345 --pine --out strategy.pine');
  if (command === 'compare' && args.length < 2) throw new Error('Compare needs at least two backtest ids. Example: tradesearcher compare 12345 67890');
  validatePositionalArgs(command, args);
  if (command === 'backtest') validatePositiveIntegerFlag('backtest id', args[0]);
  if (command === 'strategy') validatePositiveIntegerFlag('strategy id', args[0]);
  if (command === 'export') validatePositiveIntegerFlag('backtest id', args[0]);
  if (command === 'compare') args.forEach((id) => validatePositiveIntegerFlag('backtest id', id));

  if (flags.market && !ALLOWED_MARKETS.includes(flags.market)) throw new Error(`Bad --market value. Use one of: ${ALLOWED_MARKETS.join(', ')}.`);
  if (flags.strategyType && !ALLOWED_STRATEGY_TYPES.includes(flags.strategyType)) throw new Error(`Bad --strategy-type value. Use one of: ${ALLOWED_STRATEGY_TYPES.join(', ')}.`);
  if (flags.sort && !ALLOWED_SORTS.includes(flags.sort)) throw new Error(`Bad --sort value. Use one of: ${ALLOWED_SORTS.join(', ')}.`);
  if (flags.order && !ALLOWED_ORDERS.includes(String(flags.order).toLowerCase())) throw new Error(`Bad --order value. Use one of: ${ALLOWED_ORDERS.join(', ')}.`);
  for (const key of ['limit', 'tradeLimit']) {
    if (flags[key] !== undefined) validatePositiveIntegerFlag(key, flags[key]);
  }
  for (const key of ['minSharpe', 'minProfitFactor', 'maxDrawdown']) {
    if (flags[key] !== undefined && Number.isNaN(Number(flags[key]))) throw new Error(`Bad --${kebabCase(key)} value. Use a number.`);
  }
}

function validatePositionalArgs(command, args) {
  const allowedBacktestWords = new Set(['trades', 'equity', 'curves']);
  if ((command === 'symbols' || command === 'symbol' || command === 'search' || command === 'best' || command === 'strategy') && args.length > 1) {
    throw new Error(`Unexpected argument: ${args[1]}`);
  }
  if (command === 'backtest') {
    const extras = args.slice(1).filter((arg) => !allowedBacktestWords.has(arg));
    if (extras.length > 0) throw new Error(`Unexpected argument: ${extras[0]}`);
  }
  if (command === 'export' && args.length > 1) {
    throw new Error(`Unexpected argument: ${args[1]}`);
  }
  if ((command === 'schema' || command === 'schemas') && args.length > 1) {
    throw new Error(`Unexpected argument: ${args[1]}`);
  }
  if (command === 'auth') {
    const subcommand = args[0] || 'status';
    if (!['login', 'status'].includes(subcommand)) throw new Error(`Unknown auth command: ${subcommand}`);
    if (subcommand === 'status' && args.length > 1) throw new Error(`Unexpected argument: ${args[1]}`);
    if (subcommand === 'login' && args.length > 2) throw new Error(`Unexpected argument: ${args[2]}`);
  }
}

function validateFlags(flags) {
  for (const [key, value] of Object.entries(flags)) {
    if (!ALLOWED_FLAGS.has(key)) throw new Error(`Unknown option: --${kebabCase(key)}`);
    if (VALUE_FLAGS.has(key) && (value === true || value === '')) throw new Error(`Missing value for --${kebabCase(key)}.`);
    if (BOOLEAN_FLAGS.has(key) && value !== true) throw new Error(`--${kebabCase(key)} does not take a value.`);
  }
}

function validatePositiveIntegerFlag(key, value) {
  const number = Number(value);
  const label = key.includes(' ') ? key : `--${kebabCase(key)} value`;
  if (!Number.isInteger(number) || number < 1) throw new Error(`Bad ${label}. Use a positive whole number.`);
}

function pickSearchFlags(flags) {
  return {
    limit: flags.limit,
    market: flags.market,
    timeframe: flags.timeframe,
    strategyType: flags.strategyType,
    minSharpe: flags.minSharpe,
    minProfitFactor: flags.minProfitFactor,
    maxDrawdown: flags.maxDrawdown,
    sort: flags.sort,
    order: flags.order,
  };
}

async function withSymbolSuggestions(client, response, input) {
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

function formatJsonResponse(response, flags) {
  if (!flags.trades && !flags.tradeLimit) return response;
  return limitTradesInResponse(response, flags.tradeLimit || 20);
}

function isStrategy(row) {
  return Boolean(row && (row.averages || row.repainting || row.sourceCode !== undefined || row.tvId || row.entryCriteria || row.exitCriteria));
}

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch (error) {
    return {};
  }
}

function writeConfig(config) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  fs.chmodSync(CONFIG_FILE, 0o600);
}

function getApiKeySource(flags, config) {
  if (flags.apiKey) return 'flag';
  if (process.env.TRADESEARCHER_API_KEY) return 'environment';
  if (config.apiKey) return 'saved';
  return 'missing';
}

function formatApiKeyStatus(source) {
  if (source === 'saved') return 'saved';
  if (source === 'environment') return 'from TRADESEARCHER_API_KEY (not saved)';
  if (source === 'flag') return 'from --api-key (not saved)';
  return 'missing';
}

function normalizeDisplayValue(value) {
  if (value === undefined || value === null || value === '' || value === 'NaN') return null;
  return value;
}

function formatNumber(value) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return null;
  return Number(value).toLocaleString('en-US', {
    maximumFractionDigits: 2,
  });
}

function formatInteger(value) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return null;
  return Math.round(Number(value)).toLocaleString('en-US');
}

function formatPercent(value) {
  const number = formatNumber(value);
  return number === null ? null : `${number}%`;
}

function formatRatioPercent(value) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return null;
  return `${(Number(value) * 100).toLocaleString('en-US', {
    maximumFractionDigits: 2,
  })}%`;
}

function formatDuration(value) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return null;
  const ms = Number(value);
  if (ms < 1000) return `${formatNumber(ms)} ms`;
  const minutes = ms / 60000;
  if (minutes < 120) return `${formatNumber(minutes)} min`;
  const hours = minutes / 60;
  if (hours < 72) return `${formatNumber(hours)} h`;
  return `${formatNumber(hours / 24)} d`;
}

function formatList(value) {
  if (!value) return null;
  const items = Array.isArray(value) ? value : [value];
  const cleaned = items
    .map((item) => {
      if (item === null || item === undefined || item === '') return null;
      if (typeof item === 'string') return item;
      if (typeof item === 'object') return item.name || item.title || item.label || item.text || JSON.stringify(item);
      return String(item);
    })
    .filter(Boolean);
  return cleaned.length ? cleaned.join('; ') : null;
}

function commonFlags() {
  return {
    json: booleanFlag('Print JSON.'),
    apiKey: stringFlag('Use an API key once.'),
    apiUrl: stringFlag('Use another TradeSearcher API URL.'),
  };
}

function booleanFlag(description) {
  return { type: 'boolean', description };
}

function stringFlag(description) {
  return { type: 'string', description };
}

function numberFlag(description) {
  return { type: 'number', description };
}

function enumFlag(values) {
  return { type: 'string', enum: values };
}

function formatDate(value) {
  if (!value) return null;
  const timestamp = Number(value);
  const date = Number.isFinite(timestamp)
    ? new Date(timestamp > 100000000000 ? timestamp : timestamp * 1000)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString().slice(0, 10);
}

function camelCase(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function kebabCase(value) {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
