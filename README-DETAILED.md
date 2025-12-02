# CEX Wallet Tracker - Solana Listener

A high-performance Solana CEX outflow listener using `logsSubscribe` with scrutiny checks. Monitors specific exchange wallets for outgoing SOL transfers matching configured ranges and validates detections through historical transaction analysis.

## 🎯 Features

- **Pure Event Listener**: Uses `logsSubscribe` only - zero chain scanning
- **Zero Pulling**: No polling loops, 100% event-driven architecture
- **Scrutiny Checks**: Intelligent filtering to detect loops and first-time activity
- **Multi-CEX Support**: Monitor unlimited CEX wallets with individual range configurations
- **Modular Architecture**: Clean separation of concerns with utility modules
- **RPC Agnostic**: Works with any Solana RPC (Helius, Chainstack, public endpoints)
- **Low Cost**: Minimal RPC calls per detection (~1-2 calls)

## 📋 Prerequisites

- Node.js 16+ 
- npm or yarn
- A Solana RPC endpoint (free or paid)

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and update:

```bash
cp .env.example .env
```

Edit `.env`:

```env
# ---- CEX Wallet 1 ----
CEX_1_LABEL=OKX
CEX_1_ADDRESS=is6MTRHEgyFLNTfYcuV4QBWLjrZBfmhVNYR6ccgr8KV
CEX_1_RANGE=13-15,14-26,29-31,99-100

# ---- CEX Wallet 2 ----
CEX_2_LABEL=KUCOIN
CEX_2_ADDRESS=BmFdpraQhkiDQE6SnfG5omcA1VwzqfXrwtNYBwWTymy6
CEX_2_RANGE=49-50,69-70,79-80,89-90,99-100

# RPC Configuration
RPC_ENDPOINT=https://api.mainnet-beta.solana.com
```

**Environment Variables:**
- `CEX_X_LABEL`: Display name for the exchange
- `CEX_X_ADDRESS`: Public key of the exchange wallet
- `CEX_X_RANGE`: Comma-separated ranges of SOL amounts to trigger alerts (e.g., `13-15,99-100`)
- `RPC_ENDPOINT`: Your Solana RPC endpoint

### 3. Build

```bash
npm run build
```

### 4. Run

```bash
# Production
npm start

# Development (with TypeScript)
npm run dev
```

## 🏗️ Project Structure

```
src/
├── index.ts              # Main listener loop
├── utils/
│   ├── env.ts            # Environment configuration loader
│   ├── rangeParser.ts    # Range parsing and matching logic
│   ├── txParser.ts       # Transaction parsing utilities
│   ├── scrutinyCheck.ts  # Scrutiny validation logic
│   └── websocket.ts      # WebSocket connection manager
```

## 📊 How It Works

### 1. WebSocket Subscription
Connects via `logsSubscribe` with mentions filter for specified CEX wallets:

```json
{
  "method": "logsSubscribe",
  "params": [
    {
      "mentions": ["wallet1", "wallet2"]
    },
    { "commitment": "confirmed" }
  ]
}
```

### 2. Transaction Analysis
When a log event arrives:
1. Fetch full transaction with `getTransaction`
2. Extract account balances (pre/post)
3. Identify outgoing transfers from CEX wallet
4. Calculate SOL amount

### 3. Range Filtering
Checks if outgoing amount matches any configured range:
- `13-15` matches amounts ≥ 13 and ≤ 15
- Multiple ranges supported: `13-15,29-31,99-100`

### 4. Scrutiny Check
Before alerting, validates the transaction history:

**Condition A - Loop Detection:**
- Checks if the previous inflow to the recipient came from the same CEX wallet
- If yes → **ALERT** (loop detected)

**Condition B - First-Time Activity:**
- Looks for any previous transactions on the recipient address
- If none found → **ALERT** (first-time activity)

**Condition None:**
- Previous inflow from different source → No alert

### 5. Alert Handling
Currently logs to console in structured format:

```
═══════════════════════════════════════════════════════════
🚨 DETECTION ALERT 🚨
═══════════════════════════════════════════════════════════
[KUCOIN] Outgoing 14.2 SOL → 8YtX...qpL9
Signature: 5yW...Jf9
Matched Range: 13-15 SOL
Previous Deposit: KUCOIN → Recipient → KUCOIN (Loop detected)
Alert Triggered: ✅ YES
Condition: LOOP_DETECTED
═══════════════════════════════════════════════════════════
```

