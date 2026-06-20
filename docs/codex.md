# TradeSearcher with Codex

Add the MCP server to Codex with your TradeSearcher API key.

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

Ask Codex things like:

- "Find strong BTCUSD swing backtests."
- "Compare these TradeSearcher backtests."
- "Show my TradeSearcher account limits."
- "Export the Pine source for this backtest to strategy.pine."

Tool schemas and examples are in `docs/mcp-tools.md`.

If the account is limited, the tool response includes the Premium upgrade link so Codex can explain what is missing.

For CLI-driven workflows, `tradesearcher schema` prints machine-readable command schemas and `tradesearcher export BACKTEST_ID --pine --out file.pine` writes Pine source when available.
