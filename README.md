# TradeSearcher Agent Tools

Use TradeSearcher strategies and existing backtests inside Claude Code, Codex, Cursor, and other coding agents.

**Documentation:** <https://docs.tradesearcher.ai/developer-tools/> · **Create an API key:** <https://tradesearcher.ai/app/account/my-account#agent-api-keys>

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
tradesearcher export 12345 --pine --out strategy.pine
tradesearcher compare 12345 67890
tradesearcher schema
tradesearcher schema backtest
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

Use `tradesearcher schema` to print JSON command schemas for agents. Use `tradesearcher schema backtest` or `tradesearcher schema strategy` for one command.

Search, best, and compare rows show `source available`, `source no`, or `source private` when TradeSearcher knows whether Pine source text is available. `available` means TradeSearcher has source text for the strategy; it does not prove that the text is a complete standalone Pine strategy.

Export Pine source for a backtest strategy:

```bash
tradesearcher export 12345 --pine --out strategy.pine
```

Free accounts hide high-performance backtests with a profit factor above 3. Premium shows these stronger backtests, more results, recent trades, and full strategy details.

Upgrade: https://tradesearcher.ai/app/premium

## MCP tools

See [`docs/mcp-tools.md`](docs/mcp-tools.md) or the public reference at
<https://docs.tradesearcher.ai/developer-tools/mcp-server> for tool schemas, examples, and the
recommended agent workflow.

Per-client setup: [Claude Code](docs/claude-code.md) · [Codex](docs/codex.md).

## Release check

Before publishing:

```bash
npm run release:check
```

See `docs/release.md` for the publish order.
