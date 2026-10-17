import { createSignal, onCleanup, type Accessor } from 'solid-js';

export type DebouncedSignalSetter<T> = (val: T | ((prev: T) => T)) => void;
export type DebouncedSignalFlush<T> = (val?: T) => void;
export type DebouncedSignalCancel = () => void;

export type DebouncedSignalTuple<T> = [
  value: Accessor<T>,
  debouncedValue: Accessor<T>,
  set: DebouncedSignalSetter<T>,
  flush: DebouncedSignalFlush<T>,
  cancel: DebouncedSignalCancel
];

/**
 * Creates a debounced signal pair.
 * value() updates immediately when set() is called (ideal for binding to inputs).
 * debouncedValue() updates after delayMs of idle time.
 * flush(override?) immediately cancels any timer and synchronizes debouncedValue to value() (or override).
 * cancel() cancels any pending timer without updating debouncedValue.
 */
export function createDebouncedSignal<T>(
  initialValue: T,
  delayMs: number = 300
): DebouncedSignalTuple<T> {
  const [value, setValue] = createSignal<T>(initialValue);
  const [debounced, setDebounced] = createSignal<T>(initialValue);
  let timer: number | undefined = undefined;

  const cancel = (): void => {
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timer = undefined;
    }
  };

  const flush = (overrideVal?: T): void => {
    cancel();
    if (overrideVal !== undefined) {
      setValue(() => overrideVal);
      setDebounced(() => overrideVal);
    } else {
      setDebounced(() => value());
    }
  };

  const set = (next: T | ((prev: T) => T)): void => {
    const resolved = typeof next === 'function' ? (next as (prev: T) => T)(value()) : next;
    setValue(() => resolved);
    cancel();
    timer = window.setTimeout(() => {
      timer = undefined;
      setDebounced(() => resolved);
    }, delayMs);
  };

  onCleanup(cancel);

  return [value, debounced, set, flush, cancel];
}
