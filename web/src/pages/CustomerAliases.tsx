import { type Component, createSignal, createResource, createMemo, Show, For } from 'solid-js';
import { A } from '@solidjs/router';
import {
  IconPlus,
  IconTrash,
  IconEdit,
  IconSearch,
  IconX,
  IconDownload,
  IconUpload,
  IconCheck,
  IconAlertCircle,
  IconInfoCircle,
  IconLoader2,
  IconRefresh,
  IconMapPin,
  IconBuildingStore,
  IconTag,
  IconCopy,
  IconWorld,
  IconFolderQuestion,
} from '@tabler/icons-solidjs';
import { useAuth } from '~/auth';
import {
  getCustomerAliases,
  setCustomerAlias,
  deleteCustomerAlias,
  getAreas,
  getCustomerAliasesExportUrl,
  importCustomerAliasesFile,
  type AliasImportResult,
} from '~/api';
import type { CustomerAliasGroup } from '~/types';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '~/components/ui/card';
import { TextField, TextFieldInput, TextFieldLabel } from '~/components/ui/text-field';
import { Alert, AlertTitle, AlertDescription } from '~/components/ui/alert';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
} from '~/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '~/components/ui/dialog';
import { Button } from '~/components/ui/button';
import { AreaCombobox } from '~/components/AreaCombobox';
import { Skeleton } from '~/components/ui/skeleton';

