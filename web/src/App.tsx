import { type Component, createMemo, Show } from 'solid-js';
import { type RouteSectionProps, useLocation } from '@solidjs/router';

import { useAuth } from '~/auth';
import { Login } from '~/pages/Login';
import { PendingApproval } from '~/pages/PendingApproval';
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
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '~/components/ui/dropdown-menu';
import { Avatar, AvatarImage, AvatarFallback } from '~/components/ui/avatar';
import { IconLogout } from '@tabler/icons-solidjs';
import { PageTransition } from '~/components/PageTransition';
import { Spinner } from '~/components/Spinner';
export const App: Component<RouteSectionProps> = (props) => {
  const location = useLocation();

  const routeTitle = createMemo(() => {
    const path = location.pathname;
    if (path === '/' || path === '/dashboard') return 'Dashboard';
    if (path.startsWith('/orders/')) return 'Order Details';
    if (path.startsWith('/orders')) return 'Orders';
    if (path.startsWith('/items')) return 'Items';
    if (path.startsWith('/customers')) return 'Customer View';
    if (path.startsWith('/customer-aliases')) return 'Customer Aliases';
    if (path.startsWith('/areas')) return 'Area Map';
    if (path.startsWith('/delivery-flow')) return 'Delivery Flow';
    if (path.startsWith('/timeline')) return 'Delivery Timeline';
    if (path.startsWith('/barcode')) return 'Barcode Printer';
    if (path.startsWith('/sync')) return 'Sync Manager';
    if (path.startsWith('/search')) return 'Search';
    if (path.startsWith('/settings')) return 'Settings';
    if (path.startsWith('/admin/users')) return 'User Management';
    if (path.startsWith('/privacy')) return 'Privacy Policy';
    if (path.startsWith('/terms')) return 'Terms of Service';
    return 'Console';
  });

  const auth = useAuth();
  const currentUser = () => auth.user();

  return (
    <Show
      when={location.pathname !== '/privacy' && location.pathname !== '/terms'}
      fallback={<PageTransition>{props.children}</PageTransition>}
    >
    <Show
      when={!auth.loading() || currentUser() !== undefined}
      fallback={
        <div class="min-h-screen w-full flex items-center justify-center bg-background">
          <div class="flex flex-col items-center gap-3">
            <Spinner size="lg" />
            <span class="text-sm text-muted-foreground font-medium">Loading session...</span>
          </div>
        </div>
      }
    >
      <Show when={currentUser() !== null} fallback={<Login />}>
        <Show when={currentUser()?.role !== 'guest'} fallback={<PendingApproval />}>
          <SidebarProvider style={{ '--sidebar-width': '16rem' } as Record<string, string>}>
            <AppSidebar />
            <SidebarInset>
              <header class="flex h-16 shrink-0 items-center justify-between gap-2 border-b px-4 bg-background">
                <div class="flex items-center gap-2 min-w-0">
                  <SidebarTrigger class="-ml-1 shrink-0" />
                  <Separator orientation="vertical" class="mr-2 h-4 shrink-0" />
                  <Breadcrumb class="min-w-0">
                    <BreadcrumbList class="flex-nowrap">
                      <BreadcrumbItem class="hidden sm:inline-flex shrink-0">
                        <BreadcrumbLink href="/">Warehouse</BreadcrumbLink>
                      </BreadcrumbItem>
                      <BreadcrumbSeparator class="hidden sm:inline-flex shrink-0" />
                      <BreadcrumbItem class="min-w-0">
                        <span class="font-medium text-foreground truncate block">{routeTitle()}</span>
                      </BreadcrumbItem>
                    </BreadcrumbList>
                  </Breadcrumb>
                </div>
                <div class="flex items-center gap-3 shrink-0">
                  <ModeToggle />
                  <Show when={currentUser() && currentUser()?.email}>
                    <div class="flex items-center gap-2">
                      <div class="hidden sm:flex flex-col items-end text-right">
                        <span class="text-sm font-medium leading-tight truncate max-w-[140px]">
                          {currentUser()?.name || 'User'}
                        </span>
                        <span class="text-[10px] font-mono uppercase text-muted-foreground">
                          {currentUser()?.role}
                        </span>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger class="rounded-full ring-offset-background transition-opacity hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
                          <Avatar class="h-8 w-8 cursor-pointer border border-border">
                            <AvatarImage src={currentUser()?.picture} alt={currentUser()?.name} />
                            <AvatarFallback class="text-xs font-semibold bg-primary/10 text-primary">
                              {(currentUser()?.name || currentUser()?.email || 'U')
                                .charAt(0)
                                .toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent class="w-56 p-2">
                          <div class="flex flex-col space-y-1 p-2">
                            <p class="text-xs leading-none text-muted-foreground font-mono truncate">
                              {currentUser()?.email}
                            </p>
                          </div>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            class="cursor-pointer gap-2 text-destructive focus:text-destructive"
                            onSelect={() => auth.logout()}
                          >
                            <IconLogout class="h-4 w-4" />
                            <span>Sign Out</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </Show>
                </div>
              </header>
              <main class="flex flex-1 flex-col gap-4 p-4 md:p-6 min-w-0 bg-background">
                <PageTransition>{props.children}</PageTransition>
              </main>
            </SidebarInset>
          </SidebarProvider>
        </Show>
      </Show>
    </Show>
    </Show>
  );
};
