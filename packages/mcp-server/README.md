# @tradesearcher/mcp-server

MCP server for Claude Code, Codex, and other coding agents.

```bash
npx -y @tradesearcher/mcp-server
```

```json
{
  "mcpServers": {
    "tradesearcher": {
      "command": "npx",
      "args": ["-y", "@tradesearcher/mcp-server"],
      "env": {
        "TRADESEARCHER_API_KEY": "your_api_key"
      }
    }
  }
}
```

Tool responses include simple limit text and the Premium upgrade link when the account is limited.

## Common tool calls

Search symbols before searching backtests when the user gives a company name or ambiguous ticker:

```json
{
  "name": "search_symbols",
  "arguments": { "query": "Apple", "limit": 5 }
}
```

Find top candidates:

```json
{
  "name": "get_best_for_symbol",
  "arguments": { "symbol": "AAPL", "limit": 5 }
}
```

Inspect one backtest without flooding context. `includeEquityCurve` can return thousands of points, so use it after narrowing to final candidates:

```json
{
  "name": "get_backtest",
  "arguments": { "id": 12345, "includeTrades": true, "tradeLimit": 20, "includeEquityCurve": true }
}
```

Backtest and compare rows include `strategy.sourceAvailability` when known:

- `available`: source text is available to this account. This does not prove the text is a complete standalone Pine strategy.
- `no`: source code is not available for this strategy
- `private`: source exists but this account cannot view it

The public repo also includes `docs/mcp-tools.md` with the same workflow.

## Tool schemas

### `search_symbols`

```json
{
  "query": "string",
  "limit": "number, optional"
}
```

### `search_backtests`

Allowed `sort` values: `sharpe`, `sharpeRatio`, `profitFactor`, `roi`, `netProfitPercent`, `latestTradeDate`, `robustness`.

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

### `get_best_for_symbol`

```json
{
  "symbol": "string",
  "limit": "number, optional"
}
```

### `get_backtest`

```json
{
  "id": "number",
  "includeTrades": "boolean, optional",
  "tradeLimit": "number, optional; default 20 when includeTrades is true",
  "includeEquityCurve": "boolean, optional"
}
```

### `get_strategy`

```json
{
  "id": "number",
  "includeSourceCode": "boolean, optional"
}
```

When `includeSourceCode` is true and source is available, the response includes `sourceCode`.

### `compare_backtests`

```json
{
  "ids": ["number"]
}
```

### `get_account_status`

```json
{}
```
