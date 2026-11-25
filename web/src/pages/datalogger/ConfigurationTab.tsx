import { createEffect, createMemo, createResource, createSignal, For, Show } from 'solid-js';
import {
  IconAlertCircle,
  IconCheck,
  IconClock,
  IconDeviceFloppy,
  IconRefresh,
  IconRotateClockwise,
  IconSettings,
  IconTrash,
} from '@tabler/icons-solidjs';
import {
  createDataloggerProfile,
  deleteDataloggerProfile,
  getDataloggerProfiles,
  updateDataloggerProfile,
} from '~/api';
import { useAuth } from '~/auth';
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from '~/components/ui/alert-dialog';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { DATALOGGER_START_MODE, type DataloggerStartMode, USER_ROLE } from '~/domain';
import { useI18n } from '~/i18n';
import type { DataloggerConfiguration, DataloggerProfile } from '~/types';
import type { DataloggerDeviceSession } from '~/components/datalogger/device-session';
import { DeviceConnectSection } from '~/components/datalogger/DeviceConnectSection';
import {
  calculateLoggingInterval,
  encodeTimezoneOffset,
  parseAndValidateScheduledStartLocal,
  formatDisplayTimeout,
  RC5_PLUS_MODEL,
} from '~/components/datalogger/elitech-protocol';
import { formatDateTimeFull } from '~/components/datalogger/format';

export interface ConfigurationTabProps {
  device: DataloggerDeviceSession;
  active: boolean;
  onSwitchToImport: () => void;
}

function isPrintableAscii(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code > 0x7e) return false;
  }
  return true;
}

function normalizeDatetimeLocalString(raw: string): string {
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)) {
    return `${trimmed}:00`;
  }
  return trimmed;
}

function formatDurationHuman(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return '0s';
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
  return parts.join(' ');
}

