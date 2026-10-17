import { type Component, createSignal, createResource, Show, For, createMemo, createEffect, on } from 'solid-js';
import { A } from '@solidjs/router';
import { IconDownload } from '@tabler/icons-solidjs';
import { getItems } from '../api';
import { TopBar } from '../components/TopBar';
import { Badge } from '../components/Badge';
import { Pagination } from '../components/Pagination';
import { createDebouncedSignal } from '../utils/debounce';

export const Items: Component = () => {
  const [customer, debouncedCustomer, setCustomer, flushCustomer] = createDebouncedSignal('', 300);
  const [namaBarang, debouncedNamaBarang, setNamaBarang, flushNamaBarang] = createDebouncedSignal('', 300);
  const [statusOrder, setStatusOrder] = createSignal('');
  const [tanggal, setTanggal] = createSignal('');
  const [offset, setOffset] = createSignal(0);
  const limit = 25;

  // When any filter changes, reset pagination offset to 0
  createEffect(
    on(
      [debouncedCustomer, debouncedNamaBarang, statusOrder, tanggal],
      () => {
        setOffset(0);
      },
      { defer: true }
    )
  );

  const queryParams = createMemo(() => ({
    customer: debouncedCustomer(),
    nama_barang: debouncedNamaBarang(),
    status_order: statusOrder(),
    tanggal: tanggal(),
    limit,
    offset: offset(),
  }));

  const [data] = createResource(queryParams, (params) => getItems(params));

  const applyFilters = (e?: Event) => {
    if (e) e.preventDefault();
    flushCustomer();
    flushNamaBarang();
    setOffset(0);
  };

  const resetFilters = () => {
    flushCustomer('');
    flushNamaBarang('');
    setStatusOrder('');
    setTanggal('');
    setOffset(0);
  };

  const handlePageChange = (newOffset: number) => {
    setOffset(newOffset);
  };

  const getExportUrl = () => {
    const p = new URLSearchParams();
    if (customer()) p.set('customer', customer());
    if (namaBarang()) p.set('nama_barang', namaBarang());
    if (statusOrder()) p.set('status_order', statusOrder());
    if (tanggal()) p.set('tanggal', tanggal());
    return `/api/v1/items/export?${p.toString()}`;
  };

  return (
    <div>
      <TopBar title="All Line Items">
        <div class="flex items-center gap-2.5">
          <Show when={data()?.total !== undefined}>
            <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary">
              {data()?.total} Items Total
            </span>
          </Show>
          <a
            href={getExportUrl()}
            class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-medium bg-gray-100 text-text hover:bg-gray-200 transition-colors"
            download="items.csv"
          >
            <IconDownload size={16} stroke={1.8} aria-hidden="true" />
            <span>Export CSV</span>
          </a>
        </div>
      </TopBar>

      <main class="p-6 md:p-8 max-w-7xl w-full mx-auto">
        {/* Filters */}
        <section class="bg-surface rounded-lg border border-border shadow-sm p-5 mb-5">
          <form class="flex flex-wrap items-end gap-4" onSubmit={applyFilters}>
            <div class="flex flex-col gap-1.5 min-w-[160px] flex-1">
              <label class="text-xs font-semibold text-muted">Customer Name</label>
              <input
                type="text"
                class="w-full px-3 py-2 border border-border rounded-md text-sm bg-surface text-text focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                placeholder="e.g. RS Harapan"
                value={customer()}
                onInput={(e) => setCustomer(e.currentTarget.value)}
              />
            </div>

            <div class="flex flex-col gap-1.5 min-w-[160px] flex-1">
              <label class="text-xs font-semibold text-muted">Item Name (Nama Barang)</label>
              <input
                type="text"
                class="w-full px-3 py-2 border border-border rounded-md text-sm bg-surface text-text focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                placeholder="e.g. Needle, Spuit, Tip"
                value={namaBarang()}
                onInput={(e) => setNamaBarang(e.currentTarget.value)}
              />
            </div>

            <div class="flex flex-col gap-1.5 min-w-[140px]">
              <label class="text-xs font-semibold text-muted">Status Order</label>
              <select
                class="w-full px-3 py-2 border border-border rounded-md text-sm bg-surface text-text focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                value={statusOrder()}
                onChange={(e) => setStatusOrder(e.currentTarget.value)}
              >
                <option value="">All Statuses</option>
                <option value="SELESAI">SELESAI</option>
                <option value="PROSES">PROSES</option>
                <option value="PENDING">PENDING</option>
                <option value="BATAL">BATAL</option>
              </select>
            </div>

            <div class="flex flex-col gap-1.5 min-w-[140px]">
              <label class="text-xs font-semibold text-muted">Date</label>
              <input
                type="date"
                class="w-full px-3 py-2 border border-border rounded-md text-sm bg-surface text-text focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                value={tanggal()}
                onInput={(e) => setTanggal(e.currentTarget.value)}
                onChange={(e) => setTanggal(e.currentTarget.value)}
              />
            </div>

            <div class="flex items-center gap-2">
              <button
                type="submit"
                class="inline-flex items-center justify-center px-4 py-2 rounded-md text-sm font-medium bg-primary text-white hover:bg-primary-hover cursor-pointer transition-colors"
              >
                Filter
              </button>
              <button
                type="button"
                class="inline-flex items-center justify-center px-4 py-2 rounded-md text-sm font-medium bg-gray-100 text-text hover:bg-gray-200 cursor-pointer transition-colors"
                onClick={resetFilters}
              >
                Reset
              </button>
            </div>
          </form>
        </section>

        {/* Items Table */}
        <section class="bg-surface rounded-lg border border-border shadow-sm p-5">
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse text-sm">
              <thead>
                <tr class="border-b border-border bg-gray-50 text-xs uppercase tracking-wider text-muted font-semibold">
                  <th class="py-2.5 px-3">Row</th>
                  <th class="py-2.5 px-3">Order No.</th>
                  <th class="py-2.5 px-3">Customer</th>
                  <th class="py-2.5 px-3">Area</th>
                  <th class="py-2.5 px-3">Date</th>
                  <th class="py-2.5 px-3">Item Name</th>
                  <th class="py-2.5 px-3">Qty</th>
                  <th class="py-2.5 px-3">Status Order</th>
                  <th class="py-2.5 px-3">Status Barang</th>
                  <th class="py-2.5 px-3">Delivery Date</th>
                  <th class="py-2.5 px-3">Notes</th>
                </tr>
              </thead>
              <tbody>
                <Show
                  when={!data.loading}
                  fallback={
                    <tr>
                      <td colspan="11" class="p-8 text-center text-muted text-sm">
                        Loading line items...
                      </td>
                    </tr>
                  }
                >
                  <Show
                    when={data()?.items && data()!.items.length > 0}
                    fallback={
                      <tr>
                        <td colspan="11" class="p-8 text-center text-muted text-sm">
                          No items match the current filters
                        </td>
                      </tr>
                    }
                  >
                    <For each={data()?.items}>
                      {(item) => (
                        <tr class="hover:bg-gray-50 border-b border-border last:border-b-0">
                          <td class="py-2.5 px-3 text-muted">{item.row_index}</td>
                          <td class="py-2.5 px-3">
                            <Show
                              when={item.order_id}
                              fallback={
                                <span class="font-mono text-xs text-text">
                                  {item.order_number || item.ecatalog_number || '-'}
                                </span>
                              }
                            >
                              <A href={`/orders/${item.order_id}`} class="text-primary font-semibold hover:underline">
                                {item.order_number || item.order_id}
                              </A>
                            </Show>
                          </td>
                          <td class="py-2.5 px-3 font-medium text-text">{item.customer}</td>
                          <td class="py-2.5 px-3 text-text">{item.area}</td>
                          <td class="py-2.5 px-3 text-text">{item.tanggal}</td>
                          <td class="py-2.5 px-3 font-semibold text-text">{item.nama_barang}</td>
                          <td class="py-2.5 px-3 text-text">
                            {item.jumlah} {item.satuan}
                          </td>
                          <td class="py-2.5 px-3">
                            <Badge status={item.status_order} />
                          </td>
                          <td class="py-2.5 px-3">
                            <Badge status={item.status_barang} />
                          </td>
                          <td class="py-2.5 px-3 text-text">{item.tanggal_pengiriman || '-'}</td>
                          <td class="py-2.5 px-3 text-xs text-muted max-w-[180px] truncate">
                            {item.keterangan || item.catatan || '-'}
                          </td>
                        </tr>
                      )}
                    </For>
                  </Show>
                </Show>
              </tbody>
            </table>
          </div>

          <Show when={data() && data()!.total > 0}>
            <Pagination
              total={data()!.total}
              limit={limit}
              offset={offset()}
              onPageChange={handlePageChange}
            />
          </Show>
        </section>
      </main>
    </div>
  );
};
