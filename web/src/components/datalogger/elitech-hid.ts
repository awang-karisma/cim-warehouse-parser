// WebHID Transport Layer for Elitech Data Loggers
// Ported from ../datalogger-elitech/index.html

export interface HIDInputReportEventLike {
  reportId: number;
  data: DataView;
}

export interface HIDDeviceLike {
  opened: boolean;
  productName?: string;
  vendorId: number;
  productId: number;
  open(): Promise<void>;
  close(): Promise<void>;
  sendReport(reportId: number, data: BufferSource): Promise<void>;
  addEventListener(type: 'inputreport', listener: (event: HIDInputReportEventLike) => void): void;
  removeEventListener(type: 'inputreport', listener: (event: HIDInputReportEventLike) => void): void;
}

interface NavigatorWithHID extends Navigator {
  hid?: {
    requestDevice(options: {
      filters: Array<{ vendorId?: number; productId?: number }>;
    }): Promise<HIDDeviceLike[]>;
    addEventListener(type: 'disconnect', listener: (event: { device: unknown }) => void): void;
    removeEventListener(type: 'disconnect', listener: (event: { device: unknown }) => void): void;
  };
}

export function isWebHidSupported(): boolean {
  return typeof navigator !== 'undefined' && 'hid' in navigator && Boolean((navigator as NavigatorWithHID).hid);
}

export class ElitechHID {
  static readonly OP_GET_RECORD = 0x0001;
  static readonly OP_GET_PARAMETER = 0x0003;
  static readonly OP_SET_PARAMETER = 0x0004;
  static readonly OP_GET_TRIP = 0x0005;
  static readonly OP_FORMAT_MEMORY = 0x02c0;
  static readonly MAGIC = [0x33, 0xcc, 0x00] as const;
  static readonly REPORT_SIZE = 64;
  static readonly TIMEOUT_MS = 2000;

  device: HIDDeviceLike | null = null;
  private _lock: Promise<unknown> = Promise.resolve();
  private _generation = 0;
  async connect(): Promise<HIDDeviceLike | null> {
    this._generation += 1;
    this._lock = Promise.resolve();
    const nav = navigator as NavigatorWithHID;
    if (!nav.hid) {
      throw new Error('WebHID is not supported in this browser. Use Chrome, Edge, or Brave.');
    }

    const devices = await nav.hid.requestDevice({
      filters: [{ vendorId: 0x04d8 }, { vendorId: 0x0416 }],
    });

    if (!devices || devices.length === 0) {
      return null;
    }

    const device = devices[0];
    if (!device.opened) {
      try {
        await device.open();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const name = err instanceof Error ? err.name : '';
        const isLinuxPerm = /notallowed|failed to open|permission|access/i.test(message || name);
        if (isLinuxPerm) {
          throw new Error(
            `Failed to open HID device (${message}). On Linux, add a udev rule with TAG+="uaccess" for VID 04d8/0416 and replug the logger.`,
          );
        }
        throw err;
      }
    }

    this._generation += 1;
    this.device = device;
    return device;
  }

  async disconnect(): Promise<void> {
    this._generation += 1;
    this._lock = Promise.resolve();
    if (this.device) {
      const dev = this.device;
      this.device = null;
      if (dev.opened) {
        try {
          await dev.close();
        } catch {
          // Ignore error on already-unplugged device
        }
      }
    }
  }

  onDisconnect(listener: () => void): () => void {
    if (typeof navigator === 'undefined') return () => {};
    const nav = navigator as NavigatorWithHID;
    if (!nav.hid) return () => {};

    const handler = (event: { device: unknown }) => {
      if (event.device && this.device && event.device === this.device) {
        this._generation += 1;
        listener();
      }
    };

    nav.hid.addEventListener('disconnect', handler);
    return () => {
      nav.hid?.removeEventListener('disconnect', handler);
    };
  }

