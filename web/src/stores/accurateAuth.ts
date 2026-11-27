import { ACCURATE_LOGIN_STATUS } from '~/domain';

import { batch, createSignal } from 'solid-js';
import * as api from '~/api';
import type { AccurateDatabase, AccurateStatus } from '~/types';
import type { AuthContextValue } from '~/auth';

type Can = AuthContextValue['can'];
let generation = 0;
export function clearAccurateState(): void {
  batch(() => {
    resetLoginFlow();
    publishStatus({ enabled: false, connected: false });
    setAuthError(null);
    setIsLoginModalOpen(false);
  });
}

export const [status, setStatus] = createSignal<AccurateStatus>({
  enabled: false,
  connected: false,
});
export const [databases, setDatabases] = createSignal<AccurateDatabase[]>([]);
export const [isAuthLoading, setIsAuthLoading] = createSignal(false);
export const [authError, setAuthError] = createSignal<string | null>(null);
export const [isLoginModalOpen, setIsLoginModalOpen] = createSignal(false);
export const [pendingChallengeId, setPendingChallengeId] = createSignal<string | null>(null);
const [tenantRevision, setTenantRevision] = createSignal(0);
export { tenantRevision };

function publishStatus(next: AccurateStatus) {
  const previous = status();
  batch(() => {
    if (previous.connected !== next.connected || previous.provider !== next.provider ||
        previous.database?.id !== next.database?.id || previous.database?.uniqueId !== next.database?.uniqueId) {
      setTenantRevision((revision) => revision + 1);
    }
    setStatus(next);
  });
}

function resetLoginFlow() {
  generation++;
  setDatabases([]);
  setPendingChallengeId(null);
  setIsAuthLoading(false);
}

export function closeAccurateLogin() {
  batch(() => {
    setIsLoginModalOpen(false);
    resetLoginFlow();
    setAuthError(null);
  });
}

export async function refreshStatus(can: Can): Promise<void> {
  if (!can('accurate:read')) return;
  const current = generation;
  try {
    const s = await api.getAccurateStatus();
    if (current !== generation || !can('accurate:read')) return;
    batch(() => {
      if (!s.connected && status().connected) resetLoginFlow();
      publishStatus(s);
    });
  } catch {
    if (current !== generation) return;
    batch(() => {
      resetLoginFlow();
      publishStatus({ enabled: false, connected: false });
    });
  }
}

export async function handleLogin(can: Can, otpParam?: string): Promise<boolean> {
  if (!can('accurate:create')) return false;
  const current = ++generation;
  setIsAuthLoading(true);
  setAuthError(null);

  try {
    const res = await api.accurateLogin({
      challengeId: pendingChallengeId() ?? undefined,
      otp: otpParam || undefined,
    });
    if (current !== generation || !can('accurate:create')) return false;

	if (res.status === ACCURATE_LOGIN_STATUS.MFA_REQUIRED && res.challengeId) {
      setPendingChallengeId(res.challengeId);
      setIsAuthLoading(false);
      return false; // MFA pending
    }

    setPendingChallengeId(null);
    if (!can('accurate:read') || !can('accurate:update')) {
      await refreshStatus(can);
      if (current !== generation) return false;
      setIsAuthLoading(false);
      return true;
    }
    const dbs = await api.getAccurateDatabases();
    if (current !== generation || !can('accurate:read')) return false;
    setDatabases(dbs);
    if (dbs.length === 1 && can('accurate:update')) return handleSelectDatabase(can, dbs[0].id);

    setIsAuthLoading(false);
    return true; // Authenticated
  } catch (err) {
    if (current !== generation) return false;
    setIsAuthLoading(false);
    const msg = err instanceof Error ? err.message : 'Login failed';
    setAuthError(msg);
    return false;
  }
}

export async function handleSelectDatabase(can: Can, dbId: number): Promise<boolean> {
  if (!can('accurate:update')) return false;
  const previous = status();
  const current = ++generation;
  batch(() => {
    setIsAuthLoading(true);
    setAuthError(null);
    publishStatus({ ...previous, connected: false, database: undefined });
  });

  try {
    const res = await api.selectAccurateDatabase({ id: dbId });
    if (current !== generation || !can('accurate:update')) return false;
    if (res.success) {
      batch(() => {
        publishStatus({ ...previous, enabled: true, connected: true, database: res.database });
        closeAccurateLogin();
      });
      return true;
    }
    throw new Error('Failed to select database');
  } catch (err) {
    if (current !== generation) return false;
    if (err instanceof api.ApiError && err.status === 401) {
      handleSessionInvalidated(can('accurate:create'), err.message);
    } else {
      await refreshStatus(can);
      if (current !== generation) return false;
      setIsAuthLoading(false);
      setAuthError(err instanceof Error ? err.message : 'Failed to select database');
    }
    return false;
  }
}

export async function loadAccurateDatabases(can: Can): Promise<void> {
  if (!can('accurate:read') || !can('accurate:update') || isAuthLoading() || pendingChallengeId()) return;
  const current = generation;
  setIsAuthLoading(true);
  setAuthError(null);
  try {
    const list = await api.getAccurateDatabases();
    if (current === generation && can('accurate:read') && can('accurate:update')) setDatabases(list);
  } catch (error) {
    if (current === generation) {
      handleSessionInvalidated(can('accurate:create'), error instanceof Error ? error.message : 'Failed to list databases');
    }
  } finally {
    if (current === generation) setIsAuthLoading(false);
  }
}

export function handleSessionInvalidated(canReconnect: boolean, message?: string): void {
  batch(() => {
    resetLoginFlow();
    publishStatus({ ...status(), connected: false, database: undefined });
    setAuthError(message || 'Your Accurate session was invalidated or expired. Please sign in again.');
    setIsLoginModalOpen(canReconnect);
  });
}
