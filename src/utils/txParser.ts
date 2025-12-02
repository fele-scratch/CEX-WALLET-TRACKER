import { Connection, ParsedTransactionWithMeta, LAMPORTS_PER_SOL } from '@solana/web3.js';

export interface TransferDetail {
  from: string;
  to: string;
  amount: number; // in SOL
}

export interface TransactionAnalysis {
  signature: string;
  timestamp?: number;
  outgoingTransfers: TransferDetail[];
  incomingTransfers: TransferDetail[];
  accountKeys: string[];
}

/**
 * Fetch full transaction and parse it for SOL transfers
 */
export async function fetchAndParseTransaction(
  connection: Connection,
  signature: string
): Promise<TransactionAnalysis | null> {
  try {
    const tx = await connection.getParsedTransaction(signature, {
      maxSupportedTransactionVersion: 0,
    });

    if (!tx) {
      console.log(`[TxParser] Transaction ${signature} not found or not parsed`);
      return null;
    }

    const preBalances = tx.meta?.preBalances || [];
    const postBalances = tx.meta?.postBalances || [];
    const accountKeys = tx.transaction.message.accountKeys;

    const addresses = accountKeys.map((ak) => ak.pubkey.toBase58());

    const outgoingTransfers: TransferDetail[] = [];
    const incomingTransfers: TransferDetail[] = [];

    // Analyze balance changes
    for (let i = 0; i < addresses.length; i++) {
      const preBalance = preBalances[i] || 0;
      const postBalance = postBalances[i] || 0;
      const diff = (preBalance - postBalance) / LAMPORTS_PER_SOL;

      if (diff > 0) {
        // Outgoing transfer (balance decreased)
        outgoingTransfers.push({
          from: addresses[i],
          to: 'multiple', // We'll parse this more precisely from logs if needed
          amount: diff,
        });
      } else if (diff < 0) {
        // Incoming transfer (balance increased)
        incomingTransfers.push({
          from: 'multiple',
          to: addresses[i],
          amount: Math.abs(diff),
        });
      }
    }

    return {
      signature,
      timestamp: tx.blockTime || undefined,
      outgoingTransfers,
      incomingTransfers,
      accountKeys: addresses,
    };
  } catch (error) {
    console.error(`[TxParser] Error parsing transaction ${signature}:`, error);
    return null;
  }
}

/**
 * Get outgoing amount for a specific address
 */
export function getOutgoingAmountForAddress(
  analysis: TransactionAnalysis,
  address: string
): number {
  const preBalances = (global as any).__txPreBalances || {};
  const postBalances = (global as any).__txPostBalances || {};

  const preBalance = preBalances[address] || 0;
  const postBalance = postBalances[address] || 0;
  const diff = (preBalance - postBalance) / LAMPORTS_PER_SOL;

  return Math.max(0, diff); // Return 0 if no outgoing transfer
}

/**
 * Extract accounts involved in a transaction
 */
export function getTransactionAccounts(analysis: TransactionAnalysis): string[] {
  return analysis.accountKeys;
}

/**
 * Format transaction for logging
 */
export function formatTransactionLog(
  cexLabel: string,
  amount: number,
  recipientShort: string,
  signature: string
): string {
  return `[${cexLabel}] Outgoing ${amount.toFixed(2)} SOL → ${recipientShort}`;
}
