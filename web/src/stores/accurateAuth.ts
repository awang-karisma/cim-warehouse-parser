import { ACCURATE_LOGIN_STATUS } from '~/domain';

import { createSignal } from 'solid-js';
import * as api from '~/api';
import type { AccurateDatabase, AccurateStatus } from '~/types';
import type { AuthContextValue } from '~/auth';

type Can = AuthContextValue['can'];
let generation = 0;
export function clearAccurateState(): void {
  generation++;
  setStatus({ enabled: false, connected: false });
  setDatabases([]);
  setIsAuthLoading(false);
  setAuthError(null);
  setIsLoginModalOpen(false);
  setPendingChallengeId(null);
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

export async function refreshStatus(can: Can): Promise<void> {
  if (!can('accurate:read')) return;
  const current = generation;
  try {
    const s = await api.getAccurateStatus();
    if (current === generation && can('accurate:read')) setStatus(s);
  } catch {
    if (current === generation) setStatus({ enabled: false, connected: false });
  }
}

export async function handleLogin(can: Can, otpParam?: string): Promise<boolean> {
  if (!can('accurate:create')) return false;
  const current = generation;
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
    if (dbs.length === 1 && can('accurate:update')) {
      await handleSelectDatabase(can, dbs[0].id);
      if (current !== generation) return false;
    }

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
  const current = generation;
  setIsAuthLoading(true);
  setAuthError(null);

  try {
    const res = await api.selectAccurateDatabase({ id: dbId });
    if (current !== generation || !can('accurate:update')) return false;
    if (res.success) {
      await refreshStatus(can);
      if (current !== generation || !can('accurate:update')) return false;
      setIsLoginModalOpen(false);
      setIsAuthLoading(false);
      return true;
    }
    setIsAuthLoading(false);
    return false;
  } catch (err) {
    if (current !== generation) return false;
    setIsAuthLoading(false);
    const msg = err instanceof Error ? err.message : 'Failed to select database';
    setAuthError(msg);
    return false;
  }
}

export async function loadAccurateDatabases(can: Can): Promise<void> {
  if (!can('accurate:read') || !can('accurate:update')) return;
  const current = generation;
  try {
    const list = await api.getAccurateDatabases();
    if (current === generation && can('accurate:read') && can('accurate:update')) setDatabases(list);
  } catch (error) {
    if (current === generation) setAuthError(error instanceof Error ? error.message : 'Failed to list databases');
  }
}

export function handleSessionInvalidated(canReconnect: boolean, message?: string): void {
  setStatus((prev) => ({ ...prev, connected: false }));
  setAuthError(message || 'Your Accurate session was invalidated or expired. Please sign in again.');
  setIsLoginModalOpen(canReconnect);
}
