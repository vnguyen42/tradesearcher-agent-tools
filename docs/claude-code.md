# TradeSearcher with Claude Code

Configure the MCP server:

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

Available tools:

- `search_symbols`
- `search_backtests`
- `get_backtest`
- `get_strategy`
- `get_best_for_symbol`
- `compare_backtests`
- `get_account_status`

Tool schemas and examples are in `docs/mcp-tools.md`.

Free accounts hide high-performance backtests with a profit factor above 3. Premium shows these stronger backtests, more results, recent trades, and full strategy details.
