# CEX Wallet Tracker
Solana CEX outflow listener with scrutiny checks using logsSubscribe only.

## Quick Start

```bash
npm install
npm run build
npm start
```

Configure `.env` with CEX wallets and RPC endpoint. See `.env.example`.

## Features
- ✅ Pure `logsSubscribe` listener (zero chain scanning)
- ✅ Automatic scrutiny checks (loop detection + first-time activity)
- ✅ Multi-CEX support with flexible range configuration
- ✅ Low RPC usage (~2 calls per detection)
- ✅ Auto-reconnect with exponential backoff
- ✅ Detailed console logging

## Environment Setup

```env
CEX_1_LABEL=OKX
CEX_1_ADDRESS=is6MTRHEgyFLNTfYcuV4QBWLjrZBfmhVNYR6ccgr8KV
CEX_1_RANGE=13-15,99-100

RPC_ENDPOINT=https://api.mainnet-beta.solana.com
```

## Architecture

- `index.ts` - Main listener
- `utils/env.ts` - Config loader
- `utils/websocket.ts` - WebSocket manager
- `utils/txParser.ts` - Transaction analyzer
- `utils/scrutinyCheck.ts` - Validation logic
- `utils/rangeParser.ts` - Range matching

See `README-DETAILED.md` for full documentation.