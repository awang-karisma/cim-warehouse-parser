import { USER_ROLE } from '~/domain';

import { type Component, createSignal, createResource, createMemo, Show, For } from 'solid-js';
import { useI18n } from '~/i18n';
import { useAuth } from '~/auth';
import { getUsers, setUserRole, deleteUser } from '~/api';
import type { User } from '~/types';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '~/components/ui/card';
import {
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '~/components/ui/table';
import { DataTable } from '~/components/DataTable';
import { TableSkeleton } from '~/components/TableSkeleton';
import { Button } from '~/components/ui/button';
import { Badge } from '~/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '~/components/ui/avatar';
import { TextField, TextFieldInput } from '~/components/ui/text-field';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
} from '~/components/ui/alert-dialog';
import {
  IconSearch,
  IconTrash,
  IconCheck,
  IconAlertCircle,
  IconRefresh,
  IconUserCheck,
} from '@tabler/icons-solidjs';

export const UserManagement: Component = () => {
  const { t, formatDate } = useI18n();
  const auth = useAuth();
  const [data, { refetch }] = createResource(() => auth.can('user:read'), getUsers);
  const [search, setSearch] = createSignal('');
  const [userToDelete, setUserToDelete] = createSignal<User | null>(null);
  const [actionError, setActionError] = createSignal<string | null>(null);
  const [actionSuccess, setActionSuccess] = createSignal<string | null>(null);
  const [updatingEmail, setUpdatingEmail] = createSignal<string | null>(null);

  const currentUser = () => auth.user();
  const roleChoices = () => data.error ? [] : data()?.assignable_roles ?? [];

  const filteredUsers = createMemo(() => {
    const users = data.error ? [] : data()?.users ?? [];
    const q = search().toLowerCase().trim();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q)
    );
  });

  const clearNotifications = () => {
    setActionError(null);
    setActionSuccess(null);
  };

  const handleRoleChange = async (targetUser: User, newRole: string, approve = false) => {
    if (updatingEmail()) return;
    if (approve) {
      if (!targetUser.actions.approve || newRole !== USER_ROLE.USER || !auth.canAny('user:create', 'user:update')) return;
    } else if (!targetUser.actions.assign || !auth.can('user:update') || !roleChoices().some((role) => role.name === newRole)) return;
    clearNotifications();
    setUpdatingEmail(targetUser.email);
    try {
      await setUserRole(targetUser.email, newRole);
      setActionSuccess(t('userManagement.roleSaved', { email: targetUser.email, role: newRole }));
      await auth.refetch();
      if (auth.can('user:read')) await refetch();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : t('userManagement.actionFailed'));
    } finally {
      setUpdatingEmail(null);
    }
  };

  const confirmDelete = async () => {
    const target = userToDelete();
    if (!target?.actions.delete || !auth.can('user:delete') || updatingEmail()) return;
    clearNotifications();
    setUpdatingEmail(target.email);
    try {
      await deleteUser(target.email);
      setActionSuccess(t('userManagement.userDeleted', { email: target.email }));
      setUserToDelete(null);
      await auth.refetch();
      if (auth.can('user:read')) await refetch();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : t('userManagement.actionFailed'));
    } finally {
      setUpdatingEmail(null);
    }
  };


  const getRoleBadgeVariant = (
    role: string
  ): 'default' | 'secondary' | 'outline' | 'success' | 'warning' | 'error' => {
	switch (role) {
		case USER_ROLE.SUPERADMIN:
			return 'default';
		case USER_ROLE.ADMIN:
			return 'secondary';
		case USER_ROLE.USER:
			return 'success';
		case USER_ROLE.GUEST:
			return 'warning';
      default:
        return 'outline';
    }
  };

  return (
    <div class="space-y-6">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 class="text-2xl font-bold tracking-tight text-foreground">{t('userManagement.title')}</h1>
          <p class="text-sm text-muted-foreground mt-1">
            {t('userManagement.description')}
          </p>
        </div>
        <div class="flex items-center gap-2">
          <Button variant="outline" size="sm" class="gap-1.5" disabled={data.loading} onClick={() => auth.can('user:read') && void refetch()}>
            <IconRefresh class="h-4 w-4" />
            {t('common.refresh')}
          </Button>
        </div>
      </div>

      <Show when={actionSuccess()}>
        <div role="status" class="flex items-center gap-2 p-3 text-sm rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
          <IconCheck class="h-4 w-4 shrink-0" />
          <span>{actionSuccess()}</span>
        </div>
      </Show>

      <Show when={actionError()}>
        <div role="alert" class="flex items-center gap-2 p-3 text-sm rounded-lg bg-destructive/15 text-destructive border border-destructive/20">
          <IconAlertCircle class="h-4 w-4 shrink-0" />
          <span>{actionError()}</span>
        </div>
      </Show>

      <Card class="border-border shadow-sm">
        <CardHeader class="pb-3 border-b border-border/60">
          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle class="text-base font-semibold">{t('userManagement.registeredUsers')}</CardTitle>
              <CardDescription class="text-xs">
                {t('userManagement.userCount', { count: filteredUsers().length })}
              </CardDescription>
            </div>
            <div class="w-full sm:w-64">
              <TextField value={search()} onChange={setSearch}>
                <div class="relative">
                  <IconSearch class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <TextFieldInput
                    aria-label={t('userManagement.filterPlaceholder')}
                    placeholder={t('userManagement.filterPlaceholder')}
                    class="h-9 pl-8 text-xs bg-background"
                  />
                </div>
              </TextField>
            </div>
          </div>
        </CardHeader>
        <CardContent class="p-0">
          <DataTable>
              <TableHeader>
                <TableRow class="hover:bg-transparent">
                  <TableHead class="w-[300px]">{t('userManagement.userCol')}</TableHead>
                  <TableHead class="w-[140px]">{t('userManagement.role')}</TableHead>
                  <TableHead class="w-[140px]">{t('userManagement.joined')}</TableHead>
                  <TableHead class="text-right w-[200px]">{t('userManagement.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <Show
                  when={!data.loading}
                  fallback={
                    <TableSkeleton columns={4} rows={3} />
                  }
                >
                  <Show
                    when={filteredUsers().length > 0}
                    fallback={
                      <TableRow>
                        <TableCell colSpan={4} class="h-28 text-center text-sm text-muted-foreground">
                          {data.error ? t('userManagement.actionFailed') : t('userManagement.noMatches')}
                        </TableCell>
                      </TableRow>
                    }
                  >
                    <For each={filteredUsers()}>
                      {(u) => {
                        const isSelf = currentUser()?.email.toLowerCase() === u.email.toLowerCase();
						const isTargetSuper = u.role === USER_ROLE.SUPERADMIN;
                        const isUpdating = () => !!updatingEmail();
                        return (
                          <TableRow>
                            <TableCell>
                              <div class="flex items-center gap-3">
                                <Avatar class="h-9 w-9 border border-border">
                                  <AvatarImage src={u.picture} alt={u.name} />
                                  <AvatarFallback class="text-xs font-bold bg-primary/10 text-primary">
                                    {(u.name || u.email || 'U').charAt(0).toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                                <div class="flex flex-col min-w-0">
                                  <div class="flex items-center gap-2">
                                    <span class="text-sm font-medium text-foreground truncate">
                                      {u.name || t('userManagement.unnamed')}
                                    </span>
                                    <Show when={isSelf}>
                                      <span class="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-mono font-medium">
                                        {t('userManagement.you')}
                                      </span>
                                    </Show>
                                  </div>
                                  <span class="text-xs text-muted-foreground font-mono truncate">
                                    {u.email}
                                  </span>
                                </div>
                              </div>
                            </TableCell>

                            <TableCell>
                              <Badge variant={getRoleBadgeVariant(u.role)}>
                                <span class="font-mono">{u.role === USER_ROLE.GUEST ? t('userManagement.pending') : u.role}</span>
                              </Badge>
                            </TableCell>

                            <TableCell class="text-xs text-muted-foreground font-mono">
                              {formatDate(u.created_at)}
                            </TableCell>

                            <TableCell class="text-right">
                              <div class="flex items-center justify-end gap-2">
                                <Show when={u.actions.approve && auth.canAny('user:create', 'user:update')}>
                                  <Button
                                    size="sm"
                                    class="h-8 gap-1 text-xs"
                                    disabled={isUpdating()}
                                    onClick={() => void handleRoleChange(u, USER_ROLE.USER, true)}
                                  >
                                    <IconUserCheck class="h-3.5 w-3.5" />
                                    {t('userManagement.approve')}
                                  </Button>
                                </Show>

                                <Show when={u.actions.assign && auth.can('user:update')}>
                                  <select
                                    class="h-8 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                                    aria-label={t('userManagement.assignRole', { email: u.email })}
                                    value={u.role}
                                    disabled={isUpdating()}
                                    onChange={(e) => {
                                      const next = e.currentTarget.value;
                                      e.currentTarget.value = u.role;
                                      if (next !== u.role) void handleRoleChange(u, next);
                                    }}
                                  >
                                    <For each={roleChoices()}>{(role) => <option value={role.name} selected={role.name === u.role}>{role.name}</option>}</For>
                                  </select>
                                </Show>

                                <Show when={u.actions.delete && auth.can('user:delete')}>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    class="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                                    aria-label={t('userManagement.deleteUser')}
                                    disabled={isUpdating()}
                                    onClick={() => setUserToDelete(u)}
                                  >
                                    <IconTrash class="h-4 w-4" />
                                  </Button>
                                </Show>

                                <Show when={isTargetSuper}>
                                  <span class="text-xs text-muted-foreground italic pr-2">
                                    {t('userManagement.configured')}
                                  </span>
                                </Show>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      }}
                    </For>
                  </Show>
                </Show>
              </TableBody>
          </DataTable>
        </CardContent>
      </Card>

      {/* Delete User Confirmation Dialog */}
      <AlertDialog
        open={!!userToDelete()}
        onOpenChange={(open) => {
          if (!open) setUserToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>{t('userManagement.deleteUser')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('userManagement.deleteDescription', { email: userToDelete()?.email ?? '' })}
          </AlertDialogDescription>
          <div class="flex flex-col sm:flex-row sm:justify-end gap-2 mt-4">
            <Button variant="outline" size="sm" onClick={() => setUserToDelete(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" size="sm" disabled={!!updatingEmail()} onClick={confirmDelete}>
              {t('common.delete')}
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
