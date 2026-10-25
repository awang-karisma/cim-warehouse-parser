import { createSignal } from 'solid-js';
import type { AccurateNormalizedItem, BarcodeItem } from '~/types';

export const [items, setItems] = createSignal<BarcodeItem[]>([]);

export function addItem(partial?: Partial<BarcodeItem>): void {
  const current = items();
  const nextNum = current.length + 1;
  const newItem: BarcodeItem = {
    id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    selected: true,
    itemNo: partial?.itemNo || `BRG-${String(nextNum).padStart(3, '0')}`,
    itemName: partial?.itemName || `New Item ${nextNum}`,
    barcode: partial?.barcode || `899${String(Date.now()).slice(-9)}`,
    quantity: partial?.quantity ?? 1,
    unit: partial?.unit || 'Pcs',
    price: partial?.price ?? 10000,
    documentType: partial?.documentType,
    documentNumber: partial?.documentNumber,
  };
  setItems([...current, newItem]);
}

export function addNormalizedItems(normItems: AccurateNormalizedItem[]): void {
  const current = items();
  const added: BarcodeItem[] = normItems.map((it, idx) => ({
    id: `item-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
    selected: true,
    itemNo: it.itemNo,
    itemName: it.itemName,
    barcode: it.upcNo || it.itemNo,
    quantity: it.quantity > 0 ? it.quantity : 1,
    unit: it.unitName || 'Pcs',
    price: it.unitPrice ?? 0,
    documentType: it.documentType,
    documentNumber: it.documentNumber,
  }));
  setItems([...current, ...added]);
}

export function updateItemField<K extends keyof BarcodeItem>(id: string, field: K, value: BarcodeItem[K]): void {
  setItems((prev) =>
    prev.map((it) => (it.id === id ? { ...it, [field]: value } : it))
  );
}

export function deleteItem(id: string): void {
  setItems((prev) => prev.filter((it) => it.id !== id));
}

export function clearItems(): void {
  setItems([]);
}

export function toggleSelectAll(checked: boolean): void {
  setItems((prev) => prev.map((it) => ({ ...it, selected: checked })));
}

export function parseAndAddFromText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;

  // 1. Try parsing JSON
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      let rawList: unknown[] = [];
      if (Array.isArray(parsed)) {
        rawList = parsed;
      } else if (parsed && typeof parsed === 'object') {
        const obj = parsed as Record<string, unknown>;
        if (Array.isArray(obj.detailItem)) {
          rawList = obj.detailItem;
        } else if (Array.isArray(obj.items)) {
          rawList = obj.items;
        } else if (Array.isArray(obj.data)) {
          rawList = obj.data;
        }
      }

      if (rawList.length > 0) {
        const parsedItems: BarcodeItem[] = rawList.map((row, idx) => {
          const r = row && typeof row === 'object' ? (row as Record<string, unknown>) : {};
          const itemNo = String(r.itemNo || r.item_no || r.no || `BRG-${idx + 1}`);
          const itemName = String(r.itemName || r.item_name || r.name || `Item ${idx + 1}`);
          const barcode = String(r.upcNo || r.upc || r.barcode || itemNo);
          const quantity = Number(r.quantity || r.qty || 1) || 1;
          let unit = 'Pcs';
          if (r.itemUnit && typeof r.itemUnit === 'object' && 'name' in (r.itemUnit as Record<string, unknown>)) {
            unit = String((r.itemUnit as Record<string, unknown>).name);
          } else if (r.unit) {
            unit = String(r.unit);
          }
          const price = Number(r.unitPrice || r.price || 0) || 0;

          return {
            id: `item-${Date.now()}-${idx}`,
            selected: true,
            itemNo,
            itemName,
            barcode,
            quantity,
            unit,
            price,
          };
        });

        setItems(parsedItems);
        return true;
      }
    } catch {
      // Not JSON, continue to TSV/CSV
    }
  }

  // 2. Parse TSV / CSV
  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return false;

  const delimiter = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';
  let startIdx = 0;
  const firstLineLower = lines[0].toLowerCase();
  if (
    firstLineLower.includes('kode') ||
    firstLineLower.includes('item') ||
    firstLineLower.includes('nama') ||
    firstLineLower.includes('barcode')
  ) {
    startIdx = 1;
  }

  const parsedItems: BarcodeItem[] = [];
  for (let i = startIdx; i < lines.length; i++) {
    const cols = lines[i].split(delimiter).map((c) => c.trim().replace(/^["']|["']$/g, ''));
    if (cols.length >= 2) {
      parsedItems.push({
        id: `item-${Date.now()}-${i}`,
        selected: true,
        itemNo: cols[0] || `BRG-${i + 1}`,
        itemName: cols[1] || `Item ${i + 1}`,
        barcode: cols[2] || cols[0],
        quantity: parseInt(cols[3], 10) || 1,
        unit: cols[4] || 'Pcs',
        price: parseFloat(cols[5]) || 0,
      });
    }
  }

  if (parsedItems.length > 0) {
    setItems(parsedItems);
    return true;
  }

  return false;
}
