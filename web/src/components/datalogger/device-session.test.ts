import assert from 'node:assert/strict';
import test from 'node:test';
import { createRoot } from 'solid-js';
import { DATALOGGER_START_MODE } from '~/domain';
import type { DataloggerConfiguration } from '~/types';
import {
  createDataloggerDeviceSession,
  RESET_ATTEMPTED_RECONNECT_MESSAGE,
} from './device-session';
import { ElitechHID, type HIDDeviceLike } from './elitech-hid';
import {
  calculateLoggingInterval,
  decodeRecord,
  decodeTimezoneOffset,
  encodeDateTime7,
  encodeTimezoneOffset,
  PARAMETER_WRITE_RANGES,
  quickResetDevice,
  readDeviceConfiguration,
  readDeviceInfo,
  verifyConfigurationReceipt,
  writeDeviceConfiguration,
} from './elitech-protocol';

interface FakeReportEvent {
  reportId: number;
  data: DataView;
}

type ReportListener = (event: FakeReportEvent) => void;

class FakeElitechDevice implements HIDDeviceLike {
  opened = true;
  productName = 'Elitech RC-5+';
  vendorId = 0x04d8;
  productId = 0x3005;

  memory = new Uint8Array(512);
  records: bigint[] = [];
  sentFrames: Uint8Array[] = [];
  setParameterFrames: Array<{ offset: number; declaredCount: number; payload: Uint8Array; frame: Uint8Array }> = [];
  formatCount = 0;

  private listeners = new Set<ReportListener>();

  onSendHook?: (frame: Uint8Array, device: FakeElitechDevice) => Promise<boolean | void> | boolean | void;

  constructor(opts?: {
    serial?: string;
    model?: number;
    vendorId?: number;
    productId?: number;
    firmwareBcd?: number;
    protocolVersion?: number;
    recordCount?: number;
    capacity?: number;
    intervalSeconds?: number;
    startModeCode?: number;
    delaySeconds?: number;
    tripNumber?: string;
    tripDescription?: string;
    passwordEnabled?: boolean;
  }) {
    if (opts?.vendorId !== undefined) this.vendorId = opts.vendorId;
    if (opts?.productId !== undefined) this.productId = opts.productId;

    const model = opts?.model ?? 0x3005;
    this.memory[0x00] = (model >> 8) & 0xff;
    this.memory[0x01] = model & 0xff;

    const serial = opts?.serial ?? 'EF2600001001';
    this.writeAscii(0x02, 12, serial, 0x00);

    const trip = opts?.tripNumber ?? 'CURRENT';
    this.writeAscii(0x10, 13, trip, 0x00);

    this.memory[0x1d] = 0x00; // PDF EN
    this.memory[0x1e] = 0x91; // circular + backlight + product property
    this.memory[0x1f] = opts?.firmwareBcd ?? 0x87; // BCD 87
    const startModeCode = opts?.startModeCode ?? 1; // manual
    this.memory[0x20] = 0xd8 | (startModeCode & 0x07); // preserve stop/repeat/pause bits 0xd8
    this.memory[0x21] = (opts?.passwordEnabled ? 0x01 : 0x00) | 0x10; // single alarm zone, °C
    this.memory[0x22] = 0x2a;
    this.memory[0x23] = 0x10;
    this.memory[0x24] = 0xa0 | 8; // upper bits 0xa0 + UTC+8
    this.memory[0x25] = 0xc3; // startup bits 0xc0 + volatile state 0x03
    this.memory[0x26] = 0x5c; // LCD nibble 0x5 + tempPdf 0x08 + stop actual 0x04
    this.memory[0x27] = 0x14; // CSV bit 0x10 + battery 4
    this.memory.set([26, 11, 2, 24, 14, 5, 6], 0x28);
    this.memory[0x2f] = 0;

    // Inactive timing start & active timing stop
    this.memory.set([12, 1, 1, 1, 1, 1, 1, 0], 0x30);
    this.memory.set([26, 12, 4, 31, 18, 0, 0, 0], 0x38);

    const delayTicks = Math.floor((opts?.delaySeconds ?? 30) / 10);
    this.memory[0x40] = (delayTicks >> 8) & 0xff;
    this.memory[0x41] = delayTicks & 0xff;

    const capacity = opts?.capacity ?? 32000;
    this.memory[0x42] = (capacity >>> 24) & 0xff;
    this.memory[0x43] = (capacity >>> 16) & 0xff;
    this.memory[0x44] = (capacity >>> 8) & 0xff;
    this.memory[0x45] = capacity & 0xff;

    const protocolVersion = opts?.protocolVersion ?? 0x38;
    this.memory[0x95] = protocolVersion;

    this.setRecordCount(opts?.recordCount ?? 0, protocolVersion);

    const intervalTicks = Math.floor((opts?.intervalSeconds ?? 60) / 10);
    this.memory[0x4c] = (intervalTicks >> 8) & 0xff;
    this.memory[0x4d] = intervalTicks & 0xff;

    // Calibration, alarm limits, resistance compensation, custom strings
    this.memory[0x4e] = 0x00;
    this.memory[0x4f] = 0x05; // +0.5C
    this.memory[0x54] = 0x00;
    this.memory[0x55] = 0x50; // +8.0C
    this.memory[0x56] = 0x00;
    this.memory[0x57] = 0x14; // +2.0C
    this.memory[0x5c] = 0x01; // UsbStop
    this.memory[0x6e] = 0x01;
    this.memory[0x6f] = 0x2c; // ResistanceCompensation = 300
    this.memory[0x75] = 0x01; // KeyTone
    this.memory[0x76] = 0x01; // LEDFlashing
    this.memory[0x77] = 0x01; // MarkFunc enabled

    // Live RTC at 0x88..0x8e
    this.memory.set([26, 11, 2, 24, 14, 5, 6], 0x88);

    // Description at 0x98..0xfb (100 bytes space-padded) and sentinel at 0xfc
    this.writeAscii(0x98, 100, opts?.tripDescription ?? 'Existing cold-chain description', 0x20);
    this.memory[0xfc] = 0xee; // sentinel outside TravelDesc

    // Custom strings at 0xfd..0x12b and 0x13c..0x154
    this.writeAscii(0xfd, 47, 'CFG-CODE    https://warehouse.example.comRC-5+ ', 0x20);
    this.writeAscii(0x13c, 25, 'COLD-BOX-LOGGER-01', 0x20);
  }