To add Telegram alerts, modify the `handleDetection()` function in `index.ts`.

## 🔧 Configuration Examples

### Monitor Single CEX Wallet

```env
CEX_1_LABEL=BINANCE
CEX_1_ADDRESS=9B5X...qpL9
CEX_1_RANGE=100-200

RPC_ENDPOINT=https://api.mainnet-beta.solana.com
```

### Monitor Multiple Ranges

```env
CEX_1_LABEL=OKX
CEX_1_ADDRESS=is6M...ccgr8KV
CEX_1_RANGE=10-20,50-100,500-1000

CEX_2_LABEL=KUCOIN
CEX_2_ADDRESS=BmFd...ymy6
CEX_2_RANGE=5-15

RPC_ENDPOINT=https://rpc.helius.xyz/?api-key=YOUR_KEY
```

## 📈 RPC Compatibility

Tested with:
- **Public RPC**: `https://api.mainnet-beta.solana.com`
- **Helius**: `https://rpc.helius.xyz/?api-key=YOUR_KEY`
- **Chainstack**: Free tier endpoints
- **Alchemy**: Paid endpoints

**Note**: Free public RPC may have rate limits. For production, use a paid endpoint.

## 🔍 Monitoring

The listener prints:
- Connection status
- CEX wallets being monitored
- All log events (real-time)
- Transaction analysis for matches
- Range validation results
- Scrutiny check results
- Final alerts

Example output:

```
[Main] Connected to RPC: https://api.mainnet-beta.solana.com
[Main] Monitoring 2 CEX wallets:
  - OKX: is6MTRHEgyFLNTfYcuV4QBWLjrZBfmhVNYR6ccgr8KV
    Ranges: 13-15, 14-26, 29-31, 99-100
  - KUCOIN: BmFdpraQhkiDQE6SnfG5omcA1VwzqfXrwtNYBwWTymy6
    Ranges: 49-50, 69-70, 79-80, 89-90, 99-100
[Main] Connecting to WebSocket: wss://api.mainnet-beta.solana.com
[Main] ✅ Solana CEX Outflow Listener started successfully
```

## ⚡ Performance Notes

- **RPC Calls per Detection**: ~2 calls (1 for tx fetch, 1 for scrutiny)
- **Latency**: Sub-second (event-driven, no polling)
- **Memory**: Minimal (stream-based)
- **Reconnection**: Automatic with exponential backoff

## 🛠️ Extending the Project

### Add Telegram Alerts

In `src/index.ts`, modify `handleDetection()`:

```typescript
async function handleDetection(event: DetectionEvent): Promise<void> {
  // ... existing logging code ...

  // Add Telegram
  if (event.scrutinyResult.alertTriggered) {
    await sendTelegramAlert(event);
  }
}
```

### Add Discord Alerts

Similar pattern - implement webhook in a new utility and call from `handleDetection()`.

### Custom Filtering

Modify `processLogEvent()` to add additional filters before scrutiny check.

## 📝 Environment File Format

Each CEX wallet requires exactly 3 environment variables:

```env
CEX_X_LABEL=<display_name>
CEX_X_ADDRESS=<wallet_public_key>
CEX_X_RANGE=<range1>-<range1>,<range2>-<range2>
```

The parser looks for `CEX_1_*`, `CEX_2_*`, etc. until it finds a missing variable.

## 🐛 Troubleshooting

### WebSocket Connection Failed
- Check RPC endpoint is correct
- Ensure it supports WebSocket (wss://)
- Check firewall/network settings

### No Detections
- Verify CEX wallet addresses are correct
- Ensure SOL amounts match configured ranges
- Check RPC is synced (use `getHealth` endpoint)
- Monitor logs for connection status

### High RPC Usage
- Reduce number of CEX wallets
- Increase range widths to filter better
- Use a rate-limited endpoint

## 📄 License

MIT

## 🤝 Contributing

Contributions welcome! Please ensure:
- TypeScript strict mode passes
- Code follows existing style
- All utils are properly typed
- Comments explain complex logic

---

**Built for precision. Designed for efficiency. Tracker420 style. 🚀**
