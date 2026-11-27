import { DELIVERY_RUN_STATUS, ORDER_STATUS, STOCK_STATUS } from '~/domain';

import { useI18n } from '~/i18n';
import { useAuth } from '~/auth';
import {
  type Component,
  createSignal,
  createMemo,
  createResource,
  createEffect,
  onCleanup,
  on,
  Show,
  For,
  batch,
} from 'solid-js';
import { Portal } from 'solid-js/web';
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
  IconTruck,
  IconCheck,
  IconPlus,
  IconMinus,
  IconPrinter,
  IconTrash,
  IconSearch,
  IconFilter,
  IconAlertTriangle,
  IconCalendar,
  IconUser,
  IconUsers,
  IconMapPin,
  IconListCheck,
  IconBuildingWarehouse,
  IconArrowRight,
  IconRefresh,
  IconX,
  IconChevronDown,
  IconChevronRight,
  IconAdjustmentsHorizontal,
  IconClipboardList,
  IconFilePlus,
  IconNotes,
  IconPencil,
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
  return 0;
}

function makeItemKey(
  order: { id?: string; order_number?: string; customer?: string },
  item: { nama_barang?: string; row_index?: number }
): string {
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
  const { t, formatDate } = useI18n();
  const auth = useAuth();
  let disposed = false;
  onCleanup(() => { disposed = true; });
  const getRunStatusLabel = (status: string) => {
    switch (status) {
      case 'ALL':
        return t('common.all');
      case DELIVERY_RUN_STATUS.PLANNED:
        return t('status.planned');
      case DELIVERY_RUN_STATUS.PICKING:
        return t('status.picking');
      case DELIVERY_RUN_STATUS.READY:
        return t('status.ready');
      case DELIVERY_RUN_STATUS.DISPATCHED:
        return t('status.dispatched');
      case DELIVERY_RUN_STATUS.COMPLETED:
        return t('status.completed');
      default:
        return status;
    }
  };
  const formatAreaLabel = (area: string) =>
    area === 'Unassigned' ? t('deliveryFlow.unassigned') : area;
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = () => {
    if (searchParams.tab === 'runs' || searchParams.tab === 'configure') return 'runs';
    return 'plan';
  };
  createEffect(
    on(
      () => searchParams.tab,
      (tab) => {
        if (tab === 'configure' && auth.can('delivery:create') && draftItems().size > 0) {
          batch(() => {
            setSelectedRunId(null);
            setRunsEditAll(true);
            setRunsDispatchOpen(true);
          });
        }
      }
    )
  );
  const [dockFilterOpen, setDockFilterOpen] = createSignal(false);

  // Backend resources
  const [candidatesData, { refetch: refetchCandidates }] = createResource(() => auth.can('delivery:read'), getDeliveryCandidates);
  const [driversData, { refetch: refetchDrivers }] = createResource(() => auth.can('driver:read'), getDeliveryDrivers);
  const [runsData, { refetch: refetchRuns, mutate: mutateRuns }] = createResource(() => auth.can('delivery:read'), () => getDeliveryRuns());

  // Filters & toolbar state
  const [searchTerm, setSearchTerm] = createSignal('');
  const [readyInWarehouseOnly, setReadyInWarehouseOnly] = createSignal(false);
  const [includeClientHold, setIncludeClientHold] = createSignal(false);
  const [selectedAreaFilter, setSelectedAreaFilter] = createSignal<string | null>(null);

  const enabledFilterCount = createMemo(() => {
    let count = 0;
    if (searchTerm().trim()) count++;
    if (readyInWarehouseOnly()) count++;
    if (includeClientHold()) count++;
    if (selectedAreaFilter()) count++;
    return count;
  });

  // Draft Delivery Run state (Planner)
  const [selectedDriverId, setSelectedDriverId] = createSignal<number | null>(null);
  const [driverName, setDriverName] = createSignal('');
  const [deliveryDate, setDeliveryDate] = createSignal(getTodayStr());
  const [runTitle, setRunTitle] = createSignal('');
  const [runNotes, setRunNotes] = createSignal('');
  const [draftItems, setDraftItems] = createSignal<Map<string, DraftItemSelection>>(new Map());
  const [isSavingRun, setIsSavingRun] = createSignal(false);
  const [plannerError, setPlannerError] = createSignal('');

  // Runs & Dispatch Workspace state (Tab 2 - Mockup 1)
  type GroupBy = 'destination' | 'none';
  type PickFilter = 'all' | 'to-pick' | 'picked';
  type RunsDockPanel = 'runs' | 'driver' | 'filters';

  const [selectedRunId, setSelectedRunId] = createSignal<number | null>(null);
  const [runSearchQuery, setRunSearchQuery] = createSignal('');
  const [runStatusFilter, setRunStatusFilter] = createSignal<string>('ALL');
  const [runsEditAll, setRunsEditAll] = createSignal(false);
  const [runsGroupBy, setRunsGroupBy] = createSignal<GroupBy>('destination');
  const [runsPickFilter, setRunsPickFilter] = createSignal<PickFilter>('all');
  const [runsDestinationFilter, setRunsDestinationFilter] = createSignal('');
  const [runsDispatchOpen, setRunsDispatchOpen] = createSignal(false);
  const [runsItemQuery, setRunsItemQuery] = createSignal('');
  const [runsFilterOpen, setRunsFilterOpen] = createSignal(false);
  const [runsDockPanel, setRunsDockPanel] = createSignal<RunsDockPanel | null>(null);
  const [editingItemKey, setEditingItemKey] = createSignal<string | undefined>(undefined);
  const [deleteDialogOpen, setDeleteDialogOpen] = createSignal(false);
  const [isDeletingRun, setIsDeletingRun] = createSignal(false);
  let runsDockTrigger: HTMLButtonElement | undefined;
  let runsItemSearchRef!: HTMLInputElement;
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
		if (([DELIVERY_RUN_STATUS.PLANNED, DELIVERY_RUN_STATUS.PICKING, DELIVERY_RUN_STATUS.READY] as readonly string[]).includes(r.status || '')) {
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
	if (([ORDER_STATUS.COMPLETE, 'COMPLETED', ORDER_STATUS.CANCELLED, ORDER_STATUS.CANCEL] as readonly string[]).includes(sOrder)) return false;

    const remaining = getItemRemainingQty(item);
    if (remaining <= 0) return false;

    if (readyInWarehouseOnly()) {
      const sBarang = (item.status_barang || '').trim().toUpperCase();
		if (sBarang !== STOCK_STATUS.WAREHOUSE) return false;
    }

	if (!includeClientHold() && sOrder === ORDER_STATUS.PENDING) {
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
		if (([ORDER_STATUS.COMPLETE, 'COMPLETED', ORDER_STATUS.CANCELLED, ORDER_STATUS.CANCEL] as readonly string[]).includes(sOrder)) continue;
        const rem = getItemRemainingQty(it);
        if (rem <= 0) continue;

        grp.totalItemsCount++;
		if ((it.status_barang || '').trim().toUpperCase() === STOCK_STATUS.WAREHOUSE) {
          grp.readyItemsCount++;
          orderHasReady = true;
        }
		if (sOrder === ORDER_STATUS.PENDING) {
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
    const filtered = orders.filter((o) => (o.items || []).some((it) => isItemEligible(it)));
    return [...filtered].sort((a, b) => {
      const dateA = parseDateValue(a.tanggal)?.getTime() ?? 0;
      const dateB = parseDateValue(b.tanggal)?.getTime() ?? 0;
      if (dateB !== dateA) return dateB - dateA;
      const strCmp = (b.tanggal || '').localeCompare(a.tanggal || '');
      if (strCmp !== 0) return strCmp;
      const maxRowA = Math.max(0, ...(a.items || []).map((it) => it.row_index || 0));
      const maxRowB = Math.max(0, ...(b.items || []).map((it) => it.row_index || 0));
      if (maxRowB !== maxRowA) return maxRowB - maxRowA;
      return (b.id ?? '').localeCompare(a.id ?? '');
    });
  });

  // Toggle item selection in draft
  const toggleItemSelection = (order: Order, item: OrderItem) => {
    if (!auth.can('delivery:create')) return;
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

  // Order-level select toggle
  const toggleOrderSelection = (order: Order) => {
    if (!auth.can('delivery:create')) return;
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
    if (!auth.can('delivery:create')) return;
    const readyItems = (order.items || []).filter(
		(it) => isItemEligible(it) && (it.status_barang || '').trim().toUpperCase() === STOCK_STATUS.WAREHOUSE
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
    if (!auth.can('delivery:create')) return;
    const targetOrders = candidateOrders().filter((o) => (o.area?.trim() || 'Unassigned') === area);
    const next = new Map(draftItems());
    for (const ord of targetOrders) {
      const readyItems = (ord.items || []).filter(
		(it) => isItemEligible(it) && (it.status_barang || '').trim().toUpperCase() === STOCK_STATUS.WAREHOUSE
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
    let totalPlannedUnits = 0;
    for (const d of items) {
      orderSet.add(d.order.id);
      if (d.order.area) areaSet.add(d.order.area);
      totalPlannedUnits += parseQty(d.planned_qty);
    }
    return {
      totalItems: items.length,
      totalOrders: orderSet.size,
      totalPlannedUnits,
      areas: Array.from(areaSet),
    };
  });
  const removeDraftItem = (key: string) => {
    if (!auth.can('delivery:create')) return;
    setDraftItems((prev) => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  };

  const isDraft = () => selectedRunId() === null && draftItems().size > 0;
  const canEditWorkspace = () => auth.can(isDraft() ? 'delivery:create' : 'delivery:update');
  const pickedRun = createMemo<DeliveryRun | null>(() => {
    if (isDraft()) return null;
    const runs = runsData()?.runs || [];
    if (selectedRunId() !== null) {
      const found = runs.find((r) => r.id === selectedRunId());
      if (found) return found;
    }
    if (runs.length === 0) return null;
    return [...runs].sort((a, b) => {
      const dateCmp = (b.delivery_date || '').localeCompare(a.delivery_date || '');
      if (dateCmp !== 0) return dateCmp;
      return (b.id ?? 0) - (a.id ?? 0);
    })[0] || null;
  });

  const parseDateValue = (dateStr?: string): Date | null => {
    if (!dateStr) return null;
    const trimmed = dateStr.trim();
    if (!trimmed) return null;
    const parts = trimmed.split(/[-T/ ]/);
    if (parts.length >= 3) {
      let year = 0;
      let month = 0;
      let day = 0;
      if (parts[0].length === 4) {
        year = parseInt(parts[0], 10);
        month = parseInt(parts[1], 10) - 1;
        day = parseInt(parts[2], 10);
      } else if (parts[2].length === 4) {
        day = parseInt(parts[0], 10);
        month = parseInt(parts[1], 10) - 1;
        year = parseInt(parts[2], 10);
      }
      if (year && month >= 0 && day) {
        const d = new Date(year, month, day);
        if (!isNaN(d.getTime())) return d;
      }
    }
    const parsed = new Date(trimmed);
    return isNaN(parsed.getTime()) ? null : parsed;
  };

  const formatDisplayDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    const d = parseDateValue(dateStr);
    if (!d) return formatDate(dateStr);
    return formatDate(d, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  // Driver Workload & Route Overview for the active dispatch date
  const driverWorkloads = createMemo(() => {
    const activeDrivers = (driversData()?.drivers || []).filter((d) => d.active);
    const allRuns = runsData()?.runs || [];
    const targetDate = (isDraft() ? deliveryDate() : (pickedRun()?.delivery_date || '')).trim();
    const dateRuns = allRuns.filter((r) => !targetDate || r.delivery_date === targetDate);

    return activeDrivers.map((d) => {
      const matchingRuns = dateRuns.filter(
        (r) =>
          (d.id && r.driver_id === d.id) ||
          (!r.driver_id && r.driver_name.trim().toLowerCase() === d.name.trim().toLowerCase())
      );
      const areaSet = new Set<string>();
      for (const r of matchingRuns) {
        for (const a of r.areas || []) {
          if (a) areaSet.add(a);
        }
        for (const it of r.items || []) {
          if (it.area) areaSet.add(it.area);
        }
      }
      return {
        driver: d,
        runsCount: matchingRuns.length,
        areas: Array.from(areaSet),
      };
    });
  });

  // Persist saved run updates cleanly
  const latestRunSaveSeq = new Map<number, number>();
  const persistSavedRun = async (run: DeliveryRun, patch: Partial<DeliveryRun>, refetchCands = false) => {
    if (!auth.can('delivery:update')) return;
    if (!run.id) return;
    const runId = run.id;
    const payload: DeliveryRun = {
      title: patch.title !== undefined ? patch.title : (run.title || ''),
      driver_id: patch.driver_id !== undefined ? patch.driver_id : (run.driver_id || 0),
      driver_name: patch.driver_name !== undefined ? patch.driver_name : (run.driver_name || 'Unassigned'),
      areas: patch.areas !== undefined ? patch.areas : (run.areas || []),
      delivery_date: patch.delivery_date !== undefined ? patch.delivery_date : run.delivery_date,
      status: patch.status !== undefined ? patch.status : (run.status || DELIVERY_RUN_STATUS.PLANNED),
      notes: patch.notes !== undefined ? patch.notes : (run.notes || ''),
      items: patch.items !== undefined ? patch.items : (run.items || []),
    };
    const saveSeq = (latestRunSaveSeq.get(runId) ?? 0) + 1;
    latestRunSaveSeq.set(runId, saveSeq);
    mutateRuns((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        runs: prev.runs.map((r) =>
          r.id === runId
            ? {
                ...r,
                ...payload,
                total_items: payload.items.length,
                picked_items: payload.items.filter((it) => it.picked).length,
              }
            : r
        ),
      };
    });
    try {
      const res = await updateDeliveryRun(runId, payload);
      if (disposed) return;
      if (latestRunSaveSeq.get(runId) === saveSeq && res?.run) {
        mutateRuns((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            runs: prev.runs.map((r) => (r.id === runId ? res.run : r)),
          };
        });
      }
      if (!disposed && refetchCands) refetchCandidates();
    } catch (err) {
      console.error('Failed to update delivery run:', err);
      if (!disposed && latestRunSaveSeq.get(runId) === saveSeq) {
        refetchRuns();
      }
    }
  };

  // Save Draft Delivery Run
  const handleSaveRun = async () => {
    if (!auth.can('delivery:create')) return;
    setPlannerError('');
    const dName = driverName().trim() || t('deliveryFlow.unassigned');
    const dDate = deliveryDate().trim();
    if (!dDate) {
      setPlannerError(t('deliveryFlow.errEnterDeliveryDate'));
      return;
    }
    const selected = Array.from(draftItems().values());
    if (selected.length === 0) {
      setPlannerError(t('deliveryFlow.errSelectAtLeastOne'));
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
        status: DELIVERY_RUN_STATUS.PLANNED,
        notes: runNotes().trim(),
        items: runItems,
      };

      const res = await createDeliveryRun(payload);
      if (disposed) return;
      const savedRun = res.run;

      batch(() => {
        setDraftItems(new Map());
        setRunTitle('');
        setRunNotes('');
        setSelectedDriverId(null);
        setDriverName('');
        setSelectedRunId(savedRun.id || null);
        setRunsEditAll(false);
        setRunsDispatchOpen(false);
        setRunsFilterOpen(false);
        setRunsDockPanel(null);
        setSearchParams({ tab: 'runs' });
        setReadyInWarehouseOnly(false);
        setIncludeClientHold(false);
      });

      refetchRuns();
      refetchCandidates();
    } catch (err: unknown) {
      setPlannerError(err instanceof Error ? err.message : t('deliveryFlow.errSaveRun'));
    } finally {
      setIsSavingRun(false);
    }
  };
  // Driver CRUD handlers
  const handleAddDriver = async (e: Event) => {
    e.preventDefault();
    if (!auth.can(driverToEdit() ? 'driver:update' : 'driver:create')) return;
    setDriverModalError('');
    const name = newDriverName().trim();
    if (!name) {
      setDriverModalError(t('deliveryFlow.errDriverNameRequired'));
      return;
    }
    setIsAddingDriver(true);
    try {
      if (driverToEdit() && driverToEdit()?.id) {
        await updateDeliveryDriver(driverToEdit()!.id!, {
          name,
          phone: newDriverPhone().trim(),
          vehicle: newDriverVehicle().trim(),
          active: driverToEdit()!.active,
        });
      } else {
        await createDeliveryDriver({
          name,
          phone: newDriverPhone().trim(),
          vehicle: newDriverVehicle().trim(),
          active: true,
        });
      }
      if (disposed) return;
      setNewDriverName('');
      setNewDriverPhone('');
      setNewDriverVehicle('');
      setDriverToEdit(null);
      refetchDrivers();
    } catch (err: unknown) {
      setDriverModalError(err instanceof Error ? err.message : t('deliveryFlow.errSaveDriver'));
    } finally {
      setIsAddingDriver(false);
    }
  };

  const handleDeleteDriverClick = async (id: number) => {
    if (!auth.can('driver:delete')) return;
    setDriverModalError('');
    try {
      await deleteDeliveryDriver(id);
      if (disposed) return;
      if (selectedDriverId() === id) {
        setSelectedDriverId(null);
        setDriverName('');
      }
      if (driverToEdit()?.id === id) {
        setDriverToEdit(null);
        setNewDriverName('');
        setNewDriverPhone('');
        setNewDriverVehicle('');
      }
      refetchDrivers();
    } catch (err: unknown) {
      setDriverModalError(err instanceof Error ? err.message : t('deliveryFlow.errDeleteDriver'));
    }
  };

  // Driver reassignment on active runs
  const handleReassignDriver = async (runId: number, driverIdStr: string) => {
    if (!auth.can('delivery:update') || (driverIdStr && !auth.can('driver:read'))) return;
    try {
      let updatedRun: DeliveryRun | undefined;
      if (!driverIdStr) {
        const res = await updateDeliveryRunDriver(runId, {
          driver_id: undefined,
          driver_name: 'Unassigned',
        });
        updatedRun = res.run;
      } else {
        const id = parseInt(driverIdStr, 10);
        const drivers = driversData()?.drivers || [];
        const found = drivers.find((d) => d.id === id);
        if (found) {
          const res = await updateDeliveryRunDriver(runId, {
            driver_id: found.id,
            driver_name: found.name,
          });
          updatedRun = res.run;
        }
      }
      if (disposed) return;
      if (updatedRun) {
        mutateRuns((prev) =>
          prev
            ? { ...prev, runs: prev.runs.map((r) => (r.id === runId ? updatedRun! : r)) }
            : prev
        );
      } else {
        refetchRuns();
      }
    } catch (err) {
      console.error('Failed to reassign driver:', err);
    }
  };

  // Runs & Dispatch Workspace helpers
  const filteredRuns = createMemo(() => {
    let runs = runsData()?.runs || [];
    const q = runSearchQuery().trim().toLowerCase();
    if (q) {
      runs = runs.filter((r) =>
        `${r.title || ''} #${r.id || ''} ${r.driver_name || ''} ${(r.areas || []).join(' ')}`
          .toLowerCase()
          .includes(q)
      );
    }
    const status = runStatusFilter();
    if (status !== 'ALL') {
      runs = runs.filter((r) => (r.status || '').toUpperCase() === status);
    }
    return [...runs].sort((a, b) => {
      const dateCmp = (b.delivery_date || '').localeCompare(a.delivery_date || '');
      if (dateCmp !== 0) return dateCmp;
      return (b.id ?? 0) - (a.id ?? 0);
    });
  });

  const filteredRunIds = createMemo(() =>
    filteredRuns()
      .map((r) => r.id)
      .filter((id): id is number => id !== undefined)
  );
  const runsById = createMemo(() => {
    const map = new Map<number, DeliveryRun>();
    for (const r of runsData()?.runs || []) {
      if (r.id !== undefined) map.set(r.id, r);
    }
    return map;
  });

  const handleTogglePick = async (runId: number, itemId: number, currentPicked: boolean) => {
    if (!auth.can('delivery:pick')) return;
    try {
      const res = await toggleDeliveryRunItemPick(runId, itemId, !currentPicked);
      if (disposed) return;
      if (res?.run) {
        mutateRuns((prev) =>
          prev
            ? { ...prev, runs: prev.runs.map((r) => (r.id === runId ? res.run : r)) }
            : prev
        );
      } else {
        refetchRuns();
      }
    } catch (err) {
      console.error('Failed to toggle pick:', err);
    }
  };

  const handleStatusChange = async (runId: number, newStatus: DeliveryRunStatus) => {
    if (!auth.can('delivery:update')) return;
    try {
      const res = await updateDeliveryRunStatus(runId, newStatus);
      if (disposed) return;
      if (res?.run) {
        mutateRuns((prev) =>
          prev
            ? { ...prev, runs: prev.runs.map((r) => (r.id === runId ? res.run : r)) }
            : prev
        );
      } else {
        refetchRuns();
      }
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  interface WorkspaceItem {
    key: string;
    id?: number;
    order_id: string;
    order_number: string;
    ecatalog_number: string;
    customer: string;
    area: string;
    nama_barang: string;
    satuan: string;
    jumlah: number;
    belum_terkirim: number;
    planned_qty: number;
    note: string;
    picked: boolean;
  }

  const activeWorkspaceItems = createMemo<WorkspaceItem[]>(() => {
    if (isDraft()) {
      return Array.from(draftItems().entries()).map(([key, d]) => ({
        key,
        order_id: d.order.id || d.order.order_number || 'UNKNOWN',
        order_number: d.order.order_number || d.order.id || '',
        ecatalog_number: d.order.ecatalog_number || '',
        customer: d.order.customer || t('deliveryFlow.unknownCustomer'),
        area: d.order.area || '',
        nama_barang: d.item.nama_barang,
        satuan: d.item.satuan || '',
        jumlah: parseQty(d.item.jumlah),
        belum_terkirim: getItemRemainingQty(d.item),
        planned_qty: Math.max(1, parseQty(d.planned_qty)),
        note: d.note || '',
        picked: false,
      }));
    }
    const run = pickedRun();
    if (!run) return [];
    const seenKeys = new Map<string, number>();
    return (run.items || []).map((it) => {
      const rem = parseQty(it.belum_terkirim);
      const req = parseQty(it.jumlah);
      const baseKey =
        it.source_key?.trim() ||
        makeItemKey(
          { id: it.order_id, order_number: it.order_number, customer: it.customer },
          it
        );
      const dupCount = seenKeys.get(baseKey) ?? 0;
      seenKeys.set(baseKey, dupCount + 1);
      const key = dupCount > 0 ? `${baseKey}#${dupCount}` : baseKey;
      return {
        key,
        id: it.id,
        order_id: it.order_id || it.order_number || 'UNKNOWN',
        order_number: it.order_number || it.order_id || '',
        ecatalog_number: it.ecatalog_number || '',
        customer: it.customer || t('deliveryFlow.unknownCustomer'),
        area: it.area || '',
        nama_barang: it.nama_barang,
        satuan: it.satuan || '',
        jumlah: req,
        belum_terkirim: rem > 0 ? rem : req,
        planned_qty: Math.max(1, parseQty(it.planned_qty)),
        note: it.note || '',
        picked: Boolean(it.picked),
      };
    });
  });

  const visibleWorkspaceItems = createMemo(() => {
    const items = activeWorkspaceItems();
    const terms = runsItemQuery().trim().toLowerCase().split(/\s+/).filter(Boolean);
    const pFilter = runsPickFilter();
    const dFilter = runsDestinationFilter();
    if (!terms.length && pFilter === 'all' && !dFilter) return items;
    return items.filter((item) => {
      if (!isDraft() && pFilter !== 'all' && item.picked !== (pFilter === 'picked')) return false;
      if (dFilter && JSON.stringify([item.customer, item.area]) !== dFilter) return false;
      if (!terms.length) return true;
      const text = `${item.nama_barang} ${item.customer} ${item.area} ${item.order_number} ${item.ecatalog_number} ${item.note}`.toLowerCase();
      return terms.every((term) => text.includes(term));
    });
  });

  const workspaceDestinations = createMemo(() => {
    const options = new Map<string, string>();
    for (const item of activeWorkspaceItems()) {
      const label = item.area ? `${item.customer} \u00b7 ${item.area}` : item.customer;
      options.set(JSON.stringify([item.customer, item.area]), label);
    }
    return options;
  });

  createEffect(() => {
    if (runsDestinationFilter() && !workspaceDestinations().has(runsDestinationFilter())) {
      setRunsDestinationFilter('');
    }
  });

  createEffect(
    on(
      () => [selectedRunId(), isDraft(), runsEditAll()],
      () => setEditingItemKey(undefined)
    )
  );

  const enabledRunsFilterCount = () =>
    Number(runsGroupBy() === 'none') +
    Number(!isDraft() && runsPickFilter() !== 'all') +
    Number(Boolean(runsDestinationFilter()));

  const pickedRunCount = createMemo(() => {
    let count = 0;
    for (const it of pickedRun()?.items || []) {
      if (it.picked) count++;
    }
    return count;
  });
  const activeDriverId = () => {
    if (isDraft()) return selectedDriverId();
    const id = pickedRun()?.driver_id;
    return id && id > 0 ? id : null;
  };

  const getDriverVehicle = (driverId?: number | null, name?: string) => {
    const drivers = driversData()?.drivers || [];
    const found =
      (driverId ? drivers.find((d) => d.id === driverId) : undefined) ||
      (name ? drivers.find((d) => d.name.trim().toLowerCase() === name.trim().toLowerCase()) : undefined);
    return found?.vehicle?.trim() || '';
  };

  const activeWorkspaceItemMap = createMemo(() => {
    const map = new Map<string, WorkspaceItem>();
    for (const item of activeWorkspaceItems()) {
      map.set(item.key, item);
    }
    return map;
  });

  const visibleWorkspaceItemKeys = createMemo(() => visibleWorkspaceItems().map((it) => it.key));

  const groupedWorkspaceOrderMap = createMemo(() => {
    const groups = new Map<
      string,
      {
        order_id: string;
        order_number: string;
        ecatalog_number: string;
        customer: string;
        area: string;
        items: WorkspaceItem[];
      }
    >();
    for (const item of visibleWorkspaceItems()) {
      const existing = groups.get(item.order_id);
      if (existing) {
        existing.items.push(item);
      } else {
        groups.set(item.order_id, {
          order_id: item.order_id,
          order_number: item.order_number,
          ecatalog_number: item.ecatalog_number,
          customer: item.customer,
          area: item.area,
          items: [item],
        });
      }
    }
    return groups;
  });

  const groupedWorkspaceOrderIds = createMemo(() => Array.from(groupedWorkspaceOrderMap().keys()));

  const orderPickTotals = createMemo(() => {
    const counts = new Map<string, { picked: number; total: number }>();
    for (const item of activeWorkspaceItems()) {
      const c = counts.get(item.order_id) ?? { picked: 0, total: 0 };
      c.total++;
      if (item.picked) c.picked++;
      counts.set(item.order_id, c);
    }
    return counts;
  });

  const closeRunsDockPanel = () => {
    if (!runsDockPanel()) return;
    setRunsDockPanel(null);
    runsDockTrigger?.focus({ preventScroll: true });
  };

  const toggleRunsDockPanel = (panel: RunsDockPanel, trigger: HTMLButtonElement) => {
    if (runsDockPanel() === panel) {
      closeRunsDockPanel();
    } else {
      runsDockTrigger = trigger;
      setRunsDockPanel(panel);
    }
  };

  const resetRunsItemFilters = () => {
    batch(() => {
      setRunsGroupBy('destination');
      setRunsPickFilter('all');
      setRunsDestinationFilter('');
    });
  };

  const openDraftInRuns = () => {
    if (!auth.can('delivery:create')) return;
    batch(() => {
      setDockFilterOpen(false);
      setSelectedRunId(null);
      setRunsItemQuery('');
      setRunsPickFilter('all');
      setRunsDestinationFilter('');
      setRunsEditAll(true);
      setRunsDispatchOpen(true);
      setRunsFilterOpen(false);
      setSearchParams({ tab: 'runs' });
    });
    closeRunsDockPanel();
  };

  const selectRunInWorkspace = (runId: number) => {
    batch(() => {
      setSelectedRunId(runId);
      setRunsItemQuery('');
      setRunsPickFilter('all');
      setRunsDestinationFilter('');
      setRunsEditAll(false);
      setRunsDispatchOpen(false);
      setRunsFilterOpen(false);
    });
    closeRunsDockPanel();
  };

  const resetWorkspaceEditing = () => {
    setRunsEditAll(false);
    setRunsDispatchOpen(false);
    setEditingItemKey(undefined);
    if (runsDockPanel() === 'driver') closeRunsDockPanel();
  };

  createEffect(on(canEditWorkspace, (editable) => {
    if (!editable) resetWorkspaceEditing();
  }));

  const handleAssignRunDriver = async (driverId: number | null) => {
    if (!canEditWorkspace() || (driverId !== null && !auth.can('driver:read'))) return;
    if (isDraft()) {
      if (driverId === null) {
        setSelectedDriverId(null);
        setDriverName('');
      } else {
        const found = (driversData()?.drivers || []).find((d) => d.id === driverId);
        if (found) {
          setSelectedDriverId(found.id || null);
          setDriverName(found.name);
        }
      }
      return;
    }
    const run = pickedRun();
    if (!run?.id) return;
    await handleReassignDriver(run.id, driverId === null ? '' : String(driverId));
  };

  const handleUpdateRunDate = (date: string) => {
    if (!canEditWorkspace()) return;
    if (isDraft()) {
      setDeliveryDate(date);
      return;
    }
    const run = pickedRun();
    if (run) persistSavedRun(run, { delivery_date: date });
  };

  const handleUpdateRunTitle = (title: string) => {
    if (!canEditWorkspace()) return;
    if (isDraft()) {
      setRunTitle(title);
      return;
    }
    const run = pickedRun();
    if (run && (run.title || '') !== title) persistSavedRun(run, { title });
  };

  const handleUpdateRunNotes = (notes: string) => {
    if (!canEditWorkspace()) return;
    if (isDraft()) {
      setRunNotes(notes);
      return;
    }
    const run = pickedRun();
    if (run && (run.notes || '') !== notes) persistSavedRun(run, { notes });
  };

  const handleUpdateItemQty = (item: WorkspaceItem, qty: number) => {
    if (!canEditWorkspace()) return;
    const maxQty = item.belum_terkirim > 0 ? item.belum_terkirim : qty;
    const clamped = Math.max(1, Math.min(maxQty, Math.round(qty)));
    if (isDraft()) {
      setDraftItems((prev) => {
        const next = new Map(prev);
        const existing = next.get(item.key);
        if (existing) next.set(item.key, { ...existing, planned_qty: String(clamped) });
        return next;
      });
      return;
    }
    const run = pickedRun();
    if (!run || item.id === undefined) return;
    const nextItems = (run.items || []).map((it) =>
      it.id === item.id ? { ...it, planned_qty: String(clamped) } : it
    );
    persistSavedRun(run, { items: nextItems }, true);
  };

  const handleUpdateItemNote = (item: WorkspaceItem, note: string) => {
    if (!canEditWorkspace()) return;
    if (isDraft()) {
      setDraftItems((prev) => {
        const next = new Map(prev);
        const existing = next.get(item.key);
        if (existing) next.set(item.key, { ...existing, note });
        return next;
      });
      return;
    }
    const run = pickedRun();
    if (!run || item.id === undefined) return;
    const nextItems = (run.items || []).map((it) =>
      it.id === item.id ? { ...it, note } : it
    );
    persistSavedRun(run, { items: nextItems });
  };

  const handleRemoveWorkspaceItem = (item: WorkspaceItem) => {
    if (!canEditWorkspace()) return;
    if (isDraft()) {
      removeDraftItem(item.key);
      return;
    }
    const run = pickedRun();
    if (!run || item.id === undefined || (run.items?.length || 0) <= 1) return;
    const nextItems = (run.items || []).filter((it) => it.id !== item.id);
    const areas = Array.from(new Set(nextItems.map((it) => it.area || '').filter(Boolean)));
    persistSavedRun(run, { items: nextItems, areas }, true);
  };

  const handleFillOrderRemaining = (orderId: string) => {
    if (!canEditWorkspace()) return;
    if (isDraft()) {
      setDraftItems((prev) => {
        const next = new Map(prev);
        for (const [k, v] of next.entries()) {
          if ((v.order.id || v.order.order_number || 'UNKNOWN') === orderId) {
            const rem = getItemRemainingQty(v.item);
            next.set(k, { ...v, planned_qty: rem > 0 ? String(rem) : '1' });
          }
        }
        return next;
      });
      return;
    }
    const run = pickedRun();
    if (!run) return;
    const nextItems = (run.items || []).map((it) => {
      if ((it.order_id || it.order_number || 'UNKNOWN') !== orderId) return it;
      const rem = parseQty(it.belum_terkirim) || parseQty(it.jumlah);
      return { ...it, planned_qty: rem > 0 ? String(rem) : it.planned_qty };
    });
    persistSavedRun(run, { items: nextItems }, true);
  };

  const confirmDeleteOrDiscard = async () => {
    if (!auth.can(isDraft() ? 'delivery:create' : 'delivery:delete')) return;
    if (isDraft()) {
      batch(() => {
        setDraftItems(new Map());
        setRunTitle('');
        setRunNotes('');
        setSelectedDriverId(null);
        setDriverName('');
        setDeleteDialogOpen(false);
      });
      resetWorkspaceEditing();
      return;
    }
    const run = pickedRun();
    if (!run?.id) return;
    setIsDeletingRun(true);
    try {
      await deleteDeliveryRun(run.id);
      if (disposed) return;
      setDeleteDialogOpen(false);
      if (selectedRunId() === run.id) {
        setSelectedRunId(null);
      }
      refetchRuns();
      refetchCandidates();
    } catch (err) {
      console.error('Failed to delete run:', err);
    } finally {
      setIsDeletingRun(false);
    }
  };
  const PlanSelectSidebarContent = () => (
    <div class="space-y-4">
      {/* Card 0: Search Text Filter */}
      <Card class="border-border shadow-xs animate-[card-enter_300ms_ease-out_both]">
        <CardHeader class="p-3.5 pb-2">
          <CardTitle class="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 text-muted-foreground">
            <IconSearch class="size-3.5" />
            <span>{t('deliveryFlow.searchOrdersPlaceholder')}</span>
          </CardTitle>
        </CardHeader>
        <CardContent class="p-3.5 pt-0">
          <div class="relative w-full">
            <IconSearch class="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder={t('deliveryFlow.searchOrdersPlaceholder')}
              value={searchTerm()}
              onInput={(e) => setSearchTerm(e.currentTarget.value)}
              class="w-full pl-8 pr-7 py-1.5 text-xs rounded-md border bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <Show when={searchTerm()}>
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                class="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                title={t('deliveryFlow.clearSearch')}
              >
                <IconX class="size-3" />
              </button>
            </Show>
          </div>
        </CardContent>
      </Card>

      {/* Card 1: Stock Readiness & Filters */}
      <Card class="border-primary/20 shadow-xs animate-[card-enter_400ms_ease-out_both]">
        <CardHeader class="p-3.5 pb-2">
          <CardTitle class="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 text-primary">
            <IconFilter class="size-3.5" />
            {t('deliveryFlow.stockFilters')}
          </CardTitle>
        </CardHeader>
        <CardContent class="p-3.5 pt-0 space-y-3">
          <label class="flex items-center gap-2.5 text-xs font-semibold cursor-pointer select-none">
            <input
              type="checkbox"
              checked={readyInWarehouseOnly()}
              onChange={(e) => setReadyInWarehouseOnly(e.currentTarget.checked)}
              class="size-4 rounded text-status-selesai focus:ring-ring"
            />
            <span>{t('deliveryFlow.readyInWarehouseOnly')}</span>
            <span class="text-[10px] font-bold uppercase px-1.5 py-0.2 rounded bg-status-selesai/15 text-status-selesai">
              {t('status.stokGudang')}
            </span>
          </label>

          <label class="flex items-center gap-2.5 text-xs font-semibold cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeClientHold()}
              onChange={(e) => setIncludeClientHold(e.currentTarget.checked)}
              class="size-4 rounded text-status-pending focus:ring-ring"
            />
            <span>{t('deliveryFlow.showClientHolds')}</span>
            <span class="text-[10px] font-bold uppercase px-1.5 py-0.2 rounded bg-status-pending/15 text-status-pending">
              {t('status.pending')}
            </span>
          </label>
        </CardContent>
      </Card>

      {/* Card 2: Group by Area */}
      <Card class="animate-[card-enter_400ms_ease-out_both]" style={{ "animation-delay": "100ms" }}>
        <CardHeader class="p-3.5 pb-2 flex flex-row items-center justify-between">
          <CardTitle class="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 text-muted-foreground">
            <IconMapPin class="size-3.5" />
            {t('deliveryFlow.groupByArea')}
          </CardTitle>
          <Show when={selectedAreaFilter()}>
            <button
              type="button"
              onClick={() => setSelectedAreaFilter(null)}
              class="text-[10px] text-primary font-semibold hover:underline"
            >
              {t('deliveryFlow.clearFilter')}
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
                    <div class="flex items-center gap-1.5 min-w-0">
                      <span class="font-bold text-foreground truncate">{formatAreaLabel(grp.area)}</span>
                      <Show when={grp.selectedItemsCount > 0}>
                        <span class="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-primary text-primary-foreground tabular-nums">
                          {t('deliveryFlow.pickedCount', { count: grp.selectedItemsCount })}
                        </span>
                      </Show>
                    </div>
                    <span class="text-[11px] font-semibold text-muted-foreground tabular-nums shrink-0">
                      <span class="text-foreground">{grp.readyItemsCount}</span>/{t('deliveryFlow.readyTotalItems', { ready: '', total: grp.totalItemsCount }).trim()}
                    </span>
                  </div>

                  <div class="flex items-center justify-between mt-1 text-[10px]">
                    <span class="text-muted-foreground tabular-nums">{t('deliveryFlow.ordersCount', { count: grp.orders.length })}</span>
                    <button
                      disabled={!auth.can('delivery:create')}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        selectReadyInArea(grp.area);
                      }}
                      class="text-primary font-semibold hover:underline flex items-center gap-0.5"
                    >
                      <span>{t('deliveryFlow.addSelectReady')}</span>
                    </button>
                  </div>
                </div>
              );
            }}
          </For>
        </CardContent>
      </Card>

      {/* Card 3: Selection Summary & Proceed to Stage 2 */}
      <Card class="border-border bg-card shadow-sm animate-[card-enter_400ms_ease-out_both]" style={{ "animation-delay": "200ms" }}>
        <CardHeader class="p-3.5 pb-2 flex flex-row items-center justify-between">
          <CardTitle class="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 text-muted-foreground">
            <IconListCheck class="size-3.5" />
            {t('deliveryFlow.selectionSummary')}
          </CardTitle>
        </CardHeader>
        <CardContent class="p-3.5 pt-0 space-y-3">
          <div class="p-2.5 rounded-lg bg-muted/30 border border-border space-y-1">
            <div class="flex items-center justify-between text-xs font-bold text-foreground">
              <span>{t('deliveryFlow.selectedItemsLabel')}</span>
              <span class="text-primary font-extrabold text-sm tabular-nums">
                {t('deliveryFlow.itemsCount', { count: draftStats().totalItems })}
              </span>
            </div>
            <div class="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>{t('deliveryFlow.ordersCoveredLabel')}</span>
              <span class="tabular-nums">{t('deliveryFlow.ordersCoveredCount', { count: draftStats().totalOrders })}</span>
            </div>
            <Show when={draftStats().areas.length > 0}>
              <div class="text-[10px] text-muted-foreground truncate pt-1 border-t border-border">
                {t('deliveryFlow.areasLabel', { areas: draftStats().areas.join(', ') })}
              </div>
            </Show>
          </div>

          <div class="space-y-1.5">
            <Button
              size="sm"
              onClick={openDraftInRuns}
              disabled={!auth.can('delivery:create') || draftStats().totalItems === 0}
              class="w-full text-xs h-9 font-semibold gap-1.5"
            >
              <span>{t('deliveryFlow.setQuantitiesAndDispatch')}</span>
              <IconArrowRight class="size-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  // Canonical Mobile Order Card with Design-System Micro-Pills & Product Unit
  const OrderCard = (props: { order: Order; index: number }) => {
    const eligibleItems = () => (props.order.items || []).filter((it) => isItemEligible(it));
    const orderAllSelected = () =>
      eligibleItems().length > 0 &&
      eligibleItems().every((it) => draftItems().has(makeItemKey(props.order, it)));

    return (
      <div
        class="border rounded-xl bg-card overflow-hidden shadow-xs hover:border-primary/50 transition-all animate-[card-enter_400ms_ease-out_both]"
        style={{ "animation-delay": `${props.index * 40}ms` }}
      >
        <div class="bg-muted/30 p-2.5 flex items-center justify-between gap-2 border-b">
          <div class="flex items-center gap-2 min-w-0">
            <input
              type="checkbox"
              disabled={!auth.can('delivery:create')}
              checked={orderAllSelected()}
              onChange={() => toggleOrderSelection(props.order)}
              class="size-4 rounded text-primary shrink-0"
            />
            <div class="min-w-0">
              <div class="flex items-center gap-1.5 min-w-0">
                <span class="font-bold text-xs text-foreground truncate">{props.order.customer}</span>
                <Show when={props.order.area}>
                  <span class="text-[9px] font-semibold px-1.5 py-0.2 rounded-full bg-primary/10 text-primary border border-primary/20 shrink-0">
                    {props.order.area}
                  </span>
                </Show>
              </div>
              <Show when={(typeof props.order.tanggal === 'string' && props.order.tanggal) || props.order.order_number || props.order.id}>
                <div class="text-[10px] text-muted-foreground flex items-center gap-1.5 truncate mt-0.5">
                  <Show when={props.order.order_number || props.order.id}>
                    <span class="font-mono">{props.order.order_number || props.order.id}</span>
                  </Show>
                  <Show when={typeof props.order.tanggal === 'string' && props.order.tanggal}>
                    <span>&middot; {formatDisplayDate(props.order.tanggal)}</span>
                  </Show>
                </div>
              </Show>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={!auth.can('delivery:create')}
            onClick={() => selectReadyInOrder(props.order)}
            class="text-[10px] h-6 px-2 gap-1 shrink-0"
          >
            <IconCheck class="size-2.5 text-primary" />
            <span>{t('status.ready')}</span>
          </Button>
        </div>

        <table class="w-full text-right text-xs border-collapse">
          <thead>
            <tr class="border-b bg-muted/20 text-muted-foreground text-[10px]">
              <th class="py-2 px-2.5 w-8 text-center">{t('deliveryFlow.pick')}</th>
              <th class="py-2 px-2 w-full text-left">{t('deliveryFlow.itemName')}</th>
              <th class="py-2 px-2.5 w-24 whitespace-nowrap text-right">{t('deliveryFlow.remoteRemaining')}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border">
            <For each={eligibleItems()}>
              {(item) => {
                const key = makeItemKey(props.order, item);
                const isSelected = () => draftItems().has(key);
                const remaining = getItemRemainingQty(item);
                const activeRunInfo = () => activeRunItemKeys().get(key);
				const isClientPending = () => (item.status_order || '').trim().toUpperCase() === ORDER_STATUS.PENDING;

                return (
                  <tr
                    onClick={() => toggleItemSelection(props.order, item)}
                    class={cn(
                      'transition-colors cursor-pointer select-none',
                      isSelected() ? 'bg-muted' : isClientPending() ? 'bg-status-pending/5' : 'hover:bg-muted/40'
                    )}
                  >
                    <td class="py-2.5 px-2.5 w-8 text-center" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        disabled={!auth.can('delivery:create')}
                        checked={isSelected()}
                        onChange={() => toggleItemSelection(props.order, item)}
                        class="size-4 rounded text-primary focus:ring-ring cursor-pointer align-middle"
                      />
                    </td>
                    <td class="py-2.5 px-2 w-full text-left">
                      <div class="font-medium text-xs text-foreground leading-tight">{item.nama_barang}</div>
                      <div class="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        <Badge
                          status={item.status_barang || '-'}
                          kind="item"
                          pill
                          class="text-[9.5px] font-bold px-2 py-0 h-4 leading-none"
                        />
                        <Badge
                          status={item.status_order || '-'}
                          pill
                          class="text-[9.5px] font-bold px-2 py-0 h-4 leading-none"
                        />
                        <Show when={activeRunInfo()}>
                          <span class="inline-flex items-center gap-1 text-[9.5px] font-bold px-2 py-0 h-4 leading-none rounded-full bg-status-pending/15 text-status-pending border border-status-pending/30">
                            <IconTruckDelivery class="size-2.5" />
                            <span>{t('deliveryFlow.inRunBadgeShort', { runId: activeRunInfo()!.runId, qty: activeRunInfo()!.plannedQty })}</span>
                          </span>
                        </Show>
                        <Show when={item.keterangan || item.catatan || isClientPending()}>
                          <span class="text-status-pending text-[10px] font-medium truncate max-w-[130px] flex items-center gap-1">
                            <IconAlertTriangle class="size-2.5 shrink-0" />
                            <span>{item.keterangan || item.catatan || t('deliveryFlow.clientDelayRequest')}</span>
                          </span>
                        </Show>
                      </div>
                    </td>
                    <td class="py-2.5 px-2.5 w-24 whitespace-nowrap text-right text-xs tabular-nums">
                      <span class="font-bold text-foreground">{remaining}</span>
                      <span class="text-[10px] text-muted-foreground font-normal"> / {item.jumlah || '0'} {item.satuan}</span>
                    </td>
                  </tr>
                );
              }}
            </For>
          </tbody>
        </table>
      </div>
    );
  };


  // The B4 Floating Pill Dock with Integrated Filter Drawer
  const FloatingDock = () => (
    <>
      <Show when={dockFilterOpen()}>
        <div class="df-dock-backdrop no-print" onClick={() => setDockFilterOpen(false)} />
      </Show>
      <div class="fixed bottom-2 left-2 right-2 z-40 p-3.5 sm:p-4 rounded-2xl border bg-card/98 backdrop-blur-md shadow-2xl no-print">
        {/* Integrated Filter Drawer Content (Hidden by default) */}
        <Show when={dockFilterOpen()}>
          <div class="mb-3 p-3 rounded-xl border bg-background shadow-inner animate-[card-enter_200ms_ease-out_both] space-y-3">
            <div class="flex items-center justify-between">
              <span class="font-bold text-xs text-foreground flex items-center gap-1.5">
                <IconAdjustmentsHorizontal class="size-3.5 text-primary" />
                <span>{t('deliveryFlow.dockFilterTitle')}</span>
              </span>
              <button
                type="button"
                onClick={() => setDockFilterOpen(false)}
                class="size-5 inline-flex items-center justify-center rounded-full hover:bg-muted text-muted-foreground"
              >
                <IconX class="size-3" />
              </button>
            </div>

            {/* Search Text Filter */}
            <div class="relative w-full">
              <IconSearch class="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder={t('deliveryFlow.searchOrdersPlaceholder')}
                value={searchTerm()}
                onInput={(e) => setSearchTerm(e.currentTarget.value)}
                class="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg border bg-background focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <Show when={searchTerm()}>
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  class="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  title={t('deliveryFlow.clearSearch')}
                >
                  <IconX class="size-3" />
                </button>
              </Show>
            </div>

            {/* Quick Readiness Toggles */}
            <div class="grid grid-cols-2 gap-1.5 text-[11px]">
              <button
                type="button"
                onClick={() => setReadyInWarehouseOnly(!readyInWarehouseOnly())}
                class={cn(
                  'p-2 rounded-lg border text-left flex items-center justify-between',
                  readyInWarehouseOnly()
                    ? 'border-status-selesai bg-status-selesai/10 font-bold text-status-selesai'
                    : 'bg-muted/40 text-muted-foreground'
                )}
              >
                <span>{t('status.stokGudang')}</span>
                <Show when={readyInWarehouseOnly()}><IconCheck class="size-3 text-status-selesai" /></Show>
              </button>
              <button
                type="button"
                onClick={() => setIncludeClientHold(!includeClientHold())}
                class={cn(
                  'p-2 rounded-lg border text-left flex items-center justify-between',
                  includeClientHold()
                    ? 'border-status-pending bg-status-pending/10 font-bold text-status-pending'
                    : 'bg-muted/40 text-muted-foreground'
                )}
              >
                <span>{t('deliveryFlow.clientHold')}</span>
                <Show when={includeClientHold()}><IconCheck class="size-3 text-status-pending" /></Show>
              </button>
            </div>

            {/* NTB Area Grid */}
            <div class="space-y-1">
              <div class="flex items-center justify-between text-xs">
                <span class="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{t('deliveryFlow.selectRegion')}</span>
                <Show when={selectedAreaFilter() && auth.can('delivery:create')}>
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedAreaFilter()) selectReadyInArea(selectedAreaFilter()!);
                    }}
                    class="text-[10px] font-bold text-primary hover:underline"
                  >
                    {t('deliveryFlow.addSelectReadyInArea', { area: formatAreaLabel(selectedAreaFilter() ?? '') })}
                  </button>
                </Show>
              </div>
              <div class="grid grid-cols-2 gap-1.5 max-h-36 overflow-y-auto pr-0.5">
                <button
                  type="button"
                  onClick={() => setSelectedAreaFilter(null)}
                  class={cn(
                    'p-2 rounded-lg border text-left text-xs transition-all',
                    !selectedAreaFilter()
                      ? 'border-primary bg-primary text-primary-foreground font-bold'
                      : 'bg-muted/30 text-muted-foreground hover:bg-muted'
                  )}
                >
                  {t('deliveryFlow.allAreas')}
                </button>
                <For each={areaGroups()}>
                  {(grp) => (
                    <button
                      type="button"
                      onClick={() => setSelectedAreaFilter(selectedAreaFilter() === grp.area ? null : grp.area)}
                      class={cn(
                        'p-2 rounded-lg border text-left text-xs transition-all flex flex-col justify-between',
                        selectedAreaFilter() === grp.area
                          ? 'border-primary bg-primary text-primary-foreground font-bold'
                          : 'bg-muted/30 text-muted-foreground hover:bg-muted'
                      )}
                    >
                      <span class="truncate">{formatAreaLabel(grp.area)}</span>
                      <span class="text-[10px] opacity-80">{t('deliveryFlow.readyItemsShort', { count: grp.readyItemsCount })}</span>
                    </button>
                  )}
                </For>
              </div>
            </div>
          </div>
        </Show>

        {/* Dock Controls */}
        <div class="flex items-center justify-between text-xs mb-2.5">
          <span class="text-xs text-muted-foreground">
            <strong class="text-foreground font-semibold">{draftStats().totalItems}</strong> {t('deliveryFlow.selectedItemsCount', { count: draftStats().totalItems, units: draftStats().totalPlannedUnits })}
          </span>
          <Show when={draftStats().totalItems > 0}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { if (auth.can('delivery:create')) setDraftItems(new Map()); }}
              class="h-6.5 px-2 text-[11px] text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive gap-1 rounded-lg"
            >
              <IconTrash class="size-3" />
              <span>{t('deliveryFlow.clearSelection')}</span>
            </Button>
          </Show>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDockFilterOpen(!dockFilterOpen())}
            class={cn(
              'text-xs h-10 gap-1.5 rounded-xl font-medium transition-all',
              dockFilterOpen() && 'border-primary ring-1 ring-primary/30 bg-primary/5'
            )}
          >
            <IconFilter class="size-3.5 text-muted-foreground" />
            <span>{t('deliveryFlow.filters')}</span>
            <Show when={enabledFilterCount() > 0}>
              <span class="inline-flex items-center justify-center h-[18px] min-w-[18px] px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold tabular-nums leading-none shrink-0 shadow-xs">
                {enabledFilterCount()}
              </span>
            </Show>
            <IconChevronDown class={cn('size-3.5 text-muted-foreground transition-transform duration-200', dockFilterOpen() && 'rotate-180')} />
          </Button>
          <Button
            size="sm"
            disabled={!auth.can('delivery:create') || draftStats().totalItems === 0}
            onClick={openDraftInRuns}
            class="text-xs h-10 gap-1.5 rounded-xl font-semibold"
          >
            <span>{t('deliveryFlow.continueToDispatch')}</span>
            <IconArrowRight class="size-3.5" />
          </Button>
        </div>
      </div>
    </>
  );

  const fieldInputClass =
    'h-9 lg:h-8 w-full min-w-0 max-w-full rounded-md border border-input bg-background px-2.5 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50';
  const insetFocusClass =
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring';
  const runStatusClasses: Record<string, string> = {
    [DELIVERY_RUN_STATUS.PLANNED]: 'bg-muted text-muted-foreground border-border',
    [DELIVERY_RUN_STATUS.PICKING]: 'bg-status-proses/15 text-status-proses border-status-proses/30',
    [DELIVERY_RUN_STATUS.READY]: 'bg-status-selesai/15 text-status-selesai border-status-selesai/30',
    [DELIVERY_RUN_STATUS.DISPATCHED]: 'bg-primary/10 text-foreground border-primary/30',
    [DELIVERY_RUN_STATUS.COMPLETED]: 'bg-status-selesai/15 text-status-selesai border-status-selesai/30',
  };
  const runStatusFlow: readonly DeliveryRunStatus[] = [
    DELIVERY_RUN_STATUS.PLANNED,
    DELIVERY_RUN_STATUS.PICKING,
    DELIVERY_RUN_STATUS.READY,
    DELIVERY_RUN_STATUS.DISPATCHED,
    DELIVERY_RUN_STATUS.COMPLETED,
  ];
  const runFeedFilters = ['ALL', ...runStatusFlow] as const;
  const ActiveFilter: Component<{ label: string; onRemove: () => void }> = (props) => (
    <Button
      type="button"
      size="sm"
      variant="outline"
      class="h-7 min-w-0 max-w-full gap-1 rounded-full bg-muted/35 px-2.5 text-xs"
      title={props.label}
      aria-label={t('deliveryFlow.removeFilter', { label: props.label })}
      onClick={props.onRemove}
    >
      <span class="truncate">{props.label}</span>
      <IconX aria-hidden="true" />
    </Button>
  );

  const RunFeed = () => (
    <>
      <div class="grid min-w-0 gap-2">
        <div class="relative min-w-0">
          <IconSearch aria-hidden="true" class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <input
            type="search"
            aria-label={t('deliveryFlow.searchRunsPlaceholder')}
            placeholder={t('deliveryFlow.searchRunsPlaceholder')}
            value={runSearchQuery()}
            onInput={(e) => setRunSearchQuery(e.currentTarget.value)}
            class={cn(fieldInputClass, 'h-8 pl-8 [&::-webkit-search-cancel-button]:hidden', runSearchQuery() && 'pr-7')}
          />
          <Show when={runSearchQuery()}>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              class="absolute right-0.5 top-1/2 -translate-y-1/2 size-7"
              aria-label={t('deliveryFlow.clearSearch')}
              onClick={() => setRunSearchQuery('')}
            >
              <IconX aria-hidden="true" class="size-3.5" />
            </Button>
          </Show>
        </div>
        <div class="flex flex-wrap gap-1" aria-label={t('deliveryFlow.runStatusLabel')} role="group">
          <For each={runFeedFilters}>
            {(st) => (
              <Button
                type="button"
                variant={runStatusFilter() === st ? 'default' : 'outline'}
                size="sm"
                class="h-7 px-2 text-[11px] tracking-wide"
                aria-pressed={runStatusFilter() === st}
                onClick={() => setRunStatusFilter(st)}
              >
                {getRunStatusLabel(st)}
              </Button>
            )}
          </For>
        </div>
      </div>

      <Show when={draftItems().size > 0}>
        <button
          type="button"
          aria-pressed={isDraft()}
          class={cn(
            'flex min-h-14 w-full min-w-0 items-center gap-2.5 rounded-lg border border-dashed border-primary/50 bg-muted/40 p-2.5 text-left transition-colors hover:bg-muted animate-[card-enter_200ms_ease-out_both] motion-reduce:animate-none',
            insetFocusClass,
            isDraft() && 'border-primary bg-muted'
          )}
          onClick={openDraftInRuns}
        >
          <span class="grid size-9 shrink-0 place-items-center rounded-md border bg-background">
            <IconFilePlus class="size-5" aria-hidden="true" />
          </span>
          <span class="min-w-0 flex-1">
            <span class="block text-sm font-semibold">{t('deliveryFlow.pendingDraft')}</span>
            <span class="block text-xs text-muted-foreground">
              {t('deliveryFlow.itemsReadyToConfigure', { count: draftItems().size })}
            </span>
          </span>
          <IconChevronRight aria-hidden="true" class="size-4 shrink-0 text-muted-foreground" />
        </button>
      </Show>

      <For
        each={filteredRunIds()}
        fallback={
          <p class="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
            {t('deliveryFlow.noMatchingRuns')}
          </p>
        }
      >
        {(runId, index) => {
          const run = () => runsById().get(runId);
          return (
            <Show when={run()}>
              {(currentRun) => {
                const total = () => currentRun().total_items || currentRun().items?.length || 0;
                const picked = () =>
                  currentRun().picked_items ?? (currentRun().items || []).filter((it) => it.picked).length;
                const pct = () => (total() > 0 ? Math.round((picked() / total()) * 100) : 0);
                const vehicle = () => getDriverVehicle(currentRun().driver_id, currentRun().driver_name);
                const statusKey = () => (currentRun().status || DELIVERY_RUN_STATUS.PLANNED).toUpperCase();
                const isSelected = () => !isDraft() && pickedRun()?.id === runId;

                return (
                  <button
                    type="button"
                    aria-pressed={isSelected()}
                    class={cn(
                      'group w-full min-w-0 rounded-lg border bg-card p-3 text-left transition-all hover:border-primary/50 hover:bg-muted/40 animate-[card-enter_200ms_ease-out_both] motion-reduce:animate-none',
                      insetFocusClass,
                      isSelected() && 'border-primary bg-primary/5 ring-1 ring-primary/20'
                    )}
                    style={{ "animation-delay": `${Math.min(index(), 8) * 35}ms` }}
                    onClick={() => selectRunInWorkspace(runId)}
                  >
                    <span class="flex min-w-0 flex-wrap items-center justify-between gap-1.5">
                      <span class="flex min-w-0 items-center gap-1.5">
                        <span class="font-mono text-xs font-semibold tabular-nums text-muted-foreground">#{currentRun().id}</span>
                        <Show when={currentRun().delivery_date}>
                          <span class="text-[11px] text-muted-foreground tabular-nums">
                            &middot; {formatDisplayDate(currentRun().delivery_date)}
                          </span>
                        </Show>
                      </span>
                      <Badge status={statusKey()} class={runStatusClasses[statusKey()] || ''} />
                    </span>
                    <span class="mt-1.5 flex min-w-0 items-center gap-2">
                      <span class="min-w-0 flex-1 break-words text-xs font-bold leading-snug text-foreground">
                        {currentRun().title || t('deliveryFlow.runIdFallback', { id: currentRun().id ?? '' })}
                      </span>
                      <IconChevronRight aria-hidden="true" class="size-3.5 shrink-0 text-muted-foreground" />
                    </span>
                    <span class="mt-1.5 flex min-w-0 items-start gap-1.5 text-[11px] text-muted-foreground">
                      <IconTruck class="size-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                      <span class="min-w-0 break-words">
                        {currentRun().driver_name || t('deliveryFlow.unassigned')}
                        <Show when={vehicle()}>
                          <span class="text-muted-foreground"> ({vehicle()})</span>
                        </Show>
                      </span>
                    </span>
                    <span class="mt-1 flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                      <IconMapPin class="size-3.5 shrink-0" aria-hidden="true" />
                      <span class="min-w-0 break-words">
                        {(currentRun().areas || []).length > 0 ? currentRun().areas!.map(formatAreaLabel).join(' / ') : '-'}
                      </span>
                    </span>
                    <span class="mt-2 block min-w-0 space-y-1">
                      <span class="flex flex-wrap items-baseline justify-between gap-x-2 text-[11px]">
                        <span class="font-medium text-muted-foreground">{t('deliveryFlow.pickPicked')}</span>
                        <span class="font-mono font-semibold tabular-nums text-foreground">
                          {picked()}/{total()}
                        </span>
                      </span>
                      <span
                        role="progressbar"
                        aria-label={t('deliveryFlow.pickingProgress', { picked: picked(), total: total() })}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={pct()}
                        class="block h-1.5 overflow-hidden rounded-full bg-muted"
                      >
                        <span
                          class={cn(
                            'block h-full rounded-full transition-[width] motion-reduce:transition-none',
                            pct() === 100 ? 'bg-status-selesai' : 'bg-primary'
                          )}
                          style={{ width: `${pct()}%` }}
                        />
                      </span>
                    </span>
                  </button>
                );
              }}
            </Show>
          );
        }}
      </For>
    </>
  );

  const DispatchSetup = () => {
    const currentDate = () => (isDraft() ? deliveryDate() : pickedRun()?.delivery_date || '');
    const currentTitle = () => (isDraft() ? runTitle() : pickedRun()?.title || '');
    const currentNotes = () => (isDraft() ? runNotes() : pickedRun()?.notes || '');

    return (
      <div class="grid min-w-0 gap-3.5">
        <Show when={auth.canAny('driver:read', 'driver:create')}>
        <section class="min-w-0 space-y-2" aria-label={t('deliveryFlow.driverWorkload')}>
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h3 class="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('deliveryFlow.driverWorkload')}</h3>
            <Button type="button" variant="outline" size="sm" class="h-8 lg:h-7 px-2 text-xs gap-1" onClick={() => setShowDriverModal(true)}>
              <IconUsers class="size-3.5" aria-hidden="true" />
              <span>{t(auth.can('driver:read') ? 'deliveryFlow.roster' : 'deliveryFlow.addDriver')}</span>
            </Button>
          </div>
          <Show when={auth.can('driver:read')}>
          <div class="grid min-w-0 gap-1.5">
            <For
              each={driverWorkloads()}
              fallback={
                <p class="rounded-md border p-2.5 text-xs text-muted-foreground">
                  {t('deliveryFlow.noActiveDrivers')}
                </p>
              }
            >
              {(wl) => {
                const isSelected = () => activeDriverId() === wl.driver.id;
                return (
                  <button
                    type="button"
                    aria-pressed={isSelected()}
                    disabled={!canEditWorkspace()}
                    class={cn(
                      'grid min-h-12 min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md border px-2.5 py-2 text-left transition-colors hover:bg-muted',
                      insetFocusClass,
                      isSelected() && 'border-primary/50 bg-primary/5 ring-1 ring-primary/20'
                    )}
                    onClick={() => handleAssignRunDriver(wl.driver.id ?? null)}
                  >
                    <span class="min-w-0">
                      <span class="block break-words text-xs font-semibold">{wl.driver.name}</span>
                      <Show when={wl.driver.vehicle}>
                        <span class="inline-flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
                          <IconTruck class="size-3 shrink-0" aria-hidden="true" />
                          <span class="truncate font-mono">{wl.driver.vehicle}</span>
                        </span>
                      </Show>
                      <Show when={wl.areas.length > 0}>
                        <span class="block break-words text-[11px] text-muted-foreground">
                          {wl.areas.map(formatAreaLabel).join(' / ')}
                        </span>
                      </Show>
                    </span>
                    <span class="flex items-center gap-1 text-right text-xs font-medium text-muted-foreground">
                      <Show when={isSelected()}>
                        <IconCheck class="size-4 shrink-0 text-foreground" aria-label={t('deliveryFlow.assigned')} />
                      </Show>
                      <span class="tabular-nums">
                        {wl.runsCount === 0
                          ? t('deliveryFlow.available')
                          : t('deliveryFlow.runsCount', { count: wl.runsCount })}
                      </span>
                    </span>
                  </button>
                );
              }}
            </For>
          </div>
          </Show>
        </section>
        </Show>
          <Show when={canEditWorkspace() && activeDriverId() !== null}>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              class="h-8 lg:h-7 px-2 text-xs"
              onClick={() => handleAssignRunDriver(null)}
            >
              {t('deliveryFlow.clearAssignment')}
            </Button>
          </Show>

        <label class="grid min-w-0 gap-1 text-xs font-medium text-muted-foreground">
          {t('deliveryFlow.dispatchDateLabel')}
          <input
            type="date"
            class={fieldInputClass}
            disabled={!canEditWorkspace()}
            required
            value={currentDate()}
            onChange={(e) => handleUpdateRunDate(e.currentTarget.value)}
          />
        </label>

        <label class="grid min-w-0 gap-1 text-xs font-medium text-muted-foreground">
          {t('deliveryFlow.runTitleLabel')}
          <input
            type="text"
            disabled={!canEditWorkspace()}
            class={fieldInputClass}
            value={currentTitle()}
            placeholder={t('deliveryFlow.runTitlePlaceholder')}
            onInput={(e) => {
              if (isDraft() && canEditWorkspace()) setRunTitle(e.currentTarget.value);
            }}
            onChange={(e) => {
              if (!isDraft()) handleUpdateRunTitle(e.currentTarget.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
          />
        </label>

        <label class="grid min-w-0 gap-1 text-xs font-medium text-muted-foreground">
          {t('deliveryFlow.routeNotesLabel')}
          <textarea
            class={cn(fieldInputClass, 'min-h-16 h-auto py-1.5')}
            rows={2}
            disabled={!canEditWorkspace()}
            value={currentNotes()}
            onInput={(e) => {
              if (isDraft() && canEditWorkspace()) setRunNotes(e.currentTarget.value);
            }}
            onChange={(e) => {
              if (!isDraft()) handleUpdateRunNotes(e.currentTarget.value);
            }}
          />
        </label>
      </div>
    );
  };

  const ItemFilters = () => {
    const groupOptions = () =>
      [
        ['destination', t('deliveryFlow.groupDestination')],
        ['none', t('deliveryFlow.groupNone')],
      ] as const;
    const pickOptions = () =>
      [
        ['all', t('deliveryFlow.pickAll')],
        ['to-pick', t('deliveryFlow.pickToPick')],
        ['picked', t('deliveryFlow.pickPicked')],
      ] as const;

    return (
      <>
        <fieldset class="min-w-0">
          <legend class="mb-1 text-xs font-medium text-muted-foreground">{t('deliveryFlow.groupBy')}</legend>
          <div class="flex flex-wrap gap-1">
            <For each={groupOptions()}>
              {(option) => (
                <Button
                  type="button"
                  size="sm"
                  variant={runsGroupBy() === option[0] ? 'default' : 'outline'}
                  class="h-8 lg:h-7 px-2.5 text-xs"
                  aria-pressed={runsGroupBy() === option[0]}
                  onClick={() => setRunsGroupBy(option[0])}
                >
                  {option[1]}
                </Button>
              )}
            </For>
          </div>
        </fieldset>

        <Show when={!isDraft()}>
          <fieldset class="min-w-0">
            <legend class="mb-1 text-xs font-medium text-muted-foreground">{t('deliveryFlow.pickStatus')}</legend>
            <div class="flex flex-wrap gap-1">
              <For each={pickOptions()}>
                {(option) => (
                  <Button
                    type="button"
                    size="sm"
                    variant={runsPickFilter() === option[0] ? 'default' : 'outline'}
                    class="h-8 lg:h-7 px-2.5 text-xs"
                    aria-pressed={runsPickFilter() === option[0]}
                    onClick={() => setRunsPickFilter(option[0])}
                  >
                    {option[1]}
                  </Button>
                )}
              </For>
            </div>
          </fieldset>
        </Show>

        <Show when={workspaceDestinations().size > 1 || runsDestinationFilter()}>
          <label class="grid min-w-0 flex-1 basis-48 gap-1 text-xs font-medium text-muted-foreground">
            {t('deliveryFlow.destinationLabel')}
            <select
              class={fieldInputClass}
              value={runsDestinationFilter()}
              onChange={(e) => setRunsDestinationFilter(e.currentTarget.value)}
            >
              <option value="">{t('deliveryFlow.allDestinations')}</option>
              <For each={[...workspaceDestinations().keys()]}>
                {(key) => <option value={key}>{workspaceDestinations().get(key)}</option>}
              </For>
            </select>
          </label>
        </Show>

        <Show when={enabledRunsFilterCount() > 0}>
          <Button type="button" variant="ghost" size="sm" class="h-8 lg:h-7 px-2 text-xs" onClick={resetRunsItemFilters}>
            {t('deliveryFlow.resetFilters')}
          </Button>
        </Show>
      </>
    );
  };

  const WorkspaceItemRow: Component<{ itemKey: string }> = (props) => {
    const item = () => activeWorkspaceItemMap().get(props.itemKey);

    return (
      <Show when={item()}>
        {(current) => {
          const expanded = () => runsEditAll() || editingItemKey() === props.itemKey;
          const maxAllowed = () => Math.max(1, current().belum_terkirim || current().jumlah || current().planned_qty);
          const canTogglePick = () => auth.can('delivery:pick') && !isDraft() && pickedRun()?.id && current().id !== undefined;

          const rowContents = () => (
            <>
              <Show when={canTogglePick()}>
                <span
                  class={cn(
                    'grid size-6 shrink-0 place-items-center rounded-md border border-input bg-background',
                    current().picked && 'border-primary bg-primary text-primary-foreground'
                  )}
                  aria-hidden="true"
                >
                  <Show when={current().picked}>
                    <IconCheck class="size-4" />
                  </Show>
                </span>
              </Show>
              <span class="min-w-0 flex-1">
                <span class={cn('block break-words text-xs sm:text-[13px] font-medium', current().picked && 'line-through text-muted-foreground')}>
                  {current().nama_barang}
                </span>
                <Show when={runsGroupBy() === 'none'}>
                  <span class="mt-0.5 block break-words text-[11px] font-medium text-muted-foreground">
                    {current().customer}
                    <Show when={current().area}> &middot; {formatAreaLabel(current().area)}</Show>
                  </span>
                  <Show when={current().order_number}>
                    <span class="block break-words font-mono text-[11px] text-muted-foreground">
                      {current().order_number}
                    </span>
                  </Show>
                </Show>
                <Show when={current().note && !expanded()}>
                  <span class="mt-0.5 block break-words text-[11px] text-muted-foreground">{current().note}</span>
                </Show>
              </span>
              <span class="max-w-[30%] shrink-0 break-words text-right text-xs text-muted-foreground">
                <span class="font-mono text-xs sm:text-sm font-semibold tabular-nums text-foreground">{current().planned_qty}</span>{' '}
                <span class="font-mono tabular-nums">/ {current().jumlah}</span> {current().satuan}
              </span>
            </>
          );

          const rowClass = 'flex min-h-12 min-w-0 flex-1 items-center gap-2.5 px-3 py-2 text-left';
          return (
            <li class="@container min-w-0">
              <div class="flex min-w-0 items-center">
                <Show when={canTogglePick()} fallback={<div class={rowClass}>{rowContents()}</div>}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={current().picked}
                    class={cn(rowClass, 'hover:bg-muted/50', insetFocusClass)}
                    onClick={() => handleTogglePick(pickedRun()!.id!, current().id!, current().picked)}
                  >
                    {rowContents()}
                  </button>
                </Show>
                <Show when={canEditWorkspace() && !runsEditAll()}>
                  <Button
                    type="button"
                    variant={expanded() ? 'secondary' : 'ghost'}
                    size="icon"
                    class="mr-1.5 size-8 sm:size-9 shrink-0"
                    aria-expanded={expanded()}
                    aria-label={expanded() ? t('deliveryFlow.doneEditing') : t('deliveryFlow.editQty')}
                    onClick={() => { if (canEditWorkspace()) setEditingItemKey(expanded() ? undefined : props.itemKey); }}
                  >
                    <Show when={expanded()} fallback={<IconPencil class="size-4" aria-hidden="true" />}>
                      <IconCheck class="size-4" aria-hidden="true" />
                    </Show>
                  </Button>
                </Show>
              </div>
              <Show when={canEditWorkspace() && expanded()}>
                <div class="min-w-0 space-y-2 px-3 pb-3 animate-[card-enter_200ms_ease-out_both] motion-reduce:animate-none">
                  <p class="flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                    <span>
                      {t('deliveryFlow.remainingLabel')}:{' '}
                      <span class="font-mono tabular-nums">{current().belum_terkirim}</span> {current().satuan}
                    </span>
                    <span aria-hidden="true">&middot;</span>
                    <span>
                      {t('deliveryFlow.requestedLabel')}:{' '}
                      <span class="font-mono tabular-nums">{current().jumlah}</span> {current().satuan}
                    </span>
                  </p>
                  <div class="grid min-w-0 gap-2 @min-[32rem]:grid-cols-[auto_minmax(0,1fr)] @min-[32rem]:items-end">
                    <div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <div class="flex shrink-0 items-center rounded-md border bg-background">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          class="size-9 rounded-r-none"
                          aria-label={t('deliveryFlow.decreaseQty')}
                          disabled={current().planned_qty <= 1}
                          onClick={() => handleUpdateItemQty(current(), current().planned_qty - 1)}
                        >
                          <IconMinus class="size-3.5" aria-hidden="true" />
                        </Button>
                        <input
                          type="text"
                          inputmode="numeric"
                          pattern="[0-9]*"
                          aria-label={t('deliveryFlow.qtyToDeliver')}
                          class={cn('h-9 w-12 border-x bg-transparent px-1 text-center font-mono text-xs sm:text-sm tabular-nums', insetFocusClass)}
                          value={current().planned_qty}
                          onFocus={(e) => e.currentTarget.select()}
                          onChange={(e) => {
                            const input = e.currentTarget;
                            if (/^\d+$/.test(input.value.trim())) {
                              handleUpdateItemQty(current(), Number(input.value));
                            }
                            input.value = String(current().planned_qty);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') e.currentTarget.blur();
                          }}
                        />
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          class="size-9 rounded-l-none"
                          aria-label={t('deliveryFlow.increaseQty')}
                          disabled={current().planned_qty >= maxAllowed()}
                          onClick={() => handleUpdateItemQty(current(), current().planned_qty + 1)}
                        >
                          <IconPlus class="size-3.5" aria-hidden="true" />
                        </Button>
                      </div>
                      <span class="text-xs text-muted-foreground">{current().satuan}</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        class="h-9 px-2.5 text-xs"
                        disabled={current().planned_qty >= maxAllowed()}
                        aria-label={t('deliveryFlow.fillRemainingQty')}
                        onClick={() => handleUpdateItemQty(current(), maxAllowed())}
                      >
                        {t('deliveryFlow.maxQty')}
                      </Button>
                    </div>
                    <div class="flex min-w-0 items-center gap-1.5">
                      <input
                        type="text"
                        class={cn(fieldInputClass, 'h-9 lg:h-8')}
                        aria-label={t('deliveryFlow.pickingNote')}
                        placeholder={t('deliveryFlow.pickingNote')}
                        value={current().note}
                        onInput={(e) => {
                          if (isDraft()) handleUpdateItemNote(current(), e.currentTarget.value);
                        }}
                        onChange={(e) => {
                          if (!isDraft()) handleUpdateItemNote(current(), e.currentTarget.value);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') e.currentTarget.blur();
                        }}
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        class="size-9 shrink-0"
                        disabled={!isDraft() && activeWorkspaceItems().length <= 1}
                        aria-label={t('common.delete')}
                        onClick={() => handleRemoveWorkspaceItem(current())}
                      >
                        <IconTrash class="size-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                </div>
              </Show>
            </li>
          );
        }}
      </Show>
    );
  };
  return (
    <div class="space-y-4">
      {/* Tab Navigation */}
      <Tabs
        value={activeTab()}
        onChange={(val) => {
          setSearchParams({ tab: val });
          setDockFilterOpen(false);
          setRunsDockPanel(null);
        }}
        class="w-full no-print"
      >
        <TabsList class="flex-wrap h-auto gap-1">
          <TabsTrigger value="plan" class="gap-2 text-xs h-8">
            <IconListCheck class="size-4" />
            <span>{t('deliveryFlow.tabPlan')}</span>
          </TabsTrigger>
          <TabsTrigger value="runs" class="gap-2 text-xs h-8">
            <IconBuildingWarehouse class="size-4" />
            <span>{t('deliveryFlow.tabRunsDispatch')}</span>
            <Show when={(runsData()?.runs?.length || 0) > 0}>
              <span class="inline-flex items-center justify-center h-[18px] min-w-5 px-1.5 text-[10px] leading-none font-bold rounded bg-muted text-muted-foreground tabular-nums">
                {runsData()?.runs?.length}
              </span>
            </Show>
            <Show when={draftItems().size > 0}>
              <span class="rounded-full border border-dashed border-primary/60 px-1.5 py-0.2 text-[10px] font-semibold leading-tight text-foreground">
                {t('deliveryFlow.draftBadge')}
              </span>
            </Show>
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <Show when={auth.canAny('driver:read', 'driver:create') && (activeTab() === 'plan' || !canEditWorkspace() || (!isDraft() && !pickedRun()))}>
        <Button type="button" variant="outline" size="sm" class="gap-1 no-print" onClick={() => setShowDriverModal(true)}>
          <IconUsers class="size-3.5" aria-hidden="true" />
          {t(auth.can('driver:read') ? 'deliveryFlow.roster' : 'deliveryFlow.addDriver')}
        </Button>
      </Show>
        {/* TAB 1: PLAN DELIVERY (Orders Main Content + Floating Right Sidebar) */}
        <Show when={activeTab() === 'plan'}>
          <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* MAIN CONTENT: ORDERS LIST */}
            <div
              class={cn(
                'space-y-4',
                isMobile() ? 'col-span-1 pb-32' : 'lg:col-span-8'
              )}
            >
              {/* Main Content Sub-Header Toolbar */}
              <Show
                when={isMobile()}
                fallback={
                  /* Desktop Toolbar */
                  <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg border bg-card">
                    <div class="flex items-center gap-2">
                      <span class="text-sm font-bold text-foreground">{t('deliveryFlow.candidateOrders')}</span>
                      <span class="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-semibold">
                        {t('deliveryFlow.ordersCount', { count: visibleOrders().length })}
                      </span>
                      <Show when={selectedAreaFilter()}>
                        <div class="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-primary/15 text-primary font-medium">
                          <span>{t('deliveryFlow.areaChip', { area: formatAreaLabel(selectedAreaFilter() ?? '') })}</span>
                          <button
                            type="button"
                            onClick={() => setSelectedAreaFilter(null)}
                            class="hover:text-foreground"
                            title={t('deliveryFlow.clearAreaFilter')}
                          >
                            <IconX class="size-3" />
                          </button>
                        </div>
                      </Show>
                    </div>

                    <div class="flex items-center gap-2 flex-wrap">
                      <div class="relative w-full sm:w-64">
                        <IconSearch class="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                        <input
                          type="text"
                          placeholder={t('deliveryFlow.searchOrdersPlaceholder')}
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
                        title={t('deliveryFlow.refreshOrders')}
                      >
                        <IconRefresh class="size-3" />
                      </Button>
                    </div>
                  </div>
                }
              >
                {/* Mobile Compact Toolbar */}
                <div class="flex items-center justify-between gap-2 p-2.5 rounded-lg border bg-card">
                  <div class="flex items-center gap-1.5 min-w-0 flex-wrap">
                    <span class="text-xs font-bold text-foreground truncate">{t('deliveryFlow.candidateOrders')}</span>
                    <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-semibold">
                      {visibleOrders().length}
                    </span>
                    <Show when={selectedAreaFilter()}>
                      <span class="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary font-medium">
                        <span class="truncate max-w-[80px]">{formatAreaLabel(selectedAreaFilter() ?? '')}</span>
                        <button type="button" onClick={() => setSelectedAreaFilter(null)}>
                          <IconX class="size-2.5" />
                        </button>
                      </span>
                    </Show>
                    <Show when={searchTerm()}>
                      <span class="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                        <span class="truncate max-w-[80px]">"{searchTerm()}"</span>
                        <button type="button" onClick={() => setSearchTerm('')}>
                          <IconX class="size-2.5" />
                        </button>
                      </span>
                    </Show>
                  </div>

                  <div class="flex items-center gap-1.5 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        refetchCandidates();
                        refetchRuns();
                      }}
                      class="h-7 w-7 p-0 shrink-0"
                      title={t('deliveryFlow.refreshOrders')}
                    >
                      <IconRefresh class="size-3" />
                    </Button>
                  </div>
                </div>
              </Show>

              {/* Desktop Bulk Selection Bar (hidden on mobile, replaced by floating dock) */}
              <Show when={!isMobile() && auth.can('delivery:create')}>
                <div class="df-bulk-segmented">
                  <div class="df-seg-metrics">
                    <span class="df-metric-chip">
                      <span>{t('common.orders')}</span>
                      <strong>{draftStats().totalOrders}</strong>
                    </span>
                    <span class="df-metric-chip">
                      <span>{t('deliveryFlow.selected')}</span>
                      <strong>{draftStats().totalItems}</strong>
                    </span>
                    <span class="df-metric-chip">
                      <span>{t('deliveryFlow.units')}</span>
                      <strong>{draftStats().totalPlannedUnits}</strong>
                    </span>
                  </div>
                  <div class="df-btn-row" role="group" aria-label={t('deliveryFlow.bulkAriaLabel')}>
                    <button
                      type="button"
                      class="df-normal-btn df-normal-btn-select"
                      onClick={() => {
                        if (!auth.can('delivery:create')) return;
                        const next = new Map(draftItems());
                        for (const ord of visibleOrders()) {
                          const readyItems = (ord.items || []).filter(
                            (it) =>
                              isItemEligible(it) &&
								(it.status_barang || '').trim().toUpperCase() === STOCK_STATUS.WAREHOUSE
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
                      }}
                    >
                      <IconCheck class="size-3.5" />
                      <span>{t('deliveryFlow.selectAllReady')}</span>
                      <span class="df-btn-badge">
                        {visibleOrders().reduce(
                          (acc, ord) =>
                            acc +
                            (ord.items || []).filter(
                              (it) =>
                                isItemEligible(it) &&
								(it.status_barang || '').trim().toUpperCase() === STOCK_STATUS.WAREHOUSE
                            ).length,
                          0
                        )}
                      </span>
                    </button>
                    <button
                      type="button"
                      class="df-normal-btn df-normal-btn-clear"
                      disabled={draftStats().totalItems === 0}
                      onClick={() => { if (auth.can('delivery:create')) setDraftItems(new Map()); }}
                    >
                      <IconX class="size-3.5" />
                      <span>{t('deliveryFlow.clearSelection')}</span>
                    </button>
                  </div>
                </div>
              </Show>
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
                      <h3 class="text-sm font-semibold text-foreground">{t('deliveryFlow.noOrdersMatchFilters')}</h3>
                      <p class="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                        {t('deliveryFlow.noOrdersMatchDesc')}
                      </p>
                    </div>
                  }
                >
                  <Show
                    when={isMobile()}
                    fallback={
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
                                  disabled={!auth.can('delivery:create')}
                                  checked={orderAllSelected()}
                                  onChange={() => toggleOrderSelection(order)}
                                  class="size-4 rounded text-primary focus:ring-ring cursor-pointer"
                                  title={t('deliveryFlow.selectAllEligibleTitle')}
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
                                    <span>{t('deliveryFlow.orderNoPrefix')} <strong class="font-mono text-foreground">{order.order_number || order.id}</strong></span>
                                    <Show when={order.ecatalog_number}>
                                      <span>{t('deliveryFlow.ecatPrefix')} <span class="font-mono">{order.ecatalog_number}</span></span>
                                    </Show>
                                    <Show when={typeof order.tanggal === 'string' && order.tanggal}>
                                      <span>{t('deliveryFlow.datePrefix')} {formatDisplayDate(order.tanggal)}</span>
                                    </Show>
                                  </div>
                                </div>
                              </div>

                              <Button
                                variant="outline"
                                size="sm"
                                disabled={!auth.can('delivery:create')}
                                onClick={() => selectReadyInOrder(order)}
                                class="text-[11px] h-7 px-2.5 gap-1 self-end sm:self-auto"
                              >
                                <IconCheck class="size-3 text-primary" />
                                <span>{t('deliveryFlow.selectReadyItems')}</span>
                              </Button>
                            </div>

                            {/* Order Items Table (Stage 1: Zero Layout Shift - fixed 5 columns, no conditional inputs) */}
                            <div class="overflow-x-auto">
                              <table class="w-full text-right text-xs border-collapse">
                                <thead>
                                  <tr class="border-b bg-muted/20 text-muted-foreground text-[11px]">
                                    <th class="py-2.5 px-3 w-px whitespace-nowrap text-right">{t('deliveryFlow.pick')}</th>
                                    <th class="py-2.5 px-3 w-full text-left">{t('deliveryFlow.itemName')}</th>
                                    <th class="py-2.5 px-3 w-px whitespace-nowrap text-right">{t('deliveryFlow.stockStatus')}</th>
                                    <th class="py-2.5 px-3 w-px whitespace-nowrap text-right">{t('deliveryFlow.orderStatus')}</th>
                                    <th class="py-2.5 px-3 w-px whitespace-nowrap text-right">{t('deliveryFlow.remoteRemaining')}</th>
                                  </tr>
                                </thead>
                                <tbody class="divide-y divide-border">
                                  <For each={eligibleItems()}>
                                    {(item) => {
                                      const key = makeItemKey(order, item);
                                      const isSelected = () => draftItems().has(key);
                                      const activeRunInfo = () => activeRunItemKeys().get(key);
                                      const remaining = getItemRemainingQty(item);
								const isClientPending = () => (item.status_order || '').trim().toUpperCase() === ORDER_STATUS.PENDING;

                                      return (
                                        <tr
                                          onClick={() => toggleItemSelection(order, item)}
                                          class={cn(
                                            'transition-colors cursor-pointer select-none',
                                            isSelected()
                                              ? 'bg-muted'
                                              : isClientPending()
                                                ? 'bg-status-pending/5 hover:bg-status-pending/10'
                                                : 'hover:bg-muted/50'
                                          )}
                                        >
                                          {/* Checkbox */}
                                          <td
                                            class="py-2.5 px-3 w-px whitespace-nowrap text-right"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <input
                                              type="checkbox"
                                              disabled={!auth.can('delivery:create')}
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
                                                  {t('deliveryFlow.inRunBadge', { runId: activeRunInfo()!.runId, driver: activeRunInfo()!.driverName, qty: activeRunInfo()!.plannedQty })}
                                                </span>
                                              </Show>
                                              <Show when={item.keterangan || item.catatan || isClientPending()}>
                                                <div class="inline-flex items-center gap-1 text-[11px] text-status-pending font-medium">
                                                  <IconAlertTriangle class="size-3 shrink-0" />
                                                  <span>{item.keterangan || item.catatan || t('deliveryFlow.clientDelayRequest')}</span>
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
                }
              >
                <div class="space-y-3">
                  <For each={visibleOrders()}>
                    {(order, index) => <OrderCard order={order} index={index()} />}
                  </For>
                </div>
              </Show>
            </Show>
          </Show>
        </div>

        {/* FLOATING RIGHT SIDEBAR: FILTERS, AREAS & SELECTION SUMMARY (Col 4) */}
        <Show when={!isMobile()}>
          <div class="lg:col-span-4 space-y-4 lg:sticky lg:top-4 max-h-[calc(100vh-2rem)] overflow-y-auto pr-1 scrollbar-thin">
            <PlanSelectSidebarContent />
          </div>
        </Show>
      </div>

      {/* Persistent B4 Floating Bottom Dock with Integrated Filters */}
      <Show when={isMobile()}>
        <FloatingDock />
      </Show>
    </Show>

        {/* TAB 2: RUNS & DISPATCH (Mockup 1 Unified Workspace) */}
        <Show when={activeTab() === 'runs'}>
          <div class="min-w-0 space-y-4 pb-28 text-foreground print:hidden lg:pb-0">
            <div class="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5 items-start">
              {/* Left: Active Run Workspace (matches tab=plan main column) */}
              <div class="lg:col-span-8 min-w-0 space-y-4">
                {/* Main Content Sub-Header Toolbar (matches tab=plan) */}
                <Show
                  when={isMobile()}
                  fallback={
                    /* Desktop Toolbar */
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg border bg-card">
                      <div class="flex items-center gap-2 min-w-0">
                        <span class="text-sm font-bold text-foreground">{t('deliveryFlow.runItemsHeading')}</span>
                        <span class="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-semibold tabular-nums">
                          {t('deliveryFlow.linesCount', {
                            visible: visibleWorkspaceItems().length,
                            total: activeWorkspaceItems().length,
                          })}
                        </span>
                      </div>

                      <div class="flex items-center gap-2 flex-wrap">
                        <div class="relative w-full sm:w-64">
                          <IconSearch aria-hidden="true" class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                          <input
                            ref={runsItemSearchRef}
                            type="search"
                            aria-label={t('deliveryFlow.searchItemsOrDestination')}
                            placeholder={t('deliveryFlow.searchItemsOrDestination')}
                            value={runsItemQuery()}
                            disabled={!isDraft() && !pickedRun()}
                            onInput={(e) => setRunsItemQuery(e.currentTarget.value)}
                            class="w-full pl-8 pr-7 py-1 text-xs rounded-md border bg-background focus:outline-none focus:ring-1 focus:ring-ring [&::-webkit-search-cancel-button]:hidden disabled:opacity-50"
                          />
                          <Show when={runsItemQuery()}>
                            <button
                              type="button"
                              onClick={() => {
                                setRunsItemQuery('');
                                runsItemSearchRef.focus();
                              }}
                              class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                              aria-label={t('deliveryFlow.clearSearch')}
                              title={t('deliveryFlow.clearSearch')}
                            >
                              <IconX class="size-3" aria-hidden="true" />
                            </button>
                          </Show>
                        </div>

                        <Show
                          when={!isDraft() && auth.can('delivery:update')}
                          fallback={
                            <Show when={isDraft()}>
                              <span class="text-xs font-medium text-muted-foreground px-1">
                                {t('deliveryFlow.editingQty')}
                              </span>
                            </Show>
                          }
                        >
                          <Button
                            type="button"
                            variant={runsEditAll() ? 'secondary' : 'outline'}
                            size="sm"
                            disabled={!pickedRun()}
                            class="h-7 px-2.5 text-xs gap-1 shrink-0"
                            aria-pressed={runsEditAll()}
                            onClick={() => { if (canEditWorkspace()) setRunsEditAll((editing) => !editing); }}
                          >
                            <Show
                              when={runsEditAll()}
                              fallback={<IconPencil class="size-3" aria-hidden="true" />}
                            >
                              <IconCheck class="size-3" aria-hidden="true" />
                            </Show>
                            <span>
                              {runsEditAll() ? t('deliveryFlow.doneEditing') : t('deliveryFlow.editQty')}
                            </span>
                          </Button>
                        </Show>

                        <Button
                          type="button"
                          variant={runsFilterOpen() ? 'secondary' : 'outline'}
                          size="sm"
                          disabled={!isDraft() && !pickedRun()}
                          class="hidden lg:inline-flex h-7 px-2.5 text-xs gap-1 shrink-0"
                          aria-expanded={runsFilterOpen()}
                          aria-controls={runsFilterOpen() ? 'delivery-runs-item-filters' : undefined}
                          onClick={() => setRunsFilterOpen((open) => !open)}
                        >
                          <IconAdjustmentsHorizontal class="size-3.5" aria-hidden="true" />
                          <span>{t('deliveryFlow.filtersAndView')}</span>
                          <Show when={enabledRunsFilterCount() > 0}>
                            <span aria-hidden="true" class="size-1.5 rounded-full bg-current" />
                          </Show>
                        </Button>

                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            refetchRuns();
                            refetchCandidates();
                          }}
                          class="h-7 px-2 text-xs shrink-0"
                          aria-label={t('common.refresh')}
                          title={t('common.refresh')}
                        >
                          <IconRefresh class="size-3" aria-hidden="true" />
                        </Button>
                      </div>
                    </div>
                  }
                >
                  {/* Mobile Compact Toolbar */}
                  <div class="flex items-center gap-2 p-2.5 rounded-lg border bg-card">
                    <div class="relative flex-1 min-w-0">
                      <IconSearch aria-hidden="true" class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                      <input
                        ref={runsItemSearchRef}
                        type="search"
                        aria-label={t('deliveryFlow.searchItemsOrDestination')}
                        placeholder={t('deliveryFlow.searchItemsOrDestination')}
                        value={runsItemQuery()}
                        disabled={!isDraft() && !pickedRun()}
                        onInput={(e) => setRunsItemQuery(e.currentTarget.value)}
                        class="h-8 w-full pl-8 pr-7 text-xs rounded-md border bg-background focus:outline-none focus:ring-1 focus:ring-ring [&::-webkit-search-cancel-button]:hidden disabled:opacity-50"
                      />
                      <Show when={runsItemQuery()}>
                        <button
                          type="button"
                          onClick={() => {
                            setRunsItemQuery('');
                            runsItemSearchRef.focus();
                          }}
                          class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          aria-label={t('deliveryFlow.clearSearch')}
                          title={t('deliveryFlow.clearSearch')}
                        >
                          <IconX class="size-3" aria-hidden="true" />
                        </button>
                      </Show>
                    </div>
                    <Show when={!isDraft() && pickedRun() && auth.can('delivery:update')}>
                      <Button
                        type="button"
                        variant={runsEditAll() ? 'secondary' : 'outline'}
                        size="sm"
                        class="h-8 px-2.5 text-xs gap-1 shrink-0"
                        aria-pressed={runsEditAll()}
                        onClick={() => { if (canEditWorkspace()) setRunsEditAll((editing) => !editing); }}
                      >
                        <Show
                          when={runsEditAll()}
                          fallback={<IconPencil class="size-3.5" aria-hidden="true" />}
                        >
                          <IconCheck class="size-3.5" aria-hidden="true" />
                        </Show>
                        <span>
                          {runsEditAll() ? t('deliveryFlow.doneEditing') : t('deliveryFlow.editQty')}
                        </span>
                      </Button>
                    </Show>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        refetchRuns();
                        refetchCandidates();
                      }}
                      class="h-8 w-8 p-0 shrink-0"
                      aria-label={t('common.refresh')}
                      title={t('common.refresh')}
                    >
                      <IconRefresh class="size-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                </Show>

                <Show when={enabledRunsFilterCount() > 0 && (isDraft() || pickedRun())}>
                  <div
                    role="group"
                    aria-label={t('deliveryFlow.filtersAndView')}
                    class="flex min-w-0 flex-wrap gap-1.5"
                  >
                    <Show when={runsGroupBy() === 'none'}>
                      <ActiveFilter
                        label={t('deliveryFlow.flatList')}
                        onRemove={() => setRunsGroupBy('destination')}
                      />
                    </Show>
                    <Show when={!isDraft() && runsPickFilter() !== 'all'}>
                      <ActiveFilter
                        label={
                          runsPickFilter() === 'picked'
                            ? t('deliveryFlow.pickPicked')
                            : t('deliveryFlow.pickToPick')
                        }
                        onRemove={() => setRunsPickFilter('all')}
                      />
                    </Show>
                    <Show when={workspaceDestinations().get(runsDestinationFilter())}>
                      {(label) => (
                        <ActiveFilter label={label()} onRemove={() => setRunsDestinationFilter('')} />
                      )}
                    </Show>
                  </div>
                </Show>

                <Show when={runsFilterOpen() && (isDraft() || pickedRun())}>
                  <div
                    id="delivery-runs-item-filters"
                    class="hidden min-w-0 flex-wrap items-end gap-3 rounded-lg border bg-card p-3 lg:flex animate-[card-enter_200ms_ease-out_both] motion-reduce:animate-none"
                  >
                    <ItemFilters />
                  </div>
                </Show>

                <Show
                  when={isDraft() || pickedRun()}
                  fallback={
                    <p class="rounded-lg border border-dashed bg-card p-8 text-center text-xs text-muted-foreground">
                      {t('deliveryFlow.noRunSelected')}
                    </p>
                  }
                >
                  <section aria-label={t('deliveryFlow.tabRunsDispatch')} class="@container min-w-0 space-y-4">
                    <Show when={plannerError()}>
                      <div class="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/15 p-3 text-xs text-destructive">
                        <IconAlertTriangle class="size-4 shrink-0" aria-hidden="true" />
                        <span>{plannerError()}</span>
                      </div>
                    </Show>

                    {/* In-Page Run Header Card */}
                    <div class="min-w-0 space-y-3 rounded-lg border bg-card p-3 animate-[card-enter_200ms_ease-out_both] motion-reduce:animate-none">
                      <div class="flex min-w-0 flex-wrap items-start justify-between gap-2.5">
                        <div class="min-w-0 flex-1 basis-52">
                          <h1 class="break-words text-base sm:text-lg font-bold tracking-tight">
                            {isDraft()
                              ? runTitle() || t('deliveryFlow.newDeliveryRun')
                              : pickedRun()!.title || t('deliveryFlow.runIdFallback', { id: pickedRun()!.id ?? '' })}
                          </h1>
                          <p class="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
                            <Show
                              when={!isDraft() && pickedRun()}
                              fallback={<span class="font-semibold">{t('deliveryFlow.draftBadge')}</span>}
                            >
                              {(run) => (
                                <>
                                  <span class="font-mono font-semibold tabular-nums">#{run().id}</span>
                                  <Show when={(run().areas || []).length > 0}>
                                    <span>{run().areas!.map(formatAreaLabel).join(' / ')}</span>
                                  </Show>
                                </>
                              )}
                            </Show>
                          </p>
                        </div>
                        <div class="flex min-w-0 flex-wrap items-center gap-1.5">
                          <Show when={!isDraft() && pickedRun()}>
                            {(run) => (
                              <>
                                <Show when={auth.can('delivery:update')} fallback={<span class="text-xs font-medium">{getRunStatusLabel(run().status || DELIVERY_RUN_STATUS.PLANNED)}</span>}>
                                <select
                                  aria-label={t('deliveryFlow.runStatusLabel')}
                                  class={cn(fieldInputClass, 'h-9 lg:h-8 w-auto font-medium')}
                                  value={run().status || DELIVERY_RUN_STATUS.PLANNED}
                                  onChange={(e) =>
                                    run().id && handleStatusChange(run().id!, e.currentTarget.value as DeliveryRunStatus)
                                  }
                                >
                                  <For each={runStatusFlow}>
                                    {(st) => <option value={st}>{getRunStatusLabel(st)}</option>}
                                  </For>
                                </select>
                                </Show>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  class="size-9 lg:size-8"
                                  aria-label={t('common.print')}
                                  title={t('common.print')}
                                  onClick={() => { if (auth.can('delivery:read')) window.print(); }}
                                >
                                  <IconPrinter class="size-4" aria-hidden="true" />
                                </Button>
                              </>
                            )}
                          </Show>
                          <Show when={auth.can(isDraft() ? 'delivery:create' : 'delivery:delete')}>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            class="size-9 lg:size-8"
                            aria-label={isDraft() ? t('deliveryFlow.discardDraft') : t('deliveryFlow.deleteRun')}
                            title={isDraft() ? t('deliveryFlow.discardDraft') : t('deliveryFlow.deleteRun')}
                            onClick={() => setDeleteDialogOpen(true)}
                          >
                            <IconTrash class="size-4" aria-hidden="true" />
                          </Button>
                          </Show>
                        </div>
                      </div>

                      <div class="flex min-w-0 flex-wrap items-start justify-between gap-2.5 border-t pt-2.5">
                        <div class="min-w-0 flex-1 space-y-1 text-xs text-muted-foreground">
                          <div class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                            <span class="inline-flex min-w-0 items-center gap-1.5 text-foreground">
                              <IconTruck aria-hidden="true" class="size-3.5 shrink-0 text-muted-foreground" />
                              <span class="truncate font-medium">
                                {(isDraft() ? driverName() : pickedRun()?.driver_name) || t('deliveryFlow.unassigned')}
                              </span>
                              <Show
                                when={getDriverVehicle(
                                  activeDriverId(),
                                  isDraft() ? driverName() : pickedRun()?.driver_name
                                )}
                              >
                                {(vehicle) => <span class="truncate text-muted-foreground">({vehicle()})</span>}
                              </Show>
                            </span>
                            <span class="inline-flex items-center gap-1.5">
                              <IconCalendar aria-hidden="true" class="size-3.5 shrink-0" />
                              <span>
                                {formatDisplayDate(isDraft() ? deliveryDate() : pickedRun()?.delivery_date)}
                              </span>
                            </span>
                          </div>
                          <p class="flex min-w-0 items-start gap-1.5">
                            <IconNotes aria-hidden="true" class="mt-0.5 size-3.5 shrink-0" />
                            <span
                              class={cn(
                                'min-w-0 break-words',
                                !(isDraft() ? runNotes() : pickedRun()?.notes) && 'italic'
                              )}
                            >
                              {(isDraft() ? runNotes() : pickedRun()?.notes) || t('deliveryFlow.noRouteNote')}
                            </span>
                          </p>
                        </div>
                        <Show when={canEditWorkspace()}>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          class="h-9 shrink-0 gap-1.5 px-3 text-xs lg:hidden"
                          aria-expanded={runsDockPanel() === 'driver'}
                          aria-controls={runsDockPanel() === 'driver' ? 'delivery-runs-dock-panel' : undefined}
                          onClick={(e) => toggleRunsDockPanel('driver', e.currentTarget)}
                        >
                          <IconPencil aria-hidden="true" class="size-3.5" />
                          <span>{t('deliveryFlow.edit')}</span>
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          class="hidden h-8 shrink-0 gap-1.5 px-2.5 text-xs lg:inline-flex"
                          aria-expanded={runsDispatchOpen()}
                          onClick={() => setRunsDispatchOpen((open) => !open)}
                        >
                          <IconPencil aria-hidden="true" class="size-3.5" />
                          <span>{t('deliveryFlow.edit')}</span>
                        </Button>
                        </Show>
                      </div>
                    </div>

                    {/* Sticky Picking Progress (Saved Runs) */}
                    <Show when={!isDraft() && pickedRun()}>
                      {(run) => {
                        const total = () => run().items?.length || run().total_items || 0;
                        const picked = () => pickedRunCount();
                        const pct = () => (total() > 0 ? Math.round((picked() / total()) * 100) : 0);
                        return (
                          <div class="sticky top-2 z-20 min-w-0 rounded-lg border bg-card/95 p-3 shadow-xs backdrop-blur-sm animate-[card-enter_200ms_ease-out_both] motion-reduce:animate-none">
                            <div class="block min-w-0 space-y-1.5">
                              <div class="flex flex-wrap items-baseline justify-between gap-x-2 text-xs">
                                <span class="font-medium text-muted-foreground">
                                  {t('deliveryFlow.pickingProgress', { picked: picked(), total: total() })}
                                </span>
                                <span class="font-mono font-semibold tabular-nums">{pct()}%</span>
                              </div>
                              <div
                                role="progressbar"
                                aria-label={t('deliveryFlow.pickingProgress', { picked: picked(), total: total() })}
                                aria-valuemin={0}
                                aria-valuemax={100}
                                aria-valuenow={pct()}
                                class="block h-1.5 overflow-hidden rounded-full bg-muted"
                              >
                                <div
                                  class={cn(
                                    'block h-full rounded-full transition-[width] motion-reduce:transition-none',
                                    pct() === 100 ? 'bg-status-selesai' : 'bg-primary'
                                  )}
                                  style={{ width: `${pct()}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      }}
                    </Show>

                    {/* Main Workspace + Side Dispatch Panel */}
                    <div
                      class={cn(
                        'grid min-w-0 items-start gap-4',
                        canEditWorkspace() && runsDispatchOpen() && 'lg:@min-[44rem]:grid-cols-[minmax(0,1fr)_17rem]'
                      )}
                    >
                      <Show when={canEditWorkspace() && runsDispatchOpen()}>
                        <section
                          aria-label={t('deliveryFlow.dispatchAndDriver')}
                          class="hidden min-w-0 rounded-lg border bg-card p-3 lg:block lg:@min-[44rem]:sticky lg:@min-[44rem]:top-4 lg:@min-[44rem]:col-start-2 lg:@min-[44rem]:row-start-1 animate-[card-enter_200ms_ease-out_both] motion-reduce:animate-none"
                        >
                          <DispatchSetup />
                        </section>
                      </Show>

                      <div class="min-w-0 space-y-3 lg:@min-[44rem]:col-start-1 lg:@min-[44rem]:row-start-1">
                        {/* Integrated Item List */}
                        <Show
                          when={visibleWorkspaceItems().length > 0}
                          fallback={
                            <p class="rounded-lg border border-dashed bg-card p-6 text-center text-xs text-muted-foreground">
                              {activeWorkspaceItems().length > 0
                                ? t('deliveryFlow.noItemsMatchFilters')
                                : t('deliveryFlow.noItemsOnRun')}
                            </p>
                          }
                        >
                          <Show
                            when={runsGroupBy() !== 'none'}
                            fallback={
                              <ul class="min-w-0 divide-y rounded-lg border bg-card animate-[card-enter_200ms_ease-out_both] motion-reduce:animate-none">
                                <For each={visibleWorkspaceItemKeys()}>
                                  {(key) => <WorkspaceItemRow itemKey={key} />}
                                </For>
                              </ul>
                            }
                          >
                            <div class="grid min-w-0 gap-3">
                              <For each={groupedWorkspaceOrderIds()}>
                                {(orderId, index) => {
                                  const ordGroup = () => groupedWorkspaceOrderMap().get(orderId);
                                  const pickCount = () => orderPickTotals().get(orderId);
                                  const showFillBtn = () =>
                                    canEditWorkspace() && (runsEditAll() ||
                                    (ordGroup()?.items.some((it) => it.key === editingItemKey()) ?? false));
                                  const itemKeys = createMemo(() => (ordGroup()?.items || []).map((it) => it.key));
                                  return (
                                    <Show when={ordGroup()}>
                                      {(group) => (
                                        <section
                                          class="min-w-0 rounded-lg border bg-card overflow-hidden shadow-xs hover:border-primary/50 transition-colors animate-[card-enter_200ms_ease-out_both] motion-reduce:animate-none"
                                          style={{ "animation-delay": `${Math.min(index(), 8) * 35}ms` }}
                                        >
                                          <div class="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2.5">
                                            <div class="min-w-0 flex-1 basis-36">
                                              <h3 class="break-words text-xs sm:text-sm font-bold text-foreground">{group().customer}</h3>
                                              <p class="mt-0.5 flex min-w-0 flex-wrap items-baseline gap-x-2 text-[11px] text-muted-foreground">
                                                <span class="min-w-0 break-words font-mono tabular-nums">
                                                  {group().ecatalog_number || group().order_number}
                                                </span>
                                                <Show when={group().area}>
                                                  <span class="min-w-0 break-words">{formatAreaLabel(group().area)}</span>
                                                </Show>
                                              </p>
                                            </div>
                                            <Show when={!isDraft() && pickCount()}>
                                              {(count) => (
                                                <span class="shrink-0 text-xs text-muted-foreground tabular-nums">
                                                  {t('deliveryFlow.pickedSummary', {
                                                    picked: count().picked,
                                                    total: count().total,
                                                  })}
                                                </span>
                                              )}
                                            </Show>
                                            <Show when={showFillBtn()}>
                                              <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                class="h-7 bg-background px-2.5 text-xs"
                                                onClick={() => handleFillOrderRemaining(orderId)}
                                              >
                                                {t('deliveryFlow.fillRemainingQty')}
                                              </Button>
                                            </Show>
                                          </div>
                                          <ul class="min-w-0 divide-y">
                                            <For each={itemKeys()}>
                                              {(key) => <WorkspaceItemRow itemKey={key} />}
                                            </For>
                                          </ul>
                                        </section>
                                      )}
                                    </Show>
                                  );
                                }}
                              </For>
                            </div>
                          </Show>
                        </Show>
                      </div>
                    </div>

                    {/* Desktop Draft Save Footer */}
                    <Show when={isDraft()}>
                      <div class="hidden min-w-0 items-center justify-between gap-2 rounded-lg border bg-card p-3 lg:flex animate-[card-enter_200ms_ease-out_both] motion-reduce:animate-none">
                        <span class="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                          <IconClipboardList class="hidden size-4 shrink-0 sm:block" aria-hidden="true" />
                          <span class="min-w-0 break-words tabular-nums">
                            {t('deliveryFlow.linesCount', {
                              visible: activeWorkspaceItems().length,
                              total: activeWorkspaceItems().length,
                            })}{' '}
                            &middot; {driverName() || t('deliveryFlow.unassigned')}
                          </span>
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          class="h-8 lg:h-9 px-3 text-xs font-semibold shrink-0 gap-1.5"
                          disabled={isSavingRun() || draftItems().size === 0 || !deliveryDate()}
                          onClick={handleSaveRun}
                        >
                          <Show when={isSavingRun()}>
                            <Spinner size="sm" />
                          </Show>
                          <span>{t('deliveryFlow.saveRun')}</span>
                        </Button>
                      </div>
                    </Show>
                  </section>
                </Show>
              </div>

              {/* Right Sticky Run Rail (Desktop - matches tab=plan sidebar) */}
              <aside
                aria-label={t('deliveryFlow.dispatchRuns')}
                class="lg:col-span-4 hidden lg:flex flex-col gap-3 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto pr-1 scrollbar-thin"
              >
                <div class="rounded-lg border bg-card p-3 space-y-3 animate-[card-enter_200ms_ease-out_both] motion-reduce:animate-none">
                  <div class="flex items-center justify-between gap-2">
                    <h2 class="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <IconClipboardList class="size-3.5" aria-hidden="true" />
                      <span>{t('deliveryFlow.dispatchRuns')}</span>
                    </h2>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      class="h-7 px-2 text-xs shrink-0"
                      aria-label={t('common.refresh')}
                      title={t('common.refresh')}
                      onClick={() => refetchRuns()}
                    >
                      <IconRefresh class="size-3" aria-hidden="true" />
                    </Button>
                  </div>
                  <RunFeed />
                </div>
              </aside>
            </div>
          </div>

          {/* Printable A4 Manifest (Saved Runs) */}
          <Show when={!isDraft() && pickedRun()}>
            {(run) => (
              <div class="delivery-print-sheet hidden print:block text-black bg-white p-4">
                <div class="border-b-2 border-black pb-2 mb-4 flex justify-between">
                  <div>
                    <h1 class="text-xl font-bold uppercase">{t('deliveryFlow.manifestTitle')}</h1>
                    <p class="text-xs">
                      {t('deliveryFlow.runIdFallback', { id: run().id ?? '' })} •{' '}
                      {run().title || t('deliveryFlow.dispatchSheet')}
                    </p>
                  </div>
                  <div class="text-right text-xs">
                    <div>{t('deliveryFlow.manifestDate', { date: formatDisplayDate(run().delivery_date) })}</div>
                    <div>
                      {t('deliveryFlow.manifestDriver', {
                        driver: run().driver_name || t('deliveryFlow.unassigned'),
                      })}
                    </div>
                  </div>
                </div>

                <table class="w-full text-left text-xs border border-collapse border-black mb-6">
                  <thead>
                    <tr class="bg-gray-200 text-black border-b border-black text-[11px]">
                      <th class="border border-black p-1.5 w-10 text-center">{t('deliveryFlow.pick')}</th>
                      <th class="border border-black p-1.5">{t('deliveryFlow.customerAndArea')}</th>
                      <th class="border border-black p-1.5">{t('deliveryFlow.itemName')}</th>
                      <th class="border border-black p-1.5 w-24 text-center">{t('common.qty')}</th>
                      <th class="border border-black p-1.5">{t('common.notes')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={run().items || []}>
                      {(it) => (
                        <tr class="border-b border-black">
                          <td class="border border-black p-1.5 text-center font-bold">[  ]</td>
                          <td class="border border-black p-1.5 font-bold">
                            {it.customer} ({it.area})
                          </td>
                          <td class="border border-black p-1.5">{it.nama_barang}</td>
                          <td class="border border-black p-1.5 text-center font-bold">
                            {it.planned_qty} {it.satuan}
                          </td>
                          <td class="border border-black p-1.5 text-[10px]">
                            {it.note || it.keterangan || '-'}
                          </td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
            )}
          </Show>
        </Show>

        {/* Mobile Floating Bottom Bar for Runs & Dispatch (Mockup 1) */}
        <Portal>
          <Show when={activeTab() === 'runs'}>
            <Show when={runsDockPanel()}>
              <div class="df-dock-backdrop lg:hidden no-print" onClick={closeRunsDockPanel} />
            </Show>
            <div
              class="fixed bottom-2 left-2 right-2 z-40 rounded-2xl border bg-card/98 p-2.5 shadow-2xl backdrop-blur-md sm:p-3 lg:hidden no-print"
              onKeyDown={(e) => {
                if (e.key === 'Escape' && runsDockPanel()) {
                  e.stopPropagation();
                  closeRunsDockPanel();
                }
              }}
            >
              <Show when={runsDockPanel()} keyed>
                {(panel) => (
                  <section
                    id="delivery-runs-dock-panel"
                    aria-labelledby="delivery-runs-dock-title"
                    class="mb-3 max-h-[62dvh] space-y-3 overflow-y-auto overscroll-contain rounded-xl border bg-background p-3 shadow-inner animate-[card-enter_200ms_ease-out_both] motion-reduce:animate-none"
                  >
                    <div class="flex items-center justify-between gap-2">
                      <h2 id="delivery-runs-dock-title" class="text-sm font-semibold">
                        {panel === 'runs'
                          ? t('deliveryFlow.dispatchRuns')
                          : panel === 'driver'
                            ? t('deliveryFlow.dispatchAndDriver')
                            : t('deliveryFlow.filtersAndView')}
                      </h2>
                      <Button
                        ref={(btn) => queueMicrotask(() => btn.focus({ preventScroll: true }))}
                        type="button"
                        size="icon"
                        variant="ghost"
                        class="size-9 shrink-0"
                        aria-label={t('common.close')}
                        onClick={closeRunsDockPanel}
                      >
                        <IconX aria-hidden="true" />
                      </Button>
                    </div>
                    <Show when={panel === 'runs'}>
                      <RunFeed />
                    </Show>
                    <Show when={panel === 'driver' && canEditWorkspace()}>
                      <Show when={!isDraft() && auth.can('delivery:update') && pickedRun()}>
                        {(run) => (
                          <div class="flex items-center justify-between gap-2 border-b pb-3">
                            <span class="text-sm font-medium">{t('deliveryFlow.runStatusLabel')}</span>
                            <select
                              aria-label={t('deliveryFlow.runStatusLabel')}
                              class={cn(fieldInputClass, 'w-auto')}
                              value={run().status || DELIVERY_RUN_STATUS.PLANNED}
                              onChange={(e) =>
                                run().id && handleStatusChange(run().id!, e.currentTarget.value as DeliveryRunStatus)
                              }
                            >
                              <For each={runStatusFlow}>
                                {(st) => <option value={st}>{getRunStatusLabel(st)}</option>}
                              </For>
                            </select>
                          </div>
                        )}
                      </Show>
                      <DispatchSetup />
                      <Button type="button" class="h-10 w-full" onClick={closeRunsDockPanel}>
                        {t('deliveryFlow.done')}
                      </Button>
                    </Show>
                    <Show when={panel === 'filters'}>
                      <div class="flex min-w-0 flex-wrap items-end gap-3">
                        <ItemFilters />
                      </div>
                    </Show>
                  </section>
                )}
              </Show>

              <Show
                when={isDraft() || pickedRun()}
                fallback={
                  <div class="mb-2 truncate text-xs text-muted-foreground">
                    {t('deliveryFlow.noRunSelected')}
                  </div>
                }
              >
                <Show
                  when={isDraft()}
                  fallback={
                    <Show when={pickedRun()}>
                      {(run) => (
                        <div class="mb-2 flex min-w-0 items-center justify-between gap-2 text-xs text-muted-foreground">
                          <span class="shrink-0 tabular-nums">
                            <strong class="font-mono font-semibold text-foreground">#{run().id}</strong> &middot;{' '}
                            {t('deliveryFlow.pickedSummary', {
                              picked: pickedRunCount(),
                              total: run().items?.length || 0,
                            })}
                          </span>
                          <span
                            class="truncate"
                            title={run().title || run().driver_name || t('deliveryFlow.unassigned')}
                          >
                            {run().title || run().driver_name || t('deliveryFlow.unassigned')}
                          </span>
                        </div>
                      )}
                    </Show>
                  }
                >
                  <div class="mb-2 flex min-w-0 items-center justify-between gap-2 text-xs">
                    <span class="shrink-0 text-muted-foreground tabular-nums">
                      <strong class="font-semibold text-foreground">{t('deliveryFlow.draftBadge')}</strong> &middot;{' '}
                      {t('deliveryFlow.itemsCount', { count: draftItems().size })}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      class="h-9 shrink-0 gap-1.5 rounded-xl px-3 text-xs font-semibold"
                      disabled={isSavingRun() || draftItems().size === 0 || !deliveryDate()}
                      onClick={handleSaveRun}
                    >
                      <Show when={isSavingRun()}>
                        <Spinner size="sm" />
                      </Show>
                      <span>{t('deliveryFlow.saveRun')}</span>
                    </Button>
                  </div>
                </Show>
              </Show>

              <div class="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  class={cn(
                    'h-10 min-w-0 gap-1.5 rounded-xl px-2 text-xs [&_svg]:size-3.5',
                    runsDockPanel() === 'runs' && 'border-primary bg-primary/5 ring-1 ring-primary/30'
                  )}
                  aria-expanded={runsDockPanel() === 'runs'}
                  aria-controls={runsDockPanel() === 'runs' ? 'delivery-runs-dock-panel' : undefined}
                  onClick={(e) => toggleRunsDockPanel('runs', e.currentTarget)}
                >
                  <IconClipboardList aria-hidden="true" class="text-muted-foreground" />
                  <span>{t('deliveryFlow.runsButton')}</span>
                  <span class="rounded-full bg-muted px-1 text-[10px] font-bold tabular-nums">
                    {(runsData()?.runs || []).length}
                  </span>
                  <Show when={draftItems().size > 0}>
                    <span
                      aria-hidden="true"
                      class="size-2 shrink-0 rounded-full border border-dashed border-current"
                    />
                    <span class="sr-only">{t('deliveryFlow.pendingDraft')}</span>
                  </Show>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  class={cn(
                    'h-10 min-w-0 gap-1.5 rounded-xl px-2 text-xs [&_svg]:size-3.5',
                    runsDockPanel() === 'filters' && 'border-primary bg-primary/5 ring-1 ring-primary/30'
                  )}
                  aria-expanded={runsDockPanel() === 'filters'}
                  disabled={!isDraft() && !pickedRun()}
                  aria-controls={runsDockPanel() === 'filters' ? 'delivery-runs-dock-panel' : undefined}
                  onClick={(e) => toggleRunsDockPanel('filters', e.currentTarget)}
                >
                  <IconFilter aria-hidden="true" class="text-muted-foreground" />
                  <span>{t('deliveryFlow.filters')}</span>
                  <Show when={enabledRunsFilterCount() > 0}>
                    <span class="inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold leading-none text-primary-foreground tabular-nums shadow-xs">
                      {enabledRunsFilterCount()}
                    </span>
                  </Show>
                  <IconChevronDown
                    aria-hidden="true"
                    class={cn(
                      'text-muted-foreground transition-transform duration-200 motion-reduce:transition-none',
                      runsDockPanel() === 'filters' && 'rotate-180'
                    )}
                  />
                </Button>
              </div>
            </div>
          </Show>
        </Portal>
        {/* DRIVERS ROSTER MODAL */}
        <Dialog open={showDriverModal()} onOpenChange={setShowDriverModal}>
          <DialogContent class="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t('deliveryFlow.manageDrivers')}</DialogTitle>
              <DialogDescription>{t('deliveryFlow.manageDriversDesc')}</DialogDescription>
            </DialogHeader>

            <Show when={driverModalError()}>
              <div role="alert" class="p-2 rounded bg-destructive/15 text-xs text-destructive">{driverModalError()}</div>
            </Show>
            <Show when={auth.can(driverToEdit() ? 'driver:update' : 'driver:create')}>
            <form onSubmit={handleAddDriver} class="space-y-3 pt-2">

              <div class="space-y-2">
                <input
                  type="text"
                  placeholder={t('deliveryFlow.driverNamePlaceholder')}
                  value={newDriverName()}
                  onInput={(e) => setNewDriverName(e.currentTarget.value)}
                  class="w-full text-xs py-1.5 px-2 rounded border bg-background"
                />
                <input
                  type="text"
                  placeholder={t('deliveryFlow.phonePlaceholder')}
                  value={newDriverPhone()}
                  onInput={(e) => setNewDriverPhone(e.currentTarget.value)}
                  class="w-full text-xs py-1.5 px-2 rounded border bg-background"
                />
                <input
                  type="text"
                  placeholder={t('deliveryFlow.vehiclePlaceholder')}
                  value={newDriverVehicle()}
                  onInput={(e) => setNewDriverVehicle(e.currentTarget.value)}
                  class="w-full text-xs py-1.5 px-2 rounded border bg-background"
                />
              </div>

              <div class="flex justify-end gap-2">
                <Show when={driverToEdit()}>
                  <Button type="button" variant="outline" size="sm" onClick={() => { setDriverToEdit(null); setNewDriverName(''); setNewDriverPhone(''); setNewDriverVehicle(''); }}>
                    {t('common.cancel')}
                  </Button>
                </Show>
                <Button type="submit" size="sm" disabled={isAddingDriver()} class="text-xs">
                  <span>{driverToEdit() ? t('common.save') : t('deliveryFlow.addDriver')}</span>
                </Button>
              </div>
            </form>
            </Show>

            <Show when={auth.can('driver:read')}>
            <div class="border rounded mt-3 max-h-48 overflow-y-auto">
              <table class="w-full text-left text-xs">
                <tbody>
                  <For each={driversData()?.drivers || []}>
                    {(d) => (
                      <tr class="border-b hover:bg-muted/50 transition-colors">
                        <td class="p-2 font-medium">{d.name}</td>
                        <td class="p-2 text-muted-foreground">{d.vehicle || '-'}</td>
                        <td class="p-2 text-right">
                          <Show when={auth.can('driver:update')}>
                            <button type="button" class="p-1 hover:opacity-80" aria-label={t('common.edit')} onClick={() => {
                              if (!auth.can('driver:update')) return;
                              setDriverToEdit(d);
                              setNewDriverName(d.name);
                              setNewDriverPhone(d.phone || '');
                              setNewDriverVehicle(d.vehicle || '');
                            }}>
                              <IconPencil class="size-3.5" />
                            </button>
                          </Show>
                          <Show when={auth.can('driver:delete')}>
                          <button
                            type="button"
                            onClick={() => d.id && handleDeleteDriverClick(d.id)}
                            class="text-destructive p-1 hover:opacity-80"
                          >
                            <IconTrash class="size-3.5" />
                          </button>
                          </Show>
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
            </Show>

            <DialogFooter class="pt-2">
              <Button variant="outline" size="sm" onClick={() => setShowDriverModal(false)}>
                {t('common.close')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* DELETE RUN / DISCARD DRAFT ALERT DIALOG */}
        <AlertDialog open={deleteDialogOpen()} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogTitle>
              {isDraft() ? t('deliveryFlow.discardDraftTitle') : t('deliveryFlow.deleteRun')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isDraft() ? t('deliveryFlow.discardDraftDesc') : t('deliveryFlow.deleteRunConfirmDesc')}
            </AlertDialogDescription>
            <div class="flex justify-end gap-2 mt-4">
              <Button variant="outline" size="sm" onClick={() => setDeleteDialogOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={isDeletingRun()}
                onClick={confirmDeleteOrDiscard}
              >
                {isDraft() ? t('deliveryFlow.discardDraft') : t('common.delete')}
              </Button>
            </div>
          </AlertDialogContent>
        </AlertDialog>
    </div>
  );
};
export default DeliveryFlow;
