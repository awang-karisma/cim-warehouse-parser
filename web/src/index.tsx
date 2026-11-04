import { ROUTES } from './routes';

import { ColorModeProvider, ColorModeScript, createLocalStorageManager } from '@kobalte/core';
import { Route, Router } from '@solidjs/router';
import { render } from 'solid-js/web';
import './app.css';

import { App } from './App';
import { AuthProvider } from './auth';
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
import { Search } from './pages/Search';
import { Settings } from './pages/Settings';
import { SyncManager } from './pages/SyncManager';
import { Terms } from './pages/Terms';
import { Timeline } from './pages/Timeline';
import { UserManagement } from './pages/UserManagement';
const storageManager = createLocalStorageManager('warehouse-ui-theme');

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
				<Route path={ROUTES.root} component={Dashboard} />
				<Route path={ROUTES.dashboard} component={Dashboard} />
				<Route path={ROUTES.orders} component={Orders} />
				<Route path={ROUTES.orderDetailPattern} component={OrderDetail} />
				<Route path={ROUTES.items} component={Items} />
				<Route path={ROUTES.customers} component={Customers} />
				<Route path={ROUTES.customerAliases} component={CustomerAliases} />
				<Route path={ROUTES.areas} component={Areas} />
				<Route path={ROUTES.deliveryFlow} component={DeliveryFlow} />
				<Route path={ROUTES.timeline} component={Timeline} />
				<Route path={ROUTES.barcode} component={Barcode} />
				<Route path={ROUTES.sync} component={SyncManager} />
				<Route path={ROUTES.search} component={Search} />
				<Route path={ROUTES.settings} component={Settings} />
				<Route path={ROUTES.users} component={UserManagement} />
				<Route path={ROUTES.privacy} component={Privacy} />
				<Route path={ROUTES.terms} component={Terms} />
              </Router>
            </I18nProvider>
          </AuthProvider>
        </ColorModeProvider>
      </>
    ),
    root
  );
}
