# MCP Tool Schemas

Use these tools when Claude Code, Codex, or another agent needs TradeSearcher strategy and backtest data.

Recommended flow:

1. Use `search_symbols` when the user gives a company name, partial ticker, or ambiguous symbol.
2. Use `get_best_for_symbol` for a quick ranked shortlist.
3. Use `search_backtests` when the user asks for filters like timeframe, market, or minimum metrics.
4. Use `get_backtest` with `includeTrades` or `includeEquityCurve` only for selected candidates.
5. Use `get_strategy` when the user asks how the strategy works or needs source code.
6. Use `compare_backtests` to compare final candidates.

All responses include `account` and `limits` when relevant. If output is limited, relay the upgrade message and link to the user.

Upgrade URL: https://tradesearcher.ai/app/premium

## `search_symbols`

Find symbols and map short inputs like `AAPL` to full symbols like `NASDAQ:AAPL`.

Schema:

```json
{
  "query": "string",
  "limit": "number, optional"
}
```

Example:

```json
{
  "query": "Apple",
  "limit": 5
}
```

## `search_backtests`

Search existing backtests.

Allowed `sort` values: `sharpe`, `sharpeRatio`, `profitFactor`, `roi`, `netProfitPercent`, `latestTradeDate`, `robustness`.

Schema:

```json
{
  "symbol": "string, optional",
  "market": "crypto | stock | forex | futures, optional",
  "timeframe": "string, optional",
  "strategyType": "intraday | swing | longTerm, optional",
  "minSharpe": "number, optional",
  "minProfitFactor": "number, optional",
  "maxDrawdown": "number, optional",
  "sort": "sharpe | sharpeRatio | profitFactor | roi | netProfitPercent | latestTradeDate | robustness, optional",
  "order": "desc | asc, optional",
  "limit": "number, optional"
}
```

Example:

```json
{
  "symbol": "BTCUSD",
  "market": "crypto",
  "timeframe": "60",
  "minSharpe": 0.5,
  "sort": "profitFactor",
  "limit": 5
}
```

## `get_best_for_symbol`

Get top ranked backtests for a symbol. Check `meta.ranking` to explain how results were ranked.

Schema:

```json
{
  "symbol": "string",
  "limit": "number, optional"
}
```

Example:

```json
{
  "symbol": "AAPL",
  "limit": 5
}
```

## `get_backtest`

Get one backtest. Use `tradeLimit` when `includeTrades` is true. `includeEquityCurve` can return thousands of points, so use it after narrowing to final candidates.

Schema:

```json
{
  "id": "number",
  "includeTrades": "boolean, optional",
  "tradeLimit": "number, optional; default 20 when includeTrades is true",
  "includeEquityCurve": "boolean, optional"
}
```

Example:

```json
{
  "id": 12345,
  "includeTrades": true,
  "tradeLimit": 20,
  "includeEquityCurve": true
}
```

## `get_strategy`

Get strategy metadata and optionally source code.

Schema:

```json
{
  "id": "number",
  "includeSourceCode": "boolean, optional"
}
```

Example:

```json
{
  "id": 6789,
  "includeSourceCode": true
}
```

## `compare_backtests`

Compare selected backtests in compact form.

Schema:

```json
{
  "ids": ["number"]
}
```

Example:

```json
{
  "ids": [12345, 67890]
}
```

## `get_account_status`

Show the current account tier, limits, remaining free quota when available, and upgrade link.

Schema:

```json
{}
```