  writeAscii(offset: number, length: number, text: string, pad: number): void {
    this.memory.fill(pad, offset, offset + length);
    for (let i = 0; i < Math.min(length, text.length); i++) {
      this.memory[offset + i] = text.charCodeAt(i);
    }
  }

  setRecordCount(count: number, protocolVersion = this.memory[0x95]): void {
    if (protocolVersion >= 0x24) {
      this.memory[0x46] = (count >>> 24) & 0xff;
      this.memory[0x47] = (count >>> 16) & 0xff;
      this.memory[0x48] = (count >>> 8) & 0xff;
      this.memory[0x49] = count & 0xff;
    } else {
      this.memory[0x46] = 0;
      this.memory[0x47] = 0;
      this.memory[0x48] = (count >>> 8) & 0xff;
      this.memory[0x49] = count & 0xff;
    }
  }

  listenerCount(): number {
    return this.listeners.size;
  }

  async open(): Promise<void> {
    this.opened = true;
  }

  async close(): Promise<void> {
    this.opened = false;
  }

  addEventListener(type: 'inputreport', listener: ReportListener): void {
    if (type === 'inputreport') {
      this.listeners.add(listener);
    }
  }

  removeEventListener(type: 'inputreport', listener: ReportListener): void {
    if (type === 'inputreport') {
      this.listeners.delete(listener);
    }
  }

  emitFrame(frame: Uint8Array): void {
    const copy = new Uint8Array(64);
    copy.set(frame.subarray(0, 64));
    const view = new DataView(copy.buffer, copy.byteOffset, copy.byteLength);
    for (const listener of [...this.listeners]) {
      listener({ reportId: 0, data: view });
    }
  }

  static buildResponseFrame(
    opCode: number,
    offset: number,
    payload: Uint8Array,
    overrideDeclaredCount?: number,
    overrideActiveLen?: number,
  ): Uint8Array {
    const frame = new Uint8Array(64);
    const activeLen = overrideActiveLen ?? 12 + payload.length;
    frame[0] = 0x33;
    frame[1] = 0xcc;
    frame[2] = 0x00;
    frame[3] = activeLen;
    frame[4] = opCode & 0xff;
    frame[5] = (opCode >> 8) & 0xff;
    frame[6] = 0x00;
    frame[7] = (offset >> 8) & 0xff;
    frame[8] = offset & 0xff;
    frame[9] = (offset >> 16) & 0xff;
    frame[10] = overrideDeclaredCount ?? payload.length;
    frame.set(payload, 11);
    let sum = 0;
    for (let i = 0; i < activeLen - 1; i++) {
      sum = (sum + frame[i]) & 0xff;
    }
    frame[activeLen - 1] = sum;
    return frame;
  }

  async sendReport(_reportId: number, data: BufferSource): Promise<void> {
    const view =
      data instanceof Uint8Array
        ? data
        : data instanceof ArrayBuffer
          ? new Uint8Array(data)
          : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    const frame = new Uint8Array(view);
    this.sentFrames.push(frame);

    if (this.onSendHook) {
      const handled = await this.onSendHook(frame, this);
      if (handled === true) return;
    }

    const opCode = frame[4] | (frame[5] << 8);
    const offset = (frame[9] << 16) | (frame[7] << 8) | frame[8];
    const reqCount = frame[10];

    if (opCode === ElitechHID.OP_GET_PARAMETER) {
      const payload = this.memory.slice(offset, offset + reqCount);
      const resp = FakeElitechDevice.buildResponseFrame(opCode, offset, payload);
      queueMicrotask(() => this.emitFrame(resp));
      return;
    }

    if (opCode === ElitechHID.OP_GET_TRIP) {
      const payload = new Uint8Array(reqCount);
      const resp = FakeElitechDevice.buildResponseFrame(opCode, offset, payload);
      queueMicrotask(() => this.emitFrame(resp));
      return;
    }

    if (opCode === ElitechHID.OP_GET_RECORD) {
      const slice = this.records.slice(offset, offset + reqCount);
      const payload = new Uint8Array(slice.length * 8);
      const dv = new DataView(payload.buffer);
      for (let i = 0; i < slice.length; i++) {
        dv.setBigUint64(i * 8, slice[i], true);
      }
      const resp = FakeElitechDevice.buildResponseFrame(opCode, offset, payload, slice.length);
      queueMicrotask(() => this.emitFrame(resp));
      return;
    }

    if (opCode === ElitechHID.OP_SET_PARAMETER) {
      const activeLen = frame[3];
      const payloadLen = activeLen - 12;
      const payload = frame.slice(11, 11 + payloadLen);
      this.setParameterFrames.push({
        offset,
        declaredCount: reqCount,
        payload,
        frame,
      });
      // Apply writable payload to memory; note Packet 3 zeroes 0x88..0x8e in TX frame,
      // while hardware updates live RTC from ConfigurationTime (0x28..0x2e) rather than zeroing live clock.
      const prevRtc = this.memory.slice(0x88, 0x8f);
      this.memory.set(payload, offset);
      if (offset === 0) {
        // Hardware synchronizes live RTC from ConfigurationTime written at 0x28..0x2e
        this.memory.set(this.memory.subarray(0x28, 0x2f), 0x88);
      } else if (offset === 0x60) {
        // Packet 3's trailing zero bytes at 0x88..0x8e are not a direct live-clock setter
        this.memory.set(prevRtc, 0x88);
      }
      const ack = FakeElitechDevice.buildResponseFrame(opCode, offset, new Uint8Array([0x01]));
      queueMicrotask(() => this.emitFrame(ack));
      return;
    }

    if (opCode === ElitechHID.OP_FORMAT_MEMORY) {
      this.formatCount += 1;
      this.records = [];
      this.setRecordCount(0);
      return;
    }
  }
}

