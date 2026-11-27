import { IconPlus, IconSearch, IconTrash } from '@tabler/icons-solidjs';
import { createEffect, createMemo, createResource, createSignal, For, Show, type Component } from 'solid-js';
import { ApiError, deleteRole, getPermissions, getRoles, saveRole } from '~/api';
import { useAuth } from '~/auth';
import { DataTable } from '~/components/DataTable';
import { TableSkeleton } from '~/components/TableSkeleton';
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from '~/components/ui/alert-dialog';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { TableBody, TableCell, TableRow } from '~/components/ui/table';
import { USER_ROLE } from '~/domain';
import { useI18n } from '~/i18n';
import type { RawDictionary } from '~/i18n/en';
import type { Permission } from '~/permissions.generated';
import type { Role, RoleInput } from '~/types';

const fieldClass = 'min-w-0 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring read-only:bg-muted/50';
const configuredRole: Role = {
  id: 0, name: USER_ROLE.SUPERADMIN, description: '', is_system: true, permissions: [],
  actions: { update: false, delete: false },
};
const emptyRole: RoleInput = { name: '', description: '', permissions: [] };

type Copy = RawDictionary['roleManagement'];
type Selection = number | 'new';

const roleValues = ({ name, description, permissions }: Role): RoleInput => ({ name, description, permissions });
const sameValues = (a: RoleInput, b: RoleInput) => a.name === b.name && a.description === b.description &&
  a.permissions.length === b.permissions.length && a.permissions.every((grant, i) => grant === b.permissions[i]);
const roleSortName = (name: string) => name.replace(/[A-Z]/g, (char) => char.toLowerCase());
const compareRoles = (a: Role, b: Role) => {
  const system = Number(b.is_system) - Number(a.is_system);
  const x = roleSortName(a.name);
  const y = roleSortName(b.name);
  return system || (x < y ? -1 : x > y ? 1 : a.id - b.id);
};

