import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

export interface ScrutinyResult {
  alertTriggered: boolean;
  condition: 'LOOP_DETECTED' | 'FIRST_TIME_ACTIVITY' | 'NONE';
  previousInflowSource?: string;
  previousInflowSignature?: string;
  explanation: string;
}

/**
 * Perform scrutiny check on an outgoing transfer
 *
 * RULE:
 * - Condition A: Previous inflow sender is same CEX address (loop detected) → ALERT
 * - Condition B: No previous inflow found (first-time activity) → ALERT
 * - Otherwise: No alert
 *
 * Uses cheap method: getSignaturesForAddress with limit 1
 */
export async function performScrutinyCheck(
  connection: Connection,
  recipientAddress: string,
  cexAddress: string,
  cexLabel: string
): Promise<ScrutinyResult> {
  try {
    // Convert recipient address string to PublicKey
    const recipientPk = new PublicKey(recipientAddress);
    
    // Get latest transaction signature for the recipient address
    const signatures = await connection.getSignaturesForAddress(recipientPk, {
      limit: 1,
    });

    if (signatures.length === 0) {
      // No previous transaction found - first-time activity
      return {
        alertTriggered: true,
        condition: 'FIRST_TIME_ACTIVITY',
        explanation: 'No previous transaction history found for recipient',
      };
    }

    const previousTx = signatures[0];
    const txDetails = await connection.getParsedTransaction(previousTx.signature, {
      maxSupportedTransactionVersion: 0,
    });

    if (!txDetails || !txDetails.meta) {
      return {
        alertTriggered: false,
        condition: 'NONE',
        explanation: 'Could not parse previous transaction',
      };
    }

    // Extract balance changes to identify inflow
    const preBalances = txDetails.meta.preBalances || [];
    const postBalances = txDetails.meta.postBalances || [];
    const accountKeys = (txDetails.transaction.message as any).accountKeys || [];

    const addresses: string[] = (accountKeys as any[]).map((entry: any) => {
      if (typeof entry === 'string') return entry;
      if (entry?.pubkey) {
        if (typeof entry.pubkey === 'string') return entry.pubkey;
        if (typeof entry.pubkey.toBase58 === 'function') return entry.pubkey.toBase58();
      }
      return String(entry);
    });

    // Find if there was an inflow to this address
    let inflowFound = false;
    let inflowSource = 'UNKNOWN';

    for (let i = 0; i < addresses.length; i++) {
      if (addresses[i] === recipientAddress) {
        const preBalance = preBalances[i] || 0;
        const postBalance = postBalances[i] || 0;
        const diff = (postBalance - preBalance) / LAMPORTS_PER_SOL;

        if (diff > 0) {
          // Found an inflow
          inflowFound = true;

          // Try to identify the source from account keys or logs
          // Simple heuristic: first account that decreased balance is likely the source
          for (let j = 0; j < addresses.length; j++) {
            if (j !== i) {
              const sourcePreBalance = preBalances[j] || 0;
              const sourcePostBalance = postBalances[j] || 0;
              const sourceDiff = (sourcePreBalance - sourcePostBalance) / LAMPORTS_PER_SOL;

              if (sourceDiff > 0 && sourceDiff === diff) {
                inflowSource = addresses[j];
                break;
              }
            }
          }
          break;
        }
      }
    }

    if (!inflowFound) {
      // No inflow found in previous transaction - first-time activity
      return {
        alertTriggered: true,
        condition: 'FIRST_TIME_ACTIVITY',
        previousInflowSignature: previousTx.signature,
        explanation: 'No inflow detected in previous transaction',
      };
    }

    // Condition A: Check if inflow source is same CEX address
    if (inflowSource === cexAddress) {
      return {
        alertTriggered: true,
        condition: 'LOOP_DETECTED',
        previousInflowSource: inflowSource,
        previousInflowSignature: previousTx.signature,
        explanation: `${cexLabel} → Recipient → ${cexLabel} (Loop detected)`,
      };
    }

    // No alert condition met
    return {
      alertTriggered: false,
      condition: 'NONE',
      previousInflowSource: inflowSource,
      previousInflowSignature: previousTx.signature,
      explanation: `Previous inflow from ${formatAddressShort(inflowSource)}, no loop detected`,
    };
  } catch (error) {
    console.error('[ScrutinyCheck] Error during scrutiny check:', error);
    return {
      alertTriggered: false,
      condition: 'NONE',
      explanation: `Error during scrutiny check: ${error instanceof Error ? error.message : 'Unknown'}`,
    };
  }
}

function formatAddressShort(address: string): string {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}
