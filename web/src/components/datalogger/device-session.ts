import { type Accessor, createSignal, onCleanup } from 'solid-js';
import type { DataloggerConfiguration } from '~/types';
import { ElitechHID } from './elitech-hid';
import {
  type ConfigurationWriteReceipt,
  type DeviceConfigurationReadResult,
  fetchAllRecords,
  quickResetDevice,
  readDeviceConfiguration,
  readDeviceInfo,
  setDeviceDisplayTimeout,
  verifyConfigurationReceipt,
  writeDeviceConfiguration,
} from './elitech-protocol';
import type { DeviceInfo, RawRecord } from './types';

export interface FetchedDatasetSnapshot {
  readonly records: readonly RawRecord[];
  readonly deviceModel: string;
  readonly serialNumber: string;
  readonly pulledAt: Date;
}

export interface PendingVerificationState {
  readonly operation: 'apply' | 'quick-reset';
  readonly receipt: ConfigurationWriteReceipt;
  readonly statusMessage: string;
}

export interface DataloggerDeviceSessionOptions {
  clock?: () => Date;
  postFormatDelayMs?: number;
  verificationTimeoutMs?: number;
  verificationPollIntervalMs?: number;
  canRead?: () => boolean;
  canWrite?: () => boolean;
}

export interface DataloggerDeviceSession {
  connected: Accessor<boolean>;
  deviceInfo: Accessor<DeviceInfo | null>;
  deviceBusy: Accessor<boolean>;
  deviceError: Accessor<string | null>;
  deviceProgress: Accessor<{ fetched: number; total: number } | null>;
  snapshot: Accessor<FetchedDatasetSnapshot | null>;
  pendingVerification: Accessor<PendingVerificationState | null>;
  lastVerifiedOperation: Accessor<'apply' | 'quick-reset' | null>;
  connect: () => Promise<DeviceInfo | null>;
  disconnect: () => Promise<void>;
  fetchRecords: () => Promise<FetchedDatasetSnapshot | null>;
  readConfiguration: () => Promise<DeviceConfigurationReadResult>;
  applyConfiguration: (
    config: DataloggerConfiguration,
    options?: { displayTimeoutCode?: number | null },
  ) => Promise<boolean>;
  setDisplayTimeout: (code: number) => Promise<void>;
  quickReset: () => Promise<boolean>;
  verifyPendingOperation: () => Promise<boolean>;
  discardSnapshot: () => void;
  dismissPendingVerification: () => void;
  clearError: () => void;
}

export const RESET_ATTEMPTED_RECONNECT_MESSAGE =
  'Reset attempted; reconnect the same logger to verify';

function sleep(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}

function isDefinitiveVerificationMismatch(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.startsWith('Verification failed:');
}

