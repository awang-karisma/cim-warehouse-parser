import { type Component, createMemo } from 'solid-js';
import { type RouteSectionProps, useLocation } from '@solidjs/router';

import { SidebarProvider, SidebarInset, SidebarTrigger } from '~/components/ui/sidebar';
import { AppSidebar } from '~/components/app-sidebar';
import { Separator } from '~/components/ui/separator';
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
} from '~/components/ui/breadcrumb';
import { ModeToggle } from '~/components/mode-toggle';

export const App: Component<RouteSectionProps> = (props) => {
  const location = useLocation();

  const routeTitle = createMemo(() => {
    const path = location.pathname;
    if (path === '/' || path === '/dashboard') return 'Dashboard';
    if (path.startsWith('/orders/')) return 'Order Details';
    if (path.startsWith('/orders')) return 'Orders';
    if (path.startsWith('/items')) return 'Items';
    if (path.startsWith('/customers')) return 'Customer View';
    if (path.startsWith('/areas')) return 'Area Map';
    if (path.startsWith('/timeline')) return 'Delivery Timeline';
    if (path.startsWith('/sync')) return 'Sync Manager';
    if (path.startsWith('/search')) return 'Search';
    if (path.startsWith('/settings')) return 'Settings';
    return 'Console';
  });

  return (
    <SidebarProvider style={{ '--sidebar-width': '16rem' } as any}>
      <AppSidebar />
      <SidebarInset>
        <header class="flex h-16 shrink-0 items-center justify-between gap-2 border-b px-4 bg-background">
          <div class="flex items-center gap-2">
            <SidebarTrigger class="-ml-1" />
            <Separator orientation="vertical" class="mr-2 h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink href="/">Warehouse</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <span class="font-medium text-foreground">{routeTitle()}</span>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
          <div class="flex items-center gap-2">
            <ModeToggle />
          </div>
        </header>
        <main class="flex flex-1 flex-col gap-4 p-4 md:p-6 min-w-0 bg-background">{props.children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
};
