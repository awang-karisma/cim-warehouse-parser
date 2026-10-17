import { render } from 'solid-js/web';
import { Router, Route } from '@solidjs/router';
import './app.css';

import { App } from './App';
import { Dashboard } from './pages/Dashboard';
import { Orders } from './pages/Orders';
import { OrderDetail } from './pages/OrderDetail';
import { Items } from './pages/Items';
import { Customers } from './pages/Customers';
import { Areas } from './pages/Areas';
import { Timeline } from './pages/Timeline';
import { SyncManager } from './pages/SyncManager';
import { Search } from './pages/Search';
import { Settings } from './pages/Settings';

const root = document.getElementById('root');
if (root) {
  render(
    () => (
      <Router root={App}>
        <Route path="/" component={Dashboard} />
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/orders" component={Orders} />
        <Route path="/orders/:id" component={OrderDetail} />
        <Route path="/items" component={Items} />
        <Route path="/customers" component={Customers} />
        <Route path="/areas" component={Areas} />
        <Route path="/timeline" component={Timeline} />
        <Route path="/sync" component={SyncManager} />
        <Route path="/search" component={Search} />
        <Route path="/settings" component={Settings} />
      </Router>
    ),
    root
  );
}
