# TradeSearcher with Claude Code

Claude Code is a terminal tool, so add the MCP server with one command:

```bash
claude mcp add tradesearcher --env TRADESEARCHER_API_KEY=your_api_key -- npx -y @tradesearcher/mcp-server
```

Prefer editing config by hand? The `mcpServers` block is in the [root README](../README.md#install)
and the [full docs](https://docs.tradesearcher.ai/developer-tools/mcp-server). Create an API key on
your [account page](https://tradesearcher.ai/app/account/my-account#agent-api-keys).

Available tools:

- `search_symbols`
- `search_backtests`
- `get_backtest`
- `get_strategy`
- `get_best_for_symbol`
- `compare_backtests`
- `get_account_status`

Tool schemas and examples are in [`docs/mcp-tools.md`](./mcp-tools.md).

For CLI-driven workflows, `tradesearcher schema` prints command schemas and
`tradesearcher export BACKTEST_ID --pine --out file.pine` writes Pine source when available.

Free accounts hide high-performance backtests with a profit factor above 3. Premium shows these
stronger backtests, more results, recent trades, and full strategy details.