export const CustomerAliases: Component = () => {
  const auth = useAuth();
  const isAdmin = () => {
    const role = auth.user()?.role;
    return role === 'admin' || role === 'superadmin';
  };

  const [aliasesData, { refetch: refetchAliases }] = createResource(getCustomerAliases);
  const [areasData] = createResource(getAreas);

  // Filter & Search states
  const [search, setSearch] = createSignal('');
  const [selectedArea, setSelectedArea] = createSignal<string>('all');
  const [sortBy, setSortBy] = createSignal<'name' | 'aliases-desc' | 'aliases-asc'>('name');

  // Inline fast-add mode per card (keyed by canonical name)
  const [activeInlineAdd, setActiveInlineAdd] = createSignal<string | null>(null);
  const [inlineAddValue, setInlineAddValue] = createSignal('');
  const [isInlineAdding, setIsInlineAdding] = createSignal(false);
  const [inlineAddError, setInlineAddError] = createSignal('');

  // Copied indicator
  const [copiedKey, setCopiedKey] = createSignal<string | null>(null);
  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => {
      if (copiedKey() === key) setCopiedKey(null);
    }, 1500);
  };

  // Add customer alias modal
  const [showAddModal, setShowAddModal] = createSignal(false);
  const [modalAliasInput, setModalAliasInput] = createSignal('');
  const [modalCanonicalInput, setModalCanonicalInput] = createSignal('');
  const [modalAreaInput, setModalAreaInput] = createSignal('');
  const [modalError, setModalError] = createSignal('');
  const [isModalAdding, setIsModalAdding] = createSignal(false);

  // Edit group modal
  const [showEditGroupDialog, setShowEditGroupDialog] = createSignal(false);
  const [editGroup, setEditGroup] = createSignal<CustomerAliasGroup | null>(null);
  const [editCanonical, setEditCanonical] = createSignal('');
  const [editArea, setEditArea] = createSignal('');
  const [editGroupError, setEditGroupError] = createSignal('');
  const [isEditingGroup, setIsEditingGroup] = createSignal(false);

  // Edit single alias modal
  const [showEditAliasDialog, setShowEditAliasDialog] = createSignal(false);
  const [editAliasOriginal, setEditAliasOriginal] = createSignal('');
  const [editAliasSpelling, setEditAliasSpelling] = createSignal('');
  const [editAliasCanonical, setEditAliasCanonical] = createSignal('');
  const [editAliasArea, setEditAliasArea] = createSignal('');
  const [editAliasError, setEditAliasError] = createSignal('');
  const [isEditingAlias, setIsEditingAlias] = createSignal(false);

  // Delete alias modal
  const [aliasToDelete, setAliasToDelete] = createSignal<string>('');
  const [isDeleting, setIsDeleting] = createSignal(false);

  // Import JSON state
  const [importMode, setImportMode] = createSignal<'merge' | 'replace'>('merge');
  const [isImporting, setIsImporting] = createSignal(false);
  const [importResult, setImportResult] = createSignal<AliasImportResult | null>(null);
  const [showImportModeDialog, setShowImportModeDialog] = createSignal(false);
  const [pendingFile, setPendingFile] = createSignal<File | null>(null);
  let fileInputRef: HTMLInputElement | undefined;

  // Page error
  const [pageError, setPageError] = createSignal('');

  // Total calculations
  const totalAliases = createMemo(() => {
    const groups = aliasesData()?.groups || [];
    return groups.reduce((acc, g) => acc + g.aliases.length, 0);
  });

  const totalGroups = createMemo(() => (aliasesData()?.groups || []).length);

  const distinctAreas = createMemo(() => {
    const areaMap = new Map<string, number>();
    for (const g of aliasesData()?.groups || []) {
      const area = g.area && g.area.trim() ? g.area.trim() : 'Unassigned';
      areaMap.set(area, (areaMap.get(area) || 0) + 1);
    }
    return Array.from(areaMap.entries()).sort((a, b) => {
      if (a[0] === 'Unassigned') return 1;
      if (b[0] === 'Unassigned') return -1;
      return a[0].localeCompare(b[0]);
    });
  });

  const unassignedCount = createMemo(() => {
    const groups = aliasesData()?.groups || [];
    return groups.filter((g) => !g.area || g.area.trim() === '').length;
  });

  // Filtered & Sorted groups
  const filteredGroups = createMemo(() => {
    let groups = aliasesData()?.groups || [];
    const q = search().toLowerCase().trim();
    const area = selectedArea();

    if (q) {
      groups = groups.filter((grp) => {
        const canonicalMatch = grp.canonical.toLowerCase().includes(q);
        const areaMatch = Boolean(grp.area && grp.area.toLowerCase().includes(q));
        const aliasMatch = grp.aliases.some((al) => al.toLowerCase().includes(q));
        return canonicalMatch || areaMatch || aliasMatch;
      });
    }

    if (area === 'unassigned') {
      groups = groups.filter((grp) => !grp.area || grp.area.trim() === '');
    } else if (area !== 'all') {
      groups = groups.filter((grp) => (grp.area || '').toLowerCase() === area.toLowerCase());
    }

    const sort = sortBy();
    return [...groups].sort((a, b) => {
      if (sort === 'name') return a.canonical.localeCompare(b.canonical);
      if (sort === 'aliases-desc') return b.aliases.length - a.aliases.length;
      if (sort === 'aliases-asc') return a.aliases.length - b.aliases.length;
      return 0;
    });
  });

  // Handle inline quick-add on a specific card
  const handleInlineAddSubmit = async (grp: CustomerAliasGroup) => {
    const val = inlineAddValue().trim();
    if (!val) {
      setActiveInlineAdd(null);
      return;
    }
    if (val.toLowerCase() === grp.canonical.toLowerCase()) {
      setInlineAddError(`Alias cannot be identical to canonical name "${grp.canonical}"`);
      return;
    }
    if (grp.aliases.some((a) => a.toLowerCase() === val.toLowerCase())) {
      setInlineAddError(`Alias "${val}" already exists`);
      return;
    }
    setIsInlineAdding(true);
    setInlineAddError('');
    try {
      await setCustomerAlias(val, grp.canonical, grp.area);
      setInlineAddValue('');
      setActiveInlineAdd(null);
      refetchAliases();
    } catch (err: unknown) {
      setInlineAddError(err instanceof Error ? err.message : 'Failed to add alias');
    } finally {
      setIsInlineAdding(false);
    }
  };

  // Modal Add submit
  const handleAddSubmit = async (e: Event) => {
    e.preventDefault();
    const a = modalAliasInput().trim();
    const c = modalCanonicalInput().trim();
    if (!a || !c) {
      setModalError('Both Variant Name and Canonical Name are required');
      return;
    }
    if (a.toLowerCase() === c.toLowerCase()) {
      setModalError('Alias cannot be equal to canonical name');
      return;
    }
    setIsModalAdding(true);
    setModalError('');
    try {
      await setCustomerAlias(a, c, modalAreaInput().trim() || undefined);
      setModalAliasInput('');
      setModalCanonicalInput('');
      setModalAreaInput('');
      setShowAddModal(false);
      refetchAliases();
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Failed to add alias');
    } finally {
      setIsModalAdding(false);
    }
  };

  // Group save
  const handleSaveGroup = async (e: Event) => {
    e.preventDefault();
    const grp = editGroup();
    if (!grp) return;
    const newCanonical = editCanonical().trim();
    const newArea = editArea().trim() || undefined;
    if (!newCanonical) {
      setEditGroupError('Canonical name cannot be empty');
      return;
    }
    for (const alias of grp.aliases) {
      if (alias.toLowerCase() === newCanonical.toLowerCase()) {
        setEditGroupError(`Alias "${alias}" cannot be identical to canonical name "${newCanonical}"`);
        return;
      }
    }
    setIsEditingGroup(true);
    setEditGroupError('');
    try {
      for (const alias of grp.aliases) {
        await setCustomerAlias(alias, newCanonical, newArea);
      }
      setShowEditGroupDialog(false);
      refetchAliases();
    } catch (err: unknown) {
      setEditGroupError(err instanceof Error ? err.message : 'Failed to update group');
    } finally {
      setIsEditingGroup(false);
    }
  };

  // Single alias save
  const handleSaveSingleAlias = async (e: Event) => {
    e.preventDefault();
    const original = editAliasOriginal();
    const spelling = editAliasSpelling().trim();
    const canonical = editAliasCanonical().trim();
    const area = editAliasArea().trim() || undefined;

    if (!spelling || !canonical) {
      setEditAliasError('Both Variant Name and Canonical Name are required');
      return;
    }
    if (spelling.toLowerCase() === canonical.toLowerCase()) {
      setEditAliasError('Alias cannot be equal to canonical name');
      return;
    }

    setIsEditingAlias(true);
    setEditAliasError('');
    try {
      if (spelling !== original) {
        await deleteCustomerAlias(original);
      }
      await setCustomerAlias(spelling, canonical, area);
      setShowEditAliasDialog(false);
      refetchAliases();
    } catch (err: unknown) {
      setEditAliasError(err instanceof Error ? err.message : 'Failed to update alias');
    } finally {
      setIsEditingAlias(false);
    }
  };

  // Delete alias
  const confirmDeleteAlias = async () => {
    const alias = aliasToDelete();
    if (!alias) return;
    setIsDeleting(true);
    setPageError('');
    try {
      await deleteCustomerAlias(alias);
      setAliasToDelete('');
      refetchAliases();
    } catch (err: unknown) {
      setPageError(err instanceof Error ? err.message : 'Failed to delete alias');
    } finally {
      setIsDeleting(false);
    }
  };

  // Import
  const handleConfirmImport = async () => {
    const file = pendingFile();
    if (!file) return;
    setIsImporting(true);
    setPageError('');
    setImportResult(null);
    try {
      const res = await importCustomerAliasesFile(file, importMode());
      setImportResult(res);
      setShowImportModeDialog(false);
      setPendingFile(null);
      refetchAliases();
    } catch (err: unknown) {
      setPageError(err instanceof Error ? err.message : 'Failed to import customer aliases');
      setShowImportModeDialog(false);
      setPendingFile(null);
    } finally {
      setIsImporting(false);
    }
  };

  const handleExportJSON = () => {
    const a = document.createElement('a');
    a.href = getCustomerAliasesExportUrl();
    a.download = 'customer-aliases.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  // Helper avatar color class generator based on initial
  const getAvatarColor = (name: string) => {
    const char = (name[0] || 'A').toUpperCase().charCodeAt(0);
    const colors = [
      'bg-blue-500/10 text-blue-600 border-blue-500/20',
      'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
      'bg-purple-500/10 text-purple-600 border-purple-500/20',
      'bg-amber-500/10 text-amber-600 border-amber-500/20',
      'bg-rose-500/10 text-rose-600 border-rose-500/20',
      'bg-indigo-500/10 text-indigo-600 border-indigo-500/20',
    ];
    return colors[char % colors.length];
  };

  return (
    <div class="space-y-6 min-w-0 w-full max-w-full pb-10">
      {/* Page Header */}
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 class="text-2xl font-bold tracking-tight">Customer Aliases</h1>
          <p class="text-sm text-muted-foreground mt-0.5">
            Manage customer spelling variants, abbreviations, and their canonical name & area mappings.
          </p>
        </div>

        {/* Global Action Buttons */}
        <div class="flex items-center gap-2 flex-wrap">
          <Button
            type="button"
            variant="outline"
            size="sm"
            class="gap-1.5 h-9 text-xs"
            onClick={handleExportJSON}
            disabled={aliasesData.loading}
          >
            <IconDownload class="size-4" />
            <span>Export JSON</span>
          </Button>

          <Show when={isAdmin()}>
            <input
              type="file"
              accept=".json,application/json"
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
              class="gap-1.5 h-9 text-xs"
              onClick={() => fileInputRef?.click()}
              disabled={isImporting()}
            >
              <IconUpload class="size-4" />
              <span>Import JSON</span>
            </Button>

            <Button
              type="button"
              size="sm"
              class="gap-1.5 h-9 text-xs font-semibold"
              onClick={() => {
                setModalAliasInput('');
                setModalCanonicalInput('');
                setModalAreaInput('');
                setModalError('');
                setShowAddModal(true);
              }}
            >
              <IconPlus class="size-4" />
              <span>Add Customer</span>
            </Button>
          </Show>
        </div>
      </div>

      {/* KPI Cards Strip */}
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card class="bg-card">
          <CardContent class="p-3.5 flex items-center justify-between">
            <div>
              <p class="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Canonical Customers</p>
              <p class="text-xl font-bold mt-0.5">
                <Show when={!aliasesData.loading} fallback="--">
                  {totalGroups()}
                </Show>
              </p>
            </div>
            <div class="p-2 rounded-lg bg-blue-500/10 text-blue-600">
              <IconBuildingStore class="size-4" />
            </div>
          </CardContent>
        </Card>

        <Card class="bg-card">
          <CardContent class="p-3.5 flex items-center justify-between">
            <div>
              <p class="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Total Active Aliases</p>
              <p class="text-xl font-bold mt-0.5">
                <Show when={!aliasesData.loading} fallback="--">
                  {totalAliases()}
                </Show>
              </p>
            </div>
            <div class="p-2 rounded-lg bg-emerald-500/10 text-emerald-600">
              <IconTag class="size-4" />
            </div>
          </CardContent>
        </Card>

        <Card class="bg-card">
          <CardContent class="p-3.5 flex items-center justify-between">
            <div>
              <p class="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Areas Covered</p>
              <p class="text-xl font-bold mt-0.5">
                <Show when={!aliasesData.loading} fallback="--">
                  {distinctAreas().filter(([a]) => a !== 'Unassigned').length}
                </Show>
              </p>
            </div>
            <div class="p-2 rounded-lg bg-purple-500/10 text-purple-600">
              <IconWorld class="size-4" />
            </div>
          </CardContent>
        </Card>

        <Card class="bg-card">
          <CardContent class="p-3.5 flex items-center justify-between">
            <div>
              <p class="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Unassigned Area</p>
              <p class="text-xl font-bold mt-0.5">
                <Show when={!aliasesData.loading} fallback="--">
                  {unassignedCount()}
                </Show>
              </p>
            </div>
            <div class="p-2 rounded-lg bg-amber-500/10 text-amber-600">
              <IconFolderQuestion class="size-4" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sync impact alert */}
      <Alert class="bg-muted/40 border-border">
        <IconInfoCircle class="size-4 text-primary shrink-0" />
        <AlertTitle class="text-xs font-semibold">Synchronization Pipeline Notice</AlertTitle>
        <AlertDescription class="text-xs text-muted-foreground mt-0.5">
          Aliases resolve raw Google Sheets entries during worker ingestion. Modifying alias mappings does not rewrite stored database records immediately; changes take effect on the next scheduled sync or when triggering a full resync in{' '}
          <A href="/sync" class="underline text-foreground font-medium hover:text-primary">
            Sync Manager
          </A>
          .
        </AlertDescription>
      </Alert>

      {/* Import Result Alert */}
      <Show when={importResult()}>
        {(res) => (
          <Alert class="bg-primary/5 border-primary/20">
            <IconCheck class="size-4 text-primary shrink-0" />
            <div class="flex flex-1 items-center justify-between">
              <div>
                <AlertTitle class="text-primary font-semibold text-xs">Import Complete</AlertTitle>
                <AlertDescription class="text-xs text-muted-foreground">
                  Successfully imported <strong>{res().imported}</strong> alias{res().imported === 1 ? '' : 'es'}
                  <Show when={res().skipped > 0}> ({res().skipped} skipped)</Show>.
                </AlertDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                class="h-7 px-2 text-xs"
                onClick={() => setImportResult(null)}
              >
                Dismiss
              </Button>
            </div>
          </Alert>
        )}
      </Show>

      {/* Error Alert */}
      <Show when={pageError()}>
        <Alert variant="destructive">
          <IconAlertCircle class="size-4 shrink-0" />
          <div class="flex flex-1 items-center justify-between">
            <span class="text-xs font-medium">{pageError()}</span>
            <Button variant="ghost" size="sm" class="h-6 px-2 text-xs" onClick={() => setPageError('')}>
              Dismiss
            </Button>
          </div>
        </Alert>
      </Show>

      {/* Search Bar & Filter Strip */}
      <div class="space-y-3">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div class="relative flex-1 max-w-md">
            <IconSearch class="absolute left-3 top-2.5 size-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Search customer, variant spelling, or area..."
              value={search()}
              onInput={(e) => setSearch(e.currentTarget.value)}
              class="w-full pl-9 pr-8 h-9 text-xs rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <Show when={search()}>
              <button
                type="button"
                class="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                onClick={() => setSearch('')}
              >
                <IconX class="size-3.5" />
              </button>
            </Show>
          </div>

          <div class="flex items-center gap-2">
            <span class="text-xs text-muted-foreground shrink-0">Sort by:</span>
            <select
              value={sortBy()}
              onChange={(e) => setSortBy(e.currentTarget.value as any)}
              class="h-9 px-2 text-xs rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="name">Customer Name (A-Z)</option>
              <option value="aliases-desc">Most Aliases</option>
              <option value="aliases-asc">Least Aliases</option>
            </select>
          </div>
        </div>

        {/* Horizontal Scrolling Area Filter Chips */}
        <div class="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
          <button
            type="button"
            class={`px-2.5 py-1 rounded-full text-xs font-medium shrink-0 transition-all ${
              selectedArea() === 'all'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'bg-muted/80 text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
            onClick={() => setSelectedArea('all')}
          >
            All Customers ({totalGroups()})
          </button>

          <For each={distinctAreas()}>
            {([area, count]) => {
              const isSelected = () =>
                selectedArea().toLowerCase() === (area === 'Unassigned' ? 'unassigned' : area.toLowerCase());
              return (
                <button
                  type="button"
                  class={`px-2.5 py-1 rounded-full text-xs font-medium shrink-0 transition-all flex items-center gap-1.5 ${
                    isSelected()
                      ? 'bg-primary text-primary-foreground shadow-xs'
                      : 'bg-muted/80 text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                  onClick={() => setSelectedArea(area === 'Unassigned' ? 'unassigned' : area)}
                >
                  <span>{area}</span>
                  <span class={`text-[10px] font-mono px-1 rounded ${isSelected() ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-background/80 text-muted-foreground'}`}>
                    {count}
                  </span>
                </button>
              );
            }}
          </For>
        </div>
      </div>

      {/* Loading Skeletons */}
      <Show when={aliasesData.loading}>
        <div class="columns-1 md:columns-2 lg:columns-3 gap-4">
          <Skeleton class="h-32 w-full rounded-xl mb-4" />
          <Skeleton class="h-48 w-full rounded-xl mb-4" />
          <Skeleton class="h-36 w-full rounded-xl mb-4" />
          <Skeleton class="h-56 w-full rounded-xl mb-4" />
          <Skeleton class="h-40 w-full rounded-xl mb-4" />
          <Skeleton class="h-32 w-full rounded-xl mb-4" />
        </div>
      </Show>

      {/* Error State with Retry */}
      <Show when={aliasesData.error}>
        <Alert variant="destructive">
          <IconAlertCircle class="size-4 shrink-0" />
          <div class="flex flex-1 items-center justify-between flex-wrap gap-2">
            <div>
              <AlertTitle>Failed to load customer aliases</AlertTitle>
              <AlertDescription class="text-xs">
                {aliasesData.error instanceof Error ? aliasesData.error.message : 'Unknown error'}
              </AlertDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              class="h-8 gap-1.5"
              onClick={() => refetchAliases()}
            >
              <IconRefresh class="size-3.5" />
              <span>Retry</span>
            </Button>
          </div>
        </Alert>
      </Show>

      {/* Empty State: No Aliases Configured */}
      <Show when={!aliasesData.loading && !aliasesData.error && totalAliases() === 0}>
        <div class="p-10 text-center text-muted-foreground text-xs border border-dashed rounded-xl space-y-2">
          <IconBuildingStore class="size-8 mx-auto opacity-40" />
          <p>No customer aliases configured yet. Add your first customer mapping above.</p>
        </div>
      </Show>

      {/* Empty State: No Search Matches */}
      <Show
        when={
          !aliasesData.loading &&
          !aliasesData.error &&
          totalAliases() > 0 &&
          filteredGroups().length === 0
        }
      >
        <div class="p-10 text-center text-muted-foreground text-xs border border-dashed rounded-xl space-y-2">
          <IconBuildingStore class="size-8 mx-auto opacity-40" />
          <p>
            No aliases found matching <span class="font-semibold text-foreground">"{search()}"</span>.
          </p>
          <Button
            variant="outline"
            size="sm"
            class="h-8 text-xs"
            onClick={() => {
              setSearch('');
              setSelectedArea('all');
            }}
          >
            Clear Filters
          </Button>
        </div>
      </Show>

      {/* Masonry Cards Flow */}
      <Show when={!aliasesData.loading && !aliasesData.error && filteredGroups().length > 0}>
        <div class="columns-1 md:columns-2 lg:columns-3 gap-4">
          <For each={filteredGroups()}>
            {(grp) => {
              const q = () => search().toLowerCase().trim();
              const isInlineAddingThis = () => activeInlineAdd() === grp.canonical;

              return (
                <div class="break-inside-avoid mb-4">
                  <Card class="bg-card hover:border-primary/40 transition-all hover:shadow-xs">
                    <CardHeader class="p-4 pb-2 space-y-2">
                      <div class="flex items-start justify-between gap-2">
                        <div class="flex items-center gap-2.5 min-w-0">
                          <div
                            class={`size-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 border ${getAvatarColor(
                              grp.canonical
                            )}`}
                          >
                            {(grp.canonical[0] || 'C').toUpperCase()}
                          </div>
                          <div class="min-w-0">
                            <CardTitle class="text-sm font-bold text-foreground leading-snug truncate">
                              {grp.canonical}
                            </CardTitle>
                            <div class="flex items-center gap-1.5 mt-0.5">
                              <Show
                                when={grp.area}
                                fallback={
                                  <span class="text-[10px] text-muted-foreground/60 italic">Unassigned Area</span>
                                }
                              >
                                <span class="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                                  <IconMapPin class="size-3 text-primary" />
                                  <span>{grp.area}</span>
                                </span>
                              </Show>
                            </div>
                          </div>
                        </div>

                        <Show when={isAdmin()}>
                          <Button
                            variant="ghost"
                            size="sm"
                            class="h-7 w-7 p-0 text-muted-foreground hover:text-primary shrink-0"
                            title="Edit Group"
                            onClick={() => {
                              setEditGroup(grp);
                              setEditCanonical(grp.canonical);
                              setEditArea(grp.area || '');
                              setEditGroupError('');
                              setShowEditGroupDialog(true);
                            }}
                          >
                            <IconEdit class="size-3.5" />
                          </Button>
                        </Show>
                      </div>
                    </CardHeader>

                    <CardContent class="p-4 pt-1 space-y-3">
                      <div class="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                        Aliases ({grp.aliases.length})
                      </div>

                      {/* Alias Pills Wrap */}
                      <div class="flex flex-wrap items-center gap-1.5">
                        <For each={grp.aliases}>
                          {(al) => {
                            const isMatch = () => Boolean(q() && al.toLowerCase().includes(q()));
                            return (
                              <div
                                class={`group inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border transition-all ${
                                  isMatch()
                                    ? 'bg-primary/20 text-primary border-primary/50 font-semibold shadow-xs'
                                    : 'bg-muted/60 text-foreground border-border/80 hover:bg-muted'
                                }`}
                              >
                                <span>{al}</span>
                                <Show when={isAdmin()}>
                                  <div class="hidden group-hover:flex items-center gap-0.5 -mr-1 pl-1 border-l border-border/50">
                                    <button
                                      type="button"
                                      class="p-0.5 text-muted-foreground hover:text-primary"
                                      title={`Edit "${al}"`}
                                      onClick={() => {
                                        setEditAliasOriginal(al);
                                        setEditAliasSpelling(al);
                                        setEditAliasCanonical(grp.canonical);
                                        setEditAliasArea(grp.area || '');
                                        setEditAliasError('');
                                        setShowEditAliasDialog(true);
                                      }}
                                    >
                                      <IconEdit class="size-3" />
                                    </button>
                                    <button
                                      type="button"
                                      class="p-0.5 text-muted-foreground hover:text-destructive"
                                      title={`Delete "${al}"`}
                                      onClick={() => setAliasToDelete(al)}
                                    >
                                      <IconTrash class="size-3" />
                                    </button>
                                  </div>
                                </Show>
                              </div>
                            );
                          }}
                        </For>

                        {/* Dashed "+ Add" variant pill / inline input */}
                        <Show when={isAdmin()}>
                          <Show
                            when={isInlineAddingThis()}
                            fallback={
                              <button
                                type="button"
                                class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border border-dashed border-primary/40 text-primary hover:bg-primary/5 hover:border-primary transition-all font-medium"
                                onClick={() => {
                                  setActiveInlineAdd(grp.canonical);
                                  setInlineAddValue('');
                                  setInlineAddError('');
                                }}
                              >
                                <IconPlus class="size-3" />
                                <span>Add variant</span>
                              </button>
                            }
                          >
                            <div class="inline-flex items-center gap-1 p-0.5 rounded-full border border-primary bg-background shadow-xs">
                              <input
                                type="text"
                                placeholder="Spelling variant..."
                                value={inlineAddValue()}
                                onInput={(e) => setInlineAddValue(e.currentTarget.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleInlineAddSubmit(grp);
                                  if (e.key === 'Escape') setActiveInlineAdd(null);
                                }}
                                class="h-6 px-2 text-xs bg-transparent focus:outline-none w-28"
                                autofocus
                              />
                              <button
                                type="button"
                                class="size-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90"
                                onClick={() => handleInlineAddSubmit(grp)}
                                disabled={isInlineAdding()}
                              >
                                <IconCheck class="size-3" />
                              </button>
                              <button
                                type="button"
                                class="size-5 rounded-full hover:bg-muted text-muted-foreground flex items-center justify-center"
                                onClick={() => setActiveInlineAdd(null)}
                              >
                                <IconX class="size-3" />
                              </button>
                            </div>
                          </Show>
                        </Show>
                      </div>

                      <Show when={isInlineAddingThis() && inlineAddError()}>
                        <p class="text-[10px] text-destructive font-medium">{inlineAddError()}</p>
                      </Show>
                    </CardContent>

                    <CardFooter class="p-3 px-4 bg-muted/20 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground">
                      <span class="text-[11px] font-mono">
                        {grp.aliases.length} mapped variant{grp.aliases.length === 1 ? '' : 's'}
                      </span>

                      <button
                        type="button"
                        class="flex items-center gap-1 text-[11px] hover:text-foreground transition-colors"
                        onClick={() => copyToClipboard(grp.canonical, `card-${grp.canonical}`)}
                      >
                        <Show
                          when={copiedKey() === `card-${grp.canonical}`}
                          fallback={
                            <>
                              <IconCopy class="size-3" />
                              <span>Copy Name</span>
                            </>
                          }
                        >
                          <IconCheck class="size-3 text-emerald-500" />
                          <span class="text-emerald-500 font-medium">Copied!</span>
                        </Show>
                      </button>
                    </CardFooter>
                  </Card>
                </div>
              );
            }}
          </For>
        </div>
      </Show>

      {/* Add Customer Modal */}
      <Dialog open={showAddModal()} onOpenChange={setShowAddModal}>
        <DialogContent class="sm:max-w-md">
          <form onSubmit={handleAddSubmit} class="space-y-4">
            <DialogHeader>
              <DialogTitle>Add Customer Mapping</DialogTitle>
              <DialogDescription>
                Create a new canonical customer mapping and assign its initial variant spelling.
              </DialogDescription>
            </DialogHeader>

            <Show when={modalError()}>
              <Alert variant="destructive">
                <IconAlertCircle class="size-4 shrink-0" />
                <AlertTitle class="text-xs">Validation Error</AlertTitle>
                <AlertDescription class="text-xs">{modalError()}</AlertDescription>
              </Alert>
            </Show>

            <div class="space-y-3">
              <TextField value={modalAliasInput()} onChange={setModalAliasInput} class="w-full">
                <TextFieldLabel class="text-xs font-semibold">Variant Name (Alias)</TextFieldLabel>
                <TextFieldInput placeholder="e.g. PKU Muhammadiyah..." class="h-9 w-full" disabled={isModalAdding()} />
              </TextField>

              <TextField value={modalCanonicalInput()} onChange={setModalCanonicalInput} class="w-full">
                <TextFieldLabel class="text-xs font-semibold">Canonical Name</TextFieldLabel>
                <TextFieldInput placeholder="e.g. RS PKU Muhammadiyah..." class="h-9 w-full" disabled={isModalAdding()} />
              </TextField>

              <div class="space-y-1 flex flex-col w-full">
                <label class="text-xs font-semibold">Linked Area (Optional)</label>
                <AreaCombobox
                  value={modalAreaInput()}
                  onChange={setModalAreaInput}
                  areas={() => areasData()?.areas}
                  placeholder="e.g. Lombok Barat..."
                  class="w-full"
                  disabled={isModalAdding()}
                />
              </div>
            </div>

            <DialogFooter class="pt-2 flex flex-col sm:flex-row sm:justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowAddModal(false)} disabled={isModalAdding()}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={isModalAdding()} class="gap-1.5">
                <Show when={isModalAdding()} fallback="Create Customer">
                  <span class="flex items-center gap-1.5">
                    <IconLoader2 class="size-3.5 animate-spin" /> Saving...
                  </span>
                </Show>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Group Dialog */}
      <Dialog open={showEditGroupDialog()} onOpenChange={setShowEditGroupDialog}>
        <DialogContent class="sm:max-w-md">
          <form onSubmit={handleSaveGroup} class="space-y-4">
            <DialogHeader>
              <DialogTitle>Edit Customer Group</DialogTitle>
              <DialogDescription>
                Update canonical customer name and linked area for all associated variants.
              </DialogDescription>
            </DialogHeader>

            <Show when={editGroupError()}>
              <Alert variant="destructive">
                <IconAlertCircle class="size-4 shrink-0" />
                <AlertTitle class="text-xs">Error</AlertTitle>
                <AlertDescription class="text-xs">{editGroupError()}</AlertDescription>
              </Alert>
            </Show>

            <div class="space-y-3">
              <TextField value={editCanonical()} onChange={setEditCanonical} class="w-full">
                <TextFieldLabel class="text-xs font-semibold">Canonical Name</TextFieldLabel>
                <TextFieldInput placeholder="Official canonical customer name..." class="h-9 w-full" />
              </TextField>

              <div class="space-y-1 flex flex-col w-full">
                <label class="text-xs font-semibold">Linked Area (Optional)</label>
                <AreaCombobox
                  value={editArea()}
                  onChange={setEditArea}
                  areas={() => areasData()?.areas}
                  placeholder="e.g. Lombok Barat..."
                  class="w-full"
                />
              </div>
            </div>

            <DialogFooter class="pt-2 flex flex-col sm:flex-row sm:justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowEditGroupDialog(false)} disabled={isEditingGroup()}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={isEditingGroup()}>
                <Show when={isEditingGroup()} fallback="Save Group">
                  <span class="flex items-center gap-1.5">
                    <IconLoader2 class="size-3.5 animate-spin" /> Saving...
                  </span>
                </Show>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Single Alias Dialog */}
      <Dialog open={showEditAliasDialog()} onOpenChange={setShowEditAliasDialog}>
        <DialogContent class="sm:max-w-md">
          <form onSubmit={handleSaveSingleAlias} class="space-y-4">
            <DialogHeader>
              <DialogTitle>Edit Customer Alias</DialogTitle>
              <DialogDescription>
                Modify variant spelling, canonical name, or assigned area.
              </DialogDescription>
            </DialogHeader>

            <Show when={editAliasError()}>
              <Alert variant="destructive">
                <IconAlertCircle class="size-4 shrink-0" />
                <AlertTitle class="text-xs">Error</AlertTitle>
                <AlertDescription class="text-xs">{editAliasError()}</AlertDescription>
              </Alert>
            </Show>

            <div class="space-y-3">
              <TextField value={editAliasSpelling()} onChange={setEditAliasSpelling} class="w-full">
                <TextFieldLabel class="text-xs font-semibold">Variant Name (Alias)</TextFieldLabel>
                <TextFieldInput placeholder="Source spelling..." class="h-9 w-full" />
              </TextField>

              <TextField value={editAliasCanonical()} onChange={setEditAliasCanonical} class="w-full">
                <TextFieldLabel class="text-xs font-semibold">Canonical Name</TextFieldLabel>
                <TextFieldInput placeholder="Canonical customer name..." class="h-9 w-full" />
              </TextField>

              <div class="space-y-1 flex flex-col w-full">
                <label class="text-xs font-semibold">Linked Area (Optional)</label>
                <AreaCombobox
                  value={editAliasArea()}
                  onChange={setEditAliasArea}
                  areas={() => areasData()?.areas}
                  placeholder="e.g. Lombok Barat..."
                  class="w-full"
                />
              </div>
            </div>

            <DialogFooter class="pt-2 flex flex-col sm:flex-row sm:justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowEditAliasDialog(false)} disabled={isEditingAlias()}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={isEditingAlias()}>
                <Show when={isEditingAlias()} fallback="Save Alias">
                  <span class="flex items-center gap-1.5">
                    <IconLoader2 class="size-3.5 animate-spin" /> Saving...
                  </span>
                </Show>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Alert Dialog */}
      <AlertDialog
        open={!!aliasToDelete()}
        onOpenChange={(open) => {
          if (!open) setAliasToDelete('');
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>Delete Customer Alias</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to remove the alias mapping for "{aliasToDelete()}"? Future synchronizations will no longer map this spelling to the canonical customer name.
          </AlertDialogDescription>
          <div class="flex flex-col sm:flex-row sm:justify-end gap-2 mt-4">
            <Button variant="outline" size="sm" disabled={isDeleting()} onClick={() => setAliasToDelete('')}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" disabled={isDeleting()} onClick={confirmDeleteAlias}>
              <Show when={isDeleting()} fallback="Delete Alias">
                <span class="flex items-center gap-1.5">
                  <IconLoader2 class="size-3.5 animate-spin" /> Deleting...
                </span>
              </Show>
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
                  name="customer-aliases-import-mode"
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
                  name="customer-aliases-import-mode"
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
          <div class="flex flex-col sm:flex-row sm:justify-end gap-2 mt-4">
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

export default CustomerAliases;
