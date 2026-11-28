import { A, useNavigate, useParams } from '@solidjs/router';
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconCopy,
  IconEye,
  IconEyeOff,
  IconInfinity,
  IconLock,
  IconPlus,
  IconSearch,
  IconTrash,
} from '@tabler/icons-solidjs';
import {
  batch,
  createEffect,
  createMemo,
  createResource,
  createSignal,
  For,
  Match,
  Show,
  Switch,
  type Component,
} from 'solid-js';
import { ApiError, deleteRole, getPermissions, getRoles, saveRole } from '~/api';
import { useAuth } from '~/auth';
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from '~/components/ui/alert-dialog';
import { Badge } from '~/components/ui/badge';
import { Button, buttonVariants } from '~/components/ui/button';
import { Skeleton } from '~/components/ui/skeleton';
import { USER_ROLE } from '~/domain';
import { useI18n } from '~/i18n';
import type { RawDictionary } from '~/i18n/en';
import type { Permission } from '~/permissions.generated';
import { ROUTES, type WorkspaceRoute } from '~/routes';
import type { Role, RoleInput } from '~/types';
import {
  ROUTE_LABEL_KEYS,
  countUnlockedWorkspaceRoutes,
  findMissingDependencies,
  isReadLikeAction,
  isSensitivePermission,
  resolveRoleSurfaces,
  routeUnlockedBy,
  type ResolvedRoleSurface,
  type RoleSurfaceKey,
  type SurfaceGrantItem,
} from './roleSurfaces';

const fieldClass =
  'h-10 min-w-0 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring read-only:bg-muted/50';

const configuredRole: Role = {
  id: 0,
  name: USER_ROLE.SUPERADMIN,
  description: '',
  is_system: true,
  permissions: [],
  actions: { update: false, delete: false },
};

const emptyRole: RoleInput = { name: '', description: '', permissions: [] };

type Copy = RawDictionary['roleManagement'];
type Selection = number | 'new';
type PendingNavigation =
  | { kind: 'select'; id: Selection; surface?: RoleSurfaceKey }
  | { kind: 'clone'; source: Role };

const roleValues = ({ name, description, permissions }: Role): RoleInput => ({
  name,
  description,
  permissions: [...permissions].sort(),
});

const sameValues = (a: RoleInput, b: RoleInput) =>
  a.name === b.name &&
  a.description === b.description &&
  a.permissions.length === b.permissions.length &&
  a.permissions.every((grant, i) => grant === b.permissions[i]);

const roleSortName = (name: string) => name.replace(/[A-Z]/g, (char) => char.toLowerCase());

const compareRoles = (a: Role, b: Role) => {
  const system = Number(b.is_system) - Number(a.is_system);
  const x = roleSortName(a.name);
  const y = roleSortName(b.name);
  return system || (x < y ? -1 : x > y ? 1 : a.id - b.id);
};

function rolePath(id: Selection, surface?: RoleSurfaceKey): string {
  const base = `${ROUTES.roles}/${id}`;
  return surface ? `${base}/${surface}` : base;
}

function CoverageBar(props: { granted: number; total: number }) {
  const pct = () => (props.total > 0 ? Math.round((props.granted / props.total) * 100) : 0);
  const fillClass = () => {
    if (pct() === 0) return 'bg-muted-foreground/30';
    if (pct() === 100) return 'bg-status-selesai';
    return 'bg-primary';
  };
  return (
    <div class="flex items-center gap-2.5">
      <div class="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-secondary">
        <div
          class={`h-full rounded-full transition-[width] duration-200 ${fillClass()}`}
          style={{ width: `${pct()}%` }}
        />
      </div>
      <span class="font-mono text-xs tabular-nums text-muted-foreground">
        {props.granted}/{props.total}
      </span>
    </div>
  );
}