function encodeRawSampleRecord(opts: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  tempTenths: number;
  negative?: boolean;
  humiTenths?: number;
  flags?: number;
  extBit9?: boolean;
}): bigint {
  let q = 0n;
  let flags = opts.flags ?? 0;
  if (opts.negative) flags |= 0x08;
  q |= BigInt(flags & 0xff);
  if (opts.extBit9) {
    q |= 1n << 9n;
  }
  q |= BigInt(opts.second & 0x3f) << 10n;
  q |= BigInt((opts.year - 2000) & 0x7f) << 16n;
  q |= BigInt(opts.month & 0x0f) << 23n;
  q |= BigInt(opts.day & 0x1f) << 27n;
  q |= BigInt(opts.hour & 0x1f) << 32n;
  q |= BigInt(opts.tempTenths & 0x7ff) << 37n;
  q |= BigInt(opts.minute & 0x3f) << 48n;
  q |= BigInt((opts.humiTenths ?? 0) & 0x3ff) << 54n;
  return q;
}

test('duration calculator computes 10s-stepped interval and rejects invalid targets', () => {
  const interval = calculateLoggingInterval(86400, 32000);
  assert.equal(interval, 10);
  assert.equal(interval * 32000, 320000);

  assert.equal(calculateLoggingInterval(960000, 32000), 30);

  assert.throws(() => calculateLoggingInterval(86400, 0), /capacity/i);
  assert.throws(() => calculateLoggingInterval(86400, -100), /capacity/i);
  assert.throws(() => calculateLoggingInterval(0, 32000), /duration/i);
  assert.throws(() => calculateLoggingInterval(-60, 32000), /duration/i);
  assert.throws(() => calculateLoggingInterval(120.5, 32000), /duration/i);
  // Exceeds maximum interval 655350s
  assert.throws(() => calculateLoggingInterval(32000 * 655360, 32000), /outside the supported/i);
});

test('timezone and DateTime7 encoders handle fixed UTC+8 clock, negative offsets, and bounds', () => {
  // UTC+8 (Asia/Makassar) -> 8/0
  assert.deepEqual(encodeTimezoneOffset(480), { hour: 8, minute: 0 });
  assert.equal(decodeTimezoneOffset(8, 0), 480);

  // UTC-05:30 -> 19/30
  assert.deepEqual(encodeTimezoneOffset(-330), { hour: 19, minute: 30 });
  assert.equal(decodeTimezoneOffset(19, 30), -330);

  // UTC-00:30 -> 24/30
  assert.deepEqual(encodeTimezoneOffset(-30), { hour: 24, minute: 30 });
  assert.equal(decodeTimezoneOffset(24, 30), -30);

  // UTC+13 (+780) and UTC-12 (-720) reject
  assert.throws(() => encodeTimezoneOffset(780), /unsupported/i);
  assert.throws(() => encodeTimezoneOffset(-720), /unsupported/i);

  // Fixed clock 2026-11-24 14:05:06 UTC+8 writes 1a 0b 02 18 0e 05 06 (Tuesday 2)
  const fixedClock = new Date(2026, 10, 24, 14, 5, 6);
  const dt7 = encodeDateTime7(fixedClock);
  assert.deepEqual(Array.from(dt7), [0x1a, 0x0b, 0x02, 0x18, 0x0e, 0x05, 0x06]);

  // Year 2100 rejects
  assert.throws(() => encodeDateTime7(new Date(2100, 0, 1, 0, 0, 0)), /2000\.\.2099/);
});

