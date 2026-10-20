import { type Component, createSignal, createResource, createMemo, Show, For } from 'solid-js';
import { useAuth } from '~/auth';
import { getUsers, setUserRole, deleteUser } from '~/api';
import type { User } from '~/types';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '~/components/ui/card';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '~/components/ui/table';
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
  const auth = useAuth();
  const [data, { refetch }] = createResource(getUsers);
  const [search, setSearch] = createSignal('');
  const [userToDelete, setUserToDelete] = createSignal<User | null>(null);
  const [actionError, setActionError] = createSignal<string | null>(null);
  const [actionSuccess, setActionSuccess] = createSignal<string | null>(null);
  const [updatingEmail, setUpdatingEmail] = createSignal<string | null>(null);

  const currentUser = () => auth.user();
  const isSuperadmin = () => currentUser()?.role === 'superadmin';

  const filteredUsers = createMemo(() => {
    const users = data()?.users || [];
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

  const handleRoleChange = async (targetUser: User, newRole: string) => {
    clearNotifications();
    setUpdatingEmail(targetUser.email);
    try {
      await setUserRole(targetUser.email, newRole);
      setActionSuccess(`Role for ${targetUser.email} updated to ${newRole}.`);
      await refetch();
    } catch (err: any) {
      setActionError(err?.message || 'Failed to update user role.');
    } finally {
      setUpdatingEmail(null);
    }
  };

  const handleApprove = async (targetUser: User) => {
    await handleRoleChange(targetUser, 'user');
  };

  const confirmDelete = async () => {
    const target = userToDelete();
    if (!target) return;
    clearNotifications();
    try {
      await deleteUser(target.email);
      setActionSuccess(`User ${target.email} deleted successfully.`);
      setUserToDelete(null);
      await refetch();
    } catch (err: any) {
      setActionError(err?.message || 'Failed to delete user.');
    }
  };

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return isoString;
    }
  };

  const getRoleBadgeVariant = (
    role: string
  ): 'default' | 'secondary' | 'outline' | 'success' | 'warning' | 'error' => {
    switch (role) {
      case 'superadmin':
        return 'default';
      case 'admin':
        return 'secondary';
      case 'user':
        return 'success';
      case 'guest':
        return 'warning';
      default:
        return 'outline';
    }
  };

  return (
    <div class="space-y-6">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 class="text-2xl font-bold tracking-tight text-foreground">User Management</h1>
          <p class="text-sm text-muted-foreground mt-1">
            Manage authorized users, review pending requests, and configure roles.
          </p>
        </div>
        <div class="flex items-center gap-2">
          <Button variant="outline" size="sm" class="gap-1.5" onClick={() => refetch()}>
            <IconRefresh class="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      <Show when={actionSuccess()}>
        <div class="flex items-center gap-2 p-3 text-sm rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
          <IconCheck class="h-4 w-4 shrink-0" />
          <span>{actionSuccess()}</span>
        </div>
      </Show>

      <Show when={actionError()}>
        <div class="flex items-center gap-2 p-3 text-sm rounded-lg bg-destructive/15 text-destructive border border-destructive/20">
          <IconAlertCircle class="h-4 w-4 shrink-0" />
          <span>{actionError()}</span>
        </div>
      </Show>

      <Card class="border-border shadow-sm">
        <CardHeader class="pb-3 border-b border-border/60">
          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle class="text-base font-semibold">Registered Users</CardTitle>
              <CardDescription class="text-xs">
                {filteredUsers().length} user{filteredUsers().length === 1 ? '' : 's'} total
              </CardDescription>
            </div>
            <div class="w-full sm:w-64">
              <TextField value={search()} onChange={setSearch}>
                <div class="relative">
                  <IconSearch class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <TextFieldInput
                    placeholder="Filter by name or email..."
                    class="h-9 pl-8 text-xs bg-background"
                  />
                </div>
              </TextField>
            </div>
          </div>
        </CardHeader>
        <CardContent class="p-0">
          <div class="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow class="hover:bg-transparent">
                  <TableHead class="w-[300px]">User</TableHead>
                  <TableHead class="w-[140px]">Role</TableHead>
                  <TableHead class="w-[140px]">Joined</TableHead>
                  <TableHead class="text-right w-[200px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <Show
                  when={!data.loading}
                  fallback={
                    <TableRow>
                      <TableCell colSpan={4} class="h-32 text-center text-sm text-muted-foreground">
                        Loading users...
                      </TableCell>
                    </TableRow>
                  }
                >
                  <Show
                    when={filteredUsers().length > 0}
                    fallback={
                      <TableRow>
                        <TableCell colSpan={4} class="h-28 text-center text-sm text-muted-foreground">
                          No users found matching "{search()}"
                        </TableCell>
                      </TableRow>
                    }
                  >
                    <For each={filteredUsers()}>
                      {(u) => {
                        const isSelf = currentUser()?.email.toLowerCase() === u.email.toLowerCase();
                        const isTargetSuper = u.role === 'superadmin';
                        const isUpdating = updatingEmail() === u.email;

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
                                      {u.name || 'Unnamed'}
                                    </span>
                                    <Show when={isSelf}>
                                      <span class="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-mono font-medium">
                                        You
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
                                {u.role === 'guest' ? 'Pending' : u.role}
                              </Badge>
                            </TableCell>

                            <TableCell class="text-xs text-muted-foreground font-mono">
                              {formatDate(u.created_at)}
                            </TableCell>

                            <TableCell class="text-right">
                              <div class="flex items-center justify-end gap-2">
                                {/* Guest approval button */}
                                <Show when={u.role === 'guest' && !isSelf}>
                                  <Button
                                    size="sm"
                                    class="h-8 gap-1 text-xs"
                                    disabled={isUpdating}
                                    onClick={() => handleApprove(u)}
                                  >
                                    <IconUserCheck class="h-3.5 w-3.5" />
                                    Approve
                                  </Button>
                                </Show>

                                {/* Role dropdown for active non-superadmin users */}
                                <Show when={!isTargetSuper && !isSelf}>
                                  <select
                                    class="h-8 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                                    value={u.role}
                                    disabled={isUpdating}
                                    onChange={(e) => handleRoleChange(u, e.currentTarget.value)}
                                  >
                                    <Show when={u.role === 'guest'}>
                                      <option value="guest" disabled>
                                        Guest
                                      </option>
                                    </Show>
                                    <option value="user">User</option>
                                    <option value="admin">Admin</option>
                                  </select>
                                </Show>

                                {/* Delete button for superadmin */}
                                <Show when={isSuperadmin() && !isTargetSuper && !isSelf}>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    class="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                                    disabled={isUpdating}
                                    onClick={() => setUserToDelete(u)}
                                  >
                                    <IconTrash class="h-4 w-4" />
                                  </Button>
                                </Show>

                                <Show when={isTargetSuper}>
                                  <span class="text-xs text-muted-foreground italic pr-2">
                                    Configured in ENV
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
            </Table>
          </div>
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
          <AlertDialogTitle>Delete User</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to permanently delete user{' '}
            <strong class="text-foreground">{userToDelete()?.email}</strong>? They will immediately
            lose all access to the system.
          </AlertDialogDescription>
          <div class="flex justify-end gap-2 mt-4">
            <Button variant="outline" size="sm" onClick={() => setUserToDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" onClick={confirmDelete}>
              Delete
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
