import { USER_ROLE, SYNC_STATUS } from '~/domain';
import { ROUTES } from '~/routes';

import { type Component, For, Show, createMemo, createSignal, onMount, onCleanup, createResource } from 'solid-js';
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
  IconChevronDown,
  type IconProps,
} from '@tabler/icons-solidjs';
import * as Accordion from '@kobalte/core/accordion';

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
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

interface NavGroup {
  id: 'overview' | 'operations' | 'customersAndAreas' | 'tools' | 'administration';
  label: string;
  items: NavItem[];
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
    const record = status()?.last_record;
    if (record?.status.toUpperCase() !== SYNC_STATUS.SUCCESS) return null;
    const date = new Date(record.synced_at);
    return Number.isNaN(date.getTime()) ? null : date;
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
  const sidebar = useSidebar();
  const { isMobile, setOpenMobile } = sidebar;

  const handleNavClick = () => {
    if (isMobile()) {
      setOpenMobile(false);
    }
  };
	const isPrivileged = createMemo(() => {
		const role = auth.user()?.role;
		return role === USER_ROLE.ADMIN || role === USER_ROLE.SUPERADMIN;
	});

  const currentNavGroups = createMemo<NavGroup[]>(() => {
    const groups: NavGroup[] = [
		{ id: 'overview', label: t('navGroups.overview'), items: [
			{ href: ROUTES.root, label: t('nav.dashboard'), icon: IconLayoutDashboard, exact: true },
		] },
		{ id: 'operations', label: t('navGroups.operations'), items: [
			{ href: ROUTES.orders, label: t('nav.orders'), icon: IconClipboardList },
			{ href: ROUTES.items, label: t('nav.items'), icon: IconPackage },
			{ href: ROUTES.deliveryFlow, label: t('nav.deliveryFlow'), icon: IconTruckDelivery },
			{ href: ROUTES.timeline, label: t('nav.deliveryTimeline'), icon: IconTimeline },
		] },
		{ id: 'customersAndAreas', label: t('navGroups.customersAndAreas'), items: [
			{ href: ROUTES.customers, label: t('nav.customerView'), icon: IconUsers },
			{ href: ROUTES.customerAliases, label: t('nav.customerAliases'), icon: IconAddressBook },
			{ href: ROUTES.areas, label: t('nav.areaMap'), icon: IconMapPin },
	] },
	{ id: 'tools', label: t('navGroups.tools'), items: [
		{ href: ROUTES.barcode, label: t('nav.barcodePrinter'), icon: IconBarcode },
		{ href: ROUTES.search, label: t('nav.search'), icon: IconSearch },
	] },
	{ id: 'administration', label: t('navGroups.administration'), items: [
		{ href: ROUTES.sync, label: t('nav.syncManager'), icon: IconRefresh },
		{ href: ROUTES.settings, label: t('nav.settings'), icon: IconSettings },
		...(isPrivileged() ? [{ href: ROUTES.users, label: t('nav.userManagement'), icon: IconUserCog }] : []),
	] },
    ];
    return groups;
  });

	const isActive = (item: NavItem) => item.exact
		? location.pathname === ROUTES.root || location.pathname === ROUTES.dashboard
		: location.pathname.startsWith(item.href);
	const activeGroupId = createMemo<NavGroup['id']>(() => {
		const path = location.pathname;
		if (path === ROUTES.root || path === ROUTES.dashboard) return 'overview';
		if ([ROUTES.orders, ROUTES.items, ROUTES.deliveryFlow, ROUTES.timeline].some((prefix) => path.startsWith(prefix))) return 'operations';
		if ([ROUTES.customers, ROUTES.customerAliases, ROUTES.areas].some((prefix) => path.startsWith(prefix))) return 'customersAndAreas';
		if ([ROUTES.barcode, ROUTES.search].some((prefix) => path.startsWith(prefix))) return 'tools';
		return 'administration';
	});
  const [userOpenGroups, setUserOpenGroups] = createSignal<string[]>([]);
  const expandedGroups = createMemo(() => [...new Set([...userOpenGroups(), activeGroupId()])]);
  const handleAccordionChange = (value: string[]) => {
    setUserOpenGroups(value.filter((id) => id !== activeGroupId()));
  };
  const NavLinks: Component<{ items: NavItem[] }> = (props) => (
    <SidebarMenu>
      <For each={props.items}>{(item) => {
        const Icon = item.icon;
        return (
          <SidebarMenuItem>
            <SidebarMenuButton as={A} href={item.href} isActive={isActive(item)} tooltip={item.label} onClick={handleNavClick}>
              <Icon class="size-4 shrink-0" />
              <span>{item.label}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      }}</For>
    </SidebarMenu>
  );

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" class="cursor-default hover:bg-transparent">
              <div class="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground"><IconPackage class="size-4" /></div>
              <div class="grid flex-1 text-left text-sm leading-tight">
                <span class="truncate font-semibold">Warehouse Parser</span>
                <span class="truncate text-xs text-muted-foreground">{t('common.adminConsole')}</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent class="group-data-[collapsible=icon]:overflow-y-auto group-data-[collapsible=icon]:overflow-x-hidden">
        <Show when={sidebar.state() === 'collapsed'} fallback={
          <Accordion.Root multiple collapsible value={expandedGroups()} onChange={handleAccordionChange} class="w-full">
            <For each={currentNavGroups()}>{(group) => (
              <Accordion.Item value={group.id}>
                <SidebarGroup class="p-0">
                  <Accordion.Header class="w-full">
                    <Accordion.Trigger class="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs font-medium text-sidebar-foreground/70 outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring">
                      <span class="truncate">{group.label}</span>
                      <IconChevronDown class="ml-auto size-4 shrink-0" />
                    </Accordion.Trigger>
                  </Accordion.Header>
                  <Accordion.Content>
                    <SidebarGroupContent><NavLinks items={group.items} /></SidebarGroupContent>
                  </Accordion.Content>
                </SidebarGroup>
              </Accordion.Item>
            )}</For>
          </Accordion.Root>
        }>
          <SidebarGroup class="p-0">
            <SidebarGroupContent>
              <For each={currentNavGroups()}>{(group) => <NavLinks items={group.items} />}</For>
            </SidebarGroupContent>
          </SidebarGroup>
        </Show>
      </SidebarContent>

      <SyncStatusFooter />
      <SidebarRail />
    </Sidebar>
  );
};