test('protocol decode fixes: 12-bit temperature shift 11, BCD firmware, 32-bit record count, and M flag', async () => {
  // Only extension bit (q bit 9) set -> 2048 / 10 = 204.8 on protocol >= 0x23; 0 on protocol < 0x23
  const extPositive = encodeRawSampleRecord({
    year: 2026,
    month: 11,
    day: 24,
    hour: 10,
    minute: 0,
    second: 0,
    tempTenths: 0,
    extBit9: true,
    flags: 0x01, // M bit 0
  });
  const decodedNew = decodeRecord(extPositive, 0x23);
  assert.equal(decodedNew.temperature, 204.8);
  assert.equal(decodedNew.flags, 'M');

  const decodedOld = decodeRecord(extPositive, 0x22);
  assert.equal(decodedOld.temperature, 0);

  const extNegative = encodeRawSampleRecord({
    year: 2026,
    month: 11,
    day: 24,
    hour: 10,
    minute: 0,
    second: 0,
    tempTenths: 0,
    extBit9: true,
    negative: true,
    flags: 0x02, // P only, not M
  });
  const decodedNeg = decodeRecord(extNegative, 0x38);
  assert.equal(decodedNeg.temperature, -204.8);
  assert.equal(decodedNeg.flags, 'P');
  assert.equal(decodedNeg.flags.includes('M'), false);

  // BCD firmware 0x87 -> 87 and protocol >= 0x24 record count 00 01 00 02 -> 65538
  const devNew = new FakeElitechDevice({
    firmwareBcd: 0x87,
    protocolVersion: 0x24,
  });
  devNew.memory.set([0x00, 0x01, 0x00, 0x02], 0x46);
  const hid = new ElitechHID();
  hid.device = devNew;

  const infoNew = await readDeviceInfo(hid);
  assert.equal(infoNew.firmwareVersion, 87);
  assert.equal(infoNew.recordNumber, 65538);

  // Older protocol < 0x24 reads low word 2
  devNew.memory[0x95] = 0x23;
  const infoOld = await readDeviceInfo(hid);
  assert.equal(infoOld.recordNumber, 2);
});

