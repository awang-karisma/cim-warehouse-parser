import { ROUTES, WORKSPACE_DESTINATIONS, canAccessRoute, type WorkspaceRoute } from './routes';

import { ColorModeProvider, ColorModeScript, createLocalStorageManager } from '@kobalte/core';
import { Navigate, Route, Router } from '@solidjs/router';
import { Show, lazy, type Component } from 'solid-js';
import { render } from 'solid-js/web';
import './app.css';

import { App } from './App';
import { AuthProvider, useAuth } from './auth';
import { WorkspaceAccess } from './components/WorkspaceAccess';
import { I18nProvider } from './i18n';
import { Areas } from './pages/Areas';
import { Barcode } from './pages/Barcode';
import { CustomerAliases } from './pages/CustomerAliases';
import { Customers } from './pages/Customers';
import { Dashboard } from './pages/Dashboard';
import { DeliveryFlow } from './pages/DeliveryFlow';
import { Items } from './pages/Items';
import { OrderDetail } from './pages/OrderDetail';
import { Orders } from './pages/Orders';
import { Privacy } from './pages/Privacy';
import { PurchaseOrders } from './pages/PurchaseOrders';
import { Search } from './pages/Search';
import { Settings } from './pages/Settings';
import { RoleManagement } from './pages/RoleManagement';
import { SyncManager } from './pages/SyncManager';
import { Terms } from './pages/Terms';
import { UserManagement } from './pages/UserManagement';
const Datalogger = lazy(() => import('./pages/datalogger'));
const DataloggerRecords = lazy(() => import('./pages/DataloggerRecords'));
const storageManager = createLocalStorageManager('warehouse-ui-theme');

function guardedPage(route: WorkspaceRoute, Page: Component): Component {
  return () => {
    const auth = useAuth();
    return (
      <Show when={canAccessRoute(auth, route) && auth.accessKey()} keyed fallback={<WorkspaceAccess kind="denied" />}>
        {(_key) => <Page />}
      </Show>
    );
  };
}

const DashboardPage = guardedPage(ROUTES.dashboard, Dashboard);
const Home: Component = () => {
  const auth = useAuth();
  const first = () => WORKSPACE_DESTINATIONS.find((route) => canAccessRoute(auth, route));
  return (
    <Show when={first()} keyed fallback={<WorkspaceAccess kind="unprovisioned" />}>
      {(route) => route === ROUTES.dashboard ? <DashboardPage /> : <Navigate href={route} />}
    </Show>
  );
};

const root = document.getElementById('root');
if (root) {
  render(
    () => (
      <>
        <ColorModeScript storageType={storageManager.type} storageKey="warehouse-ui-theme" />
        <ColorModeProvider storageManager={storageManager}>
          <AuthProvider>
            <I18nProvider>
              <Router root={App}>
                <Route path={ROUTES.root} component={Home} />
                <Route path={ROUTES.dashboard} component={DashboardPage} />
                <Route path={ROUTES.orders} component={guardedPage(ROUTES.orders, Orders)} />
                <Route path={ROUTES.orderDetailPattern} component={guardedPage(ROUTES.orderDetailPattern, OrderDetail)} />
                <Route path={ROUTES.items} component={guardedPage(ROUTES.items, Items)} />
                <Route path={ROUTES.customers} component={guardedPage(ROUTES.customers, Customers)} />
                <Route path={ROUTES.customerAliases} component={guardedPage(ROUTES.customerAliases, CustomerAliases)} />
                <Route path={ROUTES.areas} component={guardedPage(ROUTES.areas, Areas)} />
                <Route path={ROUTES.deliveryFlow} component={guardedPage(ROUTES.deliveryFlow, DeliveryFlow)} />
                <Route path={ROUTES.purchaseOrders} component={guardedPage(ROUTES.purchaseOrders, PurchaseOrders)} />
                <Route path={ROUTES.barcode} component={guardedPage(ROUTES.barcode, Barcode)} />
                <Route path={ROUTES.sync} component={guardedPage(ROUTES.sync, SyncManager)} />
                <Route path={ROUTES.search} component={guardedPage(ROUTES.search, Search)} />
                <Route path={ROUTES.settings} component={guardedPage(ROUTES.settings, Settings)} />
                <Route path={ROUTES.users} component={guardedPage(ROUTES.users, UserManagement)} />
                <Route path={ROUTES.roles} component={guardedPage(ROUTES.roles, RoleManagement)} />
                <Route path={ROUTES.privacy} component={Privacy} />
                <Route path={ROUTES.terms} component={Terms} />
                <Route path={ROUTES.datalogger} component={guardedPage(ROUTES.datalogger, Datalogger)} />
                <Route path={ROUTES.dataloggerRecordsPattern} component={guardedPage(ROUTES.dataloggerRecordsPattern, DataloggerRecords)} />
              </Router>
            </I18nProvider>
          </AuthProvider>
        </ColorModeProvider>
      </>
    ),
    root
  );
}