  _buildFrame(opCode: number, offset: number, dataOrLen: Uint8Array | number): Uint8Array {
    const frame = new Uint8Array(ElitechHID.REPORT_SIZE);
    const isPayload = dataOrLen instanceof Uint8Array;
    const payloadLen = isPayload ? dataOrLen.length : 0;
    const lengthField = isPayload ? payloadLen : Number(dataOrLen);
    const frameLen = 12 + payloadLen;

    if (frameLen > ElitechHID.REPORT_SIZE) {
      throw new Error(`Frame length ${frameLen} exceeds 64-byte HID report limit.`);
    }

    frame[0] = ElitechHID.MAGIC[0];
    frame[1] = ElitechHID.MAGIC[1];
    frame[2] = ElitechHID.MAGIC[2];
    frame[3] = frameLen;
    frame[4] = opCode & 0xff;
    frame[5] = (opCode >> 8) & 0xff;
    frame[6] = 0x00;
    // 24-bit offset byte order: [mid, low, high]
    frame[7] = (offset >> 8) & 0xff;
    frame[8] = offset & 0xff;
    frame[9] = (offset >> 16) & 0xff;
    frame[10] = lengthField & 0xff;

    if (isPayload && payloadLen > 0) {
      frame.set(dataOrLen, 11);
    }

    let sum = 0;
    for (let i = 0; i < frameLen - 1; i++) {
      sum = (sum + frame[i]) & 0xff;
    }
    frame[frameLen - 1] = sum;

    return frame;
  }

