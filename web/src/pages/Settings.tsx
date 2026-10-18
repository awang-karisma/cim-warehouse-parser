import { type Component, createSignal, createResource, Show, For } from 'solid-js';
import {
  IconDeviceDesktop,
  IconSettings as IconSettingsIcon,
  IconDatabase,
  IconTool,
  IconRefresh,
  IconUsers,
  IconTrash,
  IconPlus,
  IconAlertCircle,
  IconSun,
  IconMoon,
  IconDownload,
  IconUpload,
  IconCheck,
} from '@tabler/icons-solidjs';
import { useColorMode } from '@kobalte/core';
import {
  getSystemInfo,
  getConfig,
  getStatus,
  triggerSync,
  getCustomerAliases,
  setCustomerAlias,
  deleteCustomerAlias,
  getCustomerAliasesExportUrl,
  importCustomerAliasesFile,
  type AliasImportResult,
} from '../api';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '~/components/ui/card';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '~/components/ui/table';
import { TextField, TextFieldInput, TextFieldLabel } from '~/components/ui/text-field';
import { Alert, AlertTitle, AlertDescription } from '~/components/ui/alert';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
} from '~/components/ui/alert-dialog';
import { Button } from '~/components/ui/button';
import { Separator } from '~/components/ui/separator';
import { Skeleton } from '~/components/ui/skeleton';
import { Badge } from '../components/Badge';

