# TradeSearcher with Codex

Add the MCP server with your TradeSearcher API key. The `mcpServers` config block is in the
[root README](../README.md#install) and the
[full docs](https://docs.tradesearcher.ai/developer-tools/mcp-server); create a key on your
[account page](https://tradesearcher.ai/app/account/my-account#agent-api-keys).

Ask Codex things like:

- "Find strong BTCUSD swing backtests."
- "Compare these TradeSearcher backtests."
- "Show my TradeSearcher account limits."
- "Export the Pine source for this backtest to strategy.pine."

Tool schemas and examples are in [`docs/mcp-tools.md`](./mcp-tools.md).

If the account is limited, the tool response includes the Premium upgrade link so Codex can explain
what is missing.

For CLI-driven workflows, `tradesearcher schema` prints machine-readable command schemas and
`tradesearcher export BACKTEST_ID --pine --out file.pine` writes Pine source when available.
