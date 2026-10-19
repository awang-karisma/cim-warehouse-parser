import {
  createSignal,
  createMemo,
  createEffect,
  on,
  untrack,
  onCleanup,
  batch,
  type Accessor,
  type Setter,
} from 'solid-js';
import { useSearchParams, useLocation } from '@solidjs/router';

type SearchParamMap = Record<string, string | string[] | number | number[] | boolean | boolean[] | null | undefined>;

export type FilterDef<T> = {
  key: string;
  defaultValue: T;
  parse: (raw: string | null) => T;
  serialize: (val: T) => string | null;
  debounceMs?: number;
};

interface FieldState<V> {
  value: Accessor<V>;
  debouncedValue: Accessor<V>;
  setValue: Setter<V>;
  setDebouncedValue?: Setter<V>;
  set: (next: V | ((prev: V) => V)) => void;
  cancel?: () => void;
  flush?: () => void;
}

function setupField<V>(
  def: FilterDef<V>,
  readRawParam: () => string | null,
  updateUrl: (key: string, val: string | null) => void
): FieldState<V> {
  const initialVal = def.parse(readRawParam());
  const [val, setVal] = createSignal<V>(initialVal);

  if (def.debounceMs && def.debounceMs > 0) {
    const [debouncedVal, setDebouncedVal] = createSignal<V>(initialVal);
    let timer: number | undefined;

    const cancel = () => {
      if (timer !== undefined) {
        window.clearTimeout(timer);
        timer = undefined;
      }
    };

    const flush = () => {
      cancel();
      setDebouncedVal(() => val());
    };

    const set = (next: V | ((prev: V) => V)) => {
      const resolved = typeof next === 'function' ? (next as (prev: V) => V)(val()) : next;
      setVal(() => resolved);
      cancel();
      timer = window.setTimeout(() => {
        timer = undefined;
        setDebouncedVal(() => resolved);
      }, def.debounceMs);
    };

    onCleanup(cancel);

    createEffect(
      on(
        debouncedVal,
        (nextVal) => {
          updateUrl(def.key, def.serialize(nextVal));
        },
        { defer: true }
      )
    );

    return {
      value: val,
      debouncedValue: debouncedVal,
      setValue: setVal,
      setDebouncedValue: setDebouncedVal,
      set,
      cancel,
      flush,
    };
  }

  createEffect(
    on(
      val,
      (nextVal) => {
        updateUrl(def.key, def.serialize(nextVal));
      },
      { defer: true }
    )
  );

  return {
    value: val,
    debouncedValue: val,
    setValue: setVal,
    set: (next: V | ((prev: V) => V)) => {
      const resolved = typeof next === 'function' ? (next as (prev: V) => V)(val()) : next;
      setVal(() => resolved);
    },
  };
}

export function createUrlFilter<T extends Record<string, unknown>>(
  defs: { [K in keyof T]: FilterDef<T[K]> }
): {
  values: { [K in keyof T]: Accessor<T[K]> };
  debouncedValues: { [K in keyof T]: Accessor<T[K]> };
  setters: { [K in keyof T]: (v: T[K] | ((prev: T[K]) => T[K])) => void };
  flush: (key?: keyof T) => void;
  reset: () => void;
  rawSearchParams: Accessor<URLSearchParams>;
} {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const rawSearchParams = createMemo(() => new URLSearchParams(location.search));

  const readParam = (key: string): string | null => {
    const raw = searchParams[key];
    if (Array.isArray(raw)) {
      return raw[0] ?? null;
    }
    return raw ?? null;
  };
  const keys = Object.keys(defs) as Array<keyof T>;
  const currentParams: Record<string, string | undefined> = {};
  for (const k of keys) {
    const raw = readParam(defs[k].key);
    if (raw !== null && raw !== '') {
      currentParams[defs[k].key] = raw;
    }
  }

  const fields = {} as { [K in keyof T]: FieldState<T[K]> };

  const updateUrl = (key: string, serialized: string | null) => {
    const currentVal = currentParams[key] ?? null;
    const isCurrentlyMissing = currentVal === null || currentVal === '';
    if (serialized === null && isCurrentlyMissing) {
      return;
    }
    if (serialized !== null && currentVal === serialized) {
      return;
    }

    const nextParams: SearchParamMap = { [key]: serialized ?? undefined };
    if (serialized !== null && serialized !== '') {
      currentParams[key] = serialized;
    } else {
      delete currentParams[key];
    }

    if (key !== 'offset' && key !== 'limit' && 'offset' in defs) {
      const offsetDef = defs['offset' as keyof T];
      const currentOffset = untrack(() => fields['offset' as keyof T].value());
      if (currentOffset !== offsetDef.defaultValue) {
        delete currentParams[offsetDef.key];
        nextParams[offsetDef.key] = undefined;
        fields['offset' as keyof T].setValue(() => offsetDef.defaultValue);
        fields['offset' as keyof T].setDebouncedValue?.(() => offsetDef.defaultValue);
      }
    }

    setSearchParams(nextParams, { replace: true });
  };

  for (const k of keys) {
    const def = defs[k];
    const field = setupField(def, () => readParam(def.key), updateUrl);
    fields[k] = field;

    createEffect(
      on(
        () => readParam(def.key),
        (raw) => {
          if (raw !== null && raw !== '') {
            currentParams[def.key] = raw;
          } else {
            delete currentParams[def.key];
          }
          const parsed = def.parse(raw);
          const current = untrack(() => field.value());
          if (!Object.is(current, parsed)) {
            field.cancel?.();
            field.setValue(() => parsed);
            field.setDebouncedValue?.(() => parsed);
          }
        },
        { defer: true }
      )
    );
  }


  const values = {} as { [K in keyof T]: Accessor<T[K]> };
  const debouncedValues = {} as { [K in keyof T]: Accessor<T[K]> };
  const setters = {} as { [K in keyof T]: (v: T[K] | ((prev: T[K]) => T[K])) => void };

  for (const k of keys) {
    values[k] = fields[k].value;
    debouncedValues[k] = fields[k].debouncedValue;
    setters[k] = fields[k].set;
  }

  const flush = (key?: keyof T) => {
    if (key !== undefined) {
      fields[key]?.flush?.();
    } else {
      for (const k of keys) {
        fields[k].flush?.();
      }
    }
  };

  const reset = () => {
    batch(() => {
      const paramsToClear: SearchParamMap = {};
      for (const prop in currentParams) {
        delete currentParams[prop];
      }
      for (const k of keys) {
        const def = defs[k];
        const field = fields[k];
        field.cancel?.();
        const defaultVal = def.defaultValue;
        field.setValue(() => defaultVal);
        field.setDebouncedValue?.(() => defaultVal);
        paramsToClear[def.key] = undefined;
      }
      setSearchParams(paramsToClear, { replace: true });
    });
  };

  return {
    values,
    debouncedValues,
    setters,
    flush,
    reset,
    rawSearchParams,
  };
}
