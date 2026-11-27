import { batch, createSignal, onCleanup, type Accessor, type Setter } from 'solid-js';
import { ApiError, getDataloggerSession } from '~/api';
import type { DataloggerRecord, DataloggerSession } from '~/types';
import type { ChannelMapping } from './series';

type SourceState = 'loading' | 'ready' | 'deleted' | 'empty' | 'failed';

export interface SessionSource {
  id: number;
  state: Accessor<SourceState>;
  setState: Setter<SourceState>;
  records: Accessor<readonly DataloggerRecord[]>;
  metadata: Accessor<DataloggerSession | undefined>;
  setMetadata: Setter<DataloggerSession | undefined>;
  mapping: Accessor<ChannelMapping>;
  setMapping: Setter<ChannelMapping>;
  revision: number;
}

export interface ThermalSources {
  sources: Accessor<SessionSource[]>;
  addPending: (ids: readonly number[]) => void;
  addSession: (metadata: DataloggerSession) => void;
  remap: (from: string | undefined, to?: string) => void;
  remove: (source: SessionSource) => void;
  retry: (source: SessionSource) => void;
}

export function createThermalSources(load: (ids: readonly number[]) => Promise<void>, recordsBySession: Accessor<Record<string, DataloggerRecord[]>>): ThermalSources {
  const [sources, setSources] = createSignal<SessionSource[]>([]);
  let disposed = false;
  onCleanup(() => { disposed = true; });

  function session(id: number, initial?: DataloggerSession): SessionSource {
    const [state, setState] = createSignal<SourceState>('loading');
    const [metadata, setMetadata] = createSignal(initial);
    const [mapping, setMapping] = createSignal<ChannelMapping>({ sensor: '', unit: 'C' });
    return { id, state, setState, records: () => recordsBySession()[String(id)] ?? [], metadata, setMetadata, mapping, setMapping, revision: 0 };
  }

  async function loadSessions(group: SessionSource[]) {
    if (!group.length) return;
    const requests = group.map((source) => {
      const revision = ++source.revision;
      source.setState('loading');
      return { source, revision };
    });
    const records = load(group.map((source) => source.id));
    await Promise.all(requests.map(async ({ source, revision }) => {
      try {
        await records;
        if (disposed || revision !== source.revision) return;
        const rows = source.records();
        const known = source.metadata();
        const metadata = known && rows.length ? known : (await getDataloggerSession(source.id)).session;
        if (disposed || revision !== source.revision) return;
        batch(() => {
          source.setMetadata(metadata);
          source.setState(rows.length ? 'ready' : 'empty');
        });
      } catch (error) {
        if (disposed || revision !== source.revision) return;
        source.setState(error instanceof ApiError && error.status === 404 ? 'deleted' : 'failed');
      }
    }));
  }

  function addPending(ids: readonly number[]) {
    const existing = new Set(sources().map((source) => source.id));
    const pending = ids.filter((id) => !existing.has(id)).map((id) => session(id));
    if (!pending.length) return;
    setSources((current) => [...current, ...pending]);
    void loadSessions(pending);
  }

  function addSession(metadata: DataloggerSession) {
    if (sources().some((source) => source.id === metadata.id)) return;
    const source = session(metadata.id, metadata);
    setSources((current) => [...current, source]);
    void loadSessions([source]);
  }

  function remap(from: string | undefined, to = '') {
    batch(() => {
      for (const source of sources()) {
        const current = source.mapping();
        if (current.sensor && (from === undefined || from === current.sensor)) source.setMapping({ ...current, sensor: to });
      }
    });
  }

  return {
    sources, addPending, addSession, remap,
    remove(source) {
      source.revision++;
      setSources((current) => current.filter((item) => item !== source));
    },
    retry(source) { void loadSessions([source]); },
  };
}
