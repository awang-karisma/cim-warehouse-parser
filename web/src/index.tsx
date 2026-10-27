import { ColorModeProvider, ColorModeScript, createLocalStorageManager } from '@kobalte/core';
import { Route, Router } from '@solidjs/router';
import { render } from 'solid-js/web';
import './app.css';

import { App } from './App';
import { AuthProvider } from './auth';
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
            <Router root={App}>
              <Route path="/" component={Dashboard} />
              <Route path="/dashboard" component={Dashboard} />
              <Route path="/orders" component={Orders} />
              <Route path="/orders/:id" component={OrderDetail} />
              <Route path="/items" component={Items} />
              <Route path="/customers" component={Customers} />
              <Route path="/customer-aliases" component={CustomerAliases} />
              <Route path="/areas" component={Areas} />
              <Route path="/delivery-flow" component={DeliveryFlow} />
              <Route path="/timeline" component={Timeline} />
              <Route path="/barcode" component={Barcode} />
              <Route path="/sync" component={SyncManager} />
              <Route path="/search" component={Search} />
              <Route path="/settings" component={Settings} />
              <Route path="/admin/users" component={UserManagement} />
              <Route path="/privacy" component={Privacy} />
              <Route path="/terms" component={Terms} />
            </Router>
          </AuthProvider>
        </ColorModeProvider>
      </>
    ),
    root
  );
}
