import { type Component, createSignal, createResource, Show, For } from 'solid-js';
import { A } from '@solidjs/router';
import { getItems } from '../api';
import { TopBar } from '../components/TopBar';
import { Badge } from '../components/Badge';
import { Pagination } from '../components/Pagination';

export const Items: Component = () => {
  const [customer, setCustomer] = createSignal('');
  const [namaBarang, setNamaBarang] = createSignal('');
  const [statusOrder, setStatusOrder] = createSignal('');
  const [tanggal, setTanggal] = createSignal('');
  const [offset, setOffset] = createSignal(0);
  const limit = 25;

  const [queryParams, setQueryParams] = createSignal({
    customer: '',
    nama_barang: '',
    status_order: '',
    tanggal: '',
    limit,
    offset: 0,
  });

  const [data] = createResource(queryParams, (params) => getItems(params));

  const applyFilters = (e?: Event) => {
    if (e) e.preventDefault();
    setOffset(0);
    setQueryParams({
      customer: customer(),
      nama_barang: namaBarang(),
      status_order: statusOrder(),
      tanggal: tanggal(),
      limit,
      offset: 0,
    });
  };

  const resetFilters = () => {
    setCustomer('');
    setNamaBarang('');
    setStatusOrder('');
    setTanggal('');
    setOffset(0);
    setQueryParams({
      customer: '',
      nama_barang: '',
      status_order: '',
      tanggal: '',
      limit,
      offset: 0,
    });
  };

  const handlePageChange = (newOffset: number) => {
    setOffset(newOffset);
    setQueryParams((prev) => ({ ...prev, offset: newOffset }));
  };

  const getExportUrl = () => {
    const p = new URLSearchParams();
    p.set('format', 'csv');
    if (customer()) p.set('customer', customer());
    if (namaBarang()) p.set('nama_barang', namaBarang());
    if (statusOrder()) p.set('status_order', statusOrder());
    if (tanggal()) p.set('tanggal', tanggal());
    return `/api/v1/items/export?${p.toString()}`;
  };

  return (
    <div>
      <TopBar title="All Line Items">
        <div style={{ display: 'flex', gap: '10px', 'align-items': 'center' }}>
          <Show when={data()?.total !== undefined}>
            <span class="badge badge-pill badge-primary">
              {data()?.total} Items Total
            </span>
          </Show>
          <a
            href={getExportUrl()}
            class="btn btn-secondary"
            download="items.csv"
            style={{ 'font-size': '13px', 'padding': '6px 14px' }}
          >
            📥 Export CSV
          </a>
        </div>
      </TopBar>

      <main class="content">
        {/* Filters */}
        <section class="card" style={{ 'margin-bottom': '20px' }}>
          <form class="filter-bar" onSubmit={applyFilters}>
            <div class="form-group">
              <label>Customer Name</label>
              <input
                type="text"
                class="form-control"
                placeholder="e.g. RS Harapan"
                value={customer()}
                onInput={(e) => setCustomer(e.currentTarget.value)}
              />
            </div>

            <div class="form-group">
              <label>Item Name (Nama Barang)</label>
              <input
                type="text"
                class="form-control"
                placeholder="e.g. Needle, Spuit, Tip"
                value={namaBarang()}
                onInput={(e) => setNamaBarang(e.currentTarget.value)}
              />
            </div>

            <div class="form-group">
              <label>Status Order</label>
              <select
                class="form-control"
                value={statusOrder()}
                onChange={(e) => setStatusOrder(e.currentTarget.value)}
              >
                <option value="">All Statuses</option>
                <option value="SELESAI">SELESAI</option>
                <option value="PROSES">PROSES</option>
                <option value="PENDING">PENDING</option>
              </select>
            </div>

            <div class="form-group">
              <label>Date</label>
              <input
                type="text"
                class="form-control"
                placeholder="DD/MM/YYYY"
                value={tanggal()}
                onInput={(e) => setTanggal(e.currentTarget.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="submit" class="btn btn-primary">
                Filter
              </button>
              <button type="button" class="btn btn-secondary" onClick={resetFilters}>
                Reset
              </button>
            </div>
          </form>
        </section>

        {/* Items Table */}
        <section class="card">
          <div class="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Order No.</th>
                  <th>Customer</th>
                  <th>Area</th>
                  <th>Date</th>
                  <th>Item Name</th>
                  <th>Qty</th>
                  <th>Status Order</th>
                  <th>Status Barang</th>
                  <th>Delivery Date</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                <Show
                  when={!data.loading}
                  fallback={
                    <tr>
                      <td colspan="11" class="loading-box">
                        Loading line items...
                      </td>
                    </tr>
                  }
                >
                  <Show
                    when={data()?.items && data()!.items.length > 0}
                    fallback={
                      <tr>
                        <td colspan="11" class="empty-box">
                          No items match the current filters
                        </td>
                      </tr>
                    }
                  >
                    <For each={data()?.items}>
                      {(item) => (
                        <tr>
                          <td>{item.row_index}</td>
                          <td>
                            <Show
                              when={item.order_id}
                              fallback={
                                <span style={{ 'font-family': 'monospace', 'font-size': '12px' }}>
                                  {item.order_number || item.ecatalog_number || '-'}
                                </span>
                              }
                            >
                              <A href={`/orders/${item.order_id}`} class="order-link">
                                {item.order_number || item.order_id}
                              </A>
                            </Show>
                          </td>
                          <td style={{ 'font-weight': '500' }}>{item.customer}</td>
                          <td>{item.area}</td>
                          <td>{item.tanggal}</td>
                          <td style={{ 'font-weight': '600' }}>{item.nama_barang}</td>
                          <td>
                            {item.jumlah} {item.satuan}
                          </td>
                          <td>
                            <Badge status={item.status_order} />
                          </td>
                          <td>
                            <Badge status={item.status_barang} />
                          </td>
                          <td>{item.tanggal_pengiriman || '-'}</td>
                          <td style={{ 'font-size': '12px', 'max-width': '180px' }}>
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
