import { type Component, createSignal, Show } from 'solid-js';
import { parseAndAddFromText } from '~/stores/barcodeItems';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { Button } from '~/components/ui/button';
import { Alert, AlertDescription } from '~/components/ui/alert';
import { IconClipboard, IconUpload, IconAlertTriangle } from '@tabler/icons-solidjs';

interface PasteModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PasteModal: Component<PasteModalProps> = (props) => {
  const [text, setText] = createSignal('');
  const [error, setError] = createSignal<string | null>(null);

  const handleProcess = () => {
    setError(null);
    const success = parseAndAddFromText(text());
    if (success) {
      setText('');
      props.onClose();
    } else {
      setError(
        'Unrecognized data format. Please paste at least 2 tab/comma-separated columns (Code, Name) or a valid JSON list.'
      );
    }
  };

  const handleFileUpload = (e: Event) => {
    const target = e.currentTarget as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = String(event.target?.result || '');
      setText(content);
      const success = parseAndAddFromText(content);
      if (success) {
        setText('');
        props.onClose();
      } else {
        setError('Unrecognized file content format.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <Dialog open={props.isOpen} onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent class="max-w-xl">
        <DialogHeader>
          <DialogTitle class="flex items-center gap-2 text-base">
            <IconClipboard class="size-5 text-primary" />
            Paste / Import Item Data
          </DialogTitle>
          <DialogDescription class="text-xs">
            Copy and paste rows from Excel/Google Sheets, or upload a CSV, TSV, or JSON file.
          </DialogDescription>
        </DialogHeader>

        <div class="space-y-4 py-2">
          <Show when={error()}>
            <Alert variant="destructive">
              <IconAlertTriangle class="size-4" />
              <AlertDescription class="text-xs">{error()}</AlertDescription>
            </Alert>
          </Show>

          <div>
            <label class="block text-xs font-semibold text-foreground mb-1.5">
              Paste spreadsheet rows or JSON payload:
            </label>
            <textarea
              rows={8}
              value={text()}
              onInput={(e) => setText(e.currentTarget.value)}
              placeholder={`ItemCode\tItemName\tBarcode\tQty\tUnit\tPrice\nITM-001\tSpiral Notebook A5\t89912345601\t12\tPcs\t15000\nITM-002\tGel Pen 0.5 Black\t89912345602\t24\tPcs\t8500`}
              class="w-full text-xs font-mono p-3 border rounded-md bg-muted/30 focus:outline-none focus:ring-2 focus:ring-primary leading-relaxed"
            />
          </div>

          <div class="flex items-center justify-between text-xs text-muted-foreground pt-1">
            <label class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border bg-muted/40 hover:bg-muted text-foreground cursor-pointer transition-colors">
              <IconUpload class="size-4 text-muted-foreground" />
              <span>Upload CSV / TSV / JSON</span>
              <input
                type="file"
                accept=".csv,.tsv,.txt,.json"
                onChange={handleFileUpload}
                class="hidden"
              />
            </label>
            <span class="text-[11px] text-muted-foreground">Columns: Code, Name, Barcode, Qty, Unit, Price</span>
          </div>
        </div>

        <DialogFooter class="sm:justify-end gap-2 pt-2">
          <Button variant="outline" onClick={props.onClose}>
            Cancel
          </Button>
          <Button onClick={handleProcess} disabled={text().trim().length === 0}>
            Import Items
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
