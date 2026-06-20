# @tradesearcher/core

JavaScript client for the TradeSearcher agent API.

```js
import { createClient } from '@tradesearcher/core';

const client = createClient({ apiKey: process.env.TRADESEARCHER_API_KEY });
const results = await client.searchBacktests({ symbol: 'BTCUSD' });
```

Free accounts hide high-performance backtests with a profit factor above 3. Premium shows these stronger backtests, more results, recent trades, and full strategy details.