export const RoleManagement: Component = () => {
  const auth = useAuth();
  const { t } = useI18n();
  const [directory, { mutate, refetch: reloadRoles }] = createResource(() => auth.can('role:read'), getRoles);
  const [catalog, { refetch: reloadCatalog }] = createResource(() => auth.can('role:read'), getPermissions);
  const [search, setSearch] = createSignal('');
  const [selection, setSelection] = createSignal<Selection>();
  const [base, setBase] = createSignal<RoleInput>(emptyRole);
  const [draft, setDraft] = createSignal<RoleInput>(emptyRole);
  const [nextSelection, setNextSelection] = createSignal<Selection>();
  const [confirmDelete, setConfirmDelete] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<'roleManagement.nameConflict' | 'roleManagement.saveFailed' | 'roleManagement.deleteFailed'>();
  const [feedback, setFeedback] = createSignal<'roleManagement.saved' | 'roleManagement.deleted'>();

  const roles = createMemo(() => directory.error ? [] : [...(directory()?.roles ?? []), configuredRole]);
  const selected = () => roles().find((role) => role.id === selection());
  const canCreate = () => auth.can('role:create');
  const canEdit = () => selection() === 'new' ? canCreate() : !!selected()?.actions.update && auth.can('role:update');
  const canDelete = () => !!selected()?.actions.delete && auth.can('role:delete');
  const loadFailed = () => directory.error || catalog.error;
  const dirty = createMemo(() => !sameValues(draft(), base()));
  const conflict = createMemo(() => {
    const current = selected();
    return !!current && dirty() && !sameValues(roleValues(current), base());
  });
  const visibleRoles = createMemo(() => {
    const query = search().trim().toLocaleLowerCase();
    return roles().filter((role) => `${role.name} ${role.description}`.toLocaleLowerCase().includes(query));
  });
  const groups = createMemo(() => {
    const grouped = new Map<string, Permission[]>();
    for (const grant of catalog.error ? [] : catalog()?.permissions ?? []) {
      const split = grant.indexOf(':');
      if (split < 0) continue;
      const resource = grant.slice(0, split);
      const entries = grouped.get(resource);
      if (entries) entries.push(grant);
      else grouped.set(resource, [grant]);
    }
    return Array.from(grouped);
  });

  function openRole(id: Selection) {
    const role = roles().find((row) => row.id === id);
    const values = role ? roleValues(role) : emptyRole;
    setSelection(id);
    setBase(values);
    setDraft(values);
    setError(undefined);
    setFeedback(undefined);
  }

  createEffect(() => {
    if (busy() || directory.loading || directory.error || selection() === 'new') return;
    const current = selected();
    if (!current) {
      const first = roles()[0];
      if (first) openRole(first.id);
    } else if (!dirty() && !sameValues(roleValues(current), base())) {
      const values = roleValues(current);
      setBase(values);
      setDraft(values);
    }
  });

  function selectRole(id: Selection) {
    if (busy() || id === selection() || (id === 'new' && !canCreate())) return;
    if (dirty()) setNextSelection(id);
    else openRole(id);
  }

  function changeGrant(grant: Permission, checked: boolean) {
    if (!canEdit() || busy() || !auth.can(grant)) return;
    setDraft((current) => ({ ...current, permissions: checked
      ? [...new Set([...current.permissions, grant])].sort()
      : current.permissions.filter((candidate) => candidate !== grant) }));
  }

  async function handleSave(event: SubmitEvent) {
    event.preventDefault();
    if (!canEdit() || busy() || !dirty() || conflict() || !draft().name.trim() || loadFailed()) return;
    setBusy(true);
    setError(undefined);
    setFeedback(undefined);
    try {
      const id = selection();
      const result = await saveRole(typeof id === 'number' ? id : undefined, draft());
      mutate((previous) => ({ roles: [...(previous?.roles ?? []).filter((row) => row.id !== result.role.id), result.role].sort(compareRoles) }));
      openRole(result.role.id);
      setFeedback('roleManagement.saved');
      await auth.refetch();
    } catch (err) {
      setError(err instanceof ApiError && err.status === 409 ? 'roleManagement.nameConflict' : 'roleManagement.saveFailed');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    const role = selected();
    if (!role || !canDelete() || busy()) return;
    setBusy(true);
    setError(undefined);
    setFeedback(undefined);
    try {
      await deleteRole(role.id);
      mutate((previous) => ({ roles: (previous?.roles ?? []).filter((row) => row.id !== role.id) }));
      setConfirmDelete(false);
      openRole(roles()[0].id);
      setFeedback('roleManagement.deleted');
      await auth.refetch();
    } catch {
      setConfirmDelete(false);
      setError('roleManagement.deleteFailed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="space-y-5">
      <header class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 class="text-2xl font-bold tracking-tight">{t('roleManagement.title')}</h1>
          <p class="mt-1 max-w-[68ch] text-sm text-muted-foreground">{t('roleManagement.description')}</p>
        </div>
        <Show when={canCreate()}>
          <Button type="button" disabled={busy() || directory.loading || catalog.loading || !!loadFailed()} onClick={() => selectRole('new')}>
            <IconPlus class="size-4" />{t('roleManagement.newRole')}
          </Button>
        </Show>
      </header>
      <Show when={loadFailed()}>
        <div role="alert" class="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/30 p-3 text-sm text-destructive">
          {t('roleManagement.loadFailed')}
          <Button type="button" variant="outline" size="sm" onClick={() => {
            if (auth.can('role:read')) { void reloadRoles(); void reloadCatalog(); }
          }}>{t('common.refresh')}</Button>
        </div>
      </Show>
      <Show when={error()}>{(message) => <p role="alert" class="rounded-md border border-destructive/30 px-3 py-2 text-sm text-destructive">{t(message())}</p>}</Show>
      <Show when={feedback()}>{(message) => <p role="status" class="rounded-md border px-3 py-2 text-sm">{t(message())}</p>}</Show>

      <div class="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(210px,250px)_minmax(0,1fr)]">
        <section class="min-w-0 space-y-3" aria-labelledby="role-directory-title">
          <h2 id="role-directory-title" class="text-base font-semibold">{t('roleManagement.directory')}</h2>
          <div class="relative">
            <IconSearch class="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" aria-hidden="true" />
            <input type="search" class={`${fieldClass} pl-9`} aria-label={t('roleManagement.search')} placeholder={t('roleManagement.search')} value={search()} onInput={(e) => setSearch(e.currentTarget.value)} />
          </div>
          <DataTable>
            <TableBody>
              <Show when={!directory.loading} fallback={<TableSkeleton rows={4} columns={1} />}>
                <For each={visibleRoles()} fallback={<TableRow><TableCell class="text-sm text-muted-foreground">{t('roleManagement.noMatches')}</TableCell></TableRow>}>
                  {(role) => (
                    <TableRow>
                      <TableCell class="p-0">
                        <button type="button" aria-pressed={selection() === role.id} disabled={busy()} onClick={() => selectRole(role.id)} class="flex w-full min-w-0 flex-wrap items-center justify-between gap-1.5 px-3 py-3 text-left text-sm hover:bg-muted/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring aria-pressed:bg-muted">
                          <span class="min-w-0 break-all font-mono font-medium">{role.name}</span>
                          <Show when={role.is_system}><Badge variant="outline">{t(role.id === 0 ? 'roleManagement.configured' : 'roleManagement.builtIn')}</Badge></Show>
                        </button>
                      </TableCell>
                    </TableRow>
                  )}
                </For>
              </Show>
            </TableBody>
          </DataTable>
        </section>

        <Show when={selection() === 'new' || !!selected()} fallback={<p class="text-sm text-muted-foreground">{t('roleManagement.choose')}</p>}>
          <form onSubmit={handleSave} class="min-w-0 space-y-5 rounded-lg border bg-card p-4 sm:p-5" aria-labelledby="role-editor-title">
            <div class="flex flex-wrap items-start justify-between gap-2">
              <h2 id="role-editor-title" class="break-all text-lg font-semibold">{selection() === 'new' ? t('roleManagement.newRole') : selected()?.name}</h2>
              <Show when={!canEdit()}><Badge variant="secondary">{t('roleManagement.readOnly')}</Badge></Show>
            </div>
            <Show when={conflict()}>
              <div class="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/30 p-3 text-sm text-destructive" role="alert">
                {t('roleManagement.staleDraft')}
                <Button type="button" variant="outline" size="sm" onClick={() => { const role = selected(); if (role) openRole(role.id); }}>{t('common.refresh')}</Button>
              </div>
            </Show>
            <Show when={selected()?.name === USER_ROLE.SUPERADMIN} fallback={
              <Show when={selected()?.name !== USER_ROLE.ADMIN && selected()?.name !== USER_ROLE.GUEST} fallback={
                <p class="text-sm text-muted-foreground">{t(selected()?.name === USER_ROLE.ADMIN ? 'roleManagement.adminInfo' : 'roleManagement.guestInfo')}</p>
              }>
                <div class="grid items-start gap-3 sm:grid-cols-2">
                  <label class="grid gap-1.5 text-sm font-medium">
                    {t('roleManagement.name')}
                    <input class={fieldClass} required readOnly={!canEdit() || !!selected()?.is_system || busy()} value={draft().name} onInput={(e) => setDraft((prev) => ({ ...prev, name: e.currentTarget.value }))} />
                  </label>
                  <label class="grid gap-1.5 text-sm font-medium">
                    {t('roleManagement.roleDescription')}
                    <textarea class={fieldClass} rows={2} readOnly={!canEdit() || busy()} value={draft().description} onInput={(e) => setDraft((prev) => ({ ...prev, description: e.currentTarget.value }))} />
                  </label>
                </div>
                <section class="space-y-3" aria-labelledby="permission-editor-title">
                  <div class="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
                    <h3 id="permission-editor-title" class="text-base font-semibold">{t('roleManagement.permissions')}</h3>
                    <span class="text-xs tabular-nums text-muted-foreground">{t('roleManagement.grants', { count: draft().permissions.length })}</span>
                  </div>
                  <Show when={canEdit()}><p class="text-sm text-muted-foreground">{t('roleManagement.delegationInfo')}</p></Show>
                  <Show when={!catalog.loading} fallback={<p role="status" class="text-sm text-muted-foreground">{t('common.loading')}</p>}>
                    <div class="grid min-w-0 gap-x-5 gap-y-4 xl:grid-cols-2">
                      <For each={groups()}>{([resource, permissions]) => (
                        <fieldset class="min-w-0 border-b pb-2">
                          <legend class="max-w-full break-words pb-1 text-sm font-semibold">{t(`roleManagement.groups.${resource as keyof Copy['groups']}`) ?? resource}</legend>
                          <For each={permissions}>{(grant) => {
                            const action = grant.slice(grant.indexOf(':') + 1) as keyof Copy['actions'];
                            const note = () => t(`roleManagement.notes.${grant as keyof Copy['notes']}`);
                            return (
                              <label class="flex items-start gap-2.5 rounded-md py-2 text-sm has-enabled:cursor-pointer has-enabled:hover:bg-muted/50">
                                <input type="checkbox" name={grant} class="mt-0.5 size-4 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-ring" checked={draft().permissions.includes(grant)} disabled={!canEdit() || busy() || !auth.can(grant)} onChange={(e) => changeGrant(grant, e.currentTarget.checked)} />
                                <span class="min-w-0">
                                  <span class="font-medium">{t(`roleManagement.actions.${action}`) ?? grant}</span>
                                  <Show when={note()}><span class="block text-xs leading-relaxed text-muted-foreground">{note()}</span></Show>
                                </span>
                              </label>
                            );
                          }}</For>
                        </fieldset>
                      )}</For>
                    </div>
                  </Show>
                </section>
              </Show>
            }><p class="text-sm text-muted-foreground">{t('roleManagement.superadminInfo')}</p></Show>
            <Show when={canEdit() || canDelete()}>
              <footer class="flex flex-wrap items-center justify-end gap-2 border-t pt-4">
                <Show when={canDelete()}>
                  <Button type="button" variant="ghost" class="mr-auto text-destructive" disabled={busy()} onClick={() => setConfirmDelete(true)}><IconTrash class="size-4" />{t('roleManagement.deleteRole')}</Button>
                </Show>
                <Show when={canEdit()}>
                  <Button type="button" variant="outline" disabled={!dirty() || busy()} onClick={() => { setDraft(base()); setError(undefined); }}>{t('roleManagement.discard')}</Button>
                  <Button type="submit" disabled={!dirty() || conflict() || busy() || !draft().name.trim() || catalog.loading || !!loadFailed()}>{busy() ? t('common.loading') : t('common.save')}</Button>
                </Show>
              </footer>
            </Show>
          </form>
        </Show>
      </div>

      <AlertDialog open={nextSelection() !== undefined} onOpenChange={(open) => { if (!open) setNextSelection(undefined); }}>
        <AlertDialogContent>
          <AlertDialogTitle>{t('roleManagement.discard')}</AlertDialogTitle>
          <AlertDialogDescription>{t('roleManagement.discardDescription')}</AlertDialogDescription>
          <div class="mt-4 flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => setNextSelection(undefined)}>{t('common.cancel')}</Button>
            <Button variant="destructive" onClick={() => { const next = nextSelection(); if (next !== undefined) openRole(next); setNextSelection(undefined); }}>{t('roleManagement.discard')}</Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={confirmDelete()} onOpenChange={(open) => { if (!busy()) setConfirmDelete(open); }}>
        <AlertDialogContent>
          <AlertDialogTitle>{t('roleManagement.deleteRole')}</AlertDialogTitle>
          <AlertDialogDescription>{t('roleManagement.deleteDescription', { role: selected()?.name ?? '' })}</AlertDialogDescription>
          <div class="mt-4 flex flex-wrap justify-end gap-2">
            <Button variant="outline" disabled={busy()} onClick={() => setConfirmDelete(false)}>{t('common.cancel')}</Button>
            <Button variant="destructive" disabled={busy() || !canDelete()} onClick={() => void handleDelete()}>{t('common.delete')}</Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
