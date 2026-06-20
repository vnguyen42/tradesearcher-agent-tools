# TradeSearcher Agent Tools

Use TradeSearcher strategies and existing backtests inside Claude Code, Codex, and other coding agents.

## Install

```bash
npm install -g @tradesearcher/cli
```

For MCP:

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

## CLI

```bash
tradesearcher auth login
tradesearcher auth status
tradesearcher search BTCUSD
tradesearcher best AAPL
tradesearcher backtest 12345 --details --trades --trade-limit 20
tradesearcher strategy 6789 --source
tradesearcher compare 12345 67890
```

Useful search sorts:

```bash
tradesearcher search BTCUSD --sort sharpe
tradesearcher search BTCUSD --sort profitFactor
tradesearcher search BTCUSD --sort roi
tradesearcher search BTCUSD --sort latestTradeDate
tradesearcher search BTCUSD --sort robustness
```

`--equity` can return large JSON arrays. Use it after narrowing to final candidates.

Free accounts hide high-performance backtests with a profit factor above 3. Premium shows these stronger backtests, more results, recent trades, and full strategy details.

Upgrade: https://tradesearcher.ai/app/premium

## MCP tools

See `docs/mcp-tools.md` for tool schemas, examples, and the recommended agent workflow.

## Release check

Before publishing:

```bash
npm run release:check
```

See `docs/release.md` for the publish order.
