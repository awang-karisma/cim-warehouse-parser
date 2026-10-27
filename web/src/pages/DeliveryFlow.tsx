import {
  type Component,
  createSignal,
  createMemo,
  createResource,
  Show,
  For,
  batch,
} from 'solid-js';
import { useSearchParams } from '@solidjs/router';
import {
  getDeliveryCandidates,
  getDeliveryDrivers,
  createDeliveryDriver,
  updateDeliveryDriver,
  deleteDeliveryDriver,
  getDeliveryRuns,
  createDeliveryRun,
  updateDeliveryRun,
  updateDeliveryRunStatus,
  updateDeliveryRunDriver,
  toggleDeliveryRunItemPick,
  deleteDeliveryRun,
} from '~/api';
import type {
  Order,
  OrderItem,
  DeliveryDriver,
  DeliveryRun,
  DeliveryRunItem,
  DeliveryRunStatus,
} from '~/types';
import { Tabs, TabsList, TabsTrigger } from '~/components/ui/tabs';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '~/components/ui/sheet';
import { useIsMobile } from '~/components/ui/sidebar';
import { Badge } from '~/components/Badge';
import { TableSkeleton } from '~/components/TableSkeleton';
import { Spinner } from '~/components/Spinner';
import { getDominantOrderStatus } from '~/utils/orderStatus';
import { cn } from '~/lib/utils';
import { Button } from '~/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '~/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '~/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
} from '~/components/ui/alert-dialog';
import {
  IconTruckDelivery,
  IconCheck,
  IconPlus,
  IconMinus,
  IconPrinter,
  IconEdit,
  IconTrash,
  IconSearch,
  IconFilter,
  IconAlertTriangle,
  IconCalendar,
  IconUser,
  IconMapPin,
  IconListCheck,
  IconBuildingWarehouse,
  IconArrowRight,
  IconRefresh,
  IconX,
} from '@tabler/icons-solidjs';

