import { ORDER_STATUS } from '~/domain';

const CANCELLATION_STATUSES = [ORDER_STATUS.CANCELLED, ORDER_STATUS.CANCEL] as const;

function isCancellationStatus(status?: string): boolean {
  if (!status) return false;
  return CANCELLATION_STATUSES.includes(
    status.trim().toUpperCase() as (typeof CANCELLATION_STATUSES)[number],
  );
}

/**
 * Derives the dominant order status for an order given its line items.
 *
 * Rules preserve unknown status strings while applying known precedence.
 */
export function getDominantOrderStatus(items?: { status_order?: string }[]): string {
  if (!items || items.length === 0) return ORDER_STATUS.PENDING;

  const allCancelled = items.every((it) => isCancellationStatus(it.status_order));
  if (allCancelled) return ORDER_STATUS.CANCELLED;

  const nonCancelled = items.filter((it) => !isCancellationStatus(it.status_order));
  const upperList = nonCancelled.map((it) => it.status_order?.trim().toUpperCase() || '');

  if (upperList.includes(ORDER_STATUS.UNFINISHED)) return ORDER_STATUS.UNFINISHED;
  if (upperList.includes(ORDER_STATUS.PROCESSING)) return ORDER_STATUS.PROCESSING;
  if (upperList.includes(ORDER_STATUS.PENDING)) return ORDER_STATUS.PENDING;

  const nonBlank = upperList.find((s) => s !== '');
  if (nonBlank) return nonBlank;

  return ORDER_STATUS.PENDING;
}
