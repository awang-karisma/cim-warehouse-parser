import { type Component } from 'solid-js';
import { A, useLocation } from '@solidjs/router';

const navItems = [
  { href: '/', label: 'Dashboard', icon: '📊', exact: true },
  { href: '/orders', label: 'Orders', icon: '📋' },
  { href: '/items', label: 'Items', icon: '📦' },
  { href: '/customers', label: 'Customer View', icon: '👥' },
  { href: '/areas', label: 'Area Map', icon: '📍' },
  { href: '/timeline', label: 'Delivery Timeline', icon: '⏱️' },
  { href: '/sync', label: 'Sync Manager', icon: '🔄' },
  { href: '/search', label: 'Search', icon: '🔎' },
  { href: '/settings', label: 'Settings', icon: '⚙️' },
];

export const Sidebar: Component = () => {
  const location = useLocation();

  const isActive = (item: typeof navItems[0]) => {
    if (item.exact) {
      return location.pathname === '/' || location.pathname === '/dashboard';
    }
    return location.pathname.startsWith(item.href);
  };

  return (
    <aside class="sidebar">
      <div class="brand">
        <span>📦</span> Warehouse Parser
      </div>
      <ul class="nav-list">
        {navItems.map((item) => (
          <li class="nav-item">
            <A
              href={item.href}
              class={`nav-link ${isActive(item) ? 'active' : ''}`}
            >
              <span class="nav-icon">{item.icon}</span> {item.label}
            </A>
          </li>
        ))}
      </ul>
    </aside>
  );
};