function decomposeDurationSeconds(totalSeconds: number): {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
} {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(safe / 86400);
  const hours = Math.floor((safe % 86400) / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return { days, hours, minutes, seconds };
}

function formatHostTimezoneLabel(now: Date = new Date()): string {
  const tzName = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local';
  const offsetMin = -now.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `${tzName} (UTC${sign}${hh}:${mm})`;
}

export function ConfigurationTab(props: ConfigurationTabProps) {
  const { t } = useI18n();
  const auth = useAuth();

  const isAdmin = () => {
    const role = auth.user()?.role;
    return role === USER_ROLE.ADMIN || role === USER_ROLE.SUPERADMIN;
  };

  // Profiles resource & state
  const [profilesData, { refetch: refetchProfiles }] = createResource(getDataloggerProfiles);
  const [selectedProfileId, setSelectedProfileId] = createSignal<number | null>(null);
  const [profileNameInput, setProfileNameInput] = createSignal('');
  const [profileSaving, setProfileSaving] = createSignal(false);
  const [profileError, setProfileError] = createSignal<string | null>(null);
  const [profileSuccess, setProfileSuccess] = createSignal<string | null>(null);
  const [confirmDeleteProfileOpen, setConfirmDeleteProfileOpen] = createSignal(false);

  // Configuration form draft state (inputs stay mounted so focus is preserved)
  const [intervalInput, setIntervalInput] = createSignal('60');
  const [useDuration, setUseDuration] = createSignal(false);
  const [durationDaysInput, setDurationDaysInput] = createSignal('0');
  const [durationHoursInput, setDurationHoursInput] = createSignal('0');
  const [durationMinutesInput, setDurationMinutesInput] = createSignal('0');
  const [durationSecondsInput, setDurationSecondsInput] = createSignal('0');
  const [startMode, setStartMode] = createSignal<DataloggerStartMode>(DATALOGGER_START_MODE.MANUAL);
  const [startDelayInput, setStartDelayInput] = createSignal('0');
  const [scheduledStartInput, setScheduledStartInput] = createSignal('');
  const [tripNumberInput, setTripNumberInput] = createSignal('');
  const [tripDescriptionInput, setTripDescriptionInput] = createSignal('');
  const [displayTimeoutCode, setDisplayTimeoutCode] = createSignal<number>(1);
  const [settingTimeout, setSettingTimeout] = createSignal(false);
  const [timeoutSuccessMsg, setTimeoutSuccessMsg] = createSignal<string | null>(null);
  const [isDirty, setIsDirty] = createSignal(false);

  // Errors & status
  const [configError, setConfigError] = createSignal<string | null>(null);
  const [readingConfig, setReadingConfig] = createSignal(false);

  // Confirmation dialogs
  const [pendingDraftAction, setPendingDraftAction] = createSignal<
    { type: 'read-device' } | { type: 'load-profile'; profile: DataloggerProfile } | null
  >(null);
  const [confirmOperation, setConfirmOperation] = createSignal<'apply' | 'quick-reset' | null>(
    null,
  );
  const [confirmSnapshotMeta, setConfirmSnapshotMeta] = createSignal<{
    serial: string;
    modelName: string;
    model: number;
    recordCount: number;
    hostTimeText: string;
    hostTzText: string;
  } | null>(null);

  let lastAutoReadKey: string | null = null;

  const profiles = () => profilesData()?.profiles ?? [];
  const selectedProfile = createMemo(
    () => profiles().find((p) => p.id === selectedProfileId()) ?? null,
  );

  const requestedDurationSeconds = createMemo((): number | null => {
    if (!useDuration()) return null;
    const d = Number(durationDaysInput() || '0');
    const h = Number(durationHoursInput() || '0');
    const m = Number(durationMinutesInput() || '0');
    const s = Number(durationSecondsInput() || '0');
    if (
      !Number.isInteger(d) ||
      d < 0 ||
      !Number.isInteger(h) ||
      h < 0 ||
      !Number.isInteger(m) ||
      m < 0 ||
      !Number.isInteger(s) ||
      s < 0
    ) {
      return -1;
    }
    return d * 86400 + h * 3600 + m * 60 + s;
  });

  const durationCalculation = createMemo((): {
    effectiveInterval: number | null;
    achievedSeconds: number | null;
    capacity: number | null;
    error: string | null;
  } => {
    if (!useDuration()) {
      return { effectiveInterval: null, achievedSeconds: null, capacity: null, error: null };
    }
    const totalSec = requestedDurationSeconds();
    if (totalSec === null || totalSec <= 0) {
      return {
        effectiveInterval: null,
        achievedSeconds: null,
        capacity: null,
        error: 'Target logging duration must be greater than 0 seconds.',
      };
    }
    const info = props.device.deviceInfo();
    if (!info || info.deviceCapacity <= 0) {
      return {
        effectiveInterval: null,
        achievedSeconds: null,
        capacity: null,
        error: null,
      };
    }
    try {
      const effectiveInterval = calculateLoggingInterval(totalSec, info.deviceCapacity);
      return {
        effectiveInterval,
        achievedSeconds: effectiveInterval * info.deviceCapacity,
        capacity: info.deviceCapacity,
        error: null,
      };
    } catch (err) {
      return {
        effectiveInterval: null,
        achievedSeconds: null,
        capacity: info.deviceCapacity,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });

  const syncIntervalFromDurationIfPossible = (totalSec: number) => {
    const info = props.device.deviceInfo();
    if (!info || info.deviceCapacity <= 0 || totalSec <= 0) return;
    try {
      const calculated = calculateLoggingInterval(totalSec, info.deviceCapacity);
      setIntervalInput(String(calculated));
    } catch {
      // Keep current input; durationCalculation() surfaces the out-of-range error without clamping.
    }
  };

  const applyDraftFromConfig = (cfg: DataloggerConfiguration, nextDirty: boolean) => {
    setStartMode(cfg.start_mode);
    setStartDelayInput(
      String(cfg.start_mode === DATALOGGER_START_MODE.MANUAL ? cfg.start_delay_seconds : 0),
    );
    setScheduledStartInput(
      cfg.start_mode === DATALOGGER_START_MODE.TIMER && cfg.scheduled_start_local
        ? cfg.scheduled_start_local
        : '',
    );
    setTripNumberInput(cfg.trip_number);
    setTripDescriptionInput(cfg.trip_description);

    if (cfg.duration_seconds !== null && cfg.duration_seconds > 0) {
      const parts = decomposeDurationSeconds(cfg.duration_seconds);
      setUseDuration(true);
      setDurationDaysInput(String(parts.days));
      setDurationHoursInput(String(parts.hours));
      setDurationMinutesInput(String(parts.minutes));
      setDurationSecondsInput(String(parts.seconds));
      const info = props.device.deviceInfo();
      if (info && info.deviceCapacity > 0) {
        try {
          const recomputed = calculateLoggingInterval(cfg.duration_seconds, info.deviceCapacity);
          setIntervalInput(String(recomputed));
        } catch {
          setIntervalInput(String(cfg.interval_seconds));
        }
      } else {
        setIntervalInput(String(cfg.interval_seconds));
      }
    } else {
      setUseDuration(false);
      setDurationDaysInput('0');
      setDurationHoursInput('0');
      setDurationMinutesInput('0');
      setDurationSecondsInput('0');
      setIntervalInput(String(cfg.interval_seconds));
    }

    setIsDirty(nextDirty);
    setConfigError(null);
  };

  const executeReadFromDevice = async () => {
    setReadingConfig(true);
    setConfigError(null);
    try {
      const res = await props.device.readConfiguration();
      setDisplayTimeoutCode(res.displayTimeoutCode || 1);
      applyDraftFromConfig(res.config, false);
    } catch (err) {
      setConfigError(err instanceof Error ? err.message : String(err));
    } finally {
      setReadingConfig(false);
    }
  };

  // Guard configuration auto-read by the active config tab and connection identity
  createEffect(() => {
    const isConn = props.device.connected();
    const info = props.device.deviceInfo();
    if (!isConn || !info) {
      lastAutoReadKey = null;
      setDisplayTimeoutCode(1);
      return;
    }
    if (!props.active || props.device.deviceBusy() || props.device.pendingVerification()) {
      return;
    }
    const key = `${info.model}:${info.serialNumber}`;
    if (key !== lastAutoReadKey) {
      lastAutoReadKey = key;
      if (info.displayTimeoutCode) {
        setDisplayTimeoutCode(info.displayTimeoutCode);
      }
      if (!isDirty()) {
        void executeReadFromDevice();
      }
    }
  });

  // When a device connects while a duration-bearing draft is loaded, recompute effective interval
  createEffect(() => {
    const info = props.device.deviceInfo();
    const totalSec = requestedDurationSeconds();
    if (useDuration() && info && info.deviceCapacity > 0 && totalSec !== null && totalSec > 0) {
      syncIntervalFromDurationIfPossible(totalSec);
    }
  });

  const handleRequestReadFromDevice = () => {
    if (isDirty()) {
      setPendingDraftAction({ type: 'read-device' });
      return;
    }
    void executeReadFromDevice();
  };

  const handleRequestLoadProfile = (profile: DataloggerProfile) => {
    if (isDirty()) {
      setPendingDraftAction({ type: 'load-profile', profile });
      return;
    }
    setSelectedProfileId(profile.id);
    setProfileNameInput(profile.name);
    applyDraftFromConfig(profile.config, false);
  };

  const handleConfirmPendingDraftAction = () => {
    const action = pendingDraftAction();
    setPendingDraftAction(null);
    if (!action) return;
    if (action.type === 'read-device') {
      void executeReadFromDevice();
    } else {
      setSelectedProfileId(action.profile.id);
      setProfileNameInput(action.profile.name);
      applyDraftFromConfig(action.profile.config, false);
    }
  };

  const buildAndValidateDraftConfig = (
    forHardwareWrite: boolean,
    referenceNow: Date = new Date(),
  ): { config?: DataloggerConfiguration; error?: string } => {
    let intervalSec = Number(intervalInput().trim());
    let durationSec: number | null = null;

    if (useDuration()) {
      const reqDur = requestedDurationSeconds();
      if (reqDur === null || reqDur <= 0 || !Number.isSafeInteger(reqDur)) {
        return { error: 'Logging duration must be a positive integer number of seconds.' };
      }
      durationSec = reqDur;
      const info = props.device.deviceInfo();
      if (forHardwareWrite) {
        if (!info || info.deviceCapacity <= 0) {
          return {
            error:
              'Connect an Elitech RC-5+ logger with valid capacity to calculate interval from duration.',
          };
        }
        try {
          intervalSec = calculateLoggingInterval(reqDur, info.deviceCapacity);
        } catch (err) {
          return { error: err instanceof Error ? err.message : String(err) };
        }
      } else if (info && info.deviceCapacity > 0) {
        try {
          intervalSec = calculateLoggingInterval(reqDur, info.deviceCapacity);
        } catch (err) {
          return { error: err instanceof Error ? err.message : String(err) };
        }
      }
    }

    if (
      !Number.isInteger(intervalSec) ||
      intervalSec < 10 ||
      intervalSec > 655350 ||
      intervalSec % 10 !== 0
    ) {
      return {
        error: 'Logging interval must be between 10 and 655,350 seconds and divisible by 10.',
      };
    }

    const mode = startMode();
    let delaySec = 0;
    if (mode === DATALOGGER_START_MODE.MANUAL) {
      delaySec = Number(startDelayInput().trim() || '0');
      if (
        !Number.isInteger(delaySec) ||
        delaySec < 0 ||
        delaySec > 655350 ||
        delaySec % 10 !== 0
      ) {
        return {
          error: 'Manual start delay must be between 0 and 655,350 seconds and divisible by 10.',
        };
      }
    }

    let scheduledLocal: string | null = null;
    if (mode === DATALOGGER_START_MODE.TIMER) {
      const norm = normalizeDatetimeLocalString(scheduledStartInput());
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(norm)) {
        return {
          error: 'Timed start requires a valid local schedule in YYYY-MM-DDTHH:mm:ss format.',
        };
      }
      if (forHardwareWrite) {
        try {
          parseAndValidateScheduledStartLocal(norm, referenceNow);
        } catch (err) {
          return { error: err instanceof Error ? err.message : String(err) };
        }
      } else {
        // Profile validation checks calendar shape and year 2000..2099 without future-time restriction
        const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/.exec(norm)!;
        const y = Number(m[1]);
        const mo = Number(m[2]);
        const d = Number(m[3]);
        const h = Number(m[4]);
        const mi = Number(m[5]);
        const s = Number(m[6]);
        const check = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
        if (
          y < 2000 ||
          y > 2099 ||
          check.getUTCFullYear() !== y ||
          check.getUTCMonth() !== mo - 1 ||
          check.getUTCDate() !== d ||
          check.getUTCHours() !== h ||
          check.getUTCMinutes() !== mi ||
          check.getUTCSeconds() !== s
        ) {
          return {
            error: 'Scheduled start time must be a valid calendar date between years 2000 and 2099.',
          };
        }
      }
      scheduledLocal = norm;
    }

    const tripNum = tripNumberInput();
    if (tripNum.length > 13 || !isPrintableAscii(tripNum)) {
      return {
        error: 'Trip number must be 0 to 13 printable ASCII characters.',
      };
    }

    const tripDesc = tripDescriptionInput();
    if (tripDesc.length > 100 || !isPrintableAscii(tripDesc)) {
      return {
        error: 'Trip description must be 0 to 100 printable ASCII characters (no line breaks or non-ASCII).',
      };
    }

    if (forHardwareWrite) {
      try {
        encodeTimezoneOffset(-referenceNow.getTimezoneOffset());
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
    }

    return {
      config: {
        interval_seconds: intervalSec,
        duration_seconds: durationSec,
        start_mode: mode,
        start_delay_seconds: delaySec,
        scheduled_start_local: scheduledLocal,
        trip_number: tripNum,
        trip_description: tripDesc,
      },
    };
  };

  const handleSaveNewProfile = async () => {
    setProfileError(null);
    setProfileSuccess(null);
    const name = profileNameInput().trim();
    if (!name) {
      setProfileError('Enter a profile name before saving.');
      return;
    }
    const { config, error } = buildAndValidateDraftConfig(false);
    if (!config || error) {
      setProfileError(error ?? 'Invalid configuration.');
      return;
    }
    setProfileSaving(true);
    try {
      const res = await createDataloggerProfile({ name, config });
      await refetchProfiles();
      setSelectedProfileId(res.id);
      setProfileNameInput(name);
      setProfileSuccess(t('dataloggerConfig.profileSavedSuccess', { name }));
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : String(err));
    } finally {
      setProfileSaving(false);
    }
  };

  const handleUpdateSelectedProfile = async () => {
    const id = selectedProfileId();
    if (id === null) return;
    setProfileError(null);
    setProfileSuccess(null);
    const name = profileNameInput().trim() || selectedProfile()?.name || '';
    if (!name) {
      setProfileError('Profile name cannot be empty.');
      return;
    }
    const { config, error } = buildAndValidateDraftConfig(false);
    if (!config || error) {
      setProfileError(error ?? 'Invalid configuration.');
      return;
    }
    setProfileSaving(true);
    try {
      await updateDataloggerProfile(id, { name, config });
      await refetchProfiles();
      setSelectedProfileId(id);
      setProfileNameInput(name);
      setProfileSuccess(t('dataloggerConfig.profileUpdatedSuccess', { name }));
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : String(err));
    } finally {
      setProfileSaving(false);
    }
  };

  const handleConfirmDeleteProfile = async () => {
    const id = selectedProfileId();
    setConfirmDeleteProfileOpen(false);
    if (id === null) return;
    setProfileError(null);
    setProfileSuccess(null);
    setProfileSaving(true);
    try {
      await deleteDataloggerProfile(id);
      setSelectedProfileId(null);
      await refetchProfiles();
      setProfileSuccess(t('dataloggerConfig.profileDeletedSuccess'));
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : String(err));
    } finally {
      setProfileSaving(false);
    }
  };

  const openHardwareConfirmation = (op: 'apply' | 'quick-reset') => {
    setConfigError(null);
    if (props.device.pendingVerification()) {
      setConfigError(
        'A previous configuration or reset operation is awaiting verification. Reconnect the logger to verify or dismiss the unverified state first.',
      );
      return;
    }
    const info = props.device.deviceInfo();
    if (!props.device.connected() || !info) {
      setConfigError('Connect an Elitech RC-5+ logger before applying configuration or Quick Reset.');
      return;
    }
    if (info.model !== RC5_PLUS_MODEL) {
      setConfigError('Configuration writes and Quick Reset are supported only on Elitech RC-5+ (0x3005).');
      return;
    }
    if (!info.serialNumber || info.serialNumber === '—') {
      setConfigError('Connected logger did not report a valid serial number.');
      return;
    }

    const now = new Date();
    if (op === 'apply') {
      const { config, error } = buildAndValidateDraftConfig(true, now);
      if (!config || error) {
        setConfigError(error ?? 'Invalid configuration draft.');
        return;
      }
    } else {
      try {
        encodeTimezoneOffset(-now.getTimezoneOffset());
      } catch (err) {
        setConfigError(err instanceof Error ? err.message : String(err));
        return;
      }
    }

    setConfirmSnapshotMeta({
      serial: info.serialNumber,
      modelName: info.modelName,
      model: info.model,
      recordCount: info.recordNumber,
      hostTimeText: formatDateTimeFull(now),
      hostTzText: formatHostTimezoneLabel(now),
    });
    setConfirmOperation(op);
  };

  const confirmTargetStillMatches = createMemo(() => {
    const meta = confirmSnapshotMeta();
    const live = props.device.deviceInfo();
    if (!meta || !props.device.connected() || !live) return false;
    return live.serialNumber === meta.serial && live.model === meta.model;
  });

  const handleSetDisplayTimeoutImmediate = async () => {
    if (!props.device.connected()) return;
    setSettingTimeout(true);
    setTimeoutSuccessMsg(null);
    setConfigError(null);
    try {
      await props.device.setDisplayTimeout(displayTimeoutCode());
      const formatted = formatDisplayTimeout(displayTimeoutCode());
      setTimeoutSuccessMsg(
        t('dataloggerConfig.displayTimeoutUpdatedSuccess', { timeout: formatted }),
      );
    } catch (err) {
      setConfigError(err instanceof Error ? err.message : String(err));
    } finally {
      setSettingTimeout(false);
    }
  };

  const handleConfirmExecuteHardwareWrite = async () => {
    const op = confirmOperation();
    const meta = confirmSnapshotMeta();
    if (!op || !meta) return;
    if (!confirmTargetStillMatches()) {
      setConfigError(t('dataloggerConfig.confirmDeviceChangedError'));
      return;
    }

    setConfirmOperation(null);
    setConfigError(null);


    try {
      if (op === 'apply') {
        const { config, error } = buildAndValidateDraftConfig(true, new Date());
        if (!config || error) {
          setConfigError(error ?? 'Invalid configuration.');
          return;
        }
        const verified = await props.device.applyConfiguration(config, {
          displayTimeoutCode: displayTimeoutCode(),
        });
        if (verified) {
          setIsDirty(false);
        }
      } else {
        await props.device.quickReset();
      }
    } catch (err) {
      setConfigError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSaveReadingsFirst = () => {
    setConfirmOperation(null);
    props.onSwitchToImport();
  };

  const hardwareWritesDisabled = () =>
    !props.device.connected() ||
    props.device.deviceBusy() ||
    readingConfig() ||
    props.device.pendingVerification() !== null;

  return (
    <div class="space-y-6">
      {/* 1. Shared USB Connection & Post-Format Verification Card (Extracted & Reusable) */}
      <DeviceConnectSection
        device={props.device}
        externalError={configError()}
        busy={readingConfig()}
        displayTimeoutCode={displayTimeoutCode()}
        actions={
          <Show when={props.device.connected()}>
            <Button
              variant="secondary"
              onClick={handleRequestReadFromDevice}
              disabled={props.device.deviceBusy() || readingConfig()}
            >
              <IconRefresh class="size-4" />
              {readingConfig()
                ? t('dataloggerConfig.readingDevice')
                : t('dataloggerConfig.readFromDevice')}
            </Button>
          </Show>
        }
      />

      {/* 2. Reusable Configuration Profiles Card */}
      <Card>
        <CardHeader>
          <CardTitle class="flex items-center gap-2">
            <IconDeviceFloppy class="size-5 text-muted-foreground" />
            {t('dataloggerConfig.profilesTitle')}
          </CardTitle>
          <CardDescription>{t('dataloggerConfig.profilesDesc')}</CardDescription>
        </CardHeader>
        <CardContent class="space-y-4">
          <Show when={profilesData.error || profileError()}>
            <Alert variant="destructive">
              <IconAlertCircle class="size-4" />
              <AlertDescription>
                {profileError() ??
                  (profilesData.error instanceof Error
                    ? profilesData.error.message
                    : String(profilesData.error))}
              </AlertDescription>
            </Alert>
          </Show>

          <Show when={profileSuccess()}>
            <Alert>
              <IconCheck class="size-4 text-status-selesai" />
              <AlertDescription>{profileSuccess()}</AlertDescription>
            </Alert>
          </Show>

          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div class="space-y-1.5">
              <label class="text-xs font-medium text-muted-foreground" for="dl-profile-select">
                {t('dataloggerConfig.profilesTitle')}
              </label>
              <Show
                when={profiles().length > 0}
                fallback={
                  <div class="flex h-10 items-center rounded-md border border-dashed px-3 text-xs text-muted-foreground">
                    {t('dataloggerConfig.noProfilesSaved')}
                  </div>
                }
              >
                <div class="flex items-center gap-2">
                  <select
                    id="dl-profile-select"
                    value={selectedProfileId() ?? ''}
                    onChange={(e) => {
                      const val = Number(e.currentTarget.value);
                      const found = profiles().find((p) => p.id === val);
                      if (found) {
                        handleRequestLoadProfile(found);
                      } else {
                        setSelectedProfileId(null);
                      }
                    }}
                    class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">{t('dataloggerConfig.selectProfilePlaceholder')}</option>
                    <For each={profiles()}>
                      {(p) => (
                        <option value={p.id}>
                          {p.name} ({p.config.interval_seconds}s · {p.config.start_mode})
                        </option>
                      )}
                    </For>
                  </select>
                  <Show when={selectedProfile()}>
                    {(prof) => (
                      <Button
                        variant="secondary"
                        onClick={() => handleRequestLoadProfile(prof())}
                        class="shrink-0"
                      >
                        {t('dataloggerConfig.loadProfileBtn')}
                      </Button>
                    )}
                  </Show>
                </div>
              </Show>
            </div>

            <Show
              when={isAdmin()}
              fallback={
                <div class="flex items-end pb-2 text-xs text-muted-foreground">
                  {t('dataloggerConfig.adminOnlyProfilesHint')}
                </div>
              }
            >
              <div class="space-y-1.5">
                <label class="text-xs font-medium text-muted-foreground" for="dl-profile-name">
                  {t('dataloggerConfig.profileNameLabel')}
                </label>
                <input
                  id="dl-profile-name"
                  type="text"
                  value={profileNameInput()}
                  onInput={(e) => setProfileNameInput(e.currentTarget.value)}
                  placeholder={t('dataloggerConfig.profileNamePlaceholder')}
                  class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
              </div>
            </Show>
          </div>

          <Show when={isAdmin()}>
            <div class="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                onClick={() => void handleSaveNewProfile()}
                disabled={profileSaving()}
              >
                <IconDeviceFloppy class="size-4" />
                {profileSaving()
                  ? t('dataloggerConfig.savingProfileBtn')
                  : t('dataloggerConfig.saveNewProfileBtn')}
              </Button>
              <Button
                variant="outline"
                onClick={() => void handleUpdateSelectedProfile()}
                disabled={profileSaving() || selectedProfileId() === null}
              >
                {t('dataloggerConfig.updateProfileBtn')}
              </Button>
              <Button
                variant="outline"
                onClick={() => setConfirmDeleteProfileOpen(true)}
                disabled={profileSaving() || selectedProfileId() === null}
              >
                <IconTrash class="size-4" />
                {t('dataloggerConfig.deleteProfileBtn')}
              </Button>
            </div>
          </Show>
        </CardContent>
      </Card>

      {/* 3. Recording Configuration Form Card */}
      <Card>
        <CardHeader>
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="space-y-1">
              <CardTitle class="flex items-center gap-2">
                <IconSettings class="size-5 text-muted-foreground" />
                {t('dataloggerConfig.formTitle')}
              </CardTitle>
              <CardDescription>{t('dataloggerConfig.formDesc')}</CardDescription>
            </div>
            <Show when={isDirty()}>
              <Badge variant="outline">{t('dataloggerConfig.dirtyDraftBadge')}</Badge>
            </Show>
          </div>
        </CardHeader>
        <CardContent class="space-y-5">
          {/* Interval & Optional Duration Calculator */}
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div class="space-y-1.5">
              <label class="text-xs font-medium text-muted-foreground" for="dl-cfg-interval">
                {t('dataloggerConfig.intervalLabel')}
              </label>
              <input
                id="dl-cfg-interval"
                type="number"
                min={10}
                max={655350}
                step={10}
                value={intervalInput()}
                onInput={(e) => {
                  setIntervalInput(e.currentTarget.value);
                  // Editing interval clears duration mode/target
                  setUseDuration(false);
                  setDurationDaysInput('0');
                  setDurationHoursInput('0');
                  setDurationMinutesInput('0');
                  setDurationSecondsInput('0');
                  setIsDirty(true);
                }}
                class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
              <p class="text-xs text-muted-foreground">{t('dataloggerConfig.intervalHint')}</p>
            </div>

            <div class="space-y-2 rounded-md border bg-muted/20 p-3.5">
              <label class="flex items-center gap-2 text-xs font-medium">
                <input
                  id="dl-cfg-use-duration"
                  type="checkbox"
                  checked={useDuration()}
                  onChange={(e) => {
                    const checked = e.currentTarget.checked;
                    setUseDuration(checked);
                    setIsDirty(true);
                    if (checked) {
                      const cur = requestedDurationSeconds();
                      if (!cur || cur <= 0) {
                        setDurationDaysInput('1');
                        setDurationHoursInput('0');
                        setDurationMinutesInput('0');
                        setDurationSecondsInput('0');
                        syncIntervalFromDurationIfPossible(86400);
                      } else {
                        syncIntervalFromDurationIfPossible(cur);
                      }
                    }
                  }}
                  class="size-4 rounded border-input"
                />
                <span>{t('dataloggerConfig.useDurationCalculator')}</span>
              </label>

              <Show when={useDuration()}>
                <div class="space-y-2.5 pt-1">
                  <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div class="space-y-1">
                      <label class="text-[11px] text-muted-foreground" for="dl-dur-days">
                        {t('dataloggerConfig.durationDays')}
                      </label>
                      <input
                        id="dl-dur-days"
                        type="number"
                        min={0}
                        step={1}
                        value={durationDaysInput()}
                        onInput={(e) => {
                          setDurationDaysInput(e.currentTarget.value);
                          setIsDirty(true);
                          const next = requestedDurationSeconds();
                          if (next && next > 0) syncIntervalFromDurationIfPossible(next);
                        }}
                        class="flex h-9 w-full rounded-md border border-input bg-background px-2.5 font-mono text-xs"
                      />
                    </div>
                    <div class="space-y-1">
                      <label class="text-[11px] text-muted-foreground" for="dl-dur-hours">
                        {t('dataloggerConfig.durationHours')}
                      </label>
                      <input
                        id="dl-dur-hours"
                        type="number"
                        min={0}
                        step={1}
                        value={durationHoursInput()}
                        onInput={(e) => {
                          setDurationHoursInput(e.currentTarget.value);
                          setIsDirty(true);
                          const next = requestedDurationSeconds();
                          if (next && next > 0) syncIntervalFromDurationIfPossible(next);
                        }}
                        class="flex h-9 w-full rounded-md border border-input bg-background px-2.5 font-mono text-xs"
                      />
                    </div>
                    <div class="space-y-1">
                      <label class="text-[11px] text-muted-foreground" for="dl-dur-minutes">
                        {t('dataloggerConfig.durationMinutes')}
                      </label>
                      <input
                        id="dl-dur-minutes"
                        type="number"
                        min={0}
                        step={1}
                        value={durationMinutesInput()}
                        onInput={(e) => {
                          setDurationMinutesInput(e.currentTarget.value);
                          setIsDirty(true);
                          const next = requestedDurationSeconds();
                          if (next && next > 0) syncIntervalFromDurationIfPossible(next);
                        }}
                        class="flex h-9 w-full rounded-md border border-input bg-background px-2.5 font-mono text-xs"
                      />
                    </div>
                    <div class="space-y-1">
                      <label class="text-[11px] text-muted-foreground" for="dl-dur-seconds">
                        {t('dataloggerConfig.durationSeconds')}
                      </label>
                      <input
                        id="dl-dur-seconds"
                        type="number"
                        min={0}
                        step={1}
                        value={durationSecondsInput()}
                        onInput={(e) => {
                          setDurationSecondsInput(e.currentTarget.value);
                          setIsDirty(true);
                          const next = requestedDurationSeconds();
                          if (next && next > 0) syncIntervalFromDurationIfPossible(next);
                        }}
                        class="flex h-9 w-full rounded-md border border-input bg-background px-2.5 font-mono text-xs"
                      />
                    </div>
                  </div>

                  <Show when={durationCalculation().error}>
                    <p class="text-xs font-medium text-destructive">
                      {durationCalculation().error}
                    </p>
                  </Show>

                  <Show
                    when={
                      durationCalculation().effectiveInterval !== null &&
                      durationCalculation().achievedSeconds !== null
                    }
                  >
                    <div class="rounded border bg-background px-2.5 py-2 font-mono text-xs">
                      {t('dataloggerConfig.durationCalcSummary', {
                        interval: String(durationCalculation().effectiveInterval),
                        capacity: (durationCalculation().capacity ?? 0).toLocaleString(),
                        achieved: `${durationCalculation().achievedSeconds!.toLocaleString()}s (${formatDurationHuman(durationCalculation().achievedSeconds!)})`,
                      })}
                    </div>
                  </Show>

                  <Show when={!props.device.deviceInfo()}>
                    <p class="text-xs text-muted-foreground">
                      {t('dataloggerConfig.durationNeedsDeviceHint')}
                    </p>
                  </Show>

                  <p class="text-[11px] text-muted-foreground">
                    {t('dataloggerConfig.durationNoStopNotice')}
                  </p>
                </div>
              </Show>
            </div>
          </div>

          {/* Start Mode & Conditional Delay / Scheduled Start */}
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div class="space-y-1.5">
              <label class="text-xs font-medium text-muted-foreground" for="dl-cfg-start-mode">
                {t('dataloggerConfig.startModeLabel')}
              </label>
              <select
                id="dl-cfg-start-mode"
                value={startMode()}
                onChange={(e) => {
                  const val = e.currentTarget.value as DataloggerStartMode;
                  setStartMode(val);
                  setIsDirty(true);
                }}
                class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value={DATALOGGER_START_MODE.IMMEDIATE}>
                  {t('dataloggerConfig.startModeImmediate')}
                </option>
                <option value={DATALOGGER_START_MODE.MANUAL}>
                  {t('dataloggerConfig.startModeManual')}
                </option>
                <option value={DATALOGGER_START_MODE.TIMER}>
                  {t('dataloggerConfig.startModeTimer')}
                </option>
              </select>
            </div>

            <Show when={startMode() === DATALOGGER_START_MODE.MANUAL}>
              <div class="space-y-1.5">
                <label class="text-xs font-medium text-muted-foreground" for="dl-cfg-delay">
                  {t('dataloggerConfig.startDelayLabel')}
                </label>
                <input
                  id="dl-cfg-delay"
                  type="number"
                  min={0}
                  max={655350}
                  step={10}
                  value={startDelayInput()}
                  onInput={(e) => {
                    setStartDelayInput(e.currentTarget.value);
                    setIsDirty(true);
                  }}
                  class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
                <p class="text-xs text-muted-foreground">
                  {t('dataloggerConfig.startDelayHint', {
                    ticks: String(Math.floor(Math.max(0, Number(startDelayInput() || '0')) / 10)),
                  })}
                </p>
              </div>
            </Show>

            <Show when={startMode() === DATALOGGER_START_MODE.TIMER}>
              <div class="space-y-1.5">
                <div class="flex flex-wrap items-center justify-between gap-1">
                  <label
                    class="text-xs font-medium text-muted-foreground"
                    for="dl-cfg-scheduled-start"
                  >
                    {t('dataloggerConfig.scheduledStartLabel')}
                  </label>
                  <span class="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
                    <IconClock class="size-3" />
                    {t('dataloggerConfig.workstationTimezoneLabel')}: {formatHostTimezoneLabel()}
                  </span>
                </div>
                <input
                  id="dl-cfg-scheduled-start"
                  type="datetime-local"
                  step={1}
                  value={scheduledStartInput()}
                  onInput={(e) => {
                    setScheduledStartInput(e.currentTarget.value);
                    setIsDirty(true);
                  }}
                  class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
                <p class="text-xs text-muted-foreground">
                  {t('dataloggerConfig.scheduledStartHint')}
                </p>
              </div>
            </Show>
          </div>

          {/* Trip Number & Trip Description */}
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div class="space-y-1.5">
              <label class="text-xs font-medium text-muted-foreground" for="dl-cfg-trip-number">
                {t('dataloggerConfig.tripNumberLabel')}
              </label>
              <input
                id="dl-cfg-trip-number"
                type="text"
                maxLength={13}
                value={tripNumberInput()}
                onInput={(e) => {
                  setTripNumberInput(e.currentTarget.value);
                  setIsDirty(true);
                }}
                placeholder="TRIP-001"
                class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
              <p class="text-xs text-muted-foreground">
                {t('dataloggerConfig.tripNumberHint', {
                  count: String(tripNumberInput().length),
                })}
              </p>
            </div>

            <div class="space-y-1.5">
              <label class="text-xs font-medium text-muted-foreground" for="dl-cfg-trip-desc">
                {t('dataloggerConfig.tripDescriptionLabel')}
              </label>
              <textarea
                id="dl-cfg-trip-desc"
                rows={3}
                maxLength={100}
                value={tripDescriptionInput()}
                onInput={(e) => {
                  setTripDescriptionInput(e.currentTarget.value);
                  setIsDirty(true);
                }}
                placeholder="Cold-chain delivery"
                class="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
              <p class="text-xs text-muted-foreground">
                {t('dataloggerConfig.tripDescriptionHint', {
                  count: String(tripDescriptionInput().length),
                })}
              </p>
            </div>
          </div>

          {/* RC-5+ Screen Display Auto-Off Timeout */}
          <div class="space-y-3 rounded-md border bg-card p-4">
            <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <label
                  class="text-xs font-semibold text-foreground"
                  for="dl-cfg-display-timeout"
                >
                  {t('dataloggerConfig.displayTimeoutLabel')}
                </label>
                <p class="text-xs text-muted-foreground">
                  {t('dataloggerConfig.displayTimeoutHint')}
                </p>
              </div>
              <Show when={props.device.connected()}>
                <Button
                  size="sm"
                  variant="outline"
                  class="h-8 text-xs shrink-0 self-start sm:self-auto gap-1.5"
                  onClick={handleSetDisplayTimeoutImmediate}
                  disabled={props.device.deviceBusy() || settingTimeout()}
                >
                  <IconSettings class="size-3.5" />
                  {settingTimeout()
                    ? t('dataloggerConfig.updatingDisplayTimeoutBtn')
                    : t('dataloggerConfig.updateDisplayTimeoutBtn')}
                </Button>
              </Show>
            </div>

            <Show when={timeoutSuccessMsg()}>
              <Alert>
                <IconCheck class="size-4 text-status-selesai" />
                <AlertDescription class="text-xs font-medium">
                  {timeoutSuccessMsg()}
                </AlertDescription>
              </Alert>
            </Show>

            <div class="max-w-xs">
              <select
                id="dl-cfg-display-timeout"
                value={displayTimeoutCode()}
                onChange={(e) => {
                  setDisplayTimeoutCode(Number(e.currentTarget.value));
                  setIsDirty(true);
                  setTimeoutSuccessMsg(null);
                }}
                class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value={1}>{t('dataloggerConfig.displayTimeout15s')}</option>
                <option value={2}>{t('dataloggerConfig.displayTimeout30s')}</option>
                <option value={3}>{t('dataloggerConfig.displayTimeout45s')}</option>
                <option value={4}>{t('dataloggerConfig.displayTimeout60s')}</option>
                <option value={15}>{t('dataloggerConfig.displayTimeoutAlwaysOn')}</option>
              </select>
            </div>
          </div>

          {/* Disclosure & Action Bar */}
          <div class="space-y-3 border-t pt-4">
            <p class="text-xs text-muted-foreground">{t('dataloggerConfig.applyDisclosure')}</p>
            <div class="flex flex-wrap items-center gap-3">
              <Button
                onClick={() => openHardwareConfirmation('apply')}
                disabled={
                  hardwareWritesDisabled() ||
                  (useDuration() &&
                    (durationCalculation().error !== null ||
                      durationCalculation().effectiveInterval === null))
                }
              >
                <IconCheck class="size-4" />
                {props.device.deviceBusy()
                  ? t('dataloggerConfig.applyingBtn')
                  : t('dataloggerConfig.applyBtn')}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 4. Quick Reset Card */}
      <Card>
        <CardHeader>
          <CardTitle class="flex items-center gap-2">
            <IconRotateClockwise class="size-5 text-muted-foreground" />
            {t('dataloggerConfig.quickResetTitle')}
          </CardTitle>
          <CardDescription>{t('dataloggerConfig.quickResetDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="destructive"
            onClick={() => openHardwareConfirmation('quick-reset')}
            disabled={hardwareWritesDisabled()}
          >
            <IconRotateClockwise class="size-4" />
            {props.device.deviceBusy()
              ? t('dataloggerConfig.quickResettingBtn')
              : t('dataloggerConfig.quickResetBtn')}
          </Button>
        </CardContent>
      </Card>

      {/* AlertDialog: Replace Dirty Draft */}
      <AlertDialog
        open={pendingDraftAction() !== null}
        onOpenChange={(open) => !open && setPendingDraftAction(null)}
      >
        <AlertDialogContent>
          <AlertDialogTitle>{t('dataloggerConfig.replaceDirtyDraftTitle')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('dataloggerConfig.replaceDirtyDraftDesc')}
          </AlertDialogDescription>
          <AlertDialogFooter class="gap-2">
            <Button variant="outline" onClick={() => setPendingDraftAction(null)}>
              {t('dataloggerConfig.cancelBtn')}
            </Button>
            <Button onClick={handleConfirmPendingDraftAction}>
              {t('dataloggerConfig.replaceDraftConfirmBtn')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AlertDialog: Delete Profile */}
      <AlertDialog open={confirmDeleteProfileOpen()} onOpenChange={setConfirmDeleteProfileOpen}>
        <AlertDialogContent>
          <AlertDialogTitle>{t('dataloggerConfig.deleteProfileConfirmTitle')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('dataloggerConfig.deleteProfileConfirmDesc', {
              name: selectedProfile()?.name ?? '',
            })}
          </AlertDialogDescription>
          <AlertDialogFooter class="gap-2">
            <Button variant="outline" onClick={() => setConfirmDeleteProfileOpen(false)}>
              {t('dataloggerConfig.cancelBtn')}
            </Button>
            <Button variant="destructive" onClick={() => void handleConfirmDeleteProfile()}>
              {t('dataloggerConfig.deleteProfileBtn')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      {/* AlertDialog: Apply Configuration / Quick Reset Destructive Confirmation */}
      <AlertDialog
        open={confirmOperation() !== null}
        onOpenChange={(open) => !open && setConfirmOperation(null)}
      >
        <AlertDialogContent>
          <AlertDialogTitle>
            {confirmOperation() === 'apply'
              ? t('dataloggerConfig.confirmApplyTitle')
              : t('dataloggerConfig.confirmQuickResetTitle')}
          </AlertDialogTitle>
          <AlertDialogDescription as="div" class="space-y-3 text-left">
            <Show when={confirmSnapshotMeta()}>
              {(meta) => (
                <div class="space-y-2 rounded-md border bg-muted/30 p-3 text-xs">
                  <div class="flex justify-between gap-2">
                    <span class="text-muted-foreground">
                      {t('dataloggerConfig.confirmOperationLabel')}:
                    </span>
                    <span class="font-semibold text-foreground">
                      {confirmOperation() === 'apply'
                        ? t('dataloggerConfig.confirmOperationApply')
                        : t('dataloggerConfig.confirmOperationQuickReset')}
                    </span>
                  </div>
                  <div class="flex justify-between gap-2">
                    <span class="text-muted-foreground">
                      {t('dataloggerConfig.confirmTargetLoggerLabel')}:
                    </span>
                    <span class="font-mono font-semibold text-foreground">
                      {meta().modelName} ({meta().serial})
                    </span>
                  </div>
                  <div class="flex justify-between gap-2">
                    <span class="text-muted-foreground">
                      {t('dataloggerConfig.confirmHostTimeLabel')}:
                    </span>
                    <span class="font-mono text-foreground">
                      {meta().hostTimeText} · {meta().hostTzText}
                    </span>
                  </div>
                </div>
              )}
            </Show>

            <div class="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs font-medium text-destructive">
              {t('dataloggerConfig.confirmErasureWarning', {
                count: (confirmSnapshotMeta()?.recordCount ?? 0).toLocaleString(),
              })}
            </div>

            <Show when={confirmOperation() === 'quick-reset'}>
              <div class="rounded-md border bg-muted/40 p-3 text-xs text-foreground">
                {t('dataloggerConfig.confirmQuickResetIgnoreDraftWarning')}
              </div>
            </Show>

            <Show when={!confirmTargetStillMatches()}>
              <div class="rounded-md border border-destructive bg-destructive/15 p-3 text-xs font-semibold text-destructive">
                {t('dataloggerConfig.confirmDeviceChangedError')}
              </div>
            </Show>
          </AlertDialogDescription>
          <AlertDialogFooter class="flex-wrap gap-2">
            <Button variant="outline" onClick={() => setConfirmOperation(null)}>
              {t('dataloggerConfig.cancelBtn')}
            </Button>
            <Show when={(confirmSnapshotMeta()?.recordCount ?? 0) > 0}>
              <Button variant="secondary" onClick={handleSaveReadingsFirst}>
                {t('dataloggerConfig.saveReadingsFirstBtn')}
              </Button>
            </Show>
            <Button
              variant="destructive"
              onClick={() => void handleConfirmExecuteHardwareWrite()}
              disabled={!confirmTargetStillMatches()}
            >
              {t('dataloggerConfig.confirmContinueEraseBtn')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
