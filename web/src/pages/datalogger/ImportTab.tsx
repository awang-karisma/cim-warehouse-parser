import { createMemo, createSignal, For, Show } from 'solid-js';
import {
  IconAlertCircle,
  IconCheck,
  IconCpu,
  IconDeviceFloppy,
  IconDownload,
  IconFileSpreadsheet,
  IconPlugConnected,
  IconPlugConnectedX,
  IconTrash,
  IconUpload,
} from '@tabler/icons-solidjs';
import { createDataloggerSession } from '~/api';
import { DataTable } from '~/components/DataTable';
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from '~/components/ui/alert-dialog';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { Progress } from '~/components/ui/progress';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table';
import { useI18n } from '~/i18n';
import type { DataloggerSession } from '~/types';
import { inspectCsv, parseCsvWithMapping } from '~/components/datalogger/csv-parser';
import type { DataloggerDeviceSession } from '~/components/datalogger/device-session';
import { isWebHidSupported } from '~/components/datalogger/elitech-hid';
import { rawRecordsToApiPayload } from '~/components/datalogger/elitech-protocol';
import { formatDateTimeFull } from '~/components/datalogger/format';
import type { CsvColumnMapping, CsvParsePreview, RawRecord } from '~/components/datalogger/types';

export interface ImportTabProps {
  device: DataloggerDeviceSession;
  onSessionSaved: (session: DataloggerSession) => void;
}

