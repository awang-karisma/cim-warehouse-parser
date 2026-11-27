import { USER_ROLE } from '~/domain';

import { discardApiSession, observeAuthorizationFailures } from '~/api';
import type { Permission } from '~/permissions.generated';
import { clearAccurateState } from '~/stores/accurateAuth';
import { clearServerDesigns } from '~/stores/barcodeConfig';
import { clearItems } from '~/stores/barcodeItems';

import {
  batch,
  createMemo,
  createContext,
  useContext,
  createSignal,
  onCleanup,
  onMount,
  type ParentComponent,
} from 'solid-js';

export interface AuthUser {
  email: string;
  name: string;
  picture: string;
  role: string;
  permissions: Array<Permission | '*'>;
  locale?: string;
}

export interface AuthConfig {
  auth_enabled: boolean;
  google_client_id?: string;
}

export interface AuthContextValue {
  user: () => AuthUser | null | undefined;
  authConfig: () => AuthConfig | undefined;
  loading: () => boolean;
  failed: () => boolean;
  can: (permission: Permission) => boolean;
  canAny: (...permissions: Permission[]) => boolean;
  accessKey: () => string;
  login: (credential: string) => Promise<void>;
  logout: () => Promise<void>;
  refetch: () => Promise<void>;
  setUserLocale: (locale: string) => void;
}

const AuthContext = createContext<AuthContextValue>();

function sessionKey(user: AuthUser | null | undefined, config: AuthConfig | undefined): string {
  if (config?.auth_enabled === false) return 'local';
  return user ? JSON.stringify([user.email, user.role, user.permissions]) : '';
}

async function readUser(response: Response): Promise<AuthUser> {
  const { user } = await response.json() as { user?: AuthUser };
  if (!user || typeof user.email !== 'string' || typeof user.role !== 'string' || !Array.isArray(user.permissions)) {
    throw new Error('Invalid authorization response');
  }
  return user;
}

export const AuthProvider: ParentComponent = (props) => {
  // undefined = initial loading state, null = unauthenticated, AuthUser = authenticated
  const [user, setUser] = createSignal<AuthUser | null | undefined>(undefined);
  const [authConfig, setAuthConfig] = createSignal<AuthConfig | undefined>(undefined);
  const [loading, setLoading] = createSignal(true);

  const [failed, setFailed] = createSignal(false);
  const accessKey = createMemo(() => sessionKey(user(), authConfig()));
  const permissions = createMemo(() => new Set(user()?.permissions));
  const can = (permission: Permission) => !failed() &&
    (authConfig()?.auth_enabled === false || permissions().has('*') || permissions().has(permission));
  const canAny = (...grants: Permission[]) => grants.some(can);
  let generation = 0;
  let changing = false;
  let inflight: Promise<void> | undefined;

  const publish = (next: AuthUser | null | undefined, cfg = authConfig()) => {
    const changed = sessionKey(next, cfg) !== accessKey();
    if (changed) discardApiSession();
    batch(() => {
      if (changed) {
        clearAccurateState();
        clearServerDesigns();
        clearItems();
      }
      setAuthConfig(cfg);
      setUser(next);
    });
  };

  const refetch = (): Promise<void> => {
    if (changing) return Promise.resolve();
    if (inflight) return inflight;
    const started = generation;
    const refresh = async () => {
      try {
        let cfg = authConfig();
        if (!cfg) {
          const response = await fetch('/auth/config', { cache: 'no-store' });
          if (!response.ok) throw new Error('Failed to load authentication configuration');
          cfg = await response.json() as AuthConfig;
          if (typeof cfg?.auth_enabled !== 'boolean') throw new Error('Invalid authentication configuration');
        }
        if (started !== generation) return;
        let next: AuthUser | null;
        if (cfg.auth_enabled === false) {
          next = { email: '', name: 'Developer', picture: '', role: USER_ROLE.SUPERADMIN, permissions: ['*'] };
        } else {
          const response = await fetch('/auth/me', { cache: 'no-store' });
          if (response.status === 401) next = null;
          else if (response.ok) next = await readUser(response);
          else throw new Error('Failed to load authentication session');
        }
        if (started !== generation) return;
        batch(() => { publish(next, cfg); setFailed(false); });
      } catch {
        if (started !== generation) return;
        batch(() => { publish(undefined); setFailed(true); });
      } finally {
        if (started === generation) {
          inflight = undefined;
          setLoading(false);
        }
      }
    };
    // Schedule after the slot is assigned, including the auth-disabled path.
    inflight = Promise.resolve().then(refresh);
    return inflight;
  };

  onMount(() => {
    const focus = () => { void refetch(); };
    const forget = observeAuthorizationFailures((status) => {
      if (changing || authConfig()?.auth_enabled !== true) return;
      if (status === 401) {
        generation++;
        inflight = undefined;
        publish(null);
      }
      void refetch();
    });
    window.addEventListener('focus', focus);
    onCleanup(() => {
      generation++;
      discardApiSession();
      forget();
      window.removeEventListener('focus', focus);
    });
    focus();
  });

  const login = async (credential: string): Promise<void> => {
    if (changing || authConfig()?.auth_enabled !== true) return;
    const started = ++generation;
    inflight = undefined;
    changing = true;
    try {
      const res = await fetch('/auth/google/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Login failed');
      }
      const next = await readUser(res);
      if (started === generation) batch(() => { publish(next); setFailed(false); });
    } finally {
      if (started === generation) changing = false;
    }
  };

  const logout = async (): Promise<void> => {
    if (changing || authConfig()?.auth_enabled !== true) return;
    const started = ++generation;
    inflight = undefined;
    changing = true;
    publish(null);
    try {
      const res = await fetch('/auth/logout', { method: 'POST' });
      if (!res.ok) throw new Error('Logout failed');
    } catch {
      if (started === generation) setFailed(true);
    } finally {
      if (started === generation) changing = false;
    }
  };

  const setUserLocale = (locale: string) => {
    setUser((prev) => (prev ? { ...prev, locale } : prev));
  };

  const value: AuthContextValue = {
    user,
    authConfig,
    loading,
    failed,
    can,
    canAny,
    accessKey,
    login,
    logout,
    refetch,
    setUserLocale,
  };

  return <AuthContext.Provider value={value}>{props.children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
