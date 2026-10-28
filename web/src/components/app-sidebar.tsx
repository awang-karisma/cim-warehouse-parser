import { type Component, For, createMemo, createSignal, onMount, onCleanup, createResource } from 'solid-js';
import { getStatus, getConfig } from '~/api';
import { cn } from '~/lib/utils';
import { A, useLocation } from '@solidjs/router';
import { useAuth } from '~/auth';
import { useI18n } from '~/i18n';
import {
  IconLayoutDashboard,
  IconClipboardList,
  IconPackage,
  IconUsers,
  IconAddressBook,
  IconMapPin,
  IconTruckDelivery,
  IconTimeline,
  IconBarcode,
  IconRefresh,
  IconSearch,
  IconSettings,
  IconUserCog,
  type IconProps,
} from '@tabler/icons-solidjs';

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '~/components/ui/sidebar';

interface NavItem {
  href: string;
  label: string;
  icon: Component<IconProps>;
  exact?: boolean;
}

function parseDuration(s?: string): number {
  if (!s) return 15 * 60 * 1000;
  let ms = 0;
  const matches = s.matchAll(/(\d+)(h|m|s|ms)/g);
  let matched = false;
  for (const match of matches) {
    matched = true;
    const val = parseInt(match[1], 10);
    switch (match[2]) {
      case 'h': ms += val * 3600 * 1000; break;
      case 'm': ms += val * 60 * 1000; break;
      case 's': ms += val * 1000; break;
      case 'ms': ms += val; break;
    }
  }
  return matched ? ms : 15 * 60 * 1000;
}


function formatCountdown(ms: number): string {
  if (ms <= 0) return '00:00';
  const totalSec = Math.floor(ms / 1000);
  const sec = totalSec % 60;
  const min = Math.floor(totalSec / 60) % 60;
  const hour = Math.floor(totalSec / 3600);
  const pad = (n: number) => n.toString().padStart(2, '0');
  if (hour > 0) {
    return `${hour}:${pad(min)}:${pad(sec)}`;
  }
  return `${pad(min)}:${pad(sec)}`;
}

const SyncStatusFooter: Component = () => {
  const { t, formatRelativeTime } = useI18n();
  const [status, { refetch: refetchStatus }] = createResource(getStatus);
  const [config] = createResource(getConfig);
  const [now, setNow] = createSignal(Date.now());

  onMount(() => {
    const pollTimer = setInterval(() => {
      refetchStatus();
    }, 30000);
    const tickTimer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    onCleanup(() => {
      clearInterval(pollTimer);
      clearInterval(tickTimer);
    });
  });

  const parsedInterval = createMemo(() => parseDuration(config()?.sync_interval));

  const lastSyncDate = createMemo(() => {
    const ls = status()?.last_sync;
    return ls ? new Date(ls) : null;
  });

  const dotColorClass = createMemo(() => {
    const date = lastSyncDate();
    if (!date || isNaN(date.getTime())) return 'bg-red-500';
    const diff = now() - date.getTime();
    if (diff <= parsedInterval()) return 'bg-emerald-500';
    if (diff < 6 * 3600 * 1000) return 'bg-yellow-500';
    return 'bg-red-500';
  });

  const line1 = createMemo(() => {
    const date = lastSyncDate();
    if (!date || isNaN(date.getTime())) return t('sync.neverSynced');
    return t('sync.synced', { time: formatRelativeTime(date, now()) });
  });

  const line2 = createMemo(() => {
    const s = status();
    if (s?.status === 'syncing' || s?.status === 'running') {
      return t('sync.inProgress');
    }
    if (s?.is_inside_work_hours === false) {
      return t('sync.outsideWorkHours');
    }
    if (s?.next_sync) {
      const nextTime = new Date(s.next_sync).getTime();
      const diff = nextTime - now();
      if (diff > 0) {
        return t('sync.nextIn', { time: formatCountdown(diff) });
      }
      return t('sync.overdue');
    }
    return t('sync.idle');
  });

  const tooltipTitle = createMemo(() => {
    const parts: string[] = [];
    const ls = lastSyncDate();
    if (ls && !isNaN(ls.getTime())) {
      parts.push(t('sync.lastSync', { time: ls.toLocaleString() }));
    } else {
      parts.push(t('sync.neverSynced'));
    }
    if (status()?.next_sync) {
      parts.push(t('sync.nextSync', { time: new Date(status()!.next_sync!).toLocaleString() }));
    }
    if (status()?.is_inside_work_hours === false) {
      parts.push(t('sync.outsideActive'));
    }
    return parts.join('\n');
  });

  const isSyncing = () => status()?.status === 'syncing' || status()?.status === 'running';

  return (
    <SidebarFooter class="p-3 text-xs text-muted-foreground">
      <div
        class="flex items-center gap-2 px-2 py-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
        title={tooltipTitle()}
      >
        <span
          class={cn(
            'size-2 shrink-0 rounded-full',
            dotColorClass(),
            isSyncing() ? 'animate-ping' : 'animate-pulse'
          )}
        />
        <div class="flex flex-col min-w-0 group-data-[collapsible=icon]:hidden leading-tight">
          <span class="truncate font-medium text-foreground/80">{line1()}</span>
          <span class="truncate text-[10px] text-muted-foreground">{line2()}</span>
        </div>
      </div>
    </SidebarFooter>
  );
};

