import { type Component } from 'solid-js';
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
} from '@tabler/icons-solidjs';

interface NavItem {
  href: string;
  label: string;
  icon: Component<{ size?: number; stroke?: number; class?: string; 'aria-hidden'?: string }>;
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

export const Sidebar: Component = () => {
  const location = useLocation();

  const isActive = (item: NavItem) => {
    if (item.exact) {
      return location.pathname === '/' || location.pathname === '/dashboard';
    }
    return location.pathname.startsWith(item.href);
  };

  return (
    <aside class="w-60 bg-sidebar text-sidebar-text flex flex-col fixed top-0 bottom-0 left-0 z-50">
      <div class="px-5 py-6 text-lg font-bold text-white flex items-center gap-2.5 border-b border-white/10">
        <IconPackage size={22} stroke={1.8} aria-hidden="true" class="text-white" />
        <span>Warehouse Parser</span>
      </div>
      <ul class="list-none p-3 flex-1 overflow-y-auto space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = () => isActive(item);
          return (
            <li>
              <A
                href={item.href}
                class={`flex items-center gap-3 px-3.5 py-2.5 rounded-md text-sm font-medium transition-colors ${
                  active()
                    ? 'bg-sidebar-active text-white font-semibold border-l-3 border-primary'
                    : 'text-sidebar-text hover:bg-white/5 hover:text-white'
                }`}
              >
                <span class="w-5 flex items-center justify-center">
                  <Icon size={20} stroke={1.8} aria-hidden="true" />
                </span>
                <span>{item.label}</span>
              </A>
            </li>
          );
        })}
      </ul>
    </aside>
  );
};