  _transact(frame: Uint8Array, timeoutMs = ElitechHID.TIMEOUT_MS): Promise<Uint8Array> {
    const expectedDevice = this.device;
    const expectedGen = this._generation;

    const run = async (): Promise<Uint8Array> => {
      if (
        !expectedDevice ||
        !expectedDevice.opened ||
        this.device !== expectedDevice ||
        this._generation !== expectedGen
      ) {
        throw new Error('HID device is not connected.');
      }

      const expectedOpLow = frame[4];
      const expectedOpHigh = frame[5];

      const { promise: responsePromise, resolve, reject } = Promise.withResolvers<Uint8Array>();
      let settled = false;
      let timerId: number | NodeJS.Timeout | null = null;

      const cleanup = () => {
        expectedDevice.removeEventListener('inputreport', onReport);
        if (timerId !== null) {
          clearTimeout(timerId);
          timerId = null;
        }
      };

      const onReport = (event: HIDInputReportEventLike) => {
        if (settled) return;
        if (event.reportId !== 0) return;

        const view = event.data;
        const rx = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);

        if (
          rx.length < 12 ||
          rx[0] !== ElitechHID.MAGIC[0] ||
          rx[1] !== ElitechHID.MAGIC[1] ||
          rx[2] !== ElitechHID.MAGIC[2]
        ) {
          settled = true;
          cleanup();
          reject(new Error('Invalid HID response magic header.'));
          return;
        }

        const rxLen = rx[3];
        if (rxLen < 12 || rxLen > rx.length) {
          settled = true;
          cleanup();
          reject(new Error(`Invalid HID response frame length (${rxLen}).`));
          return;
        }

        if (rx[4] !== expectedOpLow || rx[5] !== expectedOpHigh) {
          settled = true;
          cleanup();
          const gotOp = ((rx[5] << 8) | rx[4]).toString(16).padStart(4, '0');
          reject(new Error(`Unexpected response opcode 0x${gotOp}.`));
          return;
        }

        let sum = 0;
        for (let i = 0; i < rxLen - 1; i++) {
          sum = (sum + rx[i]) & 0xff;
        }
        if (sum !== rx[rxLen - 1]) {
          settled = true;
          cleanup();
          reject(new Error('HID response checksum mismatch.'));
          return;
        }

        settled = true;
        cleanup();
        resolve(rx);
      };

      timerId = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error('Device communication timeout. Reconnect the logger.'));
      }, timeoutMs);

      expectedDevice.addEventListener('inputreport', onReport);

      try {
        await expectedDevice.sendReport(0, frame as BufferSource);
        return await responsePromise;
      } catch (err) {
        settled = true;
        cleanup();
        responsePromise.catch(() => {});
        throw err;
      }
    };

    const next = this._lock.then(run, run);
    this._lock = next.catch(() => {});
    return next;
  }

  async getParameter(offset: number, length: number): Promise<Uint8Array> {
    if (length < 1 || length > 52) {
      throw new Error(`Parameter read length ${length} out of range (1..52).`);
    }

    if (length === 1) {
      const actualOffset = Math.max(0, offset - 1);
      const actualLen = 2;
      const frame = this._buildFrame(ElitechHID.OP_GET_PARAMETER, actualOffset, actualLen);
      const rx = await this._transact(frame);
      if (rx[3] < 12 + actualLen || rx[10] < actualLen) {
        throw new Error(
          `Short GetParameter response at offset 0x${actualOffset.toString(16)} (expected ${actualLen} bytes, got ${Math.max(0, rx[3] - 12)}).`,
        );
      }
      const targetIdx = 11 + (offset - actualOffset);
      return rx.slice(targetIdx, targetIdx + 1);
    }

    const frame = this._buildFrame(ElitechHID.OP_GET_PARAMETER, offset, length);
    const rx = await this._transact(frame);
    if (rx[3] < 12 + length || rx[10] < length) {
      throw new Error(
        `Short GetParameter response at offset 0x${offset.toString(16)} (expected ${length} bytes, got ${Math.max(0, rx[3] - 12)}).`,
      );
    }
    return rx.slice(11, 11 + length);
}

  async getRecord(index: number, count: number): Promise<Uint8Array> {
    if (count < 1 || count > 6) {
      throw new Error(`Record fetch count ${count} out of range (1..6).`);
    }
    const frame = this._buildFrame(ElitechHID.OP_GET_RECORD, index, count);
    const rx = await this._transact(frame);
    const actualCount = Math.min(count, rx[10]);
    const minFrameLen = 12 + actualCount * 8;
    if (rx[3] < minFrameLen) {
      throw new Error(`Invalid GetRecord response length (${rx[3]} < ${minFrameLen}).`);
    }
    return rx.slice(11, 11 + actualCount * 8);
  }
  async setParameter(offset: number, data: Uint8Array): Promise<void> {
    if (!Number.isInteger(offset) || offset < 0 || offset > 0xffffff) {
      throw new Error(`Parameter write offset ${offset} out of range.`);
    }
    if (!(data instanceof Uint8Array) || data.length < 1 || data.length > 52) {
      throw new Error(`Parameter write length ${data?.length ?? 0} out of range (1..52).`);
    }

    const frame = this._buildFrame(ElitechHID.OP_SET_PARAMETER, offset, data);
    // Verified Packet 3 exception: offset 0x60 with 47-byte payload has active length 59
    // but declared count byte 48, with checksum recomputed at byte 58 (frame[3] - 1).
    if (offset === 0x60 && data.length === 47) {
      frame[10] = 48;
      const checksumIndex = frame[3] - 1;
      let sum = 0;
      for (let i = 0; i < checksumIndex; i++) {
        sum = (sum + frame[i]) & 0xff;
      }
      frame[checksumIndex] = sum;
    }

    const rx = await this._transact(frame);
    const expectedMid = (offset >> 8) & 0xff;
    const expectedLow = offset & 0xff;
    const expectedHigh = (offset >> 16) & 0xff;
    if (rx[7] !== expectedMid || rx[8] !== expectedLow || rx[9] !== expectedHigh) {
      throw new Error(`SetParameter ACK offset mismatch for 0x${offset.toString(16)}.`);
    }
    if (rx[3] !== 13 || rx[10] !== 1 || rx[11] !== 0x01) {
      throw new Error(
        `SetParameter rejected at offset 0x${offset.toString(16)} (status=0x${(rx[11] ?? 0).toString(16).padStart(2, '0')}).`,
      );
    }
  }

  formatMemory(): Promise<void> {
    const expectedDevice = this.device;
    const expectedGen = this._generation;
    const frame = this._buildFrame(ElitechHID.OP_FORMAT_MEMORY, 0, new Uint8Array([0]));

    const run = async (): Promise<void> => {
      if (
        !expectedDevice ||
        !expectedDevice.opened ||
        this.device !== expectedDevice ||
        this._generation !== expectedGen
      ) {
        throw new Error('HID device is not connected.');
      }
      await expectedDevice.sendReport(0, frame as BufferSource);
    };

    const next = this._lock.then(run, run);
    this._lock = next.catch(() => {});
    return next;
  }
}
