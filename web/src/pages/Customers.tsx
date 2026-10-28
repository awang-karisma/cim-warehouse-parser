import { useI18n } from '~/i18n';
import {
  type Component,
  createSignal,
  createResource,
  createEffect,
  onCleanup,
  untrack,
  Show,
  For,
  createMemo,
} from 'solid-js';
import { A } from '@solidjs/router';
import {
  IconSearch,
  IconBuildingHospital,
  IconArrowRight,
  IconEdit,
  IconLoader2,
  IconAlertCircle,
} from '@tabler/icons-solidjs';
import { getCustomers, getCustomerAliases, setCustomerAlias, getAreas } from '../api';
import type { CustomerSummary } from '../types';
import { AreaCombobox } from '~/components/AreaCombobox';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '~/components/ui/card';
import { TextField, TextFieldInput, TextFieldLabel } from '~/components/ui/text-field';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '~/components/ui/dialog';
import {
  Select,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from '~/components/ui/select';
import { Alert, AlertTitle, AlertDescription } from '~/components/ui/alert';
import { Separator } from '~/components/ui/separator';
import { Skeleton } from '~/components/ui/skeleton';
import { Badge } from '../components/Badge';
import { createUrlFilter } from '../utils/tableFilters';

export const Customers: Component = () => {
  const { t } = useI18n();
  const filters = createUrlFilter({
    search: {
      key: 'search',
      defaultValue: '',
      parse: (v) => v ?? '',
      serialize: (v) => v || null,
      debounceMs: 300,
    },
  });
  const PAGE_SIZE = 24;

  const [customers, setCustomers] = createSignal<CustomerSummary[]>([]);
  const [total, setTotal] = createSignal<number | null>(null);
  const [isLoadingInitial, setIsLoadingInitial] = createSignal(true);
  const [isLoadingMore, setIsLoadingMore] = createSignal(false);
  const [loadError, setLoadError] = createSignal<string | null>(null);
  const [initialError, setInitialError] = createSignal<string | null>(null);

  let searchGeneration = 0;
  let inFlightOffset: number | null = null;
  let sentinelEl: HTMLDivElement | null = null;
  let observer: IntersectionObserver | null = null;

  const fetchInitial = async (searchTerm: string) => {
    const gen = ++searchGeneration;
    inFlightOffset = 0;
    setIsLoadingInitial(true);
    setIsLoadingMore(false);
    setLoadError(null);
    setInitialError(null);
    setCustomers([]);
    setTotal(null);

    if (observer) {
      observer.disconnect();
    }
    sentinelEl = null;

    try {
      const res = await getCustomers({ search: searchTerm, limit: PAGE_SIZE, offset: 0 });
      if (gen !== searchGeneration) return;

      setCustomers(res.customers);
      setTotal(res.total);
    } catch (err: unknown) {
      if (gen !== searchGeneration) return;
      const msg = err instanceof Error ? err.message : t('customers.loadError');
      setInitialError(msg);
      setCustomers([]);
      setTotal(0);
    } finally {
      if (gen === searchGeneration) {
        setIsLoadingInitial(false);
        setIsLoadingMore(false);
        inFlightOffset = null;
      }
    }
  };

  createEffect(() => {
    const term = filters.debouncedValues.search();
    untrack(() => {
      fetchInitial(term);
    });
  });

  const loadMore = async () => {
    const currentTotal = total();
    const currentList = customers();
    const currentGen = searchGeneration;
    const currentSearch = filters.debouncedValues.search();
    if (
      isLoadingInitial() ||
      isLoadingMore() ||
      currentTotal === null ||
      currentList.length >= currentTotal ||
      inFlightOffset !== null
    ) {
      return;
    }

    const offsetToFetch = currentList.length;
    inFlightOffset = offsetToFetch;
    setIsLoadingMore(true);
    setLoadError(null);

    try {
      const res = await getCustomers({
        search: currentSearch,
        limit: PAGE_SIZE,
        offset: offsetToFetch,
      });

      if (currentGen !== searchGeneration) return;

      let freshCount = 0;
      setCustomers((prev) => {
        const existingNames = new Set(prev.map((c) => c.name));
        const fresh = res.customers.filter((c) => !existingNames.has(c.name));
        freshCount = fresh.length;
        if (freshCount === 0) {
          return prev;
        }
        return [...prev, ...fresh];
      });
      setTotal(res.total);

      if (
        observer &&
        sentinelEl &&
        freshCount > 0 &&
        res.total > offsetToFetch + freshCount
      ) {
        observer.unobserve(sentinelEl);
        observer.observe(sentinelEl);
      }
    } catch (err: unknown) {
      if (currentGen !== searchGeneration) return;
      const msg = err instanceof Error ? err.message : t('customers.loadMoreError');
      setLoadError(msg);
    } finally {
      if (currentGen === searchGeneration) {
        setIsLoadingMore(false);
        inFlightOffset = null;
      }
    }
  };

  const setSentinelRef = (el: HTMLDivElement) => {
    sentinelEl = el;
    if (typeof IntersectionObserver !== 'undefined') {
      if (!observer) {
        observer = new IntersectionObserver(
          (entries) => {
            const entry = entries[0];
            if (entry && entry.isIntersecting) {
              loadMore();
            }
          },
          { rootMargin: '300px' }
        );
      }
      observer.disconnect();
      observer.observe(el);
    }
  };

  onCleanup(() => {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  });

  const refetchCustomers = async () => {
    const gen = ++searchGeneration;
    const currentList = customers();
    const countToFetch = Math.max(PAGE_SIZE, currentList.length);
    const currentSearch = filters.debouncedValues.search();

    inFlightOffset = 0;
    setIsLoadingMore(true);

    try {
      const res = await getCustomers({
        search: currentSearch,
        limit: countToFetch,
        offset: 0,
      });

      if (gen !== searchGeneration) return;

      const refreshed = res.customers;
      const newTotal = res.total;

      const seen = new Set<string>();
      const finalCustomers: CustomerSummary[] = [];
      for (const cust of refreshed) {
        if (!seen.has(cust.name)) {
          seen.add(cust.name);
          finalCustomers.push(cust);
        }
      }

      setCustomers(finalCustomers);
      setTotal(newTotal);

      if (observer && sentinelEl && newTotal > finalCustomers.length) {
        observer.unobserve(sentinelEl);
        observer.observe(sentinelEl);
      }
    } catch (err) {
      console.error('Failed to refetch customers', err);
    } finally {
      if (gen === searchGeneration) {
        inFlightOffset = null;
        setIsLoadingMore(false);
      }
    }
  };

  const [aliasesData, { refetch: refetchAliases }] = createResource(getCustomerAliases);
  const [areasData] = createResource(getAreas);

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
      setErrorMessage(t('customers.aliasEmptyError'));
      return;
    }

    let canonical = selectedCanonical();
    if (canonical === '__NEW__') {
      canonical = newCanonicalName().trim();
      if (!canonical) {
        setErrorMessage(t('customers.canonicalEmptyError'));
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
      const msg = err instanceof Error ? err.message : t('customers.saveAliasError');
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const canonicalOptions = createMemo(() => {
    const list = (aliasesData()?.groups || []).map((g) => g.canonical);
    return [...list, t('customers.newCanonicalOption')];
  });

  return (
    <div class="flex flex-1 flex-col gap-6">
      {/* Search Bar (Cards Example Pattern) */}
      <Card>
        <CardContent class="p-4 md:p-6">
          <div class="relative">
            <TextField value={filters.values.search()} onChange={filters.setters.search}>
              <div class="relative flex items-center">
                <IconSearch class="absolute left-3 size-4 text-muted-foreground pointer-events-none" />
                <TextFieldInput
                  placeholder={t('customers.searchPlaceholder')}
                  class="pl-9 h-11 text-base"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      filters.flush();
                    }
                  }}
                />
              </div>
            </TextField>
          </div>
        </CardContent>
      </Card>

      {/* Initial load error */}
      <Show when={initialError()}>
        <Alert variant="destructive">
          <IconAlertCircle class="size-4" />
          <AlertTitle>Failed to load customers</AlertTitle>
          <AlertDescription class="flex items-center justify-between">
            <span>{initialError()}</span>
            <Button
              variant="outline"
              size="sm"
              class="h-8"
              onClick={() => fetchInitial(filters.debouncedValues.search())}
            >
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      </Show>

      {/* Customer Cards Grid */}
      <Show
        when={!isLoadingInitial()}
        fallback={
          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <For each={[1, 2, 3, 4, 5, 6]}>
              {() => (
                <Card>
                  <CardHeader class="space-y-2">
                    <Skeleton class="h-6 w-3/4" />
                    <Skeleton class="h-4 w-1/2" />
                  </CardHeader>
                  <CardContent class="space-y-2">
                    <Skeleton class="h-4 w-full" />
                    <Skeleton class="h-4 w-full" />
                  </CardContent>
                </Card>
              )}
            </For>
          </div>
        }
      >
        <Show
          when={customers().length > 0}
          fallback={
            <Card>
              <CardContent class="p-12 text-center text-muted-foreground">
                {filters.debouncedValues.search() ? (
                  <p>
                    {t('customers.noCustomersMatch', { query: filters.debouncedValues.search() })}
                  </p>
                ) : (
                  <p>{t('customers.noCustomersRecorded')}</p>
                )}
              </CardContent>
            </Card>
          }
        >
          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <For each={customers()}>
              {(cust) => {
                const selesaiCount =
                  (cust.status_counts?.SELESAI || 0) + (cust.status_counts?.COMPLETED || 0);
                const totalItems = cust.total_items || 1;
                const fulfillmentPct = Math.min(100, Math.round((selesaiCount / totalItems) * 100));

                return (
                  <Card class="flex flex-col justify-between transition-shadow hover:shadow-md min-w-0">
                    <div class="min-w-0">
                      <CardHeader class="pb-3">
                        <div class="flex items-start justify-between gap-2 min-w-0">
                          <div class="space-y-1 min-w-0 flex-1">
                            <CardTitle class="text-base font-semibold leading-tight flex items-center gap-1.5 min-w-0">
                              <IconBuildingHospital class="size-4 text-primary shrink-0" />
                              <span class="truncate">{cust.name}</span>
                            </CardTitle>
                            <p class="text-xs text-muted-foreground truncate">{cust.area || t('customers.unknownArea')}</p>
                          </div>
                          <Badge status={t('customers.orders', { count: cust.total_orders })} pill class="shrink-0" />
                        </div>
                      </CardHeader>

                      <CardContent class="space-y-3 pb-3">
                        <div class="rounded-md bg-muted/40 p-2.5 space-y-1.5 text-xs">
                          <div class="flex justify-between">
                            <span class="text-muted-foreground">{t('customers.totalLineItems')}</span>
                            <span class="font-medium text-foreground">{cust.total_items.toLocaleString()}</span>
                          </div>
                          <div class="flex justify-between">
                            <span class="text-muted-foreground">{t('customers.latestOrder')}</span>
                            <span class="font-medium text-foreground">{cust.last_order_date || '-'}</span>
                          </div>
                        </div>

                        <div class="space-y-1">
                          <div class="flex justify-between text-xs">
                            <span class="text-muted-foreground">{t('customers.fulfillmentRate')}</span>
                            <span class="font-semibold">{fulfillmentPct}%</span>
                          </div>
                          <div class="h-2 w-full overflow-hidden rounded-full bg-secondary">
                            <div
                              class="h-full bg-primary transition-all duration-300"
                              style={{ width: `${fulfillmentPct}%` }}
                            />
                          </div>
                        </div>
                      </CardContent>
                    </div>

                    <div>
                      <Separator class="my-2" />
                      <CardFooter class="pt-2 flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          class="flex-1 gap-1.5 text-xs h-8"
                          onClick={() => openEditModal(cust)}
                        >
                          <IconEdit class="size-3.5" />
                          <span>{t('customers.editAlias')}</span>
                        </Button>
                        <Button
                          as={A}
                          href={`/orders?customer=${encodeURIComponent(cust.name)}`}
                          variant="ghost"
                          size="sm"
                          class="flex-1 gap-1 text-xs h-8 text-primary"
                        >
                          <span>{t('common.orders')}</span>
                          <IconArrowRight class="size-3.5" />
                        </Button>
                      </CardFooter>
                    </div>
                  </Card>
                );
              }}
            </For>
          </div>

          {/* Sentinel for infinite scroll */}
          <div ref={(el) => setSentinelRef(el)} class="py-6 text-center text-sm text-muted-foreground">
            <Show when={isLoadingMore()}>
              <div class="inline-flex items-center justify-center gap-2">
                <IconLoader2 class="size-4 animate-spin text-primary" />
                <span>
                  {t('customers.loadingMore', { count: customers().length, total: total() ?? 0 })}
                </span>
              </div>
            </Show>

            <Show when={!isLoadingMore() && (total() ?? 0) > customers().length}>
              <div class="text-xs text-muted-foreground">
                {t('customers.showingCount', { count: customers().length, total: total() ?? 0, remaining: Math.max(0, (total() ?? 0) - customers().length) })}
              </div>
            </Show>

            <Show when={!isLoadingMore() && (total() ?? 0) <= customers().length}>
              <div class="text-xs text-muted-foreground font-medium">
                {t('customers.allLoaded', { total: total() ?? 0 })}
              </div>
            </Show>

            <Show when={loadError()}>
              <div class="mt-2 text-sm text-destructive flex items-center justify-center gap-2">
                <span>{loadError()}</span>
                <Button variant="outline" size="sm" class="h-7 text-xs" onClick={() => loadMore()}>
                  {t('common.retry')}
                </Button>
              </div>
            </Show>
          </div>
        </Show>
      </Show>

      {/* Solid-UI Dialog for Edit Customer Alias */}
      <Dialog open={modalOpen()} onOpenChange={setModalOpen}>
        <DialogContent class="sm:max-w-md">
          <form onSubmit={handleSaveAlias} class="space-y-4">
            <DialogHeader>
              <DialogTitle>{t('customers.editAliasTitle')}</DialogTitle>
              <DialogDescription>
                {t('customers.editAliasDesc')}
              </DialogDescription>
            </DialogHeader>

            <Show when={errorMessage()}>
              <Alert variant="destructive">
                <IconAlertCircle class="size-4" />
                <AlertTitle>{t('common.validationError')}</AlertTitle>
                <AlertDescription>{errorMessage()}</AlertDescription>
              </Alert>
            </Show>

            <div class="space-y-3">
              <TextField value={aliasSpelling()} onChange={setAliasSpelling} class="w-full">
                <TextFieldLabel class="text-xs font-semibold">{t('customers.aliasSpelling')}</TextFieldLabel>
                <TextFieldInput placeholder={t('customers.sourceSpellingPlaceholder')} class="h-9 w-full" />
              </TextField>

              <div class="space-y-1 flex flex-col w-full">
                <label class="text-xs font-semibold">{t('customers.canonicalGroup')}</label>
                <Select<string>
                  options={canonicalOptions()}
                  value={
                    selectedCanonical() === '__NEW__'
                      ? t('customers.newCanonicalOption')
                      : selectedCanonical() || canonicalOptions()[0]
                  }
                  onChange={(val) => {
                    if (val === t('customers.newCanonicalOption')) {
                      setSelectedCanonical('__NEW__');
                      if (!newCanonicalName()) setNewCanonicalName(aliasSpelling());
                    } else {
                      setSelectedCanonical(val || '');
                    }
                  }}
                  itemComponent={(props) => (
                    <SelectItem item={props.item}>{props.item.rawValue}</SelectItem>
                  )}
                >
                  <SelectTrigger class="h-9 w-full">
                    <SelectValue<string>>
                      {(state) => state.selectedOption() || t('customers.selectCanonical')}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent />
                </Select>
              </div>

              <Show when={selectedCanonical() === '__NEW__'}>
                <TextField
                  value={newCanonicalName()}
                  onChange={setNewCanonicalName}
                  class="w-full"
                >
                  <TextFieldLabel class="text-xs font-semibold">{t('customers.newCanonicalName')}</TextFieldLabel>
                  <TextFieldInput placeholder={t('customers.officialCustomerPlaceholder')} class="h-9 w-full" />
                </TextField>
              </Show>

              <div class="space-y-1 flex flex-col w-full">
                <label class="text-xs font-semibold">{t('customers.deliveryArea')}</label>
                <AreaCombobox
                  value={aliasArea()}
                  onChange={setAliasArea}
                  areas={() => areasData()?.areas}
                  placeholder={t('customers.areaPlaceholder')}
                  class="w-full"
                />
              </div>
            </div>

            <DialogFooter class="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setModalOpen(false)}
                disabled={isSubmitting()}
              >
                {t('common.cancel')}
              </Button>
              <Button type="submit" size="sm" disabled={isSubmitting()}>
                <Show when={isSubmitting()} fallback={t('customers.saveAlias')}>
                  <span class="flex items-center gap-1.5">
                    <IconLoader2 class="size-3.5 animate-spin" /> {t('common.saving')}
                  </span>
                </Show>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
