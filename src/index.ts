import { Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { loadConfig, CEXWallet } from './utils/env';
import { isAmountInRange, getMatchingRange } from './utils/rangeParser';
import { fetchAndParseTransaction, formatTransactionLog } from './utils/txParser';
import { performScrutinyCheck, ScrutinyResult } from './utils/scrutinyCheck';
import { WebSocketListener, LogsNotification } from './utils/websocket';

interface DetectionEvent {
  timestamp: Date;
  signature: string;
  cexLabel: string;
  cexAddress: string;
  recipientAddress: string;
  outgoingAmount: number;
  matchedRange: { min: number; max: number };
  scrutinyResult: ScrutinyResult;
}

// Global state to track CEX wallets
let config = loadConfig();
let connection: Connection;
let wsListener: WebSocketListener;
let cexAddressToWallet: Map<string, CEXWallet> = new Map();

// Initialize mapping
for (const wallet of config.cexWallets) {
  cexAddressToWallet.set(wallet.address, wallet);
}

/**
 * Main handler for detected outgoing transfers
 */
async function handleDetection(event: DetectionEvent): Promise<void> {
  const shortSig = event.signature.slice(0, 8) + '...' + event.signature.slice(-4);
  const shortRecipient =
    event.recipientAddress.slice(0, 4) + '...' + event.recipientAddress.slice(-4);

  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🚨 DETECTION ALERT 🚨');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`[${event.cexLabel}] Outgoing ${event.outgoingAmount.toFixed(2)} SOL → ${shortRecipient}`);
  console.log(`Signature: ${shortSig}`);
  console.log(`Matched Range: ${event.matchedRange.min}-${event.matchedRange.max} SOL`);
  console.log(`Previous Deposit: ${event.scrutinyResult.explanation}`);
  console.log(`Alert Triggered: ${event.scrutinyResult.alertTriggered ? '✅ YES' : '❌ NO'}`);
  console.log(`Condition: ${event.scrutinyResult.condition}`);

  if (event.scrutinyResult.previousInflowSignature) {
    const shortPrevSig =
      event.scrutinyResult.previousInflowSignature.slice(0, 4) +
      '...' +
      event.scrutinyResult.previousInflowSignature.slice(-4);
    console.log(`Previous Tx: ${shortPrevSig}`);
  }

  console.log('═══════════════════════════════════════════════════════════');
  console.log('');

  // TODO: Plug in Telegram alert here when this function is called
  // Currently only logging to console as per spec
}

/**
 * Process a log event from WebSocket
 */
async function processLogEvent(signature: string, logs: string[]): Promise<void> {
  try {
    console.log(`[Processor] Analyzing transaction: ${signature}`);

    // Fetch full transaction
    const txAnalysis = await fetchAndParseTransaction(connection, signature);

    if (!txAnalysis) {
      console.log(`[Processor] Could not parse transaction ${signature}`);
      return;
    }

    // Check each CEX wallet for outgoing transfers
    for (const cexWallet of config.cexWallets) {
      // Find this CEX wallet in the transaction accounts
      const cexAccountIndex = txAnalysis.accountKeys.indexOf(cexWallet.address);

      if (cexAccountIndex === -1) {
        // This CEX wallet not involved in this transaction
        continue;
      }

      console.log(`[Processor] Found ${cexWallet.label} in transaction`);

      // Get balance change for this CEX wallet
      const connection2 = new Connection(config.rpcEndpoint);
      const tx = await connection2.getParsedTransaction(signature, {
        maxSupportedTransactionVersion: 0,
      });

      if (!tx || !tx.meta) {
        continue;
      }

      const preBalance = (tx.meta.preBalances || [])[cexAccountIndex] || 0;
      const postBalance = (tx.meta.postBalances || [])[cexAccountIndex] || 0;
      const outgoingAmount = (preBalance - postBalance) / LAMPORTS_PER_SOL;

      if (outgoingAmount <= 0) {
        // No outgoing transfer from this CEX wallet
        continue;
      }

      console.log(
        `[Processor] ${cexWallet.label} outgoing: ${outgoingAmount.toFixed(2)} SOL`
      );

      // Check if amount matches any range
      if (!isAmountInRange(outgoingAmount, cexWallet.ranges)) {
        console.log(
          `[Processor] Amount ${outgoingAmount.toFixed(2)} SOL not in any range for ${cexWallet.label}`
        );
        continue;
      }

      const matchedRange = getMatchingRange(outgoingAmount, cexWallet.ranges);
      if (!matchedRange) {
        continue;
      }

      console.log(
        `[Processor] ✅ Range match: ${outgoingAmount.toFixed(2)} SOL matches ${matchedRange.min}-${matchedRange.max}`
      );

      // Find recipient address (account with increased balance)
      const accountKeys = (tx.transaction.message as any).accountKeys || [];
      const addresses: string[] = (accountKeys as any[]).map((entry: any) => {
        if (typeof entry === 'string') return entry;
        if (entry?.pubkey) {
          if (typeof entry.pubkey === 'string') return entry.pubkey;
          if (typeof entry.pubkey.toBase58 === 'function') return entry.pubkey.toBase58();
        }
        return String(entry);
      });
      const preBalances = tx.meta.preBalances || [];
      const postBalances = tx.meta.postBalances || [];

      let recipientAddress: string | null = null;
      for (let i = 0; i < addresses.length; i++) {
        if (i === cexAccountIndex) continue;

        const preBalance = preBalances[i] || 0;
        const postBalance = postBalances[i] || 0;
        const diff = (postBalance - preBalance) / LAMPORTS_PER_SOL;

        if (Math.abs(diff - outgoingAmount) < 0.0001) {
          recipientAddress = addresses[i];
          break;
        }
      }

      if (!recipientAddress) {
        console.log(`[Processor] Could not identify recipient address`);
        continue;
      }

      console.log(
        `[Processor] Recipient identified: ${recipientAddress.slice(0, 4)}...${recipientAddress.slice(-4)}`
      );

      // Perform scrutiny check
      console.log(`[Processor] Running scrutiny check...`);
      const scrutinyResult = await performScrutinyCheck(
        connection,
        recipientAddress,
        cexWallet.address,
        cexWallet.label
      );

      // Create detection event
      const detectionEvent: DetectionEvent = {
        timestamp: new Date(),
        signature,
        cexLabel: cexWallet.label,
        cexAddress: cexWallet.address,
        recipientAddress,
        outgoingAmount,
        matchedRange,
        scrutinyResult,
      };

      // Handle detection
      await handleDetection(detectionEvent);
    }
  } catch (error) {
    console.error('[Processor] Error processing log event:', error);
  }
}

/**
 * Initialize and start the listener
 */
async function startListener(): Promise<void> {
  try {
    // Initialize RPC connection
    connection = new Connection(config.rpcEndpoint, 'confirmed');
    console.log(`[Main] Connected to RPC: ${config.rpcEndpoint}`);

    // Load CEX addresses for WebSocket subscription
    const cexAddresses = config.cexWallets.map((w) => w.address);
    console.log(`[Main] Monitoring ${cexAddresses.length} CEX wallets:`);
    config.cexWallets.forEach((w) => {
      console.log(`  - ${w.label}: ${w.address}`);
      console.log(`    Ranges: ${w.ranges.map((r) => `${r.min}-${r.max}`).join(', ')}`);
    });

    // Convert HTTP endpoint to WebSocket
    const wsEndpoint = config.rpcEndpoint
      .replace('https://', 'wss://')
      .replace('http://', 'ws://');

    // Initialize WebSocket listener
    wsListener = new WebSocketListener({
      endpoint: wsEndpoint,
      mentions: cexAddresses,
    });

    // Set up log handler
    wsListener.onLog = processLogEvent;

    // Connect and start listening
    console.log(`[Main] Connecting to WebSocket: ${wsEndpoint}`);
    await wsListener.connect();

    console.log('[Main] ✅ Solana CEX Outflow Listener started successfully');
    console.log('[Main] Listening for outgoing transfers from CEX wallets...');
    console.log('[Main] Press Ctrl+C to stop');
  } catch (error) {
    console.error('[Main] Failed to start listener:', error);
    process.exit(1);
  }
}

/**
 * Graceful shutdown
 */
function shutdown(): void {
  console.log('\n[Main] Shutting down...');
  if (wsListener) {
    wsListener.close();
  }
  process.exit(0);
}

// Handle signals
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start the listener
startListener().catch((error) => {
  console.error('[Main] Startup error:', error);
  process.exit(1);
});