function parseQty(val?: string): number {
  if (!val) return 0;
  const cleaned = val.replace(/[^0-9.-]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function getItemRemainingQty(item: { jumlah?: string; jumlah_terkirim?: string; belum_terkirim?: string }): number {
  if (item.belum_terkirim !== undefined && item.belum_terkirim !== null && item.belum_terkirim.trim() !== '') {
    const b = parseQty(item.belum_terkirim);
    if (b > 0) return b;
  }
  const j = parseQty(item.jumlah);
  const jt = parseQty(item.jumlah_terkirim);
  const diff = j - jt;
  if (diff > 0) return diff;
  return j > 0 ? j : 0;
}

function makeItemKey(order: Order, item: OrderItem): string {
  const doc = (order.order_number || order.id || '').trim();
  const cust = (order.customer || '').trim().toLowerCase();
  const name = (item.nama_barang || '').trim().toLowerCase();
  if (item.row_index && item.row_index > 0) {
    return `${doc}:${item.row_index}:${cust}:${name}`;
  }
  return `${doc}:${cust}:${name}`;
}

const getTodayStr = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

interface DraftItemSelection {
  order: Order;
  item: OrderItem;
  planned_qty: string;
  note: string;
}

interface AreaGroupSummary {
  area: string;
  orders: Order[];
  readyOrdersCount: number;
  readyItemsCount: number;
  totalItemsCount: number;
  pendingItemsCount: number;
  selectedItemsCount: number;
}

export const DeliveryFlow: Component = () => {
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = createSignal(false);
  const [runsDrawerOpen, setRunsDrawerOpen] = createSignal(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = () => (searchParams.tab === 'runs' ? 'runs' : 'plan');

  // Backend resources
  const [candidatesData, { refetch: refetchCandidates }] = createResource(getDeliveryCandidates);
  const [driversData, { refetch: refetchDrivers }] = createResource(getDeliveryDrivers);
  const [runsData, { refetch: refetchRuns }] = createResource(() => getDeliveryRuns());

  // Filters & toolbar state
  const [searchTerm, setSearchTerm] = createSignal('');
  const [readyInWarehouseOnly, setReadyInWarehouseOnly] = createSignal(true);
  const [includeClientHold, setIncludeClientHold] = createSignal(true);
  const [selectedAreaFilter, setSelectedAreaFilter] = createSignal<string | null>(null);

  // Draft Delivery Run state (Planner)
  const [selectedDriverId, setSelectedDriverId] = createSignal<number | null>(null);
  const [driverName, setDriverName] = createSignal('');
  const [deliveryDate, setDeliveryDate] = createSignal(getTodayStr());
  const [runTitle, setRunTitle] = createSignal('');
  const [runNotes, setRunNotes] = createSignal('');
  const [draftItems, setDraftItems] = createSignal<Map<string, DraftItemSelection>>(new Map());
  const [editingRunId, setEditingRunId] = createSignal<number | null>(null);
  const [isSavingRun, setIsSavingRun] = createSignal(false);
  const [plannerError, setPlannerError] = createSignal('');

  // Runs Workspace state (Tab 2)
  const [selectedRunId, setSelectedRunId] = createSignal<number | null>(null);
  const [runSearchQuery, setRunSearchQuery] = createSignal('');
  const [runStatusFilter, setRunStatusFilter] = createSignal<string>('ALL');
  const [runDateFilter, setRunDateFilter] = createSignal<string>('');
  const [pickingViewMode, setPickingViewMode] = createSignal<'orders' | 'consolidated'>('orders');
  const [runToDelete, setRunToDelete] = createSignal<DeliveryRun | null>(null);
  const [isDeletingRun, setIsDeletingRun] = createSignal(false);
  const [isReassigningDriver, setIsReassigningDriver] = createSignal(false);

  // Driver Management modal
  const [showDriverModal, setShowDriverModal] = createSignal(false);
  const [newDriverName, setNewDriverName] = createSignal('');
  const [newDriverPhone, setNewDriverPhone] = createSignal('');
  const [newDriverVehicle, setNewDriverVehicle] = createSignal('');
  const [driverModalError, setDriverModalError] = createSignal('');
  const [isAddingDriver, setIsAddingDriver] = createSignal(false);
  const [driverToEdit, setDriverToEdit] = createSignal<DeliveryDriver | null>(null);

  // Active Run item map for informational badges
  const activeRunItemKeys = createMemo(() => {
    const map = new Map<string, { runId: number; driverName: string; plannedQty: string; status: string }>();
    const runs = runsData()?.runs || [];
    for (const r of runs) {
      if (['PLANNED', 'PICKING', 'READY'].includes(r.status || '')) {
        for (const it of r.items || []) {
          if (it.source_key) {
            map.set(it.source_key, {
              runId: r.id || 0,
              driverName: r.driver_name,
              plannedQty: it.planned_qty,
              status: r.status || '',
            });
          }
        }
      }
    }
    return map;
  });

  // Candidate Orders filtering
  const candidateOrders = createMemo(() => candidatesData()?.orders || []);

  const isItemEligible = (item: OrderItem) => {
    const sOrder = (item.status_order || '').trim().toUpperCase();
    if (['SELESAI', 'COMPLETED', 'BATAL', 'CANCEL'].includes(sOrder)) return false;

    const remaining = getItemRemainingQty(item);
    if (remaining <= 0) return false;

    if (readyInWarehouseOnly()) {
      const sBarang = (item.status_barang || '').trim().toUpperCase();
      if (sBarang !== 'STOK GUDANG') return false;
    }

    if (!includeClientHold() && sOrder === 'PENDING') {
      return false;
    }

    const term = searchTerm().trim().toLowerCase();
    if (term) {
      const matchName = (item.nama_barang || '').toLowerCase().includes(term);
      const matchOrder = (item.order_number || '').toLowerCase().includes(term);
      const matchCatatan = (item.catatan || '').toLowerCase().includes(term);
      const matchKet = (item.keterangan || '').toLowerCase().includes(term);
      if (!matchName && !matchOrder && !matchCatatan && !matchKet) return false;
    }

    return true;
  };

  // Group candidate orders by Area
  const areaGroups = createMemo(() => {
    const groups = new Map<string, AreaGroupSummary>();

    for (const ord of candidateOrders()) {
      const area = ord.area?.trim() || 'Unassigned';
      if (!groups.has(area)) {
        groups.set(area, {
          area,
          orders: [],
          readyOrdersCount: 0,
          readyItemsCount: 0,
          totalItemsCount: 0,
          pendingItemsCount: 0,
          selectedItemsCount: 0,
        });
      }
      const grp = groups.get(area)!;
      grp.orders.push(ord);

      let orderHasReady = false;
      for (const it of ord.items || []) {
        const sOrder = (it.status_order || '').trim().toUpperCase();
        if (['SELESAI', 'COMPLETED', 'BATAL', 'CANCEL'].includes(sOrder)) continue;
        const rem = getItemRemainingQty(it);
        if (rem <= 0) continue;

        grp.totalItemsCount++;
        if ((it.status_barang || '').trim().toUpperCase() === 'STOK GUDANG') {
          grp.readyItemsCount++;
          orderHasReady = true;
        }
        if (sOrder === 'PENDING') {
          grp.pendingItemsCount++;
        }

        const key = makeItemKey(ord, it);
        if (draftItems().has(key)) {
          grp.selectedItemsCount++;
        }
      }
      if (orderHasReady) grp.readyOrdersCount++;
    }

    return Array.from(groups.values()).sort((a, b) => {
      if (a.area === 'Unassigned') return 1;
      if (b.area === 'Unassigned') return -1;
      return a.area.localeCompare(b.area);
    });
  });

  // Filtered orders list for main stage
  const visibleOrders = createMemo(() => {
    const area = selectedAreaFilter();
    let orders = candidateOrders();
    if (area) {
      orders = orders.filter((o) => (o.area?.trim() || 'Unassigned') === area);
    }
    const term = searchTerm().trim().toLowerCase();
    if (term) {
      orders = orders.filter((o) => {
        const matchCust = (o.customer || '').toLowerCase().includes(term);
        const matchArea = (o.area || '').toLowerCase().includes(term);
        const matchID = (o.order_number || o.id || '').toLowerCase().includes(term);
        const matchItems = (o.items || []).some((it) => isItemEligible(it));
        return matchCust || matchArea || matchID || matchItems;
      });
    }
    return orders.filter((o) => (o.items || []).some((it) => isItemEligible(it)));
  });

  // Toggle item selection in draft
  const toggleItemSelection = (order: Order, item: OrderItem) => {
    const key = makeItemKey(order, item);
    const next = new Map(draftItems());
    if (next.has(key)) {
      next.delete(key);
    } else {
      const remaining = getItemRemainingQty(item);
      next.set(key, {
        order,
        item,
        planned_qty: remaining > 0 ? remaining.toString() : '1',
        note: '',
      });
    }
    setDraftItems(next);
  };

  const updateItemPlannedQty = (order: Order, item: OrderItem, delta: number) => {
    const key = makeItemKey(order, item);
    const next = new Map(draftItems());
    const existing = next.get(key);
    if (!existing) return;

    const cur = parseQty(existing.planned_qty);
    const updated = Math.max(1, cur + delta);
    next.set(key, {
      ...existing,
      planned_qty: updated.toString(),
    });
    setDraftItems(next);
  };

  const setItemPlannedQtyDirect = (order: Order, item: OrderItem, qtyStr: string) => {
    const key = makeItemKey(order, item);
    const next = new Map(draftItems());
    const existing = next.get(key);
    if (!existing) return;

    next.set(key, {
      ...existing,
      planned_qty: qtyStr,
    });
    setDraftItems(next);
  };

  const setItemNote = (order: Order, item: OrderItem, note: string) => {
    const key = makeItemKey(order, item);
    const next = new Map(draftItems());
    const existing = next.get(key);
    if (!existing) return;

    next.set(key, {
      ...existing,
      note,
    });
    setDraftItems(next);
  };

  // Order-level select toggle
  const toggleOrderSelection = (order: Order) => {
    const eligible = (order.items || []).filter((it) => isItemEligible(it));
    const next = new Map(draftItems());
    const allSelected = eligible.every((it) => next.has(makeItemKey(order, it)));

    if (allSelected) {
      for (const it of eligible) {
        next.delete(makeItemKey(order, it));
      }
    } else {
      for (const it of eligible) {
        const k = makeItemKey(order, it);
        if (!next.has(k)) {
          const rem = getItemRemainingQty(it);
          next.set(k, {
            order,
            item: it,
            planned_qty: rem > 0 ? rem.toString() : '1',
            note: '',
          });
        }
      }
    }
    setDraftItems(next);
  };

  // Quick select Ready in Order
  const selectReadyInOrder = (order: Order) => {
    const readyItems = (order.items || []).filter(
      (it) => isItemEligible(it) && (it.status_barang || '').trim().toUpperCase() === 'STOK GUDANG'
    );
    const next = new Map(draftItems());
    for (const it of readyItems) {
      const k = makeItemKey(order, it);
      if (!next.has(k)) {
        const rem = getItemRemainingQty(it);
        next.set(k, {
          order,
          item: it,
          planned_qty: rem > 0 ? rem.toString() : '1',
          note: '',
        });
      }
    }
    setDraftItems(next);
  };

  // Quick select Ready in Area
  const selectReadyInArea = (area: string) => {
    const targetOrders = candidateOrders().filter((o) => (o.area?.trim() || 'Unassigned') === area);
    const next = new Map(draftItems());
    for (const ord of targetOrders) {
      const readyItems = (ord.items || []).filter(
        (it) => isItemEligible(it) && (it.status_barang || '').trim().toUpperCase() === 'STOK GUDANG'
      );
      for (const it of readyItems) {
        const k = makeItemKey(ord, it);
        if (!next.has(k)) {
          const rem = getItemRemainingQty(it);
          next.set(k, {
            order: ord,
            item: it,
            planned_qty: rem > 0 ? rem.toString() : '1',
            note: '',
          });
        }
      }
    }
    setDraftItems(next);
  };

  // Compute draft statistics
  const draftStats = createMemo(() => {
    const items = Array.from(draftItems().values());
    const orderSet = new Set<string>();
    const areaSet = new Set<string>();
    for (const d of items) {
      orderSet.add(d.order.id);
      if (d.order.area) areaSet.add(d.order.area);
    }
    return {
      totalItems: items.length,
      totalOrders: orderSet.size,
      areas: Array.from(areaSet),
    };
  });

  // Handle Driver assignment
  const handleDriverSelect = (driverIdStr: string) => {
    if (!driverIdStr) {
      setSelectedDriverId(null);
      setDriverName('');
      return;
    }
    const id = parseInt(driverIdStr, 10);
    const drivers = driversData()?.drivers || [];
    const found = drivers.find((d) => d.id === id);
    if (found) {
      setSelectedDriverId(found.id || null);
      setDriverName(found.name);
    }
  };

  // Save or Update Delivery Run
  const handleSaveRun = async () => {
    setPlannerError('');
    const dName = driverName().trim() || 'Unassigned';
    const dDate = deliveryDate().trim();
    if (!dDate) {
      setPlannerError('Please enter a delivery date.');
      return;
    }
    const selected = Array.from(draftItems().values());
    if (selected.length === 0) {
      setPlannerError('Please select at least one item to dispatch.');
      return;
    }

    setIsSavingRun(true);
    try {
      const runItems: DeliveryRunItem[] = selected.map((s) => ({
        source_key: makeItemKey(s.order, s.item),
        row_index: s.item.row_index || 0,
        order_id: s.order.id,
        order_number: s.order.order_number || '',
        ecatalog_number: s.order.ecatalog_number || '',
        tanggal: typeof s.order.tanggal === 'string' ? s.order.tanggal : '',
        customer: s.order.customer || '',
        area: s.order.area || '',
        nama_barang: s.item.nama_barang,
        satuan: s.item.satuan || '',
        jumlah: s.item.jumlah || '',
        belum_terkirim: s.item.belum_terkirim || '',
        planned_qty: s.planned_qty,
        status_order: s.item.status_order || '',
        status_barang: s.item.status_barang || '',
        keterangan: s.item.keterangan || '',
        catatan: s.item.catatan || '',
        note: s.note,
        picked: false,
      }));

      const payload: DeliveryRun = {
        title: runTitle().trim(),
        driver_id: selectedDriverId() || 0,
        driver_name: dName,
        areas: draftStats().areas,
        delivery_date: dDate,
        status: 'PLANNED',
        notes: runNotes().trim(),
        items: runItems,
      };

      let savedRun: DeliveryRun;
      if (editingRunId()) {
        const res = await updateDeliveryRun(editingRunId()!, payload);
        savedRun = res.run;
      } else {
        const res = await createDeliveryRun(payload);
        savedRun = res.run;
      }

      batch(() => {
        setDraftItems(new Map());
        setEditingRunId(null);
        setRunTitle('');
        setRunNotes('');
        setSelectedRunId(savedRun.id || null);
        setSearchParams({ tab: 'runs' });
      });

      refetchRuns();
      refetchCandidates();
    } catch (err: unknown) {
      setPlannerError(err instanceof Error ? err.message : 'Failed to save delivery run');
    } finally {
      setIsSavingRun(false);
    }
  };

  // Load an existing run into planner to edit
  const handleEditInPlanner = (run: DeliveryRun) => {
    batch(() => {
      setEditingRunId(run.id || null);
      setDriverName(run.driver_name === 'Unassigned' ? '' : run.driver_name);
      setSelectedDriverId(run.driver_id || null);
      setDeliveryDate(run.delivery_date);
      setRunTitle(run.title || '');
      setRunNotes(run.notes || '');

      const nextDraft = new Map<string, DraftItemSelection>();
      for (const it of run.items || []) {
        const mockOrder: Order = {
          id: it.order_id || '',
          order_number: it.order_number,
          ecatalog_number: it.ecatalog_number,
          customer: it.customer || '',
          area: it.area || '',
          tanggal: it.tanggal || '',
          items: [],
        };
        const mockItem: OrderItem = {
          row_index: it.row_index || 0,
          order_number: it.order_number,
          ecatalog_number: it.ecatalog_number,
          nama_barang: it.nama_barang,
          jumlah: it.jumlah || '',
          satuan: it.satuan || '',
          tanggal_pengiriman: '',
          lead_time_pengiriman: '',
          jumlah_terkirim: '',
          belum_terkirim: it.belum_terkirim || '',
          status_order: it.status_order || '',
          status_barang: it.status_barang || '',
          keterangan: it.keterangan || '',
          catatan: it.catatan || '',
        };
        const k = it.source_key || makeItemKey(mockOrder, mockItem);
        nextDraft.set(k, {
          order: mockOrder,
          item: mockItem,
          planned_qty: it.planned_qty,
          note: it.note || '',
        });
      }
      setDraftItems(nextDraft);
      setSearchParams({ tab: 'plan' });
    });
  };

  // Driver CRUD handlers
  const handleAddDriver = async (e: Event) => {
    e.preventDefault();
    setDriverModalError('');
    const name = newDriverName().trim();
    if (!name) {
      setDriverModalError('Driver name is required.');
      return;
    }
    setIsAddingDriver(true);
    try {
      if (driverToEdit() && driverToEdit()?.id) {
        await updateDeliveryDriver(driverToEdit()!.id!, {
          name,
          phone: newDriverPhone().trim(),
          vehicle: newDriverVehicle().trim(),
          active: true,
        });
      } else {
        await createDeliveryDriver({
          name,
          phone: newDriverPhone().trim(),
          vehicle: newDriverVehicle().trim(),
          active: true,
        });
      }
      setNewDriverName('');
      setNewDriverPhone('');
      setNewDriverVehicle('');
      setDriverToEdit(null);
      refetchDrivers();
    } catch (err: unknown) {
      setDriverModalError(err instanceof Error ? err.message : 'Failed to save driver');
    } finally {
      setIsAddingDriver(false);
    }
  };

  const handleDeleteDriverClick = async (id: number) => {
    try {
      await deleteDeliveryDriver(id);
      if (selectedDriverId() === id) {
        setSelectedDriverId(null);
        setDriverName('');
      }
      refetchDrivers();
    } catch (err: unknown) {
      setDriverModalError(err instanceof Error ? err.message : 'Failed to delete driver');
    }
  };

  // Sudden driver reassignment on active runs (Tab 2)
  const handleReassignDriver = async (runId: number, driverIdStr: string) => {
    setIsReassigningDriver(true);
    try {
      if (!driverIdStr) {
        await updateDeliveryRunDriver(runId, {
          driver_id: undefined,
          driver_name: 'Unassigned',
        });
      } else {
        const id = parseInt(driverIdStr, 10);
        const drivers = driversData()?.drivers || [];
        const found = drivers.find((d) => d.id === id);
        if (found) {
          await updateDeliveryRunDriver(runId, {
            driver_id: found.id,
            driver_name: found.name,
          });
        }
      }
      refetchRuns();
    } catch (err) {
      console.error('Failed to reassign driver:', err);
    } finally {
      setIsReassigningDriver(false);
    }
  };

  // Step 4: Runs & Picking Workspace
  const filteredRuns = createMemo(() => {
    let runs = runsData()?.runs || [];
    const q = runSearchQuery().trim().toLowerCase();
    if (q) {
      runs = runs.filter((r) =>
        r.driver_name.toLowerCase().includes(q) ||
        (r.title || '').toLowerCase().includes(q) ||
        (r.areas || []).some((a) => a.toLowerCase().includes(q))
      );
    }
    const status = runStatusFilter();
    if (status !== 'ALL') {
      runs = runs.filter((r) => (r.status || '').toUpperCase() === status);
    }
    const date = runDateFilter();
    if (date) {
      runs = runs.filter((r) => r.delivery_date === date);
    }
    return runs;
  });

  const activeRun = createMemo(() => {
    const runs = runsData()?.runs || [];
    if (selectedRunId()) {
      const found = runs.find((r) => r.id === selectedRunId());
      if (found) return found;
    }
    return runs[0] || null;
  });

  const handleTogglePick = async (runId: number, itemId: number, currentPicked: boolean) => {
    try {
      await toggleDeliveryRunItemPick(runId, itemId, !currentPicked);
      refetchRuns();
    } catch (err) {
      console.error('Failed to toggle pick:', err);
    }
  };

  const handleStatusChange = async (runId: number, newStatus: DeliveryRunStatus) => {
    try {
      await updateDeliveryRunStatus(runId, newStatus);
      refetchRuns();
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  const confirmDeleteRun = async () => {
    const run = runToDelete();
    if (!run || !run.id) return;
    setIsDeletingRun(true);
    try {
      await deleteDeliveryRun(run.id);
      setRunToDelete(null);
      if (selectedRunId() === run.id) {
        setSelectedRunId(null);
      }
      refetchRuns();
    } catch (err) {
      console.error('Failed to delete run:', err);
    } finally {
      setIsDeletingRun(false);
    }
  };

  // Grouped active run items for Picking View
  const runItemsByOrder = createMemo(() => {
    const run = activeRun();
    if (!run) return [];
    const groups = new Map<string, {
      orderId: string;
      orderNumber?: string;
      customer: string;
      area: string;
      items: DeliveryRunItem[];
    }>();

    for (const it of run.items || []) {
      const orderKey = it.order_id || 'UNKNOWN';
      if (!groups.has(orderKey)) {
        groups.set(orderKey, {
          orderId: it.order_id || '',
          orderNumber: it.order_number,
          customer: it.customer || 'Unknown Customer',
          area: it.area || '',
          items: [],
        });
      }
      groups.get(orderKey)!.items.push(it);
    }

    return Array.from(groups.values());
  });

  const consolidatedRunItems = createMemo(() => {
    const run = activeRun();
    if (!run) return [];
    const groups = new Map<string, {
      nama_barang: string;
      satuan: string;
      status_barang: string;
      totalPlannedQty: number;
      allPicked: boolean;
      somePicked: boolean;
      items: DeliveryRunItem[];
      destinations: { customer: string; orderId: string; plannedQty: string }[];
    }>();

    for (const it of run.items || []) {
      const key = `${it.nama_barang.trim().toLowerCase()}_${(it.satuan || '').trim().toLowerCase()}`;
      if (!groups.has(key)) {
        groups.set(key, {
          nama_barang: it.nama_barang,
          satuan: it.satuan || '',
          status_barang: it.status_barang || '',
          totalPlannedQty: 0,
          allPicked: true,
          somePicked: false,
          items: [],
          destinations: [],
        });
      }
      const grp = groups.get(key)!;
      grp.items.push(it);
      grp.totalPlannedQty += parseQty(it.planned_qty);
      grp.destinations.push({
        customer: it.customer || '',
        orderId: it.order_number || it.order_id || '',
        plannedQty: it.planned_qty,
      });
      if (it.picked) {
        grp.somePicked = true;
      } else {
        grp.allPicked = false;
      }
    }

    return Array.from(groups.values()).sort((a, b) => a.nama_barang.localeCompare(b.nama_barang));
  });

  const toggleConsolidatedProduct = async (runId: number, items: DeliveryRunItem[], allPicked: boolean) => {
    const targetPicked = !allPicked;
    try {
      await Promise.all(items.map((it) => it.id ? toggleDeliveryRunItemPick(runId, it.id, targetPicked) : Promise.resolve()));
      refetchRuns();
    } catch (err) {
      console.error('Failed to toggle consolidated pick:', err);
    }
  };
  const PlanSidebarContent = () => (
    <div class="space-y-4">
      {/* Card 1: Stock Readiness & Filters */}
      <Card class="border-primary/20 shadow-xs animate-[card-enter_400ms_ease-out_both]">
        <CardHeader class="p-3.5 pb-2">
          <CardTitle class="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 text-primary">
            <IconFilter class="size-3.5" />
            Stock Readiness & Filters
          </CardTitle>
        </CardHeader>
        <CardContent class="p-3.5 pt-0 space-y-3">
          <label class="flex items-center gap-2.5 text-xs font-semibold cursor-pointer select-none">
            <input
              type="checkbox"
              checked={readyInWarehouseOnly()}
              onChange={(e) => setReadyInWarehouseOnly(e.currentTarget.checked)}
              class="size-4 rounded text-primary focus:ring-ring"
            />
            <span>Ready in Warehouse only</span>
            <span class="text-[10px] font-bold px-1.5 py-0.2 rounded bg-primary/15 text-primary">
              STOK GUDANG
            </span>
          </label>

          <label class="flex items-center gap-2.5 text-xs font-semibold cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeClientHold()}
              onChange={(e) => setIncludeClientHold(e.currentTarget.checked)}
              class="size-4 rounded text-status-pending focus:ring-ring"
            />
            <span>Show Client Holds</span>
            <span class="text-[10px] font-bold px-1.5 py-0.2 rounded bg-status-pending/15 text-status-pending">
              PENDING
            </span>
          </label>
        </CardContent>
      </Card>

      {/* Card 2: Group by Area */}
      <Card class="animate-[card-enter_400ms_ease-out_both]" style={{ "animation-delay": "100ms" }}>
        <CardHeader class="p-3.5 pb-2 flex flex-row items-center justify-between">
          <CardTitle class="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 text-muted-foreground">
            <IconMapPin class="size-3.5" />
            Group by Area
          </CardTitle>
          <Show when={selectedAreaFilter()}>
            <button
              type="button"
              onClick={() => setSelectedAreaFilter(null)}
              class="text-[10px] text-primary font-semibold hover:underline"
            >
              Clear Filter
            </button>
          </Show>
        </CardHeader>
        <CardContent class="p-3.5 pt-0 space-y-2">
          <For each={areaGroups()}>
            {(grp) => {
              const isSelected = () => selectedAreaFilter() === grp.area;
              return (
                <div
                  class={cn(
                    'p-2 rounded-lg border text-xs flex flex-col justify-between transition-all',
                    isSelected()
                      ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                      : 'border-border bg-card hover:border-primary/50'
                  )}
                >
                  <div
                    class="flex items-center justify-between cursor-pointer"
                    onClick={() => setSelectedAreaFilter(isSelected() ? null : grp.area)}
                  >
                    <span class="font-bold text-foreground truncate">{grp.area}</span>
                    <span class="text-[11px] font-semibold text-muted-foreground">
                      <span class="text-foreground">{grp.readyItemsCount}</span>/{grp.totalItemsCount} items
                    </span>
                  </div>

                  <div class="flex items-center justify-between mt-1 text-[10px]">
                    <span class="text-muted-foreground">{grp.orders.length} orders</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        selectReadyInArea(grp.area);
                      }}
                      class="text-primary font-semibold hover:underline flex items-center gap-0.5"
                    >
                      <span>+ Select Ready</span>
                    </button>
                  </div>
                </div>
              );
            }}
          </For>
        </CardContent>
      </Card>

      {/* Card 3: Driver Assignment & Run Dispatch Action */}
      <Card class="border-border bg-card shadow-sm animate-[card-enter_400ms_ease-out_both]" style={{ "animation-delay": "200ms" }}>
        <CardHeader class="p-3.5 pb-2 flex flex-row items-center justify-between">
          <CardTitle class="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 text-muted-foreground">
            <IconTruckDelivery class="size-3.5" />
            Driver Assignment & Dispatch
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDriverModal(true)}
            class="text-[10px] h-6 px-2 border-border"
          >
            Roster
          </Button>
        </CardHeader>

        <CardContent class="p-3.5 pt-0 space-y-3">
          <div>
            <label class="block text-[11px] font-semibold text-muted-foreground mb-1">
              Assigned Driver (Optional)
            </label>
            <select
              class="w-full text-xs py-1.5 px-2 rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              value={selectedDriverId() ? selectedDriverId()!.toString() : ''}
              onChange={(e) => handleDriverSelect(e.currentTarget.value)}
            >
              <option value="">-- Unassigned (Assign Later) --</option>
              <For each={driversData()?.drivers?.filter((d) => d.active)}>
                {(d) => (
                  <option value={d.id?.toString()}>
                    {d.name} {d.vehicle ? `(${d.vehicle})` : ''}
                  </option>
                )}
              </For>
            </select>
            <Show when={!selectedDriverId() && driverName()}>
              <input
                type="text"
                placeholder="Custom driver name..."
                value={driverName()}
                onInput={(e) => setDriverName(e.currentTarget.value)}
                class="mt-1 w-full text-xs py-1 px-2 rounded-md border border-border bg-background text-foreground"
              />
            </Show>
          </div>

          <div>
            <label class="block text-[11px] font-semibold text-muted-foreground mb-1">
              Dispatch Date *
            </label>
            <input
              type="date"
              value={deliveryDate()}
              onInput={(e) => setDeliveryDate(e.currentTarget.value)}
              class="w-full text-xs py-1.5 px-2 rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div>
            <label class="block text-[11px] font-semibold text-muted-foreground mb-1">
              Run Title
            </label>
            <input
              type="text"
              placeholder="e.g. Mataram Pagi - Batch 1"
              value={runTitle()}
              onInput={(e) => setRunTitle(e.currentTarget.value)}
              class="w-full text-xs py-1.5 px-2 rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div class="p-2.5 rounded-lg bg-muted/30 border border-border space-y-1">
            <div class="flex items-center justify-between text-xs font-bold text-foreground">
              <span>Selected Items:</span>
              <span class="text-primary font-extrabold text-sm tabular-nums">
                {draftStats().totalItems} items
              </span>
            </div>
            <div class="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Orders Covered:</span>
              <span class="tabular-nums">{draftStats().totalOrders} orders</span>
            </div>
            <Show when={draftStats().areas.length > 0}>
              <div class="text-[10px] text-muted-foreground truncate pt-1 border-t border-border">
                Areas: {draftStats().areas.join(', ')}
              </div>
            </Show>
          </div>

          <div class="space-y-1.5">
            <Button
              size="sm"
              onClick={async () => {
                await handleSaveRun();
                setSidebarOpen(false);
              }}
              disabled={isSavingRun() || draftStats().totalItems === 0}
              class="w-full text-xs h-9 font-semibold gap-1.5"
            >
              <Show when={isSavingRun()} fallback={<IconArrowRight class="size-4" />}>
                <Spinner size="sm" />
              </Show>
              <span>{editingRunId() ? 'Update Run' : 'Dispatch / Save Run'}</span>
            </Button>

            <Show when={draftStats().totalItems > 0}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDraftItems(new Map())}
                class="w-full text-[11px] h-7 text-muted-foreground hover:text-foreground"
              >
                Clear Selection
              </Button>
            </Show>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const RunsListContent = (props: { onSelectRun?: () => void }) => (
    <div class="space-y-4">
      <Card class="animate-[card-enter_400ms_ease-out_both]">
        <CardHeader class="pb-3 flex flex-row items-center justify-between">
          <CardTitle class="text-base font-semibold flex items-center gap-2">
            <IconBuildingWarehouse class="size-4 text-primary" />
            Dispatch Runs
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetchRuns()}
            class="text-xs h-7 px-2"
          >
            <IconRefresh class="size-3" />
          </Button>
        </CardHeader>
        <CardContent class="space-y-3 pt-0">
          <input
            type="text"
            placeholder="Search driver, title, area..."
            value={runSearchQuery()}
            onInput={(e) => setRunSearchQuery(e.currentTarget.value)}
            class="w-full py-1 px-2.5 text-xs rounded-md border bg-background"
          />
          <div class="flex flex-wrap gap-1">
            <For each={['ALL', 'PLANNED', 'PICKING', 'READY', 'DISPATCHED', 'COMPLETED']}>
              {(st) => (
                <button
                  type="button"
                  onClick={() => setRunStatusFilter(st)}
                  class={cn(
                    'px-2 py-0.5 text-[10px] font-semibold rounded-full border transition-all',
                    runStatusFilter() === st
                      ? 'bg-foreground text-background border-foreground'
                      : 'bg-background text-muted-foreground border-border hover:bg-muted'
                  )}
                >
                  {st}
                </button>
              )}
            </For>
          </div>
        </CardContent>
      </Card>

      {/* Stack */}
      <div class="space-y-2.5">
        <For each={filteredRuns()}>
          {(run, index) => {
            const isSelected = () => activeRun()?.id === run.id;
            const total = () => run.total_items || 0;
            const picked = () => run.picked_items || 0;
            const pct = () => (total() > 0 ? Math.round((picked() / total()) * 100) : 0);

            return (
              <div
                onClick={() => {
                  setSelectedRunId(run.id || null);
                  props.onSelectRun?.();
                }}
                style={{ "animation-delay": `${index() * 40}ms` }}
                class={cn(
                  'p-3 rounded-lg border text-left cursor-pointer transition-all space-y-2 animate-[card-enter_400ms_ease-out_both]',
                  isSelected()
                    ? 'border-primary bg-primary/5 ring-1 ring-primary/20 shadow-sm'
                    : 'border-border bg-card hover:border-primary/50'
                )}
              >
                <div class="flex items-start justify-between gap-2">
                  <div>
                    <div class="text-xs font-bold text-foreground">
                      {run.title || `Run #${run.id}`}
                    </div>
                    <div class="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5 mt-0.5">
                      <IconUser class="size-3" />
                      <span>{run.driver_name || 'Unassigned'}</span>
                    </div>
                  </div>
                  <Badge status={run.status || 'PLANNED'} />
                </div>

                <div class="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{run.delivery_date}</span>
                  <span>{picked()} / {total()} picked ({pct()}%)</span>
                </div>
              </div>
            );
          }}
        </For>
      </div>
    </div>
  );

  return (
    <div class="space-y-4">
      {/* Tab Navigation */}
      <Tabs
        value={activeTab()}
        onChange={(val) => {
          setSearchParams({ tab: val });
          setSidebarOpen(false);
          setRunsDrawerOpen(false);
        }}
        class="w-full no-print"
      >
        <TabsList>
          <TabsTrigger value="plan" class="gap-2 text-xs">
            <IconListCheck class="size-4" />
            <span>Order Dispatch Planner</span>
            <Show when={draftStats().totalItems > 0}>
              <span class="inline-flex items-center justify-center size-5 text-[11px] font-bold rounded-full bg-primary text-primary-foreground">
                {draftStats().totalItems}
              </span>
            </Show>
          </TabsTrigger>
          <TabsTrigger value="runs" class="gap-2 text-xs">
            <IconBuildingWarehouse class="size-4" />
            <span>Warehouse Picking & Runs</span>
            <Show when={(runsData()?.runs?.length || 0) > 0}>
              <span class="inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-muted text-muted-foreground">
                {runsData()?.runs?.length}
              </span>
            </Show>
          </TabsTrigger>
        </TabsList>
      </Tabs>
        {/* TAB 1: PLAN DELIVERY (Orders Main Content + Floating Right Sidebar) */}
        <Show when={activeTab() === 'plan'}>
          <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* MAIN CONTENT: ORDERS LIST */}
            <div class={cn('space-y-4', isMobile() ? 'col-span-1' : 'lg:col-span-8')}>
              {/* Main Content Sub-Header Toolbar */}
              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg border bg-card">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-bold text-foreground">Candidate Orders</span>
                  <span class="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-semibold">
                    {visibleOrders().length} orders
                  </span>
                  <Show when={selectedAreaFilter()}>
                    <div class="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-primary/15 text-primary font-medium">
                      <span>Area: {selectedAreaFilter()}</span>
                      <button
                        type="button"
                        onClick={() => setSelectedAreaFilter(null)}
                        class="hover:text-foreground"
                        title="Clear area filter"
                      >
                        <IconX class="size-3" />
                      </button>
                    </div>
                  </Show>
                </div>

                <div class="flex items-center gap-2">
                  <div class="relative w-full sm:w-64">
                    <IconSearch class="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Search orders, customers, items..."
                      value={searchTerm()}
                      onInput={(e) => setSearchTerm(e.currentTarget.value)}
                      class="w-full pl-8 pr-2.5 py-1 text-xs rounded-md border bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      refetchCandidates();
                      refetchRuns();
                    }}
                    class="text-xs h-7 px-2 shrink-0"
                    title="Refresh orders"
                  >
                    <IconRefresh class="size-3" />
                  </Button>
                </div>
              </div>

              <Show when={plannerError()}>
                <div class="p-3 rounded-lg bg-destructive/15 border border-destructive/30 text-destructive text-xs flex items-center gap-2">
                  <IconAlertTriangle class="size-4 shrink-0" />
                  <span>{plannerError()}</span>
                </div>
              </Show>

              {/* Orders List */}
              <Show
                when={!candidatesData.loading}
                fallback={<TableSkeleton rows={5} columns={6} />}
              >
                <Show
                  when={visibleOrders().length > 0}
                  fallback={
                    <div class="p-16 text-center border rounded-lg bg-card">
                      <IconBuildingWarehouse class="size-12 mx-auto text-muted-foreground mb-3" />
                      <h3 class="text-sm font-semibold text-foreground">No orders matching current filters</h3>
                      <p class="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                        Adjust stock readiness or clear the selected area filter in the right sidebar.
                      </p>
                    </div>
                  }
                >
                  <div class="space-y-4">
                    <For each={visibleOrders()}>
                      {(order, index) => {
                        const eligibleItems = () => (order.items || []).filter((it) => isItemEligible(it));
                        const orderAllSelected = () =>
                          eligibleItems().length > 0 &&
                          eligibleItems().every((it) => draftItems().has(makeItemKey(order, it)));

                        return (
                          <div
                            class="border rounded-xl bg-card overflow-hidden shadow-xs hover:border-primary/50 transition-all animate-[card-enter_400ms_ease-out_both]"
                            style={{ "animation-delay": `${index() * 50}ms` }}
                          >
                            {/* Order Header */}
                            <div class="bg-muted/30 p-3 sm:px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b">
                              <div class="flex items-center gap-3">
                                <input
                                  type="checkbox"
                                  checked={orderAllSelected()}
                                  onChange={() => toggleOrderSelection(order)}
                                  class="size-4 rounded text-primary focus:ring-ring cursor-pointer"
                                  title="Select all eligible items in this order"
                                />
                                <div>
                                  <div class="flex items-center gap-2 flex-wrap">
                                    <span class="font-bold text-sm text-foreground">{order.customer}</span>
                                    <Show when={order.area}>
                                      <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                                        {order.area}
                                      </span>
                                    </Show>
                                    <Badge status={getDominantOrderStatus(order.items)} />
                                  </div>
                                  <div class="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                                    <span>Order: <strong>{order.order_number || order.id}</strong></span>
                                    <Show when={order.ecatalog_number}>
                                      <span>• E-Cat: {order.ecatalog_number}</span>
                                    </Show>
                                    <Show when={order.tanggal}>
                                      <span>• Date: {typeof order.tanggal === 'string' ? order.tanggal : ''}</span>
                                    </Show>
                                  </div>
                                </div>
                              </div>

                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => selectReadyInOrder(order)}
                                class="text-[11px] h-7 px-2.5 gap-1 self-end sm:self-auto"
                              >
                                <IconCheck class="size-3 text-primary" />
                                <span>Select Ready Items</span>
                              </Button>
                            </div>

                            {/* Order Items Table */}
                            <div class="overflow-x-auto">
                              <table class="w-full text-right text-xs border-collapse">
                                <thead>
                                  <tr class="border-b bg-muted/20 text-muted-foreground text-[11px]">
                                    <th class="py-2.5 px-3 w-px whitespace-nowrap text-right">Pick</th>
                                    <th class="py-2.5 px-3 w-full text-left">Item Name</th>
                                    <th class="py-2.5 px-3 w-px whitespace-nowrap text-right">Stock Status</th>
                                    <th class="py-2.5 px-3 w-px whitespace-nowrap text-right">Order Status</th>
                                    <th class="py-2.5 px-3 w-px whitespace-nowrap text-right">Remote Rem.</th>
                                    <th class="py-2.5 px-3 w-px whitespace-nowrap text-right">Qty to Deliver</th>
                                    <th class="py-2.5 px-3 w-px whitespace-nowrap text-right">Picking Note</th>
                                  </tr>
                                </thead>
                                <tbody class="divide-y divide-border">
                                  <For each={eligibleItems()}>
                                    {(item) => {
                                      const key = makeItemKey(order, item);
                                      const isSelected = () => draftItems().has(key);
                                      const draftItem = () => draftItems().get(key);
                                      const activeRunInfo = () => activeRunItemKeys().get(key);
                                      const remaining = getItemRemainingQty(item);
                                      const isClientPending = () => (item.status_order || '').trim().toUpperCase() === 'PENDING';

                                      return (
                                        <tr
                                          class={cn(
                                            'transition-colors',
                                            isSelected() ? 'bg-muted' : isClientPending() ? 'bg-status-pending/5 hover:bg-status-pending/10' : 'hover:bg-muted/50'
                                          )}
                                        >
                                          {/* Checkbox */}
                                          <td class="py-2.5 px-3 w-px whitespace-nowrap text-right">
                                            <input
                                              type="checkbox"
                                              checked={isSelected()}
                                              onChange={() => toggleItemSelection(order, item)}
                                              class="size-4 rounded text-primary focus:ring-ring cursor-pointer align-middle"
                                            />
                                          </td>

                                          {/* Item Name & Active Badges (Only growing column) */}
                                          <td class="py-2.5 px-3 w-full text-left">
                                            <div class="font-medium text-foreground">{item.nama_barang}</div>
                                            <div class="flex items-center gap-1.5 flex-wrap mt-1">
                                              <Show when={activeRunInfo()}>
                                                <span class="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-status-pending/15 text-status-pending border border-status-pending/30">
                                                  <IconTruckDelivery class="size-3" />
                                                  In Run #{activeRunInfo()!.runId} ({activeRunInfo()!.driverName}): {activeRunInfo()!.plannedQty}
                                                </span>
                                              </Show>
                                              <Show when={item.keterangan || item.catatan || isClientPending()}>
                                                <div class="inline-flex items-center gap-1 text-[11px] text-status-pending font-medium">
                                                  <IconAlertTriangle class="size-3 shrink-0" />
                                                  <span>{item.keterangan || item.catatan || 'Client delay request'}</span>
                                                </div>
                                              </Show>
                                            </div>
                                          </td>

                                          {/* Stock Status */}
                                          <td class="py-2.5 px-3 w-px whitespace-nowrap text-right">
                                            <Badge status={item.status_barang || '-'} kind="item" />
                                          </td>

                                          {/* Order Status */}
                                          <td class="py-2.5 px-3 w-px whitespace-nowrap text-right">
                                            <Badge status={item.status_order || '-'} />
                                          </td>

                                          {/* Remaining Qty */}
                                          <td class="py-2.5 px-3 w-px whitespace-nowrap text-right text-muted-foreground font-medium tabular-nums">
                                            <span class="font-bold text-foreground">{remaining}</span> / {item.jumlah || '0'} {item.satuan}
                                          </td>

                                          {/* Planned Qty Stepper */}
                                          <td class="py-2.5 px-3 w-px whitespace-nowrap text-right">
                                            <Show
                                              when={isSelected()}
                                              fallback={<span class="text-muted-foreground italic text-[11px]">Check to plan</span>}
                                            >
                                              <div class="inline-flex items-center justify-end gap-1">
                                                <button
                                                  type="button"
                                                  onClick={() => updateItemPlannedQty(order, item, -1)}
                                                  class="size-6 flex items-center justify-center rounded border bg-background hover:bg-muted text-muted-foreground"
                                                >
                                                  <IconMinus class="size-3" />
                                                </button>
                                                <input
                                                  type="number"
                                                  min="1"
                                                  max={remaining}
                                                  value={draftItem()?.planned_qty || '1'}
                                                  onInput={(e) => setItemPlannedQtyDirect(order, item, e.currentTarget.value)}
                                                  class="w-14 text-center py-0.5 text-xs font-semibold rounded border bg-background focus:outline-none focus:ring-1 focus:ring-ring tabular-nums"
                                                />
                                                <button
                                                  type="button"
                                                  onClick={() => updateItemPlannedQty(order, item, 1)}
                                                  class="size-6 flex items-center justify-center rounded border bg-background hover:bg-muted text-muted-foreground"
                                                >
                                                  <IconPlus class="size-3" />
                                                </button>
                                                <span class="text-[11px] text-muted-foreground ml-1">
                                                  {item.satuan || ''}
                                                </span>
                                              </div>
                                            </Show>
                                          </td>

                                          {/* Note */}
                                          <td class="py-2.5 px-3 w-px whitespace-nowrap text-right">
                                            <Show
                                              when={isSelected()}
                                              fallback={<span class="text-muted-foreground">-</span>}
                                            >
                                              <input
                                                type="text"
                                                placeholder="Picking note..."
                                                value={draftItem()?.note || ''}
                                                onInput={(e) => setItemNote(order, item, e.currentTarget.value)}
                                                class="w-36 text-right text-[11px] py-1 px-2 rounded border bg-background"
                                              />
                                            </Show>
                                          </td>
                                        </tr>
                                      );
                                    }}
                                  </For>
                                </tbody>
                              </table>
                            </div>
                          </div>
                        );
                      }}
                    </For>
                  </div>
                </Show>
              </Show>
            </div>

            {/* FLOATING RIGHT SIDEBAR: FILTERS, AREAS & DRIVER DISPATCH (Col 4) */}
            <Show when={!isMobile()}>
              <div class="lg:col-span-4 space-y-4 lg:sticky lg:top-4 max-h-[calc(100vh-2rem)] overflow-y-auto pr-1 scrollbar-thin">
                <PlanSidebarContent />
              </div>
            </Show>
          </div>
        </Show>

        {/* TAB 2: WAREHOUSE PICKING & RUNS (Full Detail & Checklist) */}
        <Show when={activeTab() === 'runs'}>
          <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left: Runs List */}
            <Show when={!isMobile() || !selectedRunId()}>
              <div class={cn('no-print space-y-4', isMobile() ? 'col-span-1' : 'lg:col-span-4')}>
                <RunsListContent onSelectRun={() => setRunsDrawerOpen(false)} />
              </div>
            </Show>

            {/* Right: Active Run Workspace */}
            <Show when={!isMobile() || selectedRunId()}>
              <div class={cn('space-y-4', isMobile() ? 'col-span-1' : 'lg:col-span-8')}>
                <Show when={isMobile() && selectedRunId()}>
                  <button
                    type="button"
                    onClick={() => setSelectedRunId(null)}
                    class="no-print inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-1"
                  >
                    <span>← Back to Runs List</span>
                  </button>
                </Show>
              <Show
                when={activeRun()}
                fallback={
                  <div class="p-16 text-center border rounded-lg bg-card">
                    <p class="text-sm font-semibold">Select a delivery run to begin warehouse picking</p>
                  </div>
                }
              >
                {(run) => {
                  const total = () => run().total_items || 0;
                  const picked = () => run().picked_items || 0;
                  const pct = () => (total() > 0 ? Math.round((picked() / total()) * 100) : 0);

                  return (
                    <div class="space-y-4">
                      {/* Active Run Header */}
                      <Card class="no-print">
                        <CardHeader class="pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div>
                            <div class="flex items-center gap-2">
                              <span class="text-xs font-bold px-2 py-0.5 rounded bg-muted text-muted-foreground">
                                RUN #{run().id}
                              </span>
                              <CardTitle class="text-lg font-bold">
                                {run().title || `Dispatch Run #${run().id}`}
                              </CardTitle>
                            </div>
                            <div class="text-xs text-muted-foreground mt-1.5 flex items-center gap-3 flex-wrap">
                              {/* Reassign Driver Dropdown */}
                              <div class="flex items-center gap-1.5">
                                <IconUser class="size-3.5 text-primary" />
                                <span class="font-medium text-foreground">Driver:</span>
                                <select
                                  class="text-xs font-semibold py-0.5 px-2 rounded border bg-background"
                                  value={run().driver_id ? run().driver_id!.toString() : ''}
                                  disabled={isReassigningDriver()}
                                  onChange={(e) => handleReassignDriver(run().id!, e.currentTarget.value)}
                                  title="Quickly change or reassign driver for this run"
                                >
                                  <option value="">-- Unassigned --</option>
                                  <For each={driversData()?.drivers?.filter((d) => d.active)}>
                                    {(d) => (
                                      <option value={d.id?.toString()}>
                                        {d.name} {d.vehicle ? `(${d.vehicle})` : ''}
                                      </option>
                                    )}
                                  </For>
                                </select>
                                <Show when={isReassigningDriver()}>
                                  <Spinner size="sm" />
                                </Show>
                              </div>
                              <span>• Date: {run().delivery_date}</span>
                              <Show when={run().areas && run().areas!.length > 0}>
                                <span>• Areas: {run().areas!.join(', ')}</span>
                              </Show>
                            </div>
                          </div>

                          <div class="flex items-center gap-2">
                            <select
                              class="text-xs font-semibold py-1 px-2.5 rounded-md border bg-background"
                              value={run().status || 'PLANNED'}
                              onChange={(e) =>
                                handleStatusChange(run().id!, e.currentTarget.value as DeliveryRunStatus)
                              }
                            >
                              <option value="PLANNED">PLANNED</option>
                              <option value="PICKING">PICKING</option>
                              <option value="READY">READY</option>
                              <option value="DISPATCHED">DISPATCHED</option>
                              <option value="COMPLETED">COMPLETED</option>
                            </select>

                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEditInPlanner(run())}
                              class="text-xs h-8 px-2.5 gap-1"
                            >
                              <IconEdit class="size-3.5" />
                              <span>Edit</span>
                            </Button>

                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => window.print()}
                              class="text-xs h-8 px-2.5 gap-1"
                            >
                              <IconPrinter class="size-3.5" />
                              <span>Print</span>
                            </Button>

                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setRunToDelete(run())}
                              class="text-xs h-8 px-2.5 text-destructive"
                            >
                              <IconTrash class="size-3.5" />
                            </Button>
                          </div>
                        </CardHeader>

                        <CardContent class="pt-0 space-y-3">
                          <div class="space-y-1">
                            <div class="flex justify-between text-xs font-medium">
                              <span>Picking Progress: {picked()} / {total()} items</span>
                              <span>{pct()}%</span>
                            </div>
                            <div class="w-full bg-muted rounded-full h-2 overflow-hidden">
                              <div
                                class={cn(
                                  'h-full transition-all duration-300',
                                  pct() === 100 ? 'bg-status-selesai' : 'bg-primary'
                                )}
                                style={{ width: `${pct()}%` }}
                              />
                            </div>
                          </div>

                          <Show when={run().notes}>
                            <div class="p-2 rounded-md bg-muted/40 border text-xs text-muted-foreground flex items-center gap-2">
                              <span class="font-semibold text-foreground">Notes:</span>
                              <span>{run().notes}</span>
                            </div>
                          </Show>

                          {/* Picking View Mode */}
                          <div class="pt-2 flex items-center justify-between border-t text-xs">
                            <span class="font-semibold text-muted-foreground">Picking Mode:</span>
                            <div class="inline-flex rounded-md border p-0.5 bg-muted/40 text-xs">
                              <button
                                type="button"
                                class={cn(
                                  'px-2.5 py-0.5 rounded-sm font-semibold',
                                  pickingViewMode() === 'orders' ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground'
                                )}
                                onClick={() => setPickingViewMode('orders')}
                              >
                                By Destination Order
                              </button>
                              <button
                                type="button"
                                class={cn(
                                  'px-2.5 py-0.5 rounded-sm font-semibold',
                                  pickingViewMode() === 'consolidated' ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground'
                                )}
                                onClick={() => setPickingViewMode('consolidated')}
                              >
                                Consolidated Shelf List
                              </button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Items List */}
                      <Show when={pickingViewMode() === 'orders'}>
                        <div class="no-print space-y-3">
                          <For each={runItemsByOrder()}>
                            {(ordGroup) => (
                              <div class="border rounded-lg bg-card overflow-hidden">
                                <div class="bg-muted/30 p-2.5 px-3 flex items-center justify-between border-b">
                                  <span class="font-bold text-xs">{ordGroup.customer} ({ordGroup.area})</span>
                                  <span class="text-[11px] text-muted-foreground">{ordGroup.items.length} items</span>
                                </div>
                                <div class="divide-y divide-border">
                                  <For each={ordGroup.items}>
                                    {(it) => (
                                      <div class="p-2.5 flex items-center justify-between gap-3 text-xs">
                                        <div class="flex items-center gap-3">
                                          <input
                                            type="checkbox"
                                            checked={!!it.picked}
                                            onChange={() => handleTogglePick(run().id!, it.id!, !!it.picked)}
                                            class="size-5 rounded text-status-selesai focus:ring-ring cursor-pointer"
                                          />
                                          <div>
                                            <div class={cn('font-medium', it.picked ? 'line-through text-muted-foreground' : '')}>
                                              {it.nama_barang}
                                            </div>
                                            <div class="text-[11px] text-muted-foreground">
                                              Qty: <strong>{it.planned_qty} {it.satuan}</strong>
                                            </div>
                                          </div>
                                        </div>
                                        <Show when={it.picked}>
                                          <span class="text-[10px] font-bold text-status-selesai">PICKED</span>
                                        </Show>
                                      </div>
                                    )}
                                  </For>
                                </div>
                              </div>
                            )}
                          </For>
                        </div>
                      </Show>

                      <Show when={pickingViewMode() === 'consolidated'}>
                        <div class="no-print space-y-2.5">
                          <For each={consolidatedRunItems()}>
                            {(prod) => (
                              <div class="p-3 rounded-lg border bg-card flex items-start gap-3">
                                <input
                                  type="checkbox"
                                  checked={prod.allPicked}
                                  onChange={() => toggleConsolidatedProduct(run().id!, prod.items, prod.allPicked)}
                                  class="size-5 rounded text-status-selesai mt-0.5 cursor-pointer"
                                />
                                <div class="text-xs">
                                  <div class="font-bold text-sm">{prod.nama_barang}</div>
                                  <div class="text-primary font-semibold mt-0.5">
                                    Total to pull: {prod.totalPlannedQty} {prod.satuan}
                                  </div>
                                </div>
                              </div>
                            )}
                          </For>
                        </div>
                      </Show>

                      {/* Printable A4 Manifest */}
                      <div class="delivery-print-sheet hidden print:block text-black bg-white p-4">
                        <div class="border-b-2 border-black pb-2 mb-4 flex justify-between">
                          <div>
                            <h1 class="text-xl font-bold uppercase">Warehouse Delivery & Picking Manifest</h1>
                            <p class="text-xs">Run #{run().id} • {run().title || 'Dispatch Sheet'}</p>
                          </div>
                          <div class="text-right text-xs">
                            <div>Date: {run().delivery_date}</div>
                            <div>Driver: {run().driver_name}</div>
                          </div>
                        </div>

                        <table class="w-full text-left text-xs border border-collapse border-black mb-6">
                          <thead>
                            <tr class="bg-gray-200 text-black border-b border-black text-[11px]">
                              <th class="border border-black p-1.5 w-10 text-center">Pick</th>
                              <th class="border border-black p-1.5">Customer & Area</th>
                              <th class="border border-black p-1.5">Item Name</th>
                              <th class="border border-black p-1.5 w-24 text-center">Qty</th>
                              <th class="border border-black p-1.5">Notes</th>
                            </tr>
                          </thead>
                          <tbody>
                            <For each={run().items || []}>
                              {(it) => (
                                <tr class="border-b border-black">
                                  <td class="border border-black p-1.5 text-center font-bold">[  ]</td>
                                  <td class="border border-black p-1.5 font-bold">{it.customer} ({it.area})</td>
                                  <td class="border border-black p-1.5">{it.nama_barang}</td>
                                  <td class="border border-black p-1.5 text-center font-bold">{it.planned_qty} {it.satuan}</td>
                                  <td class="border border-black p-1.5 text-[10px]">{it.note || it.keterangan || '-'}</td>
                                </tr>
                              )}
                            </For>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                }}
              </Show>
            </div>
            </Show>
          </div>
        </Show>
        {/* Mobile Plan Drawer */}
        <Show when={isMobile() && activeTab() === 'plan'}>
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            class="fixed bottom-4 right-4 z-40 flex items-center gap-2 px-4 py-3 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-all no-print"
          >
            <IconFilter class="size-4" />
            <span class="text-sm font-semibold">Filters & Dispatch</span>
            <Show when={draftStats().totalItems > 0}>
              <span class="inline-flex items-center justify-center size-5 text-[11px] font-bold rounded-full bg-primary-foreground text-primary">
                {draftStats().totalItems}
              </span>
            </Show>
          </button>

          <Sheet open={sidebarOpen()} onOpenChange={setSidebarOpen}>
            <SheetContent position="right" class="w-[85vw] sm:max-w-sm overflow-y-auto p-4">
              <SheetHeader>
                <SheetTitle>Filters & Dispatch</SheetTitle>
              </SheetHeader>
              <div class="mt-4">
                <PlanSidebarContent />
              </div>
            </SheetContent>
          </Sheet>
        </Show>

        {/* Mobile Runs Drawer */}
        <Show when={isMobile() && activeTab() === 'runs' && selectedRunId()}>
          <button
            type="button"
            onClick={() => setRunsDrawerOpen(true)}
            class="fixed bottom-4 right-4 z-40 flex items-center gap-2 px-4 py-3 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-all no-print"
          >
            <IconBuildingWarehouse class="size-4" />
            <span class="text-sm font-semibold">Switch Run</span>
          </button>

          <Sheet open={runsDrawerOpen()} onOpenChange={setRunsDrawerOpen}>
            <SheetContent position="left" class="w-[85vw] sm:max-w-sm overflow-y-auto p-4">
              <SheetHeader>
                <SheetTitle>Dispatch Runs</SheetTitle>
              </SheetHeader>
              <div class="mt-4">
                <RunsListContent onSelectRun={() => setRunsDrawerOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>
        </Show>

        {/* DRIVERS ROSTER MODAL */}
        <Dialog open={showDriverModal()} onOpenChange={setShowDriverModal}>
          <DialogContent class="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Manage Delivery Drivers</DialogTitle>
              <DialogDescription>Add or remove delivery staff members.</DialogDescription>
            </DialogHeader>

            <form onSubmit={handleAddDriver} class="space-y-3 pt-2">
              <Show when={driverModalError()}>
                <div class="p-2 rounded bg-destructive/15 text-xs text-destructive">{driverModalError()}</div>
              </Show>

              <div class="space-y-2">
                <input
                  type="text"
                  placeholder="Driver name *"
                  value={newDriverName()}
                  onInput={(e) => setNewDriverName(e.currentTarget.value)}
                  class="w-full text-xs py-1.5 px-2 rounded border bg-background"
                />
                <input
                  type="text"
                  placeholder="Phone number"
                  value={newDriverPhone()}
                  onInput={(e) => setNewDriverPhone(e.currentTarget.value)}
                  class="w-full text-xs py-1.5 px-2 rounded border bg-background"
                />
                <input
                  type="text"
                  placeholder="Vehicle / Plat"
                  value={newDriverVehicle()}
                  onInput={(e) => setNewDriverVehicle(e.currentTarget.value)}
                  class="w-full text-xs py-1.5 px-2 rounded border bg-background"
                />
              </div>

              <div class="flex justify-end gap-2">
                <Button type="submit" size="sm" disabled={isAddingDriver()} class="text-xs">
                  <span>Add Driver</span>
                </Button>
              </div>
            </form>

            <div class="border rounded mt-3 max-h-48 overflow-y-auto">
              <table class="w-full text-left text-xs">
                <tbody>
                  <For each={driversData()?.drivers || []}>
                    {(d) => (
                      <tr class="border-b hover:bg-muted/50 transition-colors">
                        <td class="p-2 font-medium">{d.name}</td>
                        <td class="p-2 text-muted-foreground">{d.vehicle || '-'}</td>
                        <td class="p-2 text-right">
                          <button
                            type="button"
                            onClick={() => d.id && handleDeleteDriverClick(d.id)}
                            class="text-destructive p-1 hover:opacity-80"
                          >
                            <IconTrash class="size-3.5" />
                          </button>
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>

            <DialogFooter class="pt-2">
              <Button variant="outline" size="sm" onClick={() => setShowDriverModal(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* DELETE RUN ALERT DIALOG */}
        <AlertDialog open={!!runToDelete()} onOpenChange={(open) => !open && setRunToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogTitle>Delete Delivery Run</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this run? The original orders and items remain untouched in SQLite.
            </AlertDialogDescription>
            <div class="flex justify-end gap-2 mt-4">
              <Button variant="outline" size="sm" onClick={() => setRunToDelete(null)}>
                Cancel
              </Button>
              <Button size="sm" variant="destructive" onClick={confirmDeleteRun}>
                Delete
              </Button>
            </div>
          </AlertDialogContent>
        </AlertDialog>
      </div>
  );
};
export default DeliveryFlow;