test('writeDeviceConfiguration writes verified offsets, 52+48 description split, Packet 3 exception, and Format frame', async () => {
  const dev = new FakeElitechDevice({
    serial: 'SN-RC5P-0001',
    intervalSeconds: 300,
    startModeCode: 0,
    delaySeconds: 0,
    tripNumber: 'OLDTRIP',
  });
  const hid = new ElitechHID();
  hid.device = dev;

  const fixedNow = new Date(2026, 10, 24, 14, 5, 6);
  const desc53 = 'A'.repeat(52) + 'B';
  const cfg: DataloggerConfiguration = {
    interval_seconds: 60,
    duration_seconds: null,
    start_mode: DATALOGGER_START_MODE.MANUAL,
    start_delay_seconds: 90,
    scheduled_start_local: null,
    trip_number: 'TRIP-001',
    trip_description: desc53,
  };

  let receiptFromCallback = null;
  const receipt = await writeDeviceConfiguration(
    hid,
    cfg,
    (r) => {
      receiptFromCallback = r;
    },
    () => fixedNow,
  );
  assert.equal(receipt, receiptFromCallback);
  assert.equal(dev.setParameterFrames.length, 7);
  assert.equal(dev.formatCount, 1);

  // All 7 frames match documented offsets and lengths
  assert.deepEqual(
    dev.setParameterFrames.map((f) => ({ offset: f.offset, length: f.payload.length })),
    PARAMETER_WRITE_RANGES.map((r) => ({ offset: r.offset, length: r.length })),
  );

  // Packet 3 (index 2, offset 0x60) has active length 59, declared count 48, checksum at byte 58
  const pkt3 = dev.setParameterFrames[2];
  assert.equal(pkt3.offset, 0x60);
  assert.equal(pkt3.frame[3], 59);
  assert.equal(pkt3.frame[10], 48);
  let pkt3Sum = 0;
  for (let i = 0; i < 58; i++) {
    pkt3Sum = (pkt3Sum + pkt3.frame[i]) & 0xff;
  }
  assert.equal(pkt3.frame[58], pkt3Sum);
  // Packet 3 zeroes 0x88..0x8e in the outgoing frame, without erasing the device's live RTC
  assert.deepEqual(Array.from(pkt3.payload.subarray(0x88 - 0x60, 0x8f - 0x60)), [0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(Array.from(dev.memory.subarray(0x88, 0x8f)), [0x1a, 0x0b, 0x02, 0x18, 0x0e, 0x05, 0x06]);

  // Verify interval 00 06 at 0x4c, delay 00 09 at 0x40, 13 padded trip bytes at 0x10..0x1c
  assert.deepEqual(Array.from(dev.memory.subarray(0x4c, 0x4e)), [0x00, 0x06]);
  assert.deepEqual(Array.from(dev.memory.subarray(0x40, 0x42)), [0x00, 0x09]);
  assert.deepEqual(
    Array.from(dev.memory.subarray(0x10, 0x1d)),
    [0x54, 0x52, 0x49, 0x50, 0x2d, 0x30, 0x30, 0x31, 0, 0, 0, 0, 0],
  );

  // Other start/stop/repeat bits (0xd8) and LCD nibble (0x50) and resistance compensation (0x012c) survive
  assert.equal(dev.memory[0x20], 0xd8 | 0x01);
  assert.equal(dev.memory[0x26] & 0xf0, 0x50);
  assert.deepEqual(Array.from(dev.memory.subarray(0x6e, 0x70)), [0x01, 0x2c]);

  // Fixed clock 2026-11-24 14:05:06 UTC+8 written at 0x28..0x2e, timezone 8/0
  assert.deepEqual(
    Array.from(dev.memory.subarray(0x28, 0x2f)),
    [0x1a, 0x0b, 0x02, 0x18, 0x0e, 0x05, 0x06],
  );
  assert.equal(dev.memory[0x24] & 0x1f, 8);
  assert.equal(dev.memory[0x2f], 0);

  // Dummy start timestamp appears for non-Timer mode
  assert.deepEqual(Array.from(dev.memory.subarray(0x30, 0x38)), [12, 1, 1, 1, 1, 1, 1, 0]);

  // 53-byte description splits into 52 'A's in Packet 4 and 'B' + 47 spaces in Packet 5, never leaks into 0xfc
  assert.equal(new TextDecoder().decode(dev.setParameterFrames[3].payload), 'A'.repeat(52));
  assert.equal(new TextDecoder().decode(dev.setParameterFrames[4].payload), 'B' + ' '.repeat(47));
  assert.equal(dev.memory[0xfc], 0xee);

  // Final sent frame is exact Format command: 33 cc 00 0d c0 02 00 00 00 00 01 00 cf
  const formatFrame = dev.sentFrames[dev.sentFrames.length - 1];
  assert.deepEqual(
    Array.from(formatFrame.subarray(0, 13)),
    [0x33, 0xcc, 0x00, 0x0d, 0xc0, 0x02, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0xcf],
  );
  assert.equal(formatFrame.subarray(13).every((b) => b === 0), true);

  // Timer mode writes future DateTime7 at 0x30 and delay 0
  dev.setParameterFrames = [];
  const timerCfg: DataloggerConfiguration = {
    interval_seconds: 120,
    duration_seconds: null,
    start_mode: DATALOGGER_START_MODE.TIMER,
    start_delay_seconds: 90,
    scheduled_start_local: '2026-11-25T08:30:00',
    trip_number: 'TIMER-1',
    trip_description: 'Scheduled run',
  };
  await writeDeviceConfiguration(hid, timerCfg, () => {}, () => fixedNow);
  assert.deepEqual(Array.from(dev.memory.subarray(0x30, 0x38)), [26, 11, 3, 25, 8, 30, 0, 0]);
  assert.deepEqual(Array.from(dev.memory.subarray(0x40, 0x42)), [0, 0]);
});

test('quickResetDevice rewrites current device configuration, ignores unsaved draft, and blocks expired timer', async () => {
  const dev = new FakeElitechDevice({
    serial: 'SN-RESET-01',
    intervalSeconds: 60,
    startModeCode: 1,
    delaySeconds: 30,
    tripNumber: 'CURRENT',
    tripDescription: 'Device stored description',
  });
  // Put raw non-ASCII GB2312 bytes in DeviceName (0x13c) and TravelDesc (0x98) to verify Quick Reset preserves them
  dev.memory[0x98] = 0xb1;
  dev.memory[0x99] = 0xb2;
  dev.memory[0x13c] = 0xc4;
  dev.memory[0x13d] = 0xe3;

  const hid = new ElitechHID();
  hid.device = dev;

  // Unsaved draft has interval 600 and trip UNSAVED, which Quick Reset must never touch
  const _unsavedDraft: DataloggerConfiguration = {
    interval_seconds: 600,
    duration_seconds: null,
    start_mode: DATALOGGER_START_MODE.IMMEDIATE,
    start_delay_seconds: 0,
    scheduled_start_local: null,
    trip_number: 'UNSAVED',
    trip_description: 'Unsaved draft',
  };
  assert.ok(_unsavedDraft);

  const fixedNow = new Date(2026, 10, 24, 14, 5, 6);
  const receipt = await quickResetDevice(hid, () => {}, () => fixedNow);

  assert.equal(dev.setParameterFrames.length, 7);
  assert.equal(dev.formatCount, 1);
  // Sent interval 60 (00 06) and trip CURRENT, not draft 600 / UNSAVED
  assert.deepEqual(Array.from(dev.memory.subarray(0x4c, 0x4e)), [0x00, 0x06]);
  assert.equal(
    new TextDecoder().decode(dev.memory.subarray(0x10, 0x17)),
    'CURRENT',
  );
  // Raw non-ASCII description and custom name bytes preserved
  assert.equal(dev.memory[0x98], 0xb1);
  assert.equal(dev.memory[0x99], 0xb2);
  assert.equal(dev.memory[0x13c], 0xc4);
  assert.equal(dev.memory[0x13d], 0xe3);

  // Verify receipt passes readback even when raw RTC is decoded with captured offset
  const verified = await verifyConfigurationReceipt(hid, receipt, receipt.startedAt + 1000);
  assert.equal(verified.serialNumber, 'SN-RESET-01');
  assert.equal(verified.recordNumber, 0);

  // Expired Timer on device blocks Quick Reset before any SetParameter write
  dev.setParameterFrames = [];
  dev.formatCount = 0;
  dev.memory[0x20] = (dev.memory[0x20] & 0xf8) | 2; // Timer mode
  dev.memory.set([26, 11, 2, 24, 14, 5, 30, 0], 0x30); // Only 24s ahead (<= 60s)
  await assert.rejects(
    () => quickResetDevice(hid, () => {}, () => fixedNow),
    /60 seconds in the future/i,
  );
  assert.equal(dev.setParameterFrames.length, 0);
  assert.equal(dev.formatCount, 0);
});

test('pre-write guards reject password-enabled, short image, missing serial, unsupported model, and invalid schedule before first SetParameter', async () => {
  const fixedNow = new Date(2026, 10, 24, 14, 5, 6);
  const baseCfg: DataloggerConfiguration = {
    interval_seconds: 60,
    duration_seconds: null,
    start_mode: DATALOGGER_START_MODE.IMMEDIATE,
    start_delay_seconds: 0,
    scheduled_start_local: null,
    trip_number: 'T1',
    trip_description: 'OK',
  };

  // 1. Password-enabled
  const pwdDev = new FakeElitechDevice({ passwordEnabled: true });
  const hid = new ElitechHID();
  hid.device = pwdDev;
  await assert.rejects(
    () => writeDeviceConfiguration(hid, baseCfg, () => {}, () => fixedNow),
    /password/i,
  );
  assert.equal(pwdDev.setParameterFrames.length, 0);

  // 2. Missing serial
  const noSerialDev = new FakeElitechDevice({ serial: '' });
  hid.device = noSerialDev;
  await assert.rejects(
    () => writeDeviceConfiguration(hid, baseCfg, () => {}, () => fixedNow),
    /serial/i,
  );
  assert.equal(noSerialDev.setParameterFrames.length, 0);

  // 3. Unsupported model
  const badModelDev = new FakeElitechDevice({ model: 0x0133 });
  hid.device = badModelDev;
  await assert.rejects(
    () => writeDeviceConfiguration(hid, baseCfg, () => {}, () => fixedNow),
    /0x3005/i,
  );
  assert.equal(badModelDev.setParameterFrames.length, 0);

  // 4. Short parameter read image
  const shortDev = new FakeElitechDevice();
  shortDev.onSendHook = (frame, d) => {
    const op = frame[4] | (frame[5] << 8);
    const offset = (frame[9] << 16) | (frame[7] << 8) | frame[8];
    if (op === ElitechHID.OP_GET_PARAMETER && offset === 152) {
      const shortResp = FakeElitechDevice.buildResponseFrame(op, offset, new Uint8Array(10));
      queueMicrotask(() => d.emitFrame(shortResp));
      return true;
    }
  };
  hid.device = shortDev;
  await assert.rejects(
    () => writeDeviceConfiguration(hid, baseCfg, () => {}, () => fixedNow),
    /short/i,
  );
  assert.equal(shortDev.setParameterFrames.length, 0);

  // 5. Invalid schedule / <= 60s timer / year 2100
  const okDev = new FakeElitechDevice();
  hid.device = okDev;
  await assert.rejects(
    () =>
      writeDeviceConfiguration(
        hid,
        {
          ...baseCfg,
          start_mode: DATALOGGER_START_MODE.TIMER,
          scheduled_start_local: '2026-11-24T14:05:30', // +24s <= 60s
        },
        () => {},
        () => fixedNow,
      ),
    /60 seconds/i,
  );
  await assert.rejects(
    () =>
      writeDeviceConfiguration(
        hid,
        {
          ...baseCfg,
          start_mode: DATALOGGER_START_MODE.TIMER,
          scheduled_start_local: '2100-01-01T00:00:00',
        },
        () => {},
        () => fixedNow,
      ),
    /2000\.\.2099/,
  );
  assert.equal(okDev.setParameterFrames.length, 0);
});

test('setParameter bounds (52 ok, 0/53 reject) and _transact fault handling leave zero stale listeners and abort before Format', async () => {
  const dev = new FakeElitechDevice();
  const hid = new ElitechHID();
  hid.device = dev;

  // Payload 52 works; 0 and 53 reject
  await hid.setParameter(152, new Uint8Array(52).fill(0x20));
  assert.equal(dev.listenerCount(), 0);
  await assert.rejects(() => hid.setParameter(0, new Uint8Array(0)), /1\.\.52/);
  await assert.rejects(() => hid.setParameter(0, new Uint8Array(53)), /1\.\.52/);

  // Wrong high opcode byte
  dev.onSendHook = (frame, d) => {
    const offset = (frame[9] << 16) | (frame[7] << 8) | frame[8];
    const badOp = FakeElitechDevice.buildResponseFrame(0x0104, offset, new Uint8Array([0x01]));
    queueMicrotask(() => d.emitFrame(badOp));
    return true;
  };
  await assert.rejects(() => hid.setParameter(0, new Uint8Array(8)), /opcode/i);
  assert.equal(dev.listenerCount(), 0);

  // Wrong ACK offset
  dev.onSendHook = (_frame, d) => {
    const badOffset = FakeElitechDevice.buildResponseFrame(
      ElitechHID.OP_SET_PARAMETER,
      0x99,
      new Uint8Array([0x01]),
    );
    queueMicrotask(() => d.emitFrame(badOffset));
    return true;
  };
  await assert.rejects(() => hid.setParameter(0, new Uint8Array(8)), /offset mismatch/i);
  assert.equal(dev.listenerCount(), 0);

  // Bad checksum
  dev.onSendHook = (frame, d) => {
    const offset = (frame[9] << 16) | (frame[7] << 8) | frame[8];
    const badCrc = FakeElitechDevice.buildResponseFrame(
      ElitechHID.OP_SET_PARAMETER,
      offset,
      new Uint8Array([0x01]),
    );
    badCrc[12] ^= 0xff;
    queueMicrotask(() => d.emitFrame(badCrc));
    return true;
  };
  await assert.rejects(() => hid.setParameter(0, new Uint8Array(8)), /checksum/i);
  assert.equal(dev.listenerCount(), 0);

  // Negative ACK status 0x00
  dev.onSendHook = (frame, d) => {
    const offset = (frame[9] << 16) | (frame[7] << 8) | frame[8];
    const nack = FakeElitechDevice.buildResponseFrame(
      ElitechHID.OP_SET_PARAMETER,
      offset,
      new Uint8Array([0x00]),
    );
    queueMicrotask(() => d.emitFrame(nack));
    return true;
  };
  await assert.rejects(() => hid.setParameter(0, new Uint8Array(8)), /rejected/i);
  assert.equal(dev.listenerCount(), 0);

  // Timeout
  dev.onSendHook = () => true;
  await assert.rejects(() => hid._transact(hid._buildFrame(0x0003, 0, 8), 25), /timeout/i);
  assert.equal(dev.listenerCount(), 0);

  // sendReport rejection releases listener and timer immediately
  dev.onSendHook = () => {
    throw new Error('USB pipe broken');
  };
  await assert.rejects(() => hid.setParameter(0, new Uint8Array(8)), /USB pipe broken/);
  assert.equal(dev.listenerCount(), 0);

  // Failed packet ACK during writeDeviceConfiguration aborts without sending Format
  dev.formatCount = 0;
  dev.onSendHook = (frame, d) => {
    const op = frame[4] | (frame[5] << 8);
    const offset = (frame[9] << 16) | (frame[7] << 8) | frame[8];
    if (op === ElitechHID.OP_SET_PARAMETER && offset === 96) {
      const nack = FakeElitechDevice.buildResponseFrame(op, offset, new Uint8Array([0x00]));
      queueMicrotask(() => d.emitFrame(nack));
      return true;
    }
  };
  await assert.rejects(
    () =>
      writeDeviceConfiguration(
        hid,
        {
          interval_seconds: 60,
          duration_seconds: null,
          start_mode: DATALOGGER_START_MODE.IMMEDIATE,
          start_delay_seconds: 0,
          scheduled_start_local: null,
          trip_number: 'T1',
          trip_description: '',
        },
        () => {},
        () => new Date(2026, 10, 24, 14, 5, 6),
      ),
    /packet 3\/7/i,
  );
  assert.equal(dev.formatCount, 0);
  assert.equal(dev.listenerCount(), 0);
});

test('device-session: snapshot survives unplug/B connect, stale A fetch cannot overwrite B, partial fetch retains snapshot, and discard clears it', async () => {
  const devA = new FakeElitechDevice({
    serial: 'SN-A',
    recordCount: 2,
    protocolVersion: 0x38,
  });
  devA.records = [
    encodeRawSampleRecord({
      year: 2026,
      month: 11,
      day: 24,
      hour: 8,
      minute: 0,
      second: 0,
      tempTenths: 42,
    }),
    encodeRawSampleRecord({
      year: 2026,
      month: 11,
      day: 24,
      hour: 8,
      minute: 15,
      second: 0,
      tempTenths: 45,
      flags: 0x01,
    }),
  ];

  const devB = new FakeElitechDevice({
    serial: 'SN-B',
    recordCount: 1,
    protocolVersion: 0x38,
  });
  devB.records = [
    encodeRawSampleRecord({
      year: 2026,
      month: 11,
      day: 24,
      hour: 9,
      minute: 0,
      second: 0,
      tempTenths: 51,
    }),
  ];

  let nextDevice: FakeElitechDevice | null = devA;
  const hid = new ElitechHID();
  hid.connect = async () => {
    if (!nextDevice) return null;
    await nextDevice.open();
    hid.device = nextDevice;
    return nextDevice;
  };

  let dispose!: () => void;
  const session = createRoot((d) => {
    dispose = d;
    return createDataloggerDeviceSession(hid, {
      clock: () => new Date(2026, 10, 24, 14, 5, 6),
      postFormatDelayMs: 5,
      verificationTimeoutMs: 60,
      verificationPollIntervalMs: 10,
    });
  });

  try {
    // 1. Connect A (sends zero parameter writes) and pull snapshot
    await session.connect();
    assert.equal(session.connected(), true);
    assert.equal(session.deviceInfo()?.serialNumber, 'SN-A');
    assert.equal(devA.setParameterFrames.length, 0);

    const snapA = await session.fetchRecords();
    assert.ok(snapA);
    assert.equal(snapA.serialNumber, 'SN-A');
    assert.equal(snapA.records.length, 2);

    // 2. Unplug A and connect B -> A snapshot survives
    await session.disconnect();
    assert.equal(session.connected(), false);
    assert.equal(session.snapshot()?.serialNumber, 'SN-A');

    nextDevice = devB;
    await session.connect();
    assert.equal(session.deviceInfo()?.serialNumber, 'SN-B');
    assert.equal(session.snapshot()?.serialNumber, 'SN-A');
    assert.equal(session.snapshot()?.records.length, 2);

    // 3. Partial fetch on B does not replace complete A snapshot
    devB.setRecordCount(3); // Advertises 3 records, but only 1 record is present
    const partialResult = await session.fetchRecords();
    assert.equal(partialResult, null);
    assert.match(session.deviceError() ?? '', /Incomplete record pull/i);
    assert.equal(session.snapshot()?.serialNumber, 'SN-A');
    assert.equal(session.snapshot()?.records.length, 2);

    // 4. Stale in-flight fetch from old generation cannot overwrite new connection state
    devB.setRecordCount(1);
    const reachedGetRecord = Promise.withResolvers<void>();
    const slowFetchGate = Promise.withResolvers<void>();
    devB.onSendHook = async (frame) => {
      const op = frame[4] | (frame[5] << 8);
      if (op === ElitechHID.OP_GET_RECORD) {
        reachedGetRecord.resolve();
        await slowFetchGate.promise;
      }
    };
    const inFlightB = session.fetchRecords();
    await reachedGetRecord.promise;
    await session.disconnect();
    nextDevice = devA;
    await session.connect();
    assert.equal(session.deviceInfo()?.serialNumber, 'SN-A');

    slowFetchGate.resolve();
    const staleResult = await inFlightB;
    assert.equal(staleResult, null);
    assert.equal(session.deviceInfo()?.serialNumber, 'SN-A');
    assert.equal(session.snapshot()?.serialNumber, 'SN-A');

    // 5. Explicit discard clears snapshot
    session.discardSnapshot();
    assert.equal(session.snapshot(), null);
  } finally {
    dispose();
  }
});

test('device-session: post-Format disconnect, wrong-serial reconnect, same-serial reconnect verification, and failed Format send unknown outcome', async () => {
  const fixedNow = new Date(2026, 10, 24, 14, 5, 6);
  const devA = new FakeElitechDevice({
    serial: 'SN-VERIFY-A',
    recordCount: 5,
    intervalSeconds: 120,
  });
  const devWrong = new FakeElitechDevice({
    serial: 'SN-WRONG-B',
    recordCount: 0,
    intervalSeconds: 60,
  });

  let nextDevice: FakeElitechDevice | null = devA;
  const hid = new ElitechHID();
  hid.connect = async () => {
    if (!nextDevice) return null;
    await nextDevice.open();
    hid.device = nextDevice;
    return nextDevice;
  };

  let dispose!: () => void;
  const session = createRoot((d) => {
    dispose = d;
    return createDataloggerDeviceSession(hid, {
      clock: () => fixedNow,
      postFormatDelayMs: 5,
      verificationTimeoutMs: 40,
      verificationPollIntervalMs: 10,
    });
  });

  try {
    await session.connect();

    // Simulate USB disconnect immediately when Format is sent
    devA.onSendHook = (frame, d) => {
      const op = frame[4] | (frame[5] << 8);
      if (op === ElitechHID.OP_FORMAT_MEMORY) {
        d.formatCount += 1;
        d.records = [];
        d.setRecordCount(0);
        d.opened = false;
        return true;
      }
    };

    const targetCfg: DataloggerConfiguration = {
      interval_seconds: 60,
      duration_seconds: null,
      start_mode: DATALOGGER_START_MODE.MANUAL,
      start_delay_seconds: 90,
      scheduled_start_local: null,
      trip_number: 'TRIP-001',
      trip_description: 'Cold-chain delivery',
    };

    const verifiedImmediately = await session.applyConfiguration(targetCfg);
    assert.equal(verifiedImmediately, false);
    assert.equal(session.connected(), false);
    assert.ok(session.pendingVerification());
    assert.equal(
      session.pendingVerification()?.statusMessage,
      RESET_ATTEMPTED_RECONNECT_MESSAGE,
    );

    // Apply/Quick Reset blocked while pendingVerification is unresolved
    await assert.rejects(() => session.quickReset(), /awaiting verification/i);

    // Reconnecting wrong serial SN-WRONG-B does not clear pendingVerification or trigger writes
    nextDevice = devWrong;
    await session.connect();
    assert.ok(session.pendingVerification());
    assert.match(session.deviceError() ?? '', /does not match pending verification target/i);
    assert.equal(devWrong.setParameterFrames.length, 0);

    // Reconnecting same serial SN-VERIFY-A with non-zero record count fails verification and retains receipt
    await session.disconnect();
    devA.onSendHook = undefined;
    devA.setRecordCount(2);
    nextDevice = devA;
    await session.connect();
    assert.ok(session.pendingVerification());
    assert.match(session.deviceError() ?? '', /record count is 2/i);

    // Same serial SN-VERIFY-A with count 0, matching fields, and progressing clock -> verified success
    devA.setRecordCount(0);
    const verifiedOnRetry = await session.verifyPendingOperation();
    assert.equal(verifiedOnRetry, true);
    assert.equal(session.pendingVerification(), null);
    assert.equal(session.lastVerifiedOperation(), 'apply');
    assert.equal(session.deviceError(), null);

    // Readback configuration matches applied configuration
    const readBack = await readDeviceConfiguration(hid);
    assert.deepEqual(readBack.config, targetCfg);

    // Failed Format send leaves unverified receipt (unknown outcome) without retrying Format
    devA.formatCount = 0;
    devA.onSendHook = (frame) => {
      const op = frame[4] | (frame[5] << 8);
      if (op === ElitechHID.OP_FORMAT_MEMORY) {
        devA.formatCount += 1;
        devA.opened = false;
        throw new Error('Format write interrupted');
      }
    };
    const resetVerified = await session.quickReset();
    assert.equal(resetVerified, false);
    assert.equal(devA.formatCount, 1); // Never retried
    assert.ok(session.pendingVerification());
    session.dismissPendingVerification();
    assert.equal(session.pendingVerification(), null);
  } finally {
    dispose();
  }
});