export const RoleManagement: Component = () => {
  const auth = useAuth();
  const { t } = useI18n();
  const params = useParams<{ rest?: string }>();
  const navigate = useNavigate();

  const [directory, { mutate, refetch: reloadRoles }] = createResource(() => auth.can('role:read'), getRoles);
  const [catalog, { refetch: reloadCatalog }] = createResource(() => auth.can('role:read'), getPermissions);

  const [roleSearch, setRoleSearch] = createSignal('');
  const [selection, setSelection] = createSignal<Selection>();
  const [base, setBase] = createSignal<RoleInput>(emptyRole);
  const [draft, setDraft] = createSignal<RoleInput>(emptyRole);
  const [pendingNav, setPendingNav] = createSignal<PendingNavigation>();
  const [confirmDelete, setConfirmDelete] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<
    'roleManagement.nameConflict' | 'roleManagement.saveFailed' | 'roleManagement.deleteFailed'
  >();
  const [feedback, setFeedback] = createSignal<'roleManagement.saved' | 'roleManagement.deleted'>();

  const roles = createMemo(() => (directory.error ? [] : [...(directory()?.roles ?? []), configuredRole]));
  const catalogList = createMemo<readonly Permission[]>(() =>
    catalog.error ? [] : (catalog()?.permissions ?? []),
  );
  const surfaces = createMemo(() => resolveRoleSurfaces(catalogList()));

  const pathSegments = createMemo(() =>
    (params.rest ?? '')
      .split('/')
      .map((part) => part.trim())
      .filter(Boolean),
  );

  const routeSelection = createMemo<Selection | undefined>(() => {
    const first = pathSegments()[0];
    if (!first) return undefined;
    if (first === 'new') return 'new';
    const parsed = Number(first);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
  });

  const activeSurfaceKey = createMemo<RoleSurfaceKey | undefined>(() => {
    const raw = pathSegments()[1];
    if (!raw) return undefined;
    return surfaces().find((s) => s.key === raw)?.key;
  });

  const activeSurfaceIndex = createMemo(() => {
    const key = activeSurfaceKey();
    return key ? surfaces().findIndex((s) => s.key === key) : -1;
  });

  const selected = () => {
    const sel = selection();
    return typeof sel === 'number' ? roles().find((role) => role.id === sel) : undefined;
  };

  const isImplicitRole = () => {
    const role = selected();
    return !!role && (role.id === 0 || role.name === USER_ROLE.ADMIN);
  };
  const isGuestRole = () => selected()?.name === USER_ROLE.GUEST;

  const canCreate = () => auth.can('role:create');
  const canEdit = () =>
    selection() === 'new'
      ? canCreate()
      : !!selected()?.actions.update && auth.can('role:update') && !isImplicitRole() && !isGuestRole();
  const canRename = () => canEdit() && (selection() === 'new' || !selected()?.is_system);
  const canDelete = () => selection() !== 'new' && !!selected()?.actions.delete && auth.can('role:delete');
  const loadFailed = () => Boolean(directory.error || catalog.error);
  const dirty = createMemo(() => !sameValues(draft(), base()));
  const conflict = createMemo(() => {
    const current = selected();
    return !!current && dirty() && !sameValues(roleValues(current), base());
  });

  const routeLabel = (route: WorkspaceRoute) => t(ROUTE_LABEL_KEYS[route]) ?? route;
  const resourceLabel = (key: string) => t(`roleManagement.groups.${key as keyof Copy['groups']}`) ?? key;
  const actionLabel = (key: string) => t(`roleManagement.actions.${key as keyof Copy['actions']}`) ?? key;
  const permissionNote = (key: Permission) => t(`roleManagement.notes.${key as keyof Copy['notes']}`);

  const roleHasStoredGrant = (role: Role, grant: Permission): boolean => {
    if (role.id === 0 || role.name === USER_ROLE.ADMIN) return true;
    if (role.name === USER_ROLE.GUEST) return false;
    return role.permissions.includes(grant);
  };

  const roleStoredCount = (role: Role): number => {
    if (role.id === 0 || role.name === USER_ROLE.ADMIN) return catalogList().length;
    if (role.name === USER_ROLE.GUEST) return 0;
    return role.permissions.length;
  };

  const hasDraftGrant = (grant: Permission): boolean => {
    if (isImplicitRole()) return true;
    if (isGuestRole()) return false;
    return draft().permissions.includes(grant);
  };
  const hasBaseGrant = (grant: Permission): boolean => {
    if (isImplicitRole()) return true;
    if (isGuestRole()) return false;
    return base().permissions.includes(grant);
  };

  const grantChanged = (grant: Permission): boolean => hasDraftGrant(grant) !== hasBaseGrant(grant);

  const totalDraftGrants = createMemo(() => {
    if (isImplicitRole()) return catalogList().length;
    if (isGuestRole()) return 0;
    return draft().permissions.length;
  });

  const unlockedRoutesCount = createMemo(() =>
    countUnlockedWorkspaceRoutes(hasDraftGrant, isGuestRole()),
  );

  const missingDependencies = createMemo(() =>
    isImplicitRole() || isGuestRole() ? [] : findMissingDependencies(catalogList(), hasDraftGrant),
  );

  const sensitiveActiveGrants = createMemo(() =>
    isImplicitRole() || isGuestRole()
      ? []
      : catalogList().filter((grant) => isSensitivePermission(grant) && hasDraftGrant(grant)),
  );

  const filteredRoles = createMemo(() => {
    const q = roleSearch().trim().toLocaleLowerCase();
    const sel = selection();
    if (!q) return roles();
    return roles().filter(
      (role) =>
        role.id === sel ||
        role.name.toLocaleLowerCase().includes(q) ||
        role.description.toLocaleLowerCase().includes(q),
    );
  });

  let stagedNewDraft: RoleInput | undefined;

  function openRole(id: Selection, initialDraft?: RoleInput) {
    if (id === 'new') {
      const next = initialDraft ?? emptyRole;
      setSelection('new');
      setBase(emptyRole);
      setDraft(next);
      setError(undefined);
      setFeedback(undefined);
      return;
    }
    const role = roles().find((row) => row.id === id);
    const values = role ? roleValues(role) : emptyRole;
    setSelection(id);
    setBase(values);
    setDraft(values);
    setError(undefined);
    setFeedback(undefined);
  }

  function applyPendingNavigation(action: PendingNavigation) {
    if (action.kind === 'clone') {
      const copiedGrants = catalogList().filter(
        (grant) => roleHasStoredGrant(action.source, grant) && auth.can(grant),
      );
      stagedNewDraft = {
        name: `${action.source.name}-copy`,
        description: action.source.description,
        permissions: copiedGrants.sort(),
      };
      if (routeSelection() === 'new') {
        const next = stagedNewDraft;
        stagedNewDraft = undefined;
        openRole('new', next);
      }
      navigate(rolePath('new'));
      return;
    }
    stagedNewDraft = undefined;
    if (action.id === routeSelection()) {
      openRole(action.id);
    }
    navigate(rolePath(action.id, action.surface));
  }

  function requestSelectRole(id: Selection, surface?: RoleSurfaceKey) {
    if (busy() || (id === 'new' && !canCreate())) return;
    if (id === selection()) {
      navigate(rolePath(id, surface));
      return;
    }
    if (dirty()) {
      setPendingNav({ kind: 'select', id, surface });
      return;
    }
    applyPendingNavigation({ kind: 'select', id, surface });
  }

  function requestCloneRole(source: Role) {
    if (busy() || !canCreate()) return;
    if (dirty()) {
      setPendingNav({ kind: 'clone', source });
      return;
    }
    applyPendingNavigation({ kind: 'clone', source });
  }

  // Synchronize URL params and loaded server directory into active selection
  createEffect(() => {
    if (busy() || directory.loading || directory.error) return;
    const list = roles();
    if (!list.length) return;

    const fromUrl = routeSelection();
    const curSel = selection();

    if (fromUrl === 'new') {
      if (!canCreate()) {
        const fallback = list.find((r) => r.name === USER_ROLE.USER) ?? list[0];
        batch(() => {
          openRole(fallback.id);
          navigate(rolePath(fallback.id), { replace: true });
        });
        return;
      }
      if (curSel !== 'new') {
        const initial = stagedNewDraft;
        stagedNewDraft = undefined;
        openRole('new', initial);
      }
      return;
    }

    if (typeof fromUrl === 'number') {
      const target = list.find((row) => row.id === fromUrl);
      if (!target) {
        if (curSel !== undefined && curSel !== 'new' && !list.some((r) => r.id === curSel)) {
          setSelection(undefined);
        }
        return;
      }
      if (curSel !== target.id) {
        openRole(target.id);
      } else if (!dirty() && !sameValues(roleValues(target), base())) {
        const values = roleValues(target);
        setBase(values);
        setDraft(values);
      }
      return;
    }

    // Bare /admin/roles: open existing selection or default to built-in user / first role
    if (curSel === undefined) {
      const initial = list.find((r) => r.name === USER_ROLE.USER) ?? list[0];
      openRole(initial.id);
      return;
    }
    if (typeof curSel === 'number') {
      const current = list.find((r) => r.id === curSel);
      if (!current) {
        const fallback = list.find((r) => r.name === USER_ROLE.USER) ?? list[0];
        openRole(fallback.id);
      } else if (!dirty() && !sameValues(roleValues(current), base())) {
        const values = roleValues(current);
        setBase(values);
        setDraft(values);
      }
    }
  });

  function changeGrant(grant: Permission, checked: boolean) {
    if (!canEdit() || busy() || !auth.can(grant)) return;
    setDraft((current) => ({
      ...current,
      permissions: checked
        ? [...new Set([...current.permissions, grant])].sort()
        : current.permissions.filter((candidate) => candidate !== grant),
    }));
  }

  function changeGrantsBulk(grants: readonly Permission[], checked: boolean) {
    if (!canEdit() || busy()) return;
    const allowed = grants.filter((g) => auth.can(g));
    if (!allowed.length) return;
    setDraft((current) => {
      const next = new Set(current.permissions);
      for (const grant of allowed) {
        if (checked) next.add(grant);
        else next.delete(grant);
      }
      return { ...current, permissions: [...next].sort() };
    });
  }

  function fixMissingPrerequisites() {
    if (!canEdit() || busy()) return;
    const toAdd = missingDependencies().flatMap((issue) => issue.missing);
    changeGrantsBulk(toAdd, true);
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
      batch(() => {
        mutate((previous) => ({
          roles: [...(previous?.roles ?? []).filter((row) => row.id !== result.role.id), result.role].sort(
            compareRoles,
          ),
        }));
        openRole(result.role.id);
        navigate(rolePath(result.role.id, activeSurfaceKey()), { replace: true });
        setFeedback('roleManagement.saved');
      });
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
      const remaining = (directory()?.roles ?? []).filter((row) => row.id !== role.id);
      const nextRole = remaining.find((r) => r.name === USER_ROLE.USER) ?? remaining[0] ?? configuredRole;
      batch(() => {
        mutate({ roles: remaining });
        setConfirmDelete(false);
        openRole(nextRole.id);
        navigate(rolePath(nextRole.id), { replace: true });
        setFeedback('roleManagement.deleted');
      });
      await auth.refetch();
    } catch {
      setConfirmDelete(false);
      setError('roleManagement.deleteFailed');
    } finally {
      setBusy(false);
    }
  }

  const surfaceVisible = (surface: ResolvedRoleSurface) =>
    surface.routes.length > 0 &&
    surface.routes.some((route) => routeUnlockedBy(route, hasDraftGrant, isGuestRole()));

  const surfaceHasChanges = (surface: ResolvedRoleSurface) =>
    surface.items.some((item) => grantChanged(item.key));

  const unknownUrlRole = createMemo(() => {
    const fromUrl = routeSelection();
    if (directory.loading || directory.error || typeof fromUrl !== 'number') return false;
    return !roles().some((r) => r.id === fromUrl);
  });

  const immutableNotice = () => {
    const role = selected();
    if (!role) return '';
    if (role.id === 0) return t('roleManagement.superadminInfo');
    if (role.name === USER_ROLE.ADMIN) return t('roleManagement.adminInfo');
    if (role.name === USER_ROLE.GUEST) return t('roleManagement.guestInfo');
    return '';
  };

  const activeSurface = () => (activeSurfaceIndex() >= 0 ? surfaces()[activeSurfaceIndex()] : undefined);
  const prevSurface = () => (activeSurfaceIndex() > 0 ? surfaces()[activeSurfaceIndex() - 1] : undefined);
  const nextSurface = () =>
    activeSurfaceIndex() >= 0 && activeSurfaceIndex() < surfaces().length - 1
      ? surfaces()[activeSurfaceIndex() + 1]
      : undefined;

  const surfaceIntentBuckets = createMemo(() => {
    const surf = activeSurface();
    if (!surf) return [];
    const viewItems: SurfaceGrantItem[] = [];
    const operateItems: SurfaceGrantItem[] = [];
    const adminItems: SurfaceGrantItem[] = [];
    for (const item of surf.items) {
      if (isSensitivePermission(item.key) || item.action === 'delete' || item.action === 'clear' || item.action === 'import') {
        adminItems.push(item);
      } else if (item.action === 'read' || item.action === 'export') {
        viewItems.push(item);
      } else {
        operateItems.push(item);
      }
    }
    return [
      { key: 'intentView' as const, items: viewItems, sensitive: false },
      { key: 'intentOperate' as const, items: operateItems, sensitive: false },
      { key: 'intentAdmin' as const, items: adminItems, sensitive: true },
    ].filter((bucket) => bucket.items.length > 0);
  });

  return (
    <div class="min-w-0 space-y-5">
      <header class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <h1 class="text-2xl font-bold tracking-tight">{t('roleManagement.title')}</h1>
          <p class="mt-1 max-w-[68ch] text-sm text-muted-foreground">{t('roleManagement.description')}</p>
        </div>
        <Show when={canCreate()}>
          <Button
            type="button"
            disabled={busy() || directory.loading || catalog.loading || loadFailed()}
            onClick={() => requestSelectRole('new')}
          >
            <IconPlus class="size-4" aria-hidden="true" />
            {t('roleManagement.newRole')}
          </Button>
        </Show>
      </header>

      <Show when={loadFailed()}>
        <div
          role="alert"
          class="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/30 p-3 text-sm text-destructive"
        >
          {t('roleManagement.loadFailed')}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              if (auth.can('role:read')) {
                void reloadRoles();
                void reloadCatalog();
              }
            }}
          >
            {t('common.refresh')}
          </Button>
        </div>
      </Show>

      <Show when={error()}>
        {(message) => (
          <p role="alert" class="rounded-md border border-destructive/30 px-3 py-2 text-sm text-destructive">
            {t(message())}
          </p>
        )}
      </Show>
      <Show when={feedback()}>
        {(message) => (
          <p
            role="status"
            class="rounded-md border border-status-selesai/30 bg-status-selesai/10 px-3 py-2 text-sm font-medium text-status-selesai"
          >
            {t(message())}
          </p>
        )}
      </Show>

      <Switch>
        <Match when={directory.loading || catalog.loading}>
          <div class="space-y-4">
            <Skeleton class="h-20 w-full rounded-lg" />
            <div class="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
              <div class="space-y-2">
                <Skeleton class="h-10 w-full rounded-md" />
                <Skeleton class="h-10 w-full rounded-md" />
                <Skeleton class="h-10 w-full rounded-md" />
                <Skeleton class="h-10 w-full rounded-md" />
              </div>
              <Skeleton class="h-96 w-full rounded-lg" />
            </div>
          </div>
        </Match>

        <Match when={unknownUrlRole()}>
          <div class="space-y-3 rounded-lg border bg-card p-5 text-sm">
            <p class="font-medium">{t('roleManagement.roleNotFound')}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const first = roles().find((r) => r.name === USER_ROLE.USER) ?? roles()[0];
                if (first) requestSelectRole(first.id);
              }}
            >
              <IconArrowLeft class="size-3.5" aria-hidden="true" />
              {t('roleManagement.backToRoles')}
            </Button>
          </div>
        </Match>

        <Match when={selection() === 'new' || !!selected()}>
          <form onSubmit={handleSave} class="min-w-0 space-y-5">
            {/* Persistent Role Context Bar */}
            <div class="flex flex-wrap items-end justify-between gap-3 rounded-lg border bg-card p-4">
              <div class="flex min-w-0 flex-wrap items-end gap-3">
                <Show when={roles().length > 6}>
                  <label class="block w-48 max-w-full space-y-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <span>{t('roleManagement.search')}</span>
                    <div class="relative">
                      <IconSearch
                        class="pointer-events-none absolute left-2.5 top-3 size-4 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <input
                        type="search"
                        class={`${fieldClass} pl-8 font-normal text-foreground`}
                        placeholder={t('roleManagement.search')}
                        value={roleSearch()}
                        onInput={(e) => setRoleSearch(e.currentTarget.value)}
                      />
                    </div>
                  </label>
                </Show>

                <label class="block w-60 max-w-full space-y-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <span>{t('roleManagement.role')}</span>
                  <select
                    class={`${fieldClass} font-mono font-medium text-foreground`}
                    disabled={busy()}
                    value={String(selection() ?? '')}
                    onChange={(e) => {
                      const raw = e.currentTarget.value;
                      if (raw === 'new') requestSelectRole('new', activeSurfaceKey());
                      else requestSelectRole(Number(raw), activeSurfaceKey());
                    }}
                  >
                    <Show when={selection() === 'new'}>
                      <option value="new" selected>
                        {draft().name.trim() || t('roleManagement.newRole')}
                      </option>
                    </Show>
                    <For each={filteredRoles()}>
                      {(role) => (
                        <option value={String(role.id)} selected={selection() === role.id}>
                          {role.name} ({roleStoredCount(role)})
                        </option>
                      )}
                    </For>
                  </select>
                </label>

                <div class="flex flex-wrap items-center gap-1.5 pb-1.5">
                  <Show when={selection() === 'new'}>
                    <span class="inline-flex items-center rounded-md border border-status-pending/30 bg-status-pending/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-status-pending">
                      {t('roleManagement.newRole')}
                    </span>
                  </Show>
                  <Show when={dirty() && selection() !== 'new'}>
                    <span class="inline-flex items-center rounded-md border border-status-proses/30 bg-status-proses/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-status-proses">
                      {t('roleManagement.modified')}
                    </span>
                  </Show>
                  <Show when={selected()?.id === 0}>
                    <Badge variant="outline">{t('roleManagement.configured')}</Badge>
                  </Show>
                  <Show when={selected()?.is_system && selected()?.id !== 0}>
                    <Badge variant="outline">{t('roleManagement.builtIn')}</Badge>
                  </Show>
                  <Show when={!canEdit()}>
                    <Badge variant="secondary" class="gap-1">
                      <IconLock class="size-3" aria-hidden="true" />
                      {t('roleManagement.readOnly')}
                    </Badge>
                  </Show>
                </div>
              </div>

              <div class="flex flex-wrap items-center gap-2">
                <Show when={canCreate() && selected()}>
                  {(role) => (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy()}
                      onClick={() => requestCloneRole(role())}
                    >
                      <IconCopy class="size-3.5" aria-hidden="true" />
                      {t('roleManagement.cloneRole')}
                    </Button>
                  )}
                </Show>
                <Show when={canEdit()}>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!dirty() || busy()}
                    onClick={() => {
                      setDraft(base());
                      setError(undefined);
                    }}
                  >
                    {t('roleManagement.discard')}
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={!dirty() || conflict() || busy() || !draft().name.trim() || loadFailed()}
                  >
                    {busy() ? t('common.saving') : t('common.save')}
                  </Button>
                </Show>
              </div>
            </div>

            <Show when={conflict()}>
              <div
                class="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/30 p-3 text-sm text-destructive"
                role="alert"
              >
                {t('roleManagement.staleDraft')}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const role = selected();
                    if (role) openRole(role.id);
                  }}
                >
                  {t('common.refresh')}
                </Button>
              </div>
            </Show>

            {/* Route-First Multi-Page Workspace */}
            <div class="grid min-w-0 items-start gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
              <aside class="min-w-0 lg:sticky lg:top-4">
                <nav
                  aria-label={t('roleManagement.effectiveRoutesTitle')}
                  class="flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0"
                >
                  <A
                    href={rolePath(selection()!)}
                    aria-current={!activeSurfaceKey() ? 'page' : undefined}
                    class="flex shrink-0 items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-ring aria-[current=page]:border-primary aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground"
                  >
                    <span>{t('roleManagement.overview')}</span>
                    <span class="font-mono text-xs tabular-nums opacity-80">
                      {totalDraftGrants()}/{catalogList().length}
                    </span>
                  </A>
                  <For each={surfaces()}>
                    {(surface) => {
                      const granted = () =>
                        surface.items.filter((item) => hasDraftGrant(item.key)).length;
                      const visible = () => surfaceVisible(surface);
                      const isCurrent = () => activeSurfaceKey() === surface.key;
                      const changed = () => surfaceHasChanges(surface);
                      return (
                        <A
                          href={rolePath(selection()!, surface.key)}
                          aria-current={isCurrent() ? 'page' : undefined}
                          class="flex shrink-0 items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-ring aria-[current=page]:border-primary aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground"
                        >
                          <span class="flex min-w-0 items-center gap-2">
                            <span
                              class="size-2 shrink-0 rounded-full"
                              classList={{
                                'bg-status-proses': changed() && !isCurrent(),
                                'bg-status-selesai': !changed() && visible() && !isCurrent(),
                                'bg-primary-foreground': isCurrent(),
                                'bg-muted-foreground/30': !changed() && !visible() && !isCurrent(),
                              }}
                              aria-hidden="true"
                            />
                            <span class="truncate">{t(`roleManagement.surfaces.${surface.key}`)}</span>
                          </span>
                          <span class="font-mono text-xs tabular-nums opacity-80">
                            {granted()}/{surface.items.length}
                          </span>
                        </A>
                      );
                    }}
                  </For>
                </nav>
              </aside>

              <div class="min-w-0 space-y-5">
                <Switch>
                  {/* DEDICATED SURFACE PAGE */}
                  <Match when={activeSurface()}>
                    {(surf) => {
                      const allKeys = () => surf().items.map((item) => item.key);
                      const readKeys = () =>
                        surf()
                          .items.filter((item) => isReadLikeAction(item.action))
                          .map((item) => item.key);
                      const visible = () => surfaceVisible(surf());
                      const routeNames = () =>
                        surf()
                          .routes.map((r) => `${routeLabel(r)} (${r})`)
                          .join(', ');

                      return (
                        <div class="min-w-0 space-y-5">
                          <Show when={selection() === 'new' && !draft().name.trim()}>
                            <div class="flex flex-wrap items-center justify-between gap-3 rounded-md border border-status-proses/30 bg-status-proses/10 px-3.5 py-2.5 text-sm">
                              <label class="flex min-w-0 flex-1 flex-wrap items-center gap-2 font-medium">
                                <span class="shrink-0">{t('roleManagement.name')}</span>
                                <input
                                  type="text"
                                  required
                                  class="h-8 min-w-44 flex-1 rounded-md border border-input bg-background px-2.5 font-mono text-sm"
                                  placeholder={t('roleManagement.roleNamePlaceholder')}
                                  value={draft().name}
                                  onInput={(e) => setDraft((prev) => ({ ...prev, name: e.currentTarget.value }))}
                                />
                              </label>
                            </div>
                          </Show>

                          <div class="flex flex-wrap items-start justify-between gap-3 border-b pb-3">
                            <div class="min-w-0 space-y-1">
                              <h2 class="text-lg font-semibold tracking-tight">
                                {t(`roleManagement.surfaces.${surf().key}`)}
                              </h2>
                              <p class="max-w-prose text-sm text-muted-foreground">
                                {t(`roleManagement.surfaceHints.${surf().key}`)}
                              </p>
                              <Show when={surf().routes.length > 0}>
                                <div class="flex flex-wrap gap-1.5 pt-1">
                                  <For each={surf().routes}>
                                    {(route) => (
                                      <code class="rounded border bg-muted/50 px-2 py-0.5 font-mono text-xs text-muted-foreground">
                                        {route}
                                      </code>
                                    )}
                                  </For>
                                </div>
                              </Show>
                            </div>

                            <Show when={canEdit()}>
                              <div class="flex flex-wrap gap-1.5">
                                <Show when={readKeys().length > 0}>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={busy()}
                                    onClick={() => changeGrantsBulk(readKeys(), true)}
                                  >
                                    {t('roleManagement.tierRead')}
                                  </Button>
                                </Show>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={busy()}
                                  onClick={() => changeGrantsBulk(allKeys(), true)}
                                >
                                  {t('roleManagement.tierFull')}
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={busy()}
                                  onClick={() => changeGrantsBulk(allKeys(), false)}
                                >
                                  {t('roleManagement.tierNone')}
                                </Button>
                              </div>
                            </Show>
                          </div>

                          <Show when={surf().routes.length > 0}>
                            <div
                              class="flex items-start gap-2.5 rounded-md border px-3.5 py-3 text-sm"
                              classList={{
                                'border-status-selesai/30 bg-status-selesai/10': visible(),
                                'border-border bg-muted/40': !visible(),
                              }}
                            >
                              <Show
                                when={visible()}
                                fallback={
                                  <IconEyeOff
                                    class="mt-0.5 size-4 shrink-0 text-muted-foreground"
                                    aria-hidden="true"
                                  />
                                }
                              >
                                <IconEye class="mt-0.5 size-4 shrink-0 text-status-selesai" aria-hidden="true" />
                              </Show>
                              <div class="min-w-0 space-y-0.5">
                                <p class="font-medium">
                                  {t(visible() ? 'roleManagement.surfaceVisible' : 'roleManagement.surfaceHidden')}
                                </p>
                                <p class="text-xs text-muted-foreground">
                                  {t(
                                    visible()
                                      ? 'roleManagement.surfaceVisibleHint'
                                      : 'roleManagement.surfaceHiddenHint',
                                    { routes: routeNames() },
                                  )}
                                </p>
                              </div>
                            </div>
                          </Show>

                          <Show when={immutableNotice()}>
                            {(text) => (
                              <div class="flex items-start gap-2.5 rounded-md border bg-muted/50 px-3.5 py-3 text-sm text-muted-foreground">
                                <Show
                                  when={isImplicitRole()}
                                  fallback={<IconLock class="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
                                >
                                  <IconInfinity class="mt-0.5 size-4 shrink-0 text-foreground" aria-hidden="true" />
                                </Show>
                                <p class="max-w-prose">{text()}</p>
                              </div>
                            )}
                          </Show>

                          <Show when={canEdit()}>
                            <p class="text-xs text-muted-foreground">{t('roleManagement.delegationInfo')}</p>
                          </Show>

                          <Show when={missingDependencies().length > 0}>
                            <div
                              role="alert"
                              class="flex flex-wrap items-start justify-between gap-3 rounded-md border border-status-proses/30 bg-status-proses/10 px-3.5 py-3 text-sm"
                            >
                              <div class="flex min-w-0 items-start gap-2.5">
                                <IconAlertTriangle
                                  class="mt-0.5 size-4 shrink-0 text-status-proses"
                                  aria-hidden="true"
                                />
                                <div class="min-w-0 space-y-1">
                                  <p class="font-medium text-foreground">
                                    {t('roleManagement.dependencyWarning')}
                                  </p>
                                  <ul class="space-y-0.5 text-xs text-muted-foreground">
                                    <For each={missingDependencies()}>
                                      {(issue) => (
                                        <li>
                                          {t('roleManagement.dependencyLine', {
                                            grant: issue.grant,
                                            missing: issue.missing.join(', '),
                                          })}
                                        </li>
                                      )}
                                    </For>
                                  </ul>
                                </div>
                              </div>
                              <Show when={canEdit()}>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={busy()}
                                  onClick={fixMissingPrerequisites}
                                >
                                  <IconCheck class="size-3.5" aria-hidden="true" />
                                  {t('roleManagement.fixDependencies')}
                                </Button>
                              </Show>
                            </div>
                          </Show>

                          {/* Intent-grouped capability rows */}
                          <div class="space-y-4">
                            <For each={surfaceIntentBuckets()}>
                              {(bucket) => (
                                <div class="overflow-hidden rounded-lg border bg-card">
                                  <div
                                    class="flex items-center justify-between border-b px-4 py-2.5"
                                    classList={{
                                      'bg-status-batal/5': bucket.sensitive,
                                      'bg-muted/30': !bucket.sensitive,
                                    }}
                                  >
                                    <h3
                                      class="text-xs font-semibold uppercase tracking-wider"
                                      classList={{
                                        'text-status-batal': bucket.sensitive,
                                        'text-muted-foreground': !bucket.sensitive,
                                      }}
                                    >
                                      {t(`roleManagement.${bucket.key}`)}
                                    </h3>
                                    <span class="font-mono text-xs tabular-nums text-muted-foreground">
                                      {bucket.items.filter((i) => hasDraftGrant(i.key)).length}/
                                      {bucket.items.length}
                                    </span>
                                  </div>
                                  <div class="divide-y">
                                    <For each={bucket.items}>
                                      {(item) => {
                                        const active = () => hasDraftGrant(item.key);
                                        const changed = () => grantChanged(item.key);
                                        const canToggle = () => canEdit() && !busy() && auth.can(item.key);
                                        const note = () => permissionNote(item.key);
                                        return (
                                          <label
                                            class="flex items-start justify-between gap-4 px-4 py-3 text-sm transition-colors has-enabled:cursor-pointer has-enabled:hover:bg-muted/40"
                                            classList={{ 'bg-status-proses/10': changed() }}
                                          >
                                            <span class="min-w-0 flex-1 space-y-0.5">
                                              <span class="flex flex-wrap items-center gap-2">
                                                <span class="font-medium text-foreground">
                                                  {resourceLabel(item.resource)} · {actionLabel(item.action)}
                                                </span>
                                                <code class="font-mono text-xs text-muted-foreground">
                                                  {item.key}
                                                </code>
                                                <Show when={changed()}>
                                                  <span class="rounded border border-status-proses/30 bg-status-proses/15 px-1.5 py-0 text-[10px] font-semibold uppercase text-status-proses">
                                                    {t('roleManagement.changedBadge')}
                                                  </span>
                                                </Show>
                                                <Show when={!canToggle() && canEdit() && !busy()}>
                                                  <IconLock
                                                    class="size-3.5 text-muted-foreground"
                                                    aria-label={t('roleManagement.delegationLocked')}
                                                  />
                                                </Show>
                                              </span>
                                              <Show when={note()}>
                                                {(text) => (
                                                  <span class="block max-w-prose text-xs text-muted-foreground">
                                                    {text()}
                                                  </span>
                                                )}
                                              </Show>
                                            </span>
                                            <input
                                              type="checkbox"
                                              name={item.key}
                                              class="mt-1 size-4 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-ring"
                                              checked={active()}
                                              disabled={!canToggle()}
                                              onChange={(e) => changeGrant(item.key, e.currentTarget.checked)}
                                            />
                                          </label>
                                        );
                                      }}
                                    </For>
                                  </div>
                                </div>
                              )}
                            </For>
                          </div>

                          <div class="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                            <div>
                              <Show when={prevSurface()}>
                                {(prev) => (
                                  <A
                                    href={rolePath(selection()!, prev().key)}
                                    class={buttonVariants({ variant: 'outline', size: 'sm' })}
                                  >
                                    <IconArrowLeft class="size-3.5" aria-hidden="true" />
                                    {t(`roleManagement.surfaces.${prev().key}`)}
                                  </A>
                                )}
                              </Show>
                            </div>
                            <div>
                              <Show when={nextSurface()}>
                                {(next) => (
                                  <A
                                    href={rolePath(selection()!, next().key)}
                                    class={buttonVariants({ variant: 'outline', size: 'sm' })}
                                  >
                                    {t(`roleManagement.surfaces.${next().key}`)}
                                    <IconArrowRight class="size-3.5" aria-hidden="true" />
                                  </A>
                                )}
                              </Show>
                            </div>
                          </div>
                        </div>
                      );
                    }}
                  </Match>

                  {/* ROLE OVERVIEW PAGE */}
                  <Match when={true}>
                    <div class="min-w-0 space-y-5">
                      <Show when={immutableNotice()}>
                        {(text) => (
                          <div class="flex items-start gap-2.5 rounded-md border bg-muted/50 px-3.5 py-3 text-sm text-muted-foreground">
                            <Show
                              when={isImplicitRole()}
                              fallback={<IconLock class="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
                            >
                              <IconInfinity class="mt-0.5 size-4 shrink-0 text-foreground" aria-hidden="true" />
                            </Show>
                            <p class="max-w-prose">{text()}</p>
                          </div>
                        )}
                      </Show>

                      <Show when={!isImplicitRole() && !isGuestRole()}>
                        <div class="grid items-start gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2">
                          <label class="grid gap-1.5 text-sm font-medium">
                            <span>{t('roleManagement.name')}</span>
                            <input
                              type="text"
                              required
                              class={`${fieldClass} font-mono`}
                              readOnly={!canRename() || busy()}
                              placeholder={t('roleManagement.roleNamePlaceholder')}
                              value={draft().name}
                              onInput={(e) => setDraft((prev) => ({ ...prev, name: e.currentTarget.value }))}
                            />
                          </label>
                          <label class="grid gap-1.5 text-sm font-medium">
                            <span>{t('roleManagement.roleDescription')}</span>
                            <input
                              type="text"
                              class={fieldClass}
                              readOnly={!canEdit() || busy()}
                              placeholder={t('roleManagement.roleDescPlaceholder')}
                              value={draft().description}
                              onInput={(e) => setDraft((prev) => ({ ...prev, description: e.currentTarget.value }))}
                            />
                          </label>
                        </div>
                      </Show>

                      <Show when={missingDependencies().length > 0}>
                        <div
                          role="alert"
                          class="flex flex-wrap items-start justify-between gap-3 rounded-md border border-status-proses/30 bg-status-proses/10 px-3.5 py-3 text-sm"
                        >
                          <div class="flex min-w-0 items-start gap-2.5">
                            <IconAlertTriangle
                              class="mt-0.5 size-4 shrink-0 text-status-proses"
                              aria-hidden="true"
                            />
                            <div class="min-w-0 space-y-1">
                              <p class="font-medium text-foreground">{t('roleManagement.dependencyWarning')}</p>
                              <ul class="space-y-0.5 text-xs text-muted-foreground">
                                <For each={missingDependencies()}>
                                  {(issue) => (
                                    <li>
                                      {t('roleManagement.dependencyLine', {
                                        grant: issue.grant,
                                        missing: issue.missing.join(', '),
                                      })}
                                    </li>
                                  )}
                                </For>
                              </ul>
                            </div>
                          </div>
                          <Show when={canEdit()}>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={busy()}
                              onClick={fixMissingPrerequisites}
                            >
                              <IconCheck class="size-3.5" aria-hidden="true" />
                              {t('roleManagement.fixDependencies')}
                            </Button>
                          </Show>
                        </div>
                      </Show>

                      <Show when={sensitiveActiveGrants().length > 0}>
                        <div class="flex items-start gap-2.5 rounded-md border border-status-batal/30 bg-status-batal/10 px-3.5 py-3 text-sm">
                          <IconAlertTriangle
                            class="mt-0.5 size-4 shrink-0 text-status-batal"
                            aria-hidden="true"
                          />
                          <div class="min-w-0 space-y-1.5">
                            <p class="font-medium text-foreground">
                              {t('roleManagement.sensitiveWarning', { count: sensitiveActiveGrants().length })}
                            </p>
                            <p class="text-xs text-muted-foreground">
                              {t('roleManagement.sensitiveWarningDesc')}
                            </p>
                            <div class="flex flex-wrap gap-1.5 pt-0.5">
                              <For each={sensitiveActiveGrants()}>
                                {(grant) => (
                                  <code class="rounded-md border border-status-batal/30 bg-background px-2 py-0.5 font-mono text-xs text-status-batal">
                                    {grant}
                                  </code>
                                )}
                              </For>
                            </div>
                          </div>
                        </div>
                      </Show>

                      {/* Application Surface Map */}
                      <div class="overflow-hidden rounded-lg border bg-card">
                        <div class="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-4 py-3">
                          <h2 class="text-sm font-semibold">{t('roleManagement.effectiveRoutesTitle')}</h2>
                          <span class="font-mono text-xs tabular-nums text-muted-foreground">
                            {t('roleManagement.routesUnlocked', { count: unlockedRoutesCount() })}
                          </span>
                        </div>

                        <div class="divide-y">
                          <For each={surfaces()}>
                            {(surface) => {
                              const activeCount = () =>
                                surface.items.filter((item) => hasDraftGrant(item.key)).length;
                              const visible = () => surfaceVisible(surface);
                              const changed = () => surfaceHasChanges(surface);
                              return (
                                <div class="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                                  <div class="min-w-0 space-y-1">
                                    <div class="flex flex-wrap items-center gap-2">
                                      <A
                                        href={rolePath(selection()!, surface.key)}
                                        class="text-sm font-semibold hover:underline"
                                      >
                                        {t(`roleManagement.surfaces.${surface.key}`)}
                                      </A>
                                      <Show when={surface.routes.length > 0}>
                                        <Show
                                          when={visible()}
                                          fallback={
                                            <span class="inline-flex items-center gap-1 rounded-md border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                                              <IconEyeOff class="size-3" aria-hidden="true" />
                                              {t('roleManagement.surfaceHidden')}
                                            </span>
                                          }
                                        >
                                          <span class="inline-flex items-center gap-1 rounded-md border border-status-selesai/30 bg-status-selesai/15 px-2 py-0.5 text-[11px] font-semibold text-status-selesai">
                                            <IconEye class="size-3" aria-hidden="true" />
                                            {t('roleManagement.surfaceVisible')}
                                          </span>
                                        </Show>
                                      </Show>
                                      <Show when={changed()}>
                                        <span class="rounded border border-status-proses/30 bg-status-proses/15 px-1.5 py-0 text-[10px] font-semibold uppercase text-status-proses">
                                          {t('roleManagement.changedBadge')}
                                        </span>
                                      </Show>
                                    </div>
                                    <p class="max-w-prose text-xs text-muted-foreground">
                                      {t(`roleManagement.surfaceHints.${surface.key}`)}
                                    </p>
                                    <Show when={surface.routes.length > 0}>
                                      <div class="flex flex-wrap gap-1.5 pt-0.5">
                                        <For each={surface.routes}>
                                          {(route) => (
                                            <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                                              {routeLabel(route)} ({route})
                                            </code>
                                          )}
                                        </For>
                                      </div>
                                    </Show>
                                  </div>
                                  <div class="flex shrink-0 items-center gap-3">
                                    <CoverageBar granted={activeCount()} total={surface.items.length} />
                                    <A
                                      href={rolePath(selection()!, surface.key)}
                                      class={buttonVariants({ variant: 'outline', size: 'sm' })}
                                    >
                                      {t(canEdit() ? 'roleManagement.editPermissions' : 'roleManagement.inspect')}
                                      <IconArrowRight class="size-3.5" aria-hidden="true" />
                                    </A>
                                  </div>
                                </div>
                              );
                            }}
                          </For>
                        </div>
                      </div>
                    </div>
                  </Match>
                </Switch>

                {/* Persistent Form Action Footer */}
                <Show when={canEdit() || canDelete()}>
                  <footer class="flex flex-wrap items-center justify-end gap-2 rounded-lg border bg-card px-4 py-3">
                    <Show when={canDelete()}>
                      <Button
                        type="button"
                        variant="ghost"
                        class="mr-auto text-destructive hover:text-destructive"
                        disabled={busy()}
                        onClick={() => setConfirmDelete(true)}
                      >
                        <IconTrash class="size-4" aria-hidden="true" />
                        {t('roleManagement.deleteRole')}
                      </Button>
                    </Show>
                    <Show when={canEdit()}>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={!dirty() || busy()}
                        onClick={() => {
                          setDraft(base());
                          setError(undefined);
                        }}
                      >
                        {t('roleManagement.discard')}
                      </Button>
                      <Button
                        type="submit"
                        disabled={!dirty() || conflict() || busy() || !draft().name.trim() || loadFailed()}
                      >
                        {busy() ? t('common.saving') : t('common.save')}
                      </Button>
                    </Show>
                  </footer>
                </Show>
              </div>
            </div>
          </form>
        </Match>
      </Switch>

      <AlertDialog
        open={pendingNav() !== undefined}
        onOpenChange={(open) => {
          if (!open) setPendingNav(undefined);
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>{t('roleManagement.discard')}</AlertDialogTitle>
          <AlertDialogDescription>{t('roleManagement.discardDescription')}</AlertDialogDescription>
          <div class="mt-4 flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => setPendingNav(undefined)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                const action = pendingNav();
                setPendingNav(undefined);
                if (action) applyPendingNavigation(action);
              }}
            >
              {t('roleManagement.discard')}
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={confirmDelete()}
        onOpenChange={(open) => {
          if (!busy()) setConfirmDelete(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>{t('roleManagement.deleteRole')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('roleManagement.deleteDescription', { role: selected()?.name ?? '' })}
          </AlertDialogDescription>
          <div class="mt-4 flex flex-wrap justify-end gap-2">
            <Button variant="outline" disabled={busy()} onClick={() => setConfirmDelete(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              disabled={busy() || !canDelete()}
              onClick={() => void handleDelete()}
            >
              {busy() ? t('common.deleting') : t('common.delete')}
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
