// WebHID Transport Layer for Elitech Data Loggers
// Ported from ../datalogger-elitech/index.html

interface HIDInputReportEventLike extends Event {
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
  static readonly MAGIC = [0x33, 0xcc, 0x00] as const;
  static readonly REPORT_SIZE = 64;
  static readonly TIMEOUT_MS = 2000;

  device: HIDDeviceLike | null = null;
  private _lock: Promise<unknown> = Promise.resolve();

  async connect(): Promise<HIDDeviceLike | null> {
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

    this.device = device;
    return device;
  }

  async disconnect(): Promise<void> {
    if (this.device) {
      const dev = this.device;
      this.device = null;
      if (dev.opened) {
        await dev.close();
      }
    }
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
    const run = async (): Promise<Uint8Array> => {
      if (!this.device || !this.device.opened) {
        throw new Error('HID device is not connected.');
      }

      const device = this.device;
      const expectedOpLow = frame[4];

      const responsePromise = new Promise<Uint8Array>((resolve, reject) => {
        let settled = false;
        let timerId: number | null = null;

        const cleanup = () => {
          device.removeEventListener('inputreport', onReport);
          if (timerId !== null) {
            window.clearTimeout(timerId);
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

          if (rx[4] !== expectedOpLow) {
            settled = true;
            cleanup();
            reject(new Error(`Unexpected response opcode 0x${rx[4].toString(16).padStart(2, '0')}.`));
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

        timerId = window.setTimeout(() => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(new Error('Device communication timeout. Reconnect the logger.'));
        }, timeoutMs);

        device.addEventListener('inputreport', onReport);
      });

      await device.sendReport(0, frame as BufferSource);
      return await responsePromise;
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
      const targetIdx = 11 + (offset - actualOffset);
      return rx.slice(targetIdx, targetIdx + 1);
    }

    const frame = this._buildFrame(ElitechHID.OP_GET_PARAMETER, offset, length);
    const rx = await this._transact(frame);
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
}