export function ImportTab(props: ImportTabProps) {
  const { t } = useI18n();
  const hidSupported = isWebHidSupported();

  // USB save form state
  const [deviceSessionName, setDeviceSessionName] = createSignal('');
  const [localSaveError, setLocalSaveError] = createSignal<string | null>(null);
  const [deviceSaving, setDeviceSaving] = createSignal(false);
  const [zeroRecordsNotice, setZeroRecordsNotice] = createSignal(false);
  const [confirmReplaceOpen, setConfirmReplaceOpen] = createSignal(false);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = createSignal(false);

  // CSV import state
  const [csvText, setCsvText] = createSignal('');
  const [csvFileName, setCsvFileName] = createSignal('');
  const [csvPreview, setCsvPreview] = createSignal<CsvParsePreview | null>(null);
  const [csvMapping, setCsvMapping] = createSignal<CsvColumnMapping | null>(null);
  const [csvSessionName, setCsvSessionName] = createSignal('');
  const [csvDeviceModel, setCsvDeviceModel] = createSignal('');
  const [csvSerial, setCsvSerial] = createSignal('');
  const [csvError, setCsvError] = createSignal<string | null>(null);
  const [csvSaving, setCsvSaving] = createSignal(false);
  const [isDragging, setIsDragging] = createSignal(false);

  const parsedCsv = createMemo(() => {
    const text = csvText();
    const mapping = csvMapping();
    if (!text || !mapping) return { records: [] as RawRecord[], skippedRows: 0 };
    return parseCsvWithMapping(text, mapping);
  });

  const handleConnect = async () => {
    setLocalSaveError(null);
    setZeroRecordsNotice(false);
    await props.device.connect();
  };

  const handleDisconnect = async () => {
    setLocalSaveError(null);
    setZeroRecordsNotice(false);
    await props.device.disconnect();
  };

  const executeFetchRecords = async () => {
    setLocalSaveError(null);
    setZeroRecordsNotice(false);
    const snap = await props.device.fetchRecords();
    if (snap) {
      const stamp = snap.pulledAt.toISOString().slice(0, 10);
      const serialPart = snap.serialNumber ? ` ${snap.serialNumber}` : '';
      setDeviceSessionName(`${snap.deviceModel}${serialPart} (${stamp})`.trim());
    } else if (props.device.deviceInfo()?.recordNumber === 0 && !props.device.deviceError()) {
      setZeroRecordsNotice(true);
    }
  };

  const handleRequestFetchRecords = () => {
    if (props.device.snapshot()) {
      setConfirmReplaceOpen(true);
      return;
    }
    void executeFetchRecords();
  };

  const handleConfirmReplaceFetch = () => {
    setConfirmReplaceOpen(false);
    void executeFetchRecords();
  };

  const handleConfirmDiscardSnapshot = () => {
    setConfirmDiscardOpen(false);
    props.device.discardSnapshot();
    setDeviceSessionName('');
    setLocalSaveError(null);
  };

  const handleSaveDeviceSession = async () => {
    const snap = props.device.snapshot();
    const name = deviceSessionName().trim();
    if (!snap || snap.records.length === 0) {
      setLocalSaveError('Fetch records from the logger before saving.');
      return;
    }
    if (!name) {
      setLocalSaveError('Enter a session name before saving.');
      return;
    }
    setLocalSaveError(null);
    setDeviceSaving(true);
    try {
      const res = await createDataloggerSession({
        name,
        device_model: snap.deviceModel,
        serial_number: snap.serialNumber,
        records: rawRecordsToApiPayload([...snap.records]),
      });
      props.device.discardSnapshot();
      setDeviceSessionName('');
      props.onSessionSaved(res.session);
    } catch (err) {
      setLocalSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeviceSaving(false);
    }
  };

  const loadCsvFile = async (file: File) => {
    setCsvError(null);
    try {
      const text = await file.text();
      const preview = inspectCsv(text);
      if (preview.headers.length === 0) {
        setCsvError('The selected file appears to be empty.');
        return;
      }
      setCsvText(text);
      setCsvFileName(file.name);
      setCsvPreview(preview);
      setCsvMapping(preview.detectedMapping);
      if (!csvSessionName().trim()) {
        setCsvSessionName(file.name.replace(/\.[^.]+$/, ''));
      }
    } catch (err) {
      setCsvError(err instanceof Error ? err.message : 'Failed to read CSV file.');
    }
  };

  const handleSaveCsvSession = async () => {
    const name = csvSessionName().trim();
    const recs = parsedCsv().records;
    if (!name) {
      setCsvError('Enter a session name before saving.');
      return;
    }
    if (recs.length === 0) {
      setCsvError('No valid timestamp + temperature rows could be parsed. Check column mapping.');
      return;
    }
    setCsvError(null);
    setCsvSaving(true);
    try {
      const res = await createDataloggerSession({
        name,
        device_model: csvDeviceModel().trim() || 'CSV Import',
        serial_number: csvSerial().trim(),
        records: rawRecordsToApiPayload(recs),
      });
      setCsvText('');
      setCsvFileName('');
      setCsvPreview(null);
      setCsvMapping(null);
      setCsvSessionName('');
      setCsvDeviceModel('');
      setCsvSerial('');
      props.onSessionSaved(res.session);
    } catch (err) {
      setCsvError(err instanceof Error ? err.message : String(err));
    } finally {
      setCsvSaving(false);
    }
  };

  const updateMapping = (patch: Partial<CsvColumnMapping>) => {
    const current = csvMapping();
    if (!current) return;
    setCsvMapping({ ...current, ...patch });
  };

  const progressPercent = createMemo(() => {
    const prog = props.device.deviceProgress();
    if (!prog || prog.total <= 0) return 0;
    return Math.min(100, Math.round((prog.fetched / prog.total) * 100));
  });

  const liveSerialDiffersFromSnapshot = createMemo(() => {
    const snap = props.device.snapshot();
    const live = props.device.deviceInfo();
    if (!snap || !live) return false;
    const liveSerial = live.serialNumber === '—' ? '' : live.serialNumber;
    return liveSerial !== snap.serialNumber;
  });

  return (
    <div class="space-y-6">
      {/* Card 1: WebHID Device Import */}
      <Card>
        <CardHeader>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="space-y-1">
              <CardTitle class="flex items-center gap-2">
                <IconCpu class="size-5 text-muted-foreground" />
                Connect USB Logger (WebHID)
              </CardTitle>
              <CardDescription>
                Read temperature and humidity readings directly from an Elitech USB logger in Chrome, Edge, or Brave.
              </CardDescription>
            </div>
            <Badge variant={props.device.connected() ? 'success' : 'secondary'}>
              {props.device.connected()
                ? t('dataloggerConfig.connected')
                : t('dataloggerConfig.disconnected')}
            </Badge>
          </div>
        </CardHeader>
        <CardContent class="space-y-4">
          <Show when={!hidSupported}>
            <Alert>
              <IconAlertCircle class="size-4" />
              <AlertTitle>{t('dataloggerConfig.webHidUnavailableTitle')}</AlertTitle>
              <AlertDescription>
                Your browser does not expose <code class="font-mono text-xs">navigator.hid</code> (requires a Chromium browser over HTTPS or localhost). Use CSV import below instead.
              </AlertDescription>
            </Alert>
          </Show>

          <Show when={props.device.deviceError() || localSaveError()}>
            <Alert variant="destructive">
              <IconAlertCircle class="size-4" />
              <AlertTitle>{t('dataloggerConfig.deviceErrorTitle')}</AlertTitle>
              <AlertDescription>{localSaveError() ?? props.device.deviceError()}</AlertDescription>
            </Alert>
          </Show>

          <Show when={zeroRecordsNotice()}>
            <Alert>
              <IconAlertCircle class="size-4" />
              <AlertTitle>No Stored Readings</AlertTitle>
              <AlertDescription>{t('dataloggerConfig.zeroRecordsOnDevice')}</AlertDescription>
            </Alert>
          </Show>

          <div class="flex flex-wrap items-center gap-2">
            <Show
              when={!props.device.connected()}
              fallback={
                <Button
                  variant="outline"
                  onClick={handleDisconnect}
                  disabled={props.device.deviceBusy()}
                >
                  <IconPlugConnectedX class="size-4" />
                  {t('dataloggerConfig.disconnect')}
                </Button>
              }
            >
              <Button
                onClick={handleConnect}
                disabled={!hidSupported || props.device.deviceBusy()}
              >
                <IconPlugConnected class="size-4" />
                {props.device.deviceBusy()
                  ? t('dataloggerConfig.connecting')
                  : t('dataloggerConfig.connectDevice')}
              </Button>
            </Show>

            <Show when={props.device.deviceInfo()}>
              {(info) => (
                <Button
                  variant="secondary"
                  onClick={handleRequestFetchRecords}
                  disabled={props.device.deviceBusy()}
                >
                  <IconDownload class="size-4" />
                  {props.device.deviceBusy()
                    ? 'Reading Records…'
                    : `Fetch ${info().recordNumber.toLocaleString()} Records`}
                </Button>
              )}
            </Show>
          </div>

          <Show when={props.device.deviceInfo()}>
            {(info) => (
              <div class="grid grid-cols-2 gap-3 rounded-md border bg-muted/30 p-4 sm:grid-cols-3 lg:grid-cols-5">
                <div>
                  <div class="text-xs text-muted-foreground">{t('dataloggerConfig.modelLabel')}</div>
                  <div class="text-sm font-medium">{info().modelName}</div>
                </div>
                <div>
                  <div class="text-xs text-muted-foreground">{t('dataloggerConfig.serialLabel')}</div>
                  <div class="font-mono text-sm font-medium">{info().serialNumber}</div>
                </div>
                <div>
                  <div class="text-xs text-muted-foreground">
                    {t('dataloggerConfig.storedRecordsLabel')}
                  </div>
                  <div class="font-mono text-sm font-medium tabular-nums">
                    {info().recordNumber.toLocaleString()} / {info().deviceCapacity.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div class="text-xs text-muted-foreground">
                    {t('dataloggerConfig.currentIntervalLabel')}
                  </div>
                  <div class="font-mono text-sm font-medium">{info().intervalFormatted}</div>
                </div>
                <div>
                  <div class="text-xs text-muted-foreground">
                    {t('dataloggerConfig.firmwareProtocolLabel')}
                  </div>
                  <div class="font-mono text-sm font-medium">
                    v{info().firmwareVersion} / 0x{info().protocolVersion.toString(16).toUpperCase()}
                  </div>
                </div>
                <div>
                  <div class="text-xs text-muted-foreground">{t('dataloggerConfig.batteryLabel')}</div>
                  <div class="font-mono text-sm font-medium">{info().batteryLevel}</div>
                </div>
                <div>
                  <div class="text-xs text-muted-foreground">{t('dataloggerConfig.unitLabel')}</div>
                  <div class="font-mono text-sm font-medium">{info().temperatureUnit}</div>
                </div>
                <div class="col-span-2 sm:col-span-2 lg:col-span-3">
                  <div class="text-xs text-muted-foreground">
                    {t('dataloggerConfig.deviceClockLabel')}
                  </div>
                  <div class="font-mono text-sm font-medium">
                    {formatDateTimeFull(info().deviceTime)}
                  </div>
                </div>
              </div>
            )}
          </Show>

          <Show when={props.device.deviceProgress() && props.device.deviceProgress()!.total > 0}>
            <div class="space-y-1.5">
              <div class="flex items-center justify-between text-xs text-muted-foreground">
                <span>Reading logger memory</span>
                <span class="font-mono tabular-nums">
                  {props.device.deviceProgress()!.fetched.toLocaleString()} /{' '}
                  {props.device.deviceProgress()!.total.toLocaleString()} ({progressPercent()}%)
                </span>
              </div>
              <Progress value={progressPercent()} />
            </div>
          </Show>

          <Show when={props.device.snapshot()}>
            {(snap) => (
              <div class="space-y-3 rounded-md border bg-card p-4">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <div class="space-y-0.5">
                    <div class="text-sm font-semibold">
                      {t('dataloggerConfig.snapshotReadyTitle')}
                    </div>
                    <div class="text-xs text-muted-foreground">
                      {t('dataloggerConfig.snapshotCapturedFrom', {
                        model: snap().deviceModel,
                        serial: snap().serialNumber || t('dataloggerConfig.snapshotNoSerial'),
                        count: snap().records.length.toLocaleString(),
                      })}
                    </div>
                  </div>
                  <Badge variant="outline" class="font-mono text-xs">
                    {snap().deviceModel} ·{' '}
                    {snap().serialNumber || t('dataloggerConfig.snapshotNoSerial')}
                  </Badge>
                </div>

                <Show when={liveSerialDiffersFromSnapshot()}>
                  <Alert>
                    <IconAlertCircle class="size-4" />
                    <AlertDescription class="text-xs">
                      {t('dataloggerConfig.snapshotDifferentDeviceNotice', {
                        snapshotSerial:
                          snap().serialNumber || t('dataloggerConfig.snapshotNoSerial'),
                        liveSerial: props.device.deviceInfo()?.serialNumber ?? '—',
                      })}
                    </AlertDescription>
                  </Alert>
                </Show>

                <div class="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div class="flex-1 space-y-1.5">
                    <label
                      class="text-xs font-medium text-muted-foreground"
                      for="dl-device-session-name"
                    >
                      Session Name ({snap().records.length.toLocaleString()} records ready)
                    </label>
                    <input
                      id="dl-device-session-name"
                      type="text"
                      value={deviceSessionName()}
                      onInput={(e) => setDeviceSessionName(e.currentTarget.value)}
                      placeholder="e.g. Cold Room A - May Shipment"
                      class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    />
                  </div>
                  <div class="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setConfirmDiscardOpen(true)}
                      disabled={deviceSaving()}
                    >
                      <IconTrash class="size-4" />
                      {t('dataloggerConfig.discardSnapshotBtn')}
                    </Button>
                    <Button onClick={handleSaveDeviceSession} disabled={deviceSaving()}>
                      <IconDeviceFloppy class="size-4" />
                      {deviceSaving() ? 'Saving…' : 'Save Session'}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </Show>
        </CardContent>
      </Card>

      {/* Card 2: CSV File Import */}
      <Card>
        <CardHeader>
          <CardTitle class="flex items-center gap-2">
            <IconFileSpreadsheet class="size-5 text-muted-foreground" />
            Import CSV File
          </CardTitle>
          <CardDescription>
            Upload Elitech CSV exports (<code class="font-mono text-xs">#,DateTime,Temperature,Humidity,Flags</code>) or any timestamped CSV file.
          </CardDescription>
        </CardHeader>
        <CardContent class="space-y-4">
          <Show when={csvError()}>
            <Alert variant="destructive">
              <IconAlertCircle class="size-4" />
              <AlertTitle>Import Error</AlertTitle>
              <AlertDescription>{csvError()}</AlertDescription>
            </Alert>
          </Show>

          <label
            class={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
              isDragging() ? 'border-primary bg-accent/60' : 'border-border hover:bg-muted/40'
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              const file = e.dataTransfer?.files?.[0];
              if (file) void loadCsvFile(file);
            }}
          >
            <IconUpload class="size-6 text-muted-foreground" />
            <div class="text-sm font-medium">
              {csvFileName() ? `Loaded: ${csvFileName()}` : 'Drop a CSV file here or click to browse'}
            </div>
            <div class="text-xs text-muted-foreground">
              Supports comma, semicolon, or tab delimited files
            </div>
            <input
              type="file"
              accept=".csv,.txt,text/csv"
              class="sr-only"
              onChange={(e) => {
                const file = e.currentTarget.files?.[0];
                if (file) void loadCsvFile(file);
              }}
            />
          </label>

          <Show when={csvPreview() && csvMapping()}>
            <div class="space-y-4">
              <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div class="space-y-1">
                  <label class="text-xs font-medium text-muted-foreground" for="dl-csv-name">
                    Session Name *
                  </label>
                  <input
                    id="dl-csv-name"
                    type="text"
                    value={csvSessionName()}
                    onInput={(e) => setCsvSessionName(e.currentTarget.value)}
                    placeholder="Session name"
                    class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
                <div class="space-y-1">
                  <label class="text-xs font-medium text-muted-foreground" for="dl-csv-model">
                    Device Model (optional)
                  </label>
                  <input
                    id="dl-csv-model"
                    type="text"
                    value={csvDeviceModel()}
                    onInput={(e) => setCsvDeviceModel(e.currentTarget.value)}
                    placeholder="e.g. Elitech RC-51H"
                    class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
                <div class="space-y-1">
                  <label class="text-xs font-medium text-muted-foreground" for="dl-csv-serial">
                    Serial Number (optional)
                  </label>
                  <input
                    id="dl-csv-serial"
                    type="text"
                    value={csvSerial()}
                    onInput={(e) => setCsvSerial(e.currentTarget.value)}
                    placeholder="e.g. EF2200192"
                    class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
              </div>

              {/* Column mapping controls */}
              <div class="grid grid-cols-2 gap-3 rounded-md border bg-muted/30 p-3 sm:grid-cols-5">
                <div class="space-y-1">
                  <label class="text-xs font-medium text-muted-foreground">Timestamp Col</label>
                  <select
                    value={csvMapping()!.timestampCol}
                    onChange={(e) => updateMapping({ timestampCol: Number(e.currentTarget.value) })}
                    class="h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
                  >
                    <For each={csvPreview()!.headers}>
                      {(h, i) => <option value={i()}>{h || `Col ${i() + 1}`}</option>}
                    </For>
                  </select>
                </div>
                <div class="space-y-1">
                  <label class="text-xs font-medium text-muted-foreground">Temperature Col</label>
                  <select
                    value={csvMapping()!.temperatureCol}
                    onChange={(e) => updateMapping({ temperatureCol: Number(e.currentTarget.value) })}
                    class="h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
                  >
                    <For each={csvPreview()!.headers}>
                      {(h, i) => <option value={i()}>{h || `Col ${i() + 1}`}</option>}
                    </For>
                  </select>
                </div>
                <div class="space-y-1">
                  <label class="text-xs font-medium text-muted-foreground">Humidity Col</label>
                  <select
                    value={csvMapping()!.humidityCol ?? -1}
                    onChange={(e) => {
                      const val = Number(e.currentTarget.value);
                      updateMapping({ humidityCol: val < 0 ? null : val });
                    }}
                    class="h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
                  >
                    <option value={-1}>None</option>
                    <For each={csvPreview()!.headers}>
                      {(h, i) => <option value={i()}>{h || `Col ${i() + 1}`}</option>}
                    </For>
                  </select>
                </div>
                <div class="space-y-1">
                  <label class="text-xs font-medium text-muted-foreground">Flags Col</label>
                  <select
                    value={csvMapping()!.flagsCol ?? -1}
                    onChange={(e) => {
                      const val = Number(e.currentTarget.value);
                      updateMapping({ flagsCol: val < 0 ? null : val });
                    }}
                    class="h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
                  >
                    <option value={-1}>None</option>
                    <For each={csvPreview()!.headers}>
                      {(h, i) => <option value={i()}>{h || `Col ${i() + 1}`}</option>}
                    </For>
                  </select>
                </div>
                <label class="flex items-center gap-2 self-end pb-2 text-xs font-medium">
                  <input
                    type="checkbox"
                    checked={csvMapping()!.hasHeader}
                    onChange={(e) => updateMapping({ hasHeader: e.currentTarget.checked })}
                    class="size-4 rounded border-input"
                  />
                  First row is header
                </label>
              </div>

              <div class="flex flex-wrap items-center justify-between gap-2">
                <div class="flex items-center gap-2 text-xs text-muted-foreground">
                  <IconCheck class="size-4 text-status-selesai" />
                  <span>
                    Parsed <strong class="font-mono text-foreground">{parsedCsv().records.length.toLocaleString()}</strong> valid records
                    <Show when={parsedCsv().skippedRows > 0}>
                      {' '}({parsedCsv().skippedRows} skipped)
                    </Show>
                  </span>
                </div>
                <Button onClick={handleSaveCsvSession} disabled={csvSaving() || parsedCsv().records.length === 0}>
                  <IconDeviceFloppy class="size-4" />
                  {csvSaving() ? 'Saving…' : 'Save CSV Session'}
                </Button>
              </div>

              {/* Preview first 10 parsed rows */}
              <Show when={parsedCsv().records.length > 0}>
                <div class="space-y-1.5">
                  <div class="text-xs font-medium text-muted-foreground">
                    Preview (first {Math.min(10, parsedCsv().records.length)} records)
                  </div>
                  <DataTable>
                    <TableHeader>
                      <TableRow>
                        <TableHead class="w-12">#</TableHead>
                        <TableHead>Timestamp</TableHead>
                        <TableHead class="text-right">Temperature</TableHead>
                        <TableHead class="text-right">Humidity</TableHead>
                        <TableHead>Flags</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <For each={parsedCsv().records.slice(0, 10)}>
                        {(rec, idx) => (
                          <TableRow>
                            <TableCell class="font-mono text-xs text-muted-foreground">{idx() + 1}</TableCell>
                            <TableCell class="font-mono text-xs">{formatDateTimeFull(rec.time)}</TableCell>
                            <TableCell class="text-right font-mono text-xs tabular-nums">{rec.temperature.toFixed(1)}°C</TableCell>
                            <TableCell class="text-right font-mono text-xs tabular-nums">
                              {rec.humidity !== null ? `${rec.humidity.toFixed(1)}%` : '—'}
                            </TableCell>
                            <TableCell class="font-mono text-xs">{rec.flags}</TableCell>
                          </TableRow>
                        )}
                      </For>
                    </TableBody>
                  </DataTable>
                </div>
              </Show>
            </div>
          </Show>
        </CardContent>
      </Card>

      {/* Confirmation: Replace unsaved pulled snapshot */}
      <AlertDialog open={confirmReplaceOpen()} onOpenChange={setConfirmReplaceOpen}>
        <AlertDialogContent>
          <AlertDialogTitle>
            {t('dataloggerConfig.replaceSnapshotConfirmTitle')}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t('dataloggerConfig.replaceSnapshotConfirmDesc', {
              count: (props.device.snapshot()?.records.length ?? 0).toLocaleString(),
              model: props.device.snapshot()?.deviceModel ?? '',
              serial:
                props.device.snapshot()?.serialNumber ||
                t('dataloggerConfig.snapshotNoSerial'),
            })}
          </AlertDialogDescription>
          <AlertDialogFooter class="gap-2">
            <Button variant="outline" onClick={() => setConfirmReplaceOpen(false)}>
              {t('dataloggerConfig.cancelBtn')}
            </Button>
            <Button onClick={handleConfirmReplaceFetch}>
              {t('dataloggerConfig.replaceSnapshotConfirmBtn')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmation: Discard unsaved pulled snapshot */}
      <AlertDialog open={confirmDiscardOpen()} onOpenChange={setConfirmDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogTitle>
            {t('dataloggerConfig.discardSnapshotConfirmTitle')}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t('dataloggerConfig.discardSnapshotConfirmDesc', {
              count: (props.device.snapshot()?.records.length ?? 0).toLocaleString(),
              model: props.device.snapshot()?.deviceModel ?? '',
              serial:
                props.device.snapshot()?.serialNumber ||
                t('dataloggerConfig.snapshotNoSerial'),
            })}
          </AlertDialogDescription>
          <AlertDialogFooter class="gap-2">
            <Button variant="outline" onClick={() => setConfirmDiscardOpen(false)}>
              {t('dataloggerConfig.cancelBtn')}
            </Button>
            <Button variant="destructive" onClick={handleConfirmDiscardSnapshot}>
              {t('dataloggerConfig.discardSnapshotBtn')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
