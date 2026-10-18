import { type Component, For } from 'solid-js';
import { A, useLocation } from '@solidjs/router';
import {
  IconLayoutDashboard,
  IconClipboardList,
  IconPackage,
  IconUsers,
  IconMapPin,
  IconTimeline,
  IconRefresh,
  IconSearch,
  IconSettings,
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
} from '~/components/ui/sidebar';

interface NavItem {
  href: string;
  label: string;
  icon: Component<IconProps>;
  exact?: boolean;
}

const navItems: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: IconLayoutDashboard, exact: true },
  { href: '/orders', label: 'Orders', icon: IconClipboardList },
  { href: '/items', label: 'Items', icon: IconPackage },
  { href: '/customers', label: 'Customer View', icon: IconUsers },
  { href: '/areas', label: 'Area Map', icon: IconMapPin },
  { href: '/timeline', label: 'Delivery Timeline', icon: IconTimeline },
  { href: '/sync', label: 'Sync Manager', icon: IconRefresh },
  { href: '/search', label: 'Search', icon: IconSearch },
  { href: '/settings', label: 'Settings', icon: IconSettings },
];

export const AppSidebar: Component = () => {
  const location = useLocation();

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
                <span class="truncate text-xs text-muted-foreground">Admin Console</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <For each={navItems}>
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

      <SidebarFooter class="p-3 text-xs text-muted-foreground">
        <div class="flex items-center gap-2 px-2 py-1">
          <span class="size-2 rounded-full bg-emerald-500 animate-pulse" />
          <span class="truncate">System Connected</span>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
};
