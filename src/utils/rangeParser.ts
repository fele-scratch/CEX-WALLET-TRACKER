export interface Range {
  min: number;
  max: number;
}

/**
 * Parse range string like "13-15,14-26,29-31,99-100" into array of ranges
 */
export function parseRangeString(rangeStr: string): Range[] {
  return rangeStr
    .split(',')
    .map((range) => {
      const [min, max] = range.trim().split('-').map(Number);
      if (isNaN(min) || isNaN(max)) {
        throw new Error(`Invalid range format: ${range}`);
      }
      if (min > max) {
        throw new Error(`Invalid range: min (${min}) > max (${max})`);
      }
      return { min, max };
    });
}

/**
 * Check if amount is within any of the ranges
 */
export function isAmountInRange(amount: number, ranges: Range[]): boolean {
  return ranges.some((range) => amount >= range.min && amount <= range.max);
}

/**
 * Get the matching range for an amount
 */
export function getMatchingRange(amount: number, ranges: Range[]): Range | null {
  return ranges.find((range) => amount >= range.min && amount <= range.max) || null;
}