export const AppSidebar: Component = () => {
  const location = useLocation();
  const auth = useAuth();
  const { t } = useI18n();
  const { isMobile, setOpenMobile } = useSidebar();

  const handleNavClick = () => {
    if (isMobile()) {
      setOpenMobile(false);
    }
  };
  const isPrivileged = createMemo(() => {
    const role = auth.user()?.role;
    return role === 'admin' || role === 'superadmin';
  });

  const currentNavItems = createMemo<NavItem[]>(() => {
    const items: NavItem[] = [
      { href: '/', label: t('nav.dashboard'), icon: IconLayoutDashboard, exact: true },
      { href: '/orders', label: t('nav.orders'), icon: IconClipboardList },
      { href: '/items', label: t('nav.items'), icon: IconPackage },
      { href: '/customers', label: t('nav.customerView'), icon: IconUsers },
      { href: '/customer-aliases', label: t('nav.customerAliases'), icon: IconAddressBook },
      { href: '/areas', label: t('nav.areaMap'), icon: IconMapPin },
      { href: '/delivery-flow', label: t('nav.deliveryFlow'), icon: IconTruckDelivery },
      { href: '/timeline', label: t('nav.deliveryTimeline'), icon: IconTimeline },
      { href: '/barcode', label: t('nav.barcodePrinter'), icon: IconBarcode },
      { href: '/sync', label: t('nav.syncManager'), icon: IconRefresh },
      { href: '/search', label: t('nav.search'), icon: IconSearch },
      { href: '/settings', label: t('nav.settings'), icon: IconSettings },
    ];
    if (isPrivileged()) {
      items.push({ href: '/admin/users', label: t('nav.userManagement'), icon: IconUserCog });
    }
    return items;
  });

  const isActive = (item: NavItem) => {
    if (item.exact) {
      return location.pathname === '/' || location.pathname === '/dashboard';
    }
    return location.pathname.startsWith(item.href);
  };
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" class="cursor-default hover:bg-transparent">
              <div class="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <IconPackage class="size-4" />
              </div>
              <div class="grid flex-1 text-left text-sm leading-tight">
                <span class="truncate font-semibold">Warehouse Parser</span>
                <span class="truncate text-xs text-muted-foreground">{t('common.adminConsole')}</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t('common.navigation')}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <For each={currentNavItems()}>
                {(item) => {
                  const active = () => isActive(item);
                  const Icon = item.icon;
                  return (
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        as={A}
                        href={item.href}
                        isActive={active()}
                        tooltip={item.label}
                        onClick={handleNavClick}
                      >
                        <Icon class="size-4 shrink-0" />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                }}
              </For>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SyncStatusFooter />
      <SidebarRail />
    </Sidebar>
  );
};
