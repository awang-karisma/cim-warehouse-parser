import { type Component, createSignal, createResource, Show, For } from 'solid-js';
import { A } from '@solidjs/router';
import { getCustomers, getCustomerAliases, setCustomerAlias } from '../api';
import type { CustomerSummary } from '../types';
import { TopBar } from '../components/TopBar';
import { StatusBar } from '../components/StatusBar';
import { createDebouncedSignal } from '../utils/debounce';
export const Customers: Component = () => {
  const [search, debouncedSearch, setSearch, flushSearch] = createDebouncedSignal('', 300);
  const [limit, setLimit] = createSignal(24);

  const [data, { refetch: refetchCustomers }] = createResource(
    () => ({ search: debouncedSearch(), limit: limit() }),
    (params) => getCustomers({ search: params.search, limit: params.limit, offset: 0 })
  );

  const [aliasesData, { refetch: refetchAliases }] = createResource(getCustomerAliases);

  // Modal state
  const [modalOpen, setModalOpen] = createSignal(false);
  const [aliasSpelling, setAliasSpelling] = createSignal('');
  const [selectedCanonical, setSelectedCanonical] = createSignal('');
  const [newCanonicalName, setNewCanonicalName] = createSignal('');
  const [aliasArea, setAliasArea] = createSignal('');
  const [isSubmitting, setIsSubmitting] = createSignal(false);
  const [errorMessage, setErrorMessage] = createSignal('');

  const openEditModal = (cust: CustomerSummary) => {
    setAliasSpelling(cust.name);
    setAliasArea(cust.area || '');
    setErrorMessage('');
    setIsSubmitting(false);

    const groups = aliasesData()?.groups || [];
    const existingGroup = groups.find(
      (g) =>
        g.canonical.toLowerCase() === cust.name.toLowerCase() ||
        g.aliases.some((a) => a.toLowerCase() === cust.name.toLowerCase())
    );

    if (existingGroup) {
      setSelectedCanonical(existingGroup.canonical);
      setNewCanonicalName('');
      if (!cust.area && existingGroup.area) {
        setAliasArea(existingGroup.area);
      }
    } else if (groups.length > 0) {
      setSelectedCanonical(groups[0].canonical);
      setNewCanonicalName('');
    } else {
      setSelectedCanonical('__NEW__');
      setNewCanonicalName(cust.name);
    }

    setModalOpen(true);
  };

  const handleSaveAlias = async (e: Event) => {
    e.preventDefault();
    setErrorMessage('');

    const alias = aliasSpelling().trim();
    if (!alias) {
      setErrorMessage('Alias spelling cannot be empty');
      return;
    }

    let canonical = selectedCanonical();
    if (canonical === '__NEW__') {
      canonical = newCanonicalName().trim();
      if (!canonical) {
        setErrorMessage('Canonical customer name cannot be empty');
        return;
      }
    }

    const area = aliasArea().trim();

    setIsSubmitting(true);
    try {
      await setCustomerAlias(alias, canonical, area);
      setModalOpen(false);
      await Promise.all([refetchCustomers(), refetchAliases()]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save customer alias';
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };
  return (
    <div>
      <TopBar title="Customer View">
        <Show when={data()?.total !== undefined}>
          <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary">
            {data()?.total} Registered Customers
          </span>
        </Show>
      </TopBar>

      <main class="p-6 md:p-8 max-w-7xl w-full mx-auto">
        {/* Search */}
        <div class="relative mb-5">
          <input
            type="text"
            class="w-full px-4 py-3 text-base border-2 border-border rounded-lg outline-none bg-surface text-text focus:border-primary focus:ring-4 focus:ring-primary/15 transition-all"
            placeholder="Search customers by name (e.g. RSUD, Puskesmas, Klinik)..."
            value={search()}
            onInput={(e) => setSearch(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                flushSearch();
              }
            }}
          />
        </div>

        {/* 3-Column Card Grid */}
        <Show
          when={!data.loading}
          fallback={<div class="p-10 text-center text-muted text-sm">Loading customers...</div>}
        >
          <Show
            when={data()?.customers && data()!.customers.length > 0}
            fallback={
              <div class="bg-surface rounded-lg border border-border shadow-sm p-10 text-center text-muted text-sm">
                No customers found matching <strong class="text-text">{search()}</strong>
              </div>
            }
          >
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-6">
              <For each={data()?.customers}>
                {(cust) => (
                  <div class="bg-surface rounded-lg border border-border shadow-sm p-5 flex flex-col justify-between h-full">
                    <div>
                      <div class="mb-3 pb-2 border-b border-border">
                        <h3 class="text-base font-semibold text-text">
                          {cust.name}
                        </h3>
                        <span class="text-xs text-muted">
                          {cust.area || 'Unknown Area'}
                        </span>
                      </div>

                      <div class="space-y-2 mb-4">
                        <div class="flex justify-between items-center py-1.5 border-b border-border text-sm">
                          <span class="text-muted text-xs">Total Orders</span>
                          <span class="font-semibold text-text">{cust.total_orders}</span>
                        </div>
                        <div class="flex justify-between items-center py-1.5 border-b border-border text-sm">
                          <span class="text-muted text-xs">Total Line Items</span>
                          <span class="font-semibold text-text">{cust.total_items}</span>
                        </div>
                        <div class="flex justify-between items-center py-1.5 border-b border-border text-sm">
                          <span class="text-muted text-xs">Latest Order Date</span>
                          <span class="font-semibold text-text text-xs">
                            {cust.last_order_date || '-'}
                          </span>
                        </div>
                      </div>

                      <div class="mb-4">
                        <div class="text-[11px] text-muted mb-1.5 font-semibold uppercase tracking-wider">
                          ORDER STATUS BREAKDOWN
                        </div>
                        <StatusBar statusCounts={cust.status_counts} height={18} />
                      </div>
                    </div>

                    <div class="flex gap-2 mt-2">
                      <button
                        type="button"
                        class="flex-1 inline-flex items-center justify-center px-3 py-2 rounded-md text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors cursor-pointer"
                        onClick={() => openEditModal(cust)}
                      >
                        Edit Alias
                      </button>
                      <A
                        href={`/orders?customer=${encodeURIComponent(cust.name)}`}
                        class="flex-1 inline-flex items-center justify-center px-3 py-2 rounded-md text-xs font-medium bg-gray-100 text-text hover:bg-gray-200 transition-colors"
                      >
                        Orders &rarr;
                      </A>
                    </div>
                  </div>
                )}
              </For>
            </div>

            {/* Load More Button */}
            <Show when={data() && data()!.total > limit()}>
              <div class="text-center mt-6">
                <button
                  type="button"
                  class="inline-flex items-center justify-center px-4 py-2 rounded-md text-sm font-medium bg-primary text-white hover:bg-primary-hover cursor-pointer transition-colors"
                  onClick={() => setLimit((prev) => prev + 24)}
                >
                  Load More Customers ({data()!.total - limit()} remaining)
                </button>
              </div>
            </Show>
          </Show>
        </Show>
      </main>

      {/* Accessible Edit Customer Alias Modal */}
      <Show when={modalOpen()}>
        <div
          class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="alias-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalOpen(false);
          }}
        >
          <div class="bg-surface rounded-lg border border-border shadow-xl max-w-md w-full p-6 text-text relative">
            <div class="flex items-center justify-between pb-3 mb-4 border-b border-border">
              <h2 id="alias-modal-title" class="text-base font-semibold text-text">
                Assign Customer Alias
              </h2>
              <button
                type="button"
                class="text-muted hover:text-text text-lg font-bold leading-none cursor-pointer p-1"
                aria-label="Close dialog"
                onClick={() => setModalOpen(false)}
              >
                &times;
              </button>
            </div>

            <Show when={errorMessage()}>
              <div class="mb-4 p-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-xs">
                {errorMessage()}
              </div>
            </Show>

            <form onSubmit={handleSaveAlias} class="space-y-4">
              <div>
                <label class="block text-xs font-semibold text-muted mb-1">
                  Alias Spelling (Source Name)
                </label>
                <input
                  type="text"
                  class="w-full px-3 py-2 border border-border rounded-md text-sm bg-surface text-text focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  value={aliasSpelling()}
                  onInput={(e) => setAliasSpelling(e.currentTarget.value)}
                  required
                />
              </div>

              <div>
                <label class="block text-xs font-semibold text-muted mb-1">
                  Canonical Customer Group
                </label>
                <select
                  class="w-full px-3 py-2 border border-border rounded-md text-sm bg-surface text-text focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  value={selectedCanonical()}
                  onChange={(e) => {
                    const val = e.currentTarget.value;
                    setSelectedCanonical(val);
                    if (val === '__NEW__' && !newCanonicalName()) {
                      setNewCanonicalName(aliasSpelling());
                    }
                  }}
                  onInput={(e) => {
                    const val = e.currentTarget.value;
                    setSelectedCanonical(val);
                    if (val === '__NEW__' && !newCanonicalName()) {
                      setNewCanonicalName(aliasSpelling());
                    }
                  }}
                >
                  <For each={aliasesData()?.groups}>
                    {(group) => (
                      <option value={group.canonical}>
                        {group.canonical} ({group.aliases.length} {group.aliases.length === 1 ? 'alias' : 'aliases'}
                        {group.area ? ` • ${group.area}` : ''})
                      </option>
                    )}
                  </For>
                  <option value="__NEW__">+ Create new canonical group...</option>
                </select>
              </div>

              <Show when={selectedCanonical() === '__NEW__'}>
                <div>
                  <label class="block text-xs font-semibold text-muted mb-1">
                    New Canonical Name
                  </label>
                  <input
                    type="text"
                    class="w-full px-3 py-2 border border-border rounded-md text-sm bg-surface text-text focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    placeholder="e.g. RSUD Provinsi NTB"
                    value={newCanonicalName()}
                    onInput={(e) => setNewCanonicalName(e.currentTarget.value)}
                    required
                  />
                </div>
              </Show>

              <div>
                <label class="block text-xs font-semibold text-muted mb-1">
                  Linked Area / Region (Optional)
                </label>
                <input
                  type="text"
                  class="w-full px-3 py-2 border border-border rounded-md text-sm bg-surface text-text focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  placeholder="e.g. Mataram, Lombok Barat"
                  value={aliasArea()}
                  onInput={(e) => setAliasArea(e.currentTarget.value)}
                />
              </div>

              <div class="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  class="px-4 py-2 rounded-md text-xs font-medium bg-gray-100 text-text hover:bg-gray-200 transition-colors cursor-pointer"
                  onClick={() => setModalOpen(false)}
                  disabled={isSubmitting()}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  class="px-4 py-2 rounded-md text-xs font-medium bg-primary text-white hover:bg-primary-hover transition-colors cursor-pointer disabled:opacity-50"
                  disabled={isSubmitting()}
                >
                  {isSubmitting() ? 'Saving...' : 'Save Alias'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </Show>
    </div>
  );
};
