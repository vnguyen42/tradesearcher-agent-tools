# @tradesearcher/core

JavaScript client for the TradeSearcher agent API.

```js
import { createClient } from '@tradesearcher/core';

const client = createClient({ apiKey: process.env.TRADESEARCHER_API_KEY });
const results = await client.searchBacktests({ symbol: 'BTCUSD' });
```

Free accounts receive limited results. Premium unlocks more results, recent trades, and full strategy details.

