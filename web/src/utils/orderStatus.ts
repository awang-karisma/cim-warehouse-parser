const CANCELLATION_STATUSES = ['BATAL', 'CANCEL'] as const;

function isCancellationStatus(status?: string): boolean {
  if (!status) return false;
  return CANCELLATION_STATUSES.includes(
    status.trim().toUpperCase() as (typeof CANCELLATION_STATUSES)[number],
  );
}

/**
 * Derives the dominant order status for an order given its line items.
 *
 * Rules:
 * - Absent or empty item list returns 'PENDING'.
 * - Returns 'BATAL' only when every line item is a cancellation status ('BATAL' or 'CANCEL').
 * - Otherwise excludes cancellation-status items before applying precedence:
 *   1. 'BELUM SELESAI'
 *   2. 'PROSES'
 *   3. 'PENDING'
 *   4. First nonblank status among remaining items
 * - If no non-cancellation status remains (e.g. only blanks/unrecognized empty statuses), returns 'PENDING'.
 */
export function getDominantOrderStatus(items?: { status_order?: string }[]): string {
  if (!items || items.length === 0) return 'PENDING';

  const allCancelled = items.every((it) => isCancellationStatus(it.status_order));
  if (allCancelled) {
    return 'BATAL';
  }

  const nonCancelled = items.filter((it) => !isCancellationStatus(it.status_order));
  const upperList = nonCancelled.map((it) => it.status_order?.trim().toUpperCase() || '');

  if (upperList.includes('BELUM SELESAI')) return 'BELUM SELESAI';
  if (upperList.includes('PROSES')) return 'PROSES';
  if (upperList.includes('PENDING')) return 'PENDING';

  const nonBlank = upperList.find((s) => s !== '');
  if (nonBlank) return nonBlank;

  return 'PENDING';
}