export const Settings: Component = () => {
  const { colorMode, setColorMode } = useColorMode();
  const [system] = createResource(getSystemInfo);
  const [config] = createResource(getConfig);
  const [status, { refetch: refetchStatus }] = createResource(getStatus);
  const [aliasesData, { refetch: refetchAliases }] = createResource(getCustomerAliases);

  const [aliasInput, setAliasInput] = createSignal('');
  const [canonicalInput, setCanonicalInput] = createSignal('');
  const [areaInput, setAreaInput] = createSignal('');
  const [aliasError, setAliasError] = createSignal('');
  const [isAdding, setIsAdding] = createSignal(false);
  const [aliasToDelete, setAliasToDelete] = createSignal<string>('');
  const [importMode, setImportMode] = createSignal<'merge' | 'replace'>('merge');
  const [isImporting, setIsImporting] = createSignal(false);
  const [importResult, setImportResult] = createSignal<AliasImportResult | null>(null);
  const [showImportModeDialog, setShowImportModeDialog] = createSignal(false);
  const [pendingFile, setPendingFile] = createSignal<File | null>(null);
  let fileInputRef: HTMLInputElement | undefined;

  const handleExportSQL = () => {
    const a = document.createElement('a');
    a.href = getCustomerAliasesExportUrl();
    a.download = 'customer-aliases.sql';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleConfirmImport = async () => {
    const file = pendingFile();
    if (!file) return;
    setIsImporting(true);
    setAliasError('');
    setImportResult(null);
    try {
      const res = await importCustomerAliasesFile(file, importMode());
      setImportResult(res);
      setShowImportModeDialog(false);
      setPendingFile(null);
      refetchAliases();
    } catch (err: unknown) {
      setAliasError(err instanceof Error ? err.message : 'Failed to import customer aliases');
      setShowImportModeDialog(false);
      setPendingFile(null);
    } finally {
      setIsImporting(false);
    }
  };

  const handleAddAlias = async (e: Event) => {
    e.preventDefault();
    const a = aliasInput().trim();
    const c = canonicalInput().trim();
    if (!a || !c) {
      setAliasError('Both Variant Name (alias) and Canonical Name are required');
      return;
    }
    if (a.toLowerCase() === c.toLowerCase()) {
      setAliasError('Alias cannot be equal to canonical name');
      return;
    }
    setIsAdding(true);
    setAliasError('');
    try {
      await setCustomerAlias(a, c, areaInput().trim() || undefined);
      setAliasInput('');
      setCanonicalInput('');
      setAreaInput('');
      refetchAliases();
    } catch (err: unknown) {
      setAliasError(err instanceof Error ? err.message : 'Failed to add alias');
    } finally {
      setIsAdding(false);
    }
  };

  const confirmDeleteAlias = async () => {
    const alias = aliasToDelete();
    if (!alias) return;
    setAliasError('');
    try {
      await deleteCustomerAlias(alias);
      setAliasToDelete('');
      refetchAliases();
    } catch (err: unknown) {
      setAliasError(err instanceof Error ? err.message : 'Failed to delete alias');
    }
  };

  const [resyncing, setResyncing] = createSignal(false);
  const [resyncMsg, setResyncMsg] = createSignal('');

  const handleForceResync = async () => {
    if (resyncing()) return;
    setResyncing(true);
    setResyncMsg('Triggering full resync...');
    try {
      const res = await triggerSync();
      setResyncMsg(`Resync finished: ${res.message || 'Success'}`);
      refetchStatus();
    } catch (err: unknown) {
      setResyncMsg(err instanceof Error ? err.message : 'Resync error');
    } finally {
      setResyncing(false);
    }
  };

  const formatUptime = (seconds?: number) => {
    if (!seconds && seconds !== 0) return '-';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs}h ${mins}m ${secs}s`;
  };

  return (
    <div class="flex flex-1 flex-col gap-6">
      {/* Appearance Theme Card */}
      <Card>
        <CardHeader class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 space-y-0 pb-4">
          <div>
            <CardTitle class="text-base font-semibold">Theme & Appearance</CardTitle>
            <CardDescription>Select light, dark, or system mode</CardDescription>
          </div>
          <div class="flex items-center gap-2">
            <Button
              variant={colorMode() === 'light' ? 'default' : 'outline'}
              size="sm"
              class="gap-1.5 text-xs h-8"
              onClick={() => setColorMode('light')}
            >
              <IconSun class="size-3.5" />
              <span>Light</span>
            </Button>
            <Button
              variant={colorMode() === 'dark' ? 'default' : 'outline'}
              size="sm"
              class="gap-1.5 text-xs h-8"
              onClick={() => setColorMode('dark')}
            >
              <IconMoon class="size-3.5" />
              <span>Dark</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              class="gap-1.5 text-xs h-8"
              onClick={() => setColorMode('system')}
            >
              <IconDeviceDesktop class="size-3.5" />
              <span>System</span>
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* 2-Column: Server Runtime + Sync Config */}
      <div class="grid gap-6 lg:grid-cols-2 items-stretch">
        {/* Server Runtime Info Card */}
        <Card class="flex flex-col justify-between">
          <div>
            <CardHeader class="flex flex-row items-center gap-2 space-y-0 pb-4">
              <IconDeviceDesktop class="size-5 text-primary" />
              <div>
                <CardTitle class="text-base font-semibold">Server Runtime Information</CardTitle>
                <CardDescription>Internal backend environment</CardDescription>
              </div>
            </CardHeader>
            <CardContent class="space-y-3">
              <div class="flex justify-between items-center text-sm py-1">
                <span class="text-xs text-muted-foreground">Application Version</span>
                <span class="font-semibold">{system()?.version || 'v1.0.0'}</span>
              </div>
              <Separator />
              <div class="flex justify-between items-center text-sm py-1">
                <span class="text-xs text-muted-foreground">Go Runtime Version</span>
                <span class="font-semibold">{system()?.go_version || '-'}</span>
              </div>
              <Separator />
              <div class="flex justify-between items-center text-sm py-1">
                <span class="text-xs text-muted-foreground">HTTP Server Port</span>
                <span class="font-semibold">:{system()?.port || '8080'}</span>
              </div>
              <Separator />
              <div class="flex justify-between items-center text-sm py-1">
                <span class="text-xs text-muted-foreground">SQLite Database Path</span>
                <span class="font-mono text-xs font-semibold">
                  {system()?.db_path || 'data/warehouse.db'}
                </span>
              </div>
              <Separator />
              <div class="flex justify-between items-center text-sm py-1">
                <span class="text-xs text-muted-foreground">Server Uptime</span>
                <span class="font-semibold">{formatUptime(system()?.uptime_seconds)}</span>
              </div>
            </CardContent>
          </div>
        </Card>

        {/* Sync Configuration Card */}
        <Card class="flex flex-col justify-between">
          <div>
            <CardHeader class="flex flex-row items-center gap-2 space-y-0 pb-4">
              <IconSettingsIcon class="size-5 text-primary" />
              <div>
                <CardTitle class="text-base font-semibold">Data Source & Scheduling</CardTitle>
                <CardDescription>Synchronization parameters and rules</CardDescription>
              </div>
            </CardHeader>
            <CardContent class="space-y-3">
              <div class="flex justify-between items-center text-sm py-1">
                <span class="text-xs text-muted-foreground">Sync Interval</span>
                <span class="font-semibold">{config()?.sync_interval || '15m'}</span>
              </div>
              <Separator />
              <div class="flex justify-between items-center text-sm py-1">
                <span class="text-xs text-muted-foreground">Working Hours Window</span>
                <span class="font-semibold">
                  {config()?.work_hours_start || '08:00'} – {config()?.work_hours_end || '17:00'}
                </span>
              </div>
              <Separator />
              <div class="flex justify-between items-center text-sm py-1">
                <span class="text-xs text-muted-foreground">Timezone</span>
                <span class="font-semibold">{config()?.timezone || 'Asia/Makassar'}</span>
              </div>
              <Separator />
              <div class="flex justify-between items-center text-sm py-1">
                <span class="text-xs text-muted-foreground">Active Work Days</span>
                <span class="font-semibold">
                  {config()?.work_days ? config()!.work_days.join(', ') : 'Monday – Saturday'}
                </span>
              </div>
              <Separator />
              <div class="flex justify-between items-center text-sm py-1">
                <span class="text-xs text-muted-foreground">Worker Status</span>
                <span>
                  <Badge status={status()?.status || 'IDLE'} />
                </span>
              </div>
            </CardContent>
          </div>
        </Card>
      </div>

      {/* Database Diagnostics Table Card */}
      <Card>
        <CardHeader class="flex flex-row items-center gap-2 space-y-0 pb-4">
          <IconDatabase class="size-5 text-primary" />
          <div>
            <CardTitle class="text-base font-semibold">SQLite Database Tables Diagnostics</CardTitle>
            <CardDescription>Internal tables and record volume</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div class="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Table Name</TableHead>
                  <TableHead class="text-right">Row Count</TableHead>
                  <TableHead>Storage Engine</TableHead>
                  <TableHead class="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <Show
                  when={system()?.tables}
                  fallback={
                    <TableRow>
                      <TableCell colspan={4} class="h-24 text-center text-muted-foreground">
                        <Skeleton class="h-6 w-1/2 mx-auto" />
                      </TableCell>
                    </TableRow>
                  }
                >
                  <For each={Object.entries(system()!.tables)}>
                    {([tableName, stat]) => (
                      <TableRow>
                        <TableCell class="font-mono text-xs font-semibold">{tableName}</TableCell>
                        <TableCell class="text-right font-medium">{stat.row_count.toLocaleString()} rows</TableCell>
                        <TableCell class="text-xs text-muted-foreground">SQLite 3 (WAL mode)</TableCell>
                        <TableCell class="text-right">
                          <Badge status="READY" />
                        </TableCell>
                      </TableRow>
                    )}
                  </For>
                </Show>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Customer Name Aliases Card */}
      <Card>
        <CardHeader class="flex flex-row items-center gap-2 space-y-0 pb-2">
          <IconUsers class="size-5 text-primary" />
          <div>
            <CardTitle class="text-base font-semibold">Customer Name Aliases</CardTitle>
            <CardDescription>
              Aliases are applied during sync. Trigger a re-sync after changing aliases to update stored records.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent class="space-y-4">
          {/* Export / Import SQL Actions */}
          <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
            <span class="text-xs text-muted-foreground">
              Backup or restore customer aliases as raw SQL dump.
            </span>
            <div class="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                class="gap-1.5 h-8 text-xs"
                disabled={aliasesData.loading}
                onClick={handleExportSQL}
              >
                <IconDownload class="size-3.5" />
                <span>Export SQL</span>
              </Button>
              <input
                type="file"
                accept=".sql,.txt,application/sql"
                ref={fileInputRef}
                class="hidden"
                onChange={(e) => {
                  const file = e.currentTarget.files?.[0];
                  if (file) {
                    setPendingFile(file);
                    setImportMode('merge');
                    setShowImportModeDialog(true);
                  }
                  e.currentTarget.value = '';
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                class="gap-1.5 h-8 text-xs"
                disabled={isImporting()}
                onClick={() => fileInputRef?.click()}
              >
                <IconUpload class="size-3.5" />
                <span>{isImporting() ? 'Importing...' : 'Import SQL'}</span>
              </Button>
            </div>
          </div>

          <Show when={importResult()}>
            {(res) => (
              <Alert class="bg-primary/5 border-primary/20">
                <IconCheck class="size-4 text-primary" />
                <AlertTitle class="text-primary font-semibold">Import Complete</AlertTitle>
                <AlertDescription class="space-y-1">
                  <div>
                    Successfully imported <strong>{res().imported}</strong> alias{res().imported === 1 ? '' : 'es'}
                    <Show when={res().skipped > 0}>
                      <span>, skipped <strong>{res().skipped}</strong> invalid row{res().skipped === 1 ? '' : 's'}</span>
                    </Show>.
                  </div>
                  <Show when={res().errors && res().errors!.length > 0}>
                    <details class="text-xs text-muted-foreground cursor-pointer pt-1">
                      <summary class="font-medium hover:underline">View details ({res().errors!.length})</summary>
                      <ul class="list-disc pl-4 mt-1 space-y-0.5">
                        <For each={res().errors}>{(err) => <li>{err}</li>}</For>
                      </ul>
                    </details>
                  </Show>
                </AlertDescription>
              </Alert>
            )}
          </Show>

          {/* Add Alias Form */}
          <form class="rounded-lg border bg-muted/20 p-4 space-y-4" onSubmit={handleAddAlias}>
            <div class="grid gap-4 sm:grid-cols-3">
              <TextField value={aliasInput()} onChange={setAliasInput}>
                <TextFieldLabel class="text-xs font-semibold">Variant Name (Alias)</TextFieldLabel>
                <TextFieldInput placeholder="e.g. PKU Muhammadiyah..." class="h-9" />
              </TextField>

              <TextField value={canonicalInput()} onChange={setCanonicalInput}>
                <TextFieldLabel class="text-xs font-semibold">Canonical Name</TextFieldLabel>
                <TextFieldInput placeholder="e.g. RS PKU Muhammadiyah..." class="h-9" />
              </TextField>

              <TextField value={areaInput()} onChange={setAreaInput}>
                <TextFieldLabel class="text-xs font-semibold">Linked Area (Optional)</TextFieldLabel>
                <TextFieldInput placeholder="e.g. Lombok Barat..." class="h-9" />
              </TextField>
            </div>

            <div class="flex justify-end">
              <Button type="submit" size="sm" class="gap-1.5 h-9" disabled={isAdding()}>
                <IconPlus class="size-4" />
                <span>{isAdding() ? 'Adding...' : 'Add Mapping'}</span>
              </Button>
            </div>
          </form>

          <Show when={aliasError()}>
            <Alert variant="destructive">
              <IconAlertCircle class="size-4" />
              <AlertTitle>Alias Error</AlertTitle>
              <AlertDescription>{aliasError()}</AlertDescription>
            </Alert>
          </Show>

          {/* Grouped Aliases Display */}
          <div class="space-y-3">
            <Show
              when={aliasesData()?.groups && aliasesData()!.groups.length > 0}
              fallback={
                <div class="p-8 text-center text-muted-foreground text-sm border border-dashed rounded-lg">
                  No customer aliases configured yet. Add your first variant mapping above.
                </div>
              }
            >
              <For each={aliasesData()?.groups}>
                {(grp) => (
                  <Card class="bg-card">
                    <CardHeader class="pb-2 pt-3 px-4 flex flex-row items-center justify-between space-y-0">
                      <div class="flex items-center gap-2">
                        <span class="text-sm font-semibold">
                          Canonical: <strong class="text-primary">{grp.canonical}</strong>
                        </span>
                        <Show when={grp.area}>
                          <span class="inline-flex items-center px-2 py-0.5 rounded text-xs bg-muted text-muted-foreground font-medium">
                            {grp.area}
                          </span>
                        </Show>
                      </div>
                      <span class="text-xs text-muted-foreground">
                        {grp.aliases.length} alias{grp.aliases.length === 1 ? '' : 'es'}
                      </span>
                    </CardHeader>
                    <CardContent class="px-4 pb-3">
                      <div class="flex flex-wrap gap-2">
                        <For each={grp.aliases}>
                          {(al) => (
                            <span class="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full text-xs bg-muted text-foreground border border-border">
                              <span>{al}</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                class="h-5 w-5 p-0 hover:text-destructive"
                                title={`Delete alias ${al}`}
                                onClick={() => setAliasToDelete(al)}
                              >
                                <IconTrash class="size-3" />
                              </Button>
                            </span>
                          )}
                        </For>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </For>
            </Show>
          </div>
        </CardContent>
      </Card>

      {/* Maintenance Operations Card */}
      <Card>
        <CardHeader class="flex flex-row items-center gap-2 space-y-0 pb-4">
          <IconTool class="size-5 text-primary" />
          <div>
            <CardTitle class="text-base font-semibold">Maintenance Operations</CardTitle>
            <CardDescription>Manual controls and database utilities</CardDescription>
          </div>
        </CardHeader>
        <CardContent class="space-y-4">
          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 rounded-lg border bg-muted/20">
            <div>
              <h4 class="text-sm font-semibold">Force Full Data Resynchronization</h4>
              <p class="text-xs text-muted-foreground mt-1">
                Bypasses working hours checks and executes an atomic mirror sync from the configured remote source.
              </p>
            </div>
            <Button
              size="sm"
              class="gap-1.5"
              disabled={resyncing()}
              onClick={handleForceResync}
            >
              <IconRefresh class={`size-4 ${resyncing() ? 'animate-spin' : ''}`} />
              <span>{resyncing() ? 'Syncing...' : 'Force Resync'}</span>
            </Button>
          </div>

          <Show when={resyncMsg()}>
            <div class="p-3 rounded-md bg-muted text-xs font-medium">
              {resyncMsg()}
            </div>
          </Show>

          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 rounded-lg border border-destructive/20 bg-destructive/5">
            <div>
              <h4 class="text-sm font-semibold text-destructive">Clear Local Storage Database</h4>
              <p class="text-xs text-muted-foreground mt-1">
                Destructive operation: removes all orders, items, and sync history. Disabled in production.
              </p>
            </div>
            <Button variant="destructive" size="sm" disabled class="opacity-50 cursor-not-allowed">
              Clear Database
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Delete Alias Alert Dialog */}
      <AlertDialog
        open={!!aliasToDelete()}
        onOpenChange={(open) => {
          if (!open) setAliasToDelete('');
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>Delete Customer Alias</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to remove the alias mapping for "{aliasToDelete()}"?
            Future synchronizations will no longer map this spelling to the canonical customer name.
          </AlertDialogDescription>
          <div class="flex justify-end gap-2 mt-4">
            <Button variant="outline" size="sm" onClick={() => setAliasToDelete('')}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" onClick={confirmDeleteAlias}>
              Delete Alias
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
      {/* Import Customer Aliases Mode Dialog */}
      <AlertDialog
        open={showImportModeDialog()}
        onOpenChange={(open) => {
          if (!open) {
            setShowImportModeDialog(false);
            setPendingFile(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>Import Customer Aliases</AlertDialogTitle>
          <AlertDialogDescription class="space-y-3">
            <p>
              Select import mode for <strong class="text-foreground">{pendingFile()?.name}</strong>:
            </p>
            <div class="space-y-2 pt-1">
              <label
                class={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors hover:bg-muted/50 ${
                  importMode() === 'merge' ? 'border-primary bg-primary/5' : 'border-border'
                }`}
              >
                <input
                  type="radio"
                  name="import-mode"
                  value="merge"
                  checked={importMode() === 'merge'}
                  onChange={() => setImportMode('merge')}
                  class="mt-1"
                />
                <div>
                  <div class="text-sm font-medium text-foreground">Merge</div>
                  <div class="text-xs text-muted-foreground">
                    Inserts new aliases and updates matching existing aliases. Other existing aliases remain untouched.
                  </div>
                </div>
              </label>
              <label
                class={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors hover:bg-muted/50 ${
                  importMode() === 'replace' ? 'border-destructive bg-destructive/5' : 'border-border'
                }`}
              >
                <input
                  type="radio"
                  name="import-mode"
                  value="replace"
                  checked={importMode() === 'replace'}
                  onChange={() => setImportMode('replace')}
                  class="mt-1 text-destructive"
                />
                <div>
                  <div class="text-sm font-medium text-destructive">Replace</div>
                  <div class="text-xs text-muted-foreground">
                    Removes all existing aliases before importing. (Does not revert past order canonicalizations).
                  </div>
                </div>
              </label>
            </div>
          </AlertDialogDescription>
          <div class="flex justify-end gap-2 mt-4">
            <Button
              variant="outline"
              size="sm"
              disabled={isImporting()}
              onClick={() => {
                setShowImportModeDialog(false);
                setPendingFile(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant={importMode() === 'replace' ? 'destructive' : 'default'}
              size="sm"
              disabled={isImporting() || !pendingFile()}
              onClick={handleConfirmImport}
            >
              {isImporting() ? 'Importing...' : `Confirm ${importMode() === 'replace' ? 'Replace' : 'Merge'}`}
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
