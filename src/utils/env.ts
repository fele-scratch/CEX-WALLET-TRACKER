import dotenv from 'dotenv';

dotenv.config();

export interface CEXWallet {
  label: string;
  address: string;
  ranges: Array<{ min: number; max: number }>;
}

export interface Config {
  rpcEndpoint: string;
  cexWallets: CEXWallet[];
}

export function loadConfig(): Config {
  const rpcEndpoint = process.env.RPC_ENDPOINT;
  if (!rpcEndpoint) {
    throw new Error('RPC_ENDPOINT not set in .env');
  }

  const cexWallets: CEXWallet[] = [];

  // Parse CEX wallets from env variables
  // Pattern: CEX_X_LABEL, CEX_X_ADDRESS, CEX_X_RANGE
  let index = 1;
  while (true) {
    const label = process.env[`CEX_${index}_LABEL`];
    const address = process.env[`CEX_${index}_ADDRESS`];
    const rangeStr = process.env[`CEX_${index}_RANGE`];

    if (!label || !address || !rangeStr) {
      break;
    }

    const ranges = parseRanges(rangeStr);
    cexWallets.push({
      label,
      address,
      ranges,
    });

    index++;
  }

  if (cexWallets.length === 0) {
    throw new Error('No CEX wallets configured in .env');
  }

  return {
    rpcEndpoint,
    cexWallets,
  };
}

function parseRanges(rangeStr: string): Array<{ min: number; max: number }> {
  return rangeStr.split(',').map((range) => {
    const [min, max] = range.trim().split('-').map(Number);
    if (isNaN(min) || isNaN(max)) {
      throw new Error(`Invalid range format: ${range}`);
    }
    return { min, max };
  });
}