export function createDataloggerDeviceSession(
  hid: ElitechHID = new ElitechHID(),
  options: DataloggerDeviceSessionOptions = {},
): DataloggerDeviceSession {
  const clock = options.clock ?? (() => new Date());
  const postFormatDelayMs = options.postFormatDelayMs ?? 500;
  const verificationTimeoutMs = options.verificationTimeoutMs ?? 10_000;
  const verificationPollIntervalMs = options.verificationPollIntervalMs ?? 100;

  const [connected, setConnected] = createSignal(false);
  const [deviceInfo, setDeviceInfo] = createSignal<DeviceInfo | null>(null);
  const [deviceBusy, setDeviceBusy] = createSignal(false);
  const [deviceError, setDeviceError] = createSignal<string | null>(null);
  const [deviceProgress, setDeviceProgress] = createSignal<{
    fetched: number;
    total: number;
  } | null>(null);
  const [snapshot, setSnapshot] = createSignal<FetchedDatasetSnapshot | null>(null);
  const [pendingVerification, setPendingVerification] =
    createSignal<PendingVerificationState | null>(null);
  const [lastVerifiedOperation, setLastVerifiedOperation] = createSignal<
    'apply' | 'quick-reset' | null
  >(null);

  let generation = 0;
  let disposed = false;
  let inPostFormatWait = false;

  const unsubDisconnect = hid.onDisconnect(() => {
    if (disposed) return;
    generation += 1;
    void hid.disconnect();
    setConnected(false);
    setDeviceInfo(null);
    setDeviceProgress(null);

    if (inPostFormatWait) {
      return;
    }

    setDeviceBusy(false);
    const pending = pendingVerification();
    if (pending) {
      setPendingVerification({
        ...pending,
        statusMessage: RESET_ATTEMPTED_RECONNECT_MESSAGE,
      });
      setDeviceError(RESET_ATTEMPTED_RECONNECT_MESSAGE);
    } else {
      setDeviceError('Logger was disconnected. Reconnect device to continue.');
    }
  });

  onCleanup(() => {
    disposed = true;
    generation += 1;
    unsubDisconnect();
    void hid.disconnect();
  });

  const runVerificationAgainstCurrentHandle = async (
    pending: PendingVerificationState,
    expectedGen: number,
    expectedDevice: unknown,
  ): Promise<boolean> => {
    const verifiedInfo = await verifyConfigurationReceipt(hid, pending.receipt);
    if (disposed || generation !== expectedGen || hid.device !== expectedDevice) {
      throw new Error('Device connection changed during post-format verification.');
    }
    setPendingVerification(null);
    setLastVerifiedOperation(pending.operation);
    setDeviceInfo(verifiedInfo);
    setConnected(true);
    setDeviceError(null);
    return true;
  };

  const connect = async (): Promise<DeviceInfo | null> => {
    if (disposed || deviceBusy() || options.canRead?.() === false) {
      return null;
    }
    generation += 1;
    const opGen = generation;
    setDeviceError(null);
    setDeviceBusy(true);
    setDeviceProgress(null);

    try {
      const dev = await hid.connect();
      if (!dev) {
        return null;
      }
      if (disposed || generation !== opGen || hid.device !== dev) {
        await hid.disconnect();
        return null;
      }

      let info: DeviceInfo;
      try {
        info = await readDeviceInfo(hid);
      } catch (readErr) {
        await hid.disconnect();
        if (!disposed && generation === opGen) {
          setConnected(false);
          setDeviceInfo(null);
          setDeviceError(readErr instanceof Error ? readErr.message : String(readErr));
        }
        return null;
      }

      if (disposed || generation !== opGen || hid.device !== dev) {
        await hid.disconnect();
        return null;
      }

      setConnected(true);
      setDeviceInfo(info);

      const pending = pendingVerification();
      if (pending) {
        const currentSerial = info.serialNumber === '—' ? '' : info.serialNumber;
        if (currentSerial !== pending.receipt.serialNumber || info.model !== pending.receipt.model) {
          const mismatchMsg = `Connected logger (${info.serialNumber}) does not match pending verification target (${pending.receipt.serialNumber}). Reconnect ${pending.receipt.serialNumber} to verify or dismiss the unverified state.`;
          setPendingVerification({
            ...pending,
            statusMessage: mismatchMsg,
          });
          setDeviceError(mismatchMsg);
          return info;
        }

        try {
          await runVerificationAgainstCurrentHandle(pending, opGen, dev);
        } catch (verifyErr) {
          if (!disposed && generation === opGen && hid.device === dev) {
            const msg = verifyErr instanceof Error ? verifyErr.message : String(verifyErr);
            setPendingVerification({
              ...pending,
              statusMessage: msg,
            });
            setDeviceError(msg);
          }
        }
      }

      return deviceInfo();
    } catch (err) {
      await hid.disconnect();
      if (!disposed && generation === opGen) {
        setConnected(false);
        setDeviceInfo(null);
        setDeviceError(err instanceof Error ? err.message : String(err));
      }
      return null;
    } finally {
      if (!disposed && generation === opGen) {
        setDeviceBusy(false);
      }
    }
  };

  const disconnect = async (): Promise<void> => {
    if (disposed) return;
    generation += 1;
    await hid.disconnect();
    setConnected(false);
    setDeviceInfo(null);
    setDeviceBusy(false);
    setDeviceProgress(null);
    setDeviceError(null);
  };

  const fetchRecords = async (): Promise<FetchedDatasetSnapshot | null> => {
    if (disposed || options.canRead?.() === false) return null;
    if (deviceBusy()) {
      throw new Error('Device is busy with another operation.');
    }
    if (!connected() || !hid.device || !hid.device.opened) {
      setDeviceError('HID device is not connected.');
      return null;
    }

    const opGen = generation;
    const opDevice = hid.device;
    setDeviceError(null);
    setDeviceBusy(true);
    setDeviceProgress(null);

    try {
      const freshInfo = await readDeviceInfo(hid);
      if (disposed || generation !== opGen || hid.device !== opDevice) {
        return null;
      }
      setDeviceInfo(freshInfo);

      const capturedModel = freshInfo.modelName;
      const capturedSerial = freshInfo.serialNumber === '—' ? '' : freshInfo.serialNumber;
      const expectedCount = freshInfo.recordNumber;

      if (expectedCount === 0) {
        setDeviceProgress({ fetched: 0, total: 0 });
        return null;
      }

      setDeviceProgress({ fetched: 0, total: expectedCount });
      const records = await fetchAllRecords(
        hid,
        expectedCount,
        freshInfo.protocolVersion,
        (fetched, total) => {
          if (!disposed && generation === opGen && hid.device === opDevice) {
            setDeviceProgress({ fetched, total });
          }
        },
      );

      if (disposed || generation !== opGen || hid.device !== opDevice) {
        return null;
      }

      if (records.length !== expectedCount) {
        throw new Error(
          `Incomplete record pull: device advertised ${expectedCount} records, but only ${records.length} complete records were read.`,
        );
      }

      const nextSnapshot: FetchedDatasetSnapshot = Object.freeze({
        records: Object.freeze([...records]),
        deviceModel: capturedModel,
        serialNumber: capturedSerial,
        pulledAt: clock(),
      });
      setSnapshot(nextSnapshot);
      return nextSnapshot;
    } catch (err) {
      if (!disposed && generation === opGen && hid.device === opDevice) {
        setDeviceError(err instanceof Error ? err.message : String(err));
      }
      return null;
    } finally {
      if (!disposed && generation === opGen && hid.device === opDevice) {
        setDeviceBusy(false);
      }
    }
  };

  const readConfiguration = async (): Promise<DeviceConfigurationReadResult> => {
    if (options.canRead?.() === false) throw new Error('Device read access denied.');
    if (disposed) {
      throw new Error('Device session is disposed.');
    }
    if (deviceBusy()) {
      throw new Error('Device is busy with another operation.');
    }
    if (!connected() || !hid.device || !hid.device.opened) {
      throw new Error('HID device is not connected.');
    }

    const opGen = generation;
    const opDevice = hid.device;
    setDeviceError(null);
    setDeviceBusy(true);

    try {
      const info = await readDeviceInfo(hid);
      if (disposed || generation !== opGen || hid.device !== opDevice) {
        throw new Error('Device connection changed while reading device info.');
      }
      setDeviceInfo(info);

      const cfgResult = await readDeviceConfiguration(hid);
      if (disposed || generation !== opGen || hid.device !== opDevice) {
        throw new Error('Device connection changed while reading configuration.');
      }
      return cfgResult;
    } catch (err) {
      if (!disposed && generation === opGen && hid.device === opDevice) {
        setDeviceError(err instanceof Error ? err.message : String(err));
      }
      throw err;
    } finally {
      if (!disposed && generation === opGen && hid.device === opDevice) {
        setDeviceBusy(false);
      }
    }
  };

  const executeWriteOrReset = async (
    operation: 'apply' | 'quick-reset',
    config?: DataloggerConfiguration,
    writeOptions?: { displayTimeoutCode?: number | null },
  ): Promise<boolean> => {
    if (options.canRead?.() === false || options.canWrite?.() === false) throw new Error('Device write access denied.');
    if (disposed) {
      throw new Error('Device session is disposed.');
    }
    if (pendingVerification() !== null) {
      throw new Error(
        'A previous configuration or reset operation is awaiting verification. Reconnect the logger to verify or dismiss the unverified state first.',
      );
    }
    if (deviceBusy()) {
      throw new Error('Device is busy with another operation.');
    }
    if (!connected() || !hid.device || !hid.device.opened) {
      throw new Error('HID device is not connected.');
    }

    const opGen = generation;
    const opDevice = hid.device;
    const initialInfo = deviceInfo();
    const initialSerial =
      initialInfo && initialInfo.serialNumber !== '—' ? initialInfo.serialNumber : null;
    const initialModel = initialInfo?.model ?? null;

    setDeviceError(null);
    setLastVerifiedOperation(null);
    setDeviceBusy(true);

    let capturedReceipt: ConfigurationWriteReceipt | null = null;

    const onFormatAttempt = (receipt: ConfigurationWriteReceipt) => {
      if (
        options.canRead?.() === false ||
        options.canWrite?.() === false ||
        disposed ||
        generation !== opGen ||
        hid.device !== opDevice ||
        !hid.device?.opened ||
        (initialSerial !== null && receipt.serialNumber !== initialSerial) ||
        (initialModel !== null && receipt.model !== initialModel)
      ) {
        throw new Error('Device connection changed before Format; aborting format command.');
      }
      capturedReceipt = receipt;
      inPostFormatWait = true;
      setPendingVerification({
        operation,
        receipt,
        statusMessage: RESET_ATTEMPTED_RECONNECT_MESSAGE,
      });
    };

    try {
      if (operation === 'apply') {
        await writeDeviceConfiguration(hid, config!, onFormatAttempt, clock, writeOptions);
      } else {
        await quickResetDevice(hid, onFormatAttempt, clock);
      }
    } catch (writeErr) {
      if (!capturedReceipt) {
        inPostFormatWait = false;
        if (!disposed && generation === opGen && hid.device === opDevice) {
          setDeviceError(writeErr instanceof Error ? writeErr.message : String(writeErr));
          setDeviceBusy(false);
        }
        throw writeErr;
      }
      // Format send threw AFTER onFormatAttempt recorded the receipt:
      // outcome is unknown; proceed into post-format verification / reconnect-to-verify state.
    }

    const receipt = capturedReceipt!;
    const pendingState: PendingVerificationState = {
      operation,
      receipt,
      statusMessage: RESET_ATTEMPTED_RECONNECT_MESSAGE,
    };

    try {
      const deadline = performance.now() + verificationTimeoutMs;
      if (postFormatDelayMs > 0) {
        await sleep(postFormatDelayMs);
      }

      let lastMismatchError: Error | null = null;

      while (!disposed && performance.now() < deadline) {
        if (!hid.device || !hid.device.opened || hid.device !== opDevice) {
          break;
        }
        try {
          const verifiedInfo = await verifyConfigurationReceipt(hid, receipt);
          if (disposed || hid.device !== opDevice) {
            break;
          }
          inPostFormatWait = false;
          setPendingVerification(null);
          setLastVerifiedOperation(operation);
          setDeviceInfo(verifiedInfo);
          setConnected(true);
          setDeviceError(null);
          setDeviceBusy(false);
          return true;
        } catch (verifyErr) {
          if (isDefinitiveVerificationMismatch(verifyErr)) {
            lastMismatchError =
              verifyErr instanceof Error ? verifyErr : new Error(String(verifyErr));
            break;
          }
          if (!hid.device || !hid.device.opened || hid.device !== opDevice) {
            break;
          }
          if (performance.now() + verificationPollIntervalMs >= deadline) {
            break;
          }
          await sleep(verificationPollIntervalMs);
        }
      }

      inPostFormatWait = false;
      if (disposed) return false;

      if (lastMismatchError) {
        setPendingVerification({
          ...pendingState,
          statusMessage: lastMismatchError.message,
        });
        setDeviceError(lastMismatchError.message);
        setDeviceBusy(false);
        return false;
      }

      // Disconnected or unreadable at the deadline: close live handle, clear busy, retain receipt/draft/snapshot
      generation += 1;
      await hid.disconnect();
      setConnected(false);
      setDeviceInfo(null);
      setDeviceProgress(null);
      setPendingVerification({
        ...pendingState,
        statusMessage: RESET_ATTEMPTED_RECONNECT_MESSAGE,
      });
      setDeviceError(RESET_ATTEMPTED_RECONNECT_MESSAGE);
      setDeviceBusy(false);
      return false;
    } finally {
      inPostFormatWait = false;
      if (!disposed) {
        setDeviceBusy(false);
      }
    }
  };

  const applyConfiguration = (
    config: DataloggerConfiguration,
    options?: { displayTimeoutCode?: number | null },
  ): Promise<boolean> => executeWriteOrReset('apply', config, options);
  const quickReset = (): Promise<boolean> => executeWriteOrReset('quick-reset');
  const setDisplayTimeout = async (code: number): Promise<void> => {
    if (options.canRead?.() === false || options.canWrite?.() === false) throw new Error('Device write access denied.');
    if (disposed) {
      throw new Error('Device session is disposed.');
    }
    if (deviceBusy()) {
      throw new Error('Device is busy with another operation.');
    }
    if (!connected() || !hid.device || !hid.device.opened) {
      throw new Error('HID device is not connected.');
    }

    setDeviceError(null);
    setDeviceBusy(true);

    try {
      await setDeviceDisplayTimeout(hid, code);
      const info = await readDeviceInfo(hid);
      setDeviceInfo(info);
    } catch (err) {
      setDeviceError(err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      if (!disposed) {
        setDeviceBusy(false);
      }
    }
  };

  const verifyPendingOperation = async (): Promise<boolean> => {
    if (disposed || options.canRead?.() === false) return false;
    const pending = pendingVerification();
    if (!pending) return false;

    if (!connected() || !hid.device || !hid.device.opened) {
      await connect();
      return pendingVerification() === null;
    }

    if (deviceBusy()) {
      throw new Error('Device is busy with another operation.');
    }

    const opGen = generation;
    const opDevice = hid.device;
    setDeviceError(null);
    setDeviceBusy(true);

    try {
      await runVerificationAgainstCurrentHandle(pending, opGen, opDevice);
      return true;
    } catch (err) {
      if (!disposed && generation === opGen && hid.device === opDevice) {
        const msg = err instanceof Error ? err.message : String(err);
        setPendingVerification({
          ...pending,
          statusMessage: msg,
        });
        setDeviceError(msg);
      }
      return false;
    } finally {
      if (!disposed && generation === opGen && hid.device === opDevice) {
        setDeviceBusy(false);
      }
    }
  };

  const discardSnapshot = (): void => {
    setSnapshot(null);
  };

  const dismissPendingVerification = (): void => {
    setPendingVerification(null);
    if (deviceError() === RESET_ATTEMPTED_RECONNECT_MESSAGE) {
      setDeviceError(null);
    }
  };

  const clearError = (): void => {
    setDeviceError(null);
  };

  return {
    connected,
    deviceInfo,
    deviceBusy,
    deviceError,
    deviceProgress,
    snapshot,
    pendingVerification,
    lastVerifiedOperation,
    connect,
    disconnect,
    fetchRecords,
    readConfiguration,
    applyConfiguration,
    setDisplayTimeout,
    quickReset,
    verifyPendingOperation,
    discardSnapshot,
    dismissPendingVerification,
    clearError,
  };
}
