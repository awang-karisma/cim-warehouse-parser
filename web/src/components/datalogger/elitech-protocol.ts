import { DATALOGGER_START_MODE, type DataloggerStartMode } from '~/domain';
import type { DataloggerConfiguration } from '~/types';
import { ElitechHID } from './elitech-hid';
import type { DeviceInfo, RawRecord } from './types';
export const KNOWN_MODELS: Record<number, string> = {
  0x3005: 'Elitech RC-5+',
  0x0033: 'Elitech RC-51',
  0x0133: 'Elitech RC-51H',
  0x0037: 'Elitech RC-55',
  0x1014: 'Elitech TemLog 20',
  0x1114: 'Elitech TemLog 20H',
  0x0012: 'Elitech RC-18',
  0x0013: 'Elitech RC-19',
  0x1005: 'Elitech ST5',
  0x2033: 'Elitech MSL-51',
  0x2133: 'Elitech MSL-51H',
  0x0001: 'Elitech LogEt 1',
  0x0101: 'Elitech LogEt 1TH',
  0x0201: 'Elitech LogEt 1Bio',
  0x3006: 'Elitech LogEt 6',
  0x4008: 'Elitech LogEt 8',
  0x3008: 'Elitech LogEt 8 Food',
  0x4308: 'Elitech LogEt 8 Life Science',
};

function decodeAscii(bytes: Uint8Array): string {
  let end = bytes.indexOf(0);
  if (end === -1) end = bytes.length;
  return new TextDecoder('ascii').decode(bytes.subarray(0, end)).trim();
}

function decodeDateTime7(bytes: Uint8Array, offset = 0): Date {
  const year = 2000 + bytes[offset];
  const month = bytes[offset + 1];
  const day = bytes[offset + 3];
  const hour = bytes[offset + 4];
  const minute = bytes[offset + 5];
  const second = bytes[offset + 6];
  return new Date(year, month - 1, day, hour, minute, second);
}

function formatDurationSeconds(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

export async function readDeviceInfo(hid: ElitechHID): Promise<DeviceInfo> {
  const blockA = await hid.getParameter(0x00, 0x34); // 0x00..0x33 (52 bytes)
  const blockB = await hid.getParameter(0x34, 0x1a); // 0x34..0x4D (26 bytes)
  const p = new Uint8Array(0x4e);
  p.set(blockA, 0);
  p.set(blockB, 0x34);

  const tail = await hid.getParameter(0x88, 14); // 0x88..0x95

  const model = (p[0x00] << 8) | p[0x01];
  const serialNumber = decodeAscii(p.subarray(0x02, 0x02 + 12));
  const firmwareVersion = ((p[0x1f] >> 4) & 0x0f) * 10 + (p[0x1f] & 0x0f);
  const protocolVersion = tail[0x95 - 0x88];
  const recordNumber =
    protocolVersion >= 0x24
      ? (((p[0x46] << 24) | (p[0x47] << 16) | (p[0x48] << 8) | p[0x49]) >>> 0)
      : (p[0x48] << 8) | p[0x49];
  const deviceCapacity =
    ((p[0x42] << 24) | (p[0x43] << 16) | (p[0x44] << 8) | p[0x45]) >>> 0;
  const batteryLevel = p[0x27] & 0x0f;
  const deviceTime = decodeDateTime7(tail, 0);
  const intervalRaw = (p[0x4c] << 8) | p[0x4d];
  const intervalSeconds = intervalRaw * 10;
  const temperatureUnit: '°C' | '°F' = p[0x21] & 0x08 ? '°F' : '°C';

  return {
    model,
    modelName: KNOWN_MODELS[model] || `0x${model.toString(16).padStart(4, '0').toUpperCase()}`,
    serialNumber: serialNumber || '—',
    firmwareVersion,
    protocolVersion,
    recordNumber,
    deviceCapacity,
    batteryLevel,
    deviceTime,
    intervalSeconds,
    intervalFormatted: formatDurationSeconds(intervalSeconds),
    temperatureUnit,
  };
}

export function decodeRecord(q: bigint, protocolVersion: number): RawRecord {
  const flags = Number(q & 0xffn);
  const second = Number((q >> 10n) & 0x3fn);
  const year = Number((q >> 16n) & 0x7fn);
  const month = Number((q >> 23n) & 0x0fn);
  const day = Number((q >> 27n) & 0x1fn);
  const hour = Number((q >> 32n) & 0x1fn);
  let tempRaw = Number((q >> 37n) & 0x7ffn);
  const minute = Number((q >> 48n) & 0x3fn);
  const humiRaw = Number((q >> 54n) & 0x3ffn);

  if (protocolVersion >= 0x23) {
    tempRaw |= Number((q >> 9n) & 1n) << 11;
  }

  const temperature = flags & 0x08 ? -tempRaw / 10 : tempRaw / 10;
  const humidity = humiRaw === 0 ? null : flags & 0x40 ? -humiRaw / 10 : humiRaw / 10;
  const time = new Date(2000 + year, month - 1, day, hour, minute, second);

  let flagChars = '';
  if (flags & 0x01) flagChars += 'M';
  if (flags & 0x10) flagChars += 'L';
  if (flags & 0x20) flagChars += 'V';
  if (flags & 0x02) flagChars += 'P';
  if (flags & 0x04) flagChars += 'S';
  if (flags & 0x80) flagChars += 'E';

  return {
    time,
    temperature,
    humidity,
    flags: flagChars || '—',
  };
}

export async function fetchAllRecords(
  hid: ElitechHID,
  recordNumber: number,
  protocolVersion: number,
  onProgress?: (fetched: number, total: number) => void,
): Promise<RawRecord[]> {
  const RECORDS_PER_REQUEST = 6;
  const records: RawRecord[] = [];

  // Protocol 0x38 loggers (e.g. RC-5+ V5.7/v87) keep a stale cached record limit from the
  // previous USB readout (e.g. 0 or 13 records) until trip summary (0x0005) is queried.
  // Querying 0x0005 up front refreshes the logger's internal trip boundary before GetRecord.
  if (recordNumber > 0) {
    try {
      const tripFrame = hid._buildFrame(ElitechHID.OP_GET_TRIP, 0, 48);
      await hid._transact(tripFrame, 500);
      await new Promise((r) => setTimeout(r, 50));
    } catch {
      // Ignore if device does not support 0x0005
    }
  }

  let index = 0;
  while (index < recordNumber) {
    const count = Math.min(RECORDS_PER_REQUEST, recordNumber - index);
    const rawData = await hid.getRecord(index, count);

    const actualCount = Math.floor(rawData.length / 8);
    if (actualCount === 0) {
      break;
    }

    const dv = new DataView(rawData.buffer, rawData.byteOffset, rawData.byteLength);
    let hitSentinel = false;
    for (let i = 0; i < actualCount; i++) {
      const q = dv.getBigUint64(i * 8, true);
      if (q === 0xffffffffffffffffn) {
        hitSentinel = true;
        break;
      }
      records.push(decodeRecord(q, protocolVersion));
    }

    index += actualCount;
    if (onProgress) {
      onProgress(Math.min(index, recordNumber), recordNumber);
    }

    if (hitSentinel) break;
  }

  records.sort((a, b) => a.time.getTime() - b.time.getTime());
  return records;
}

export function rawRecordsToApiPayload(records: RawRecord[]) {
  return records.map((r) => ({
    timestamp: r.time.toISOString(),
    temperature: r.temperature,
    humidity: r.humidity,
    flags: r.flags,
  }));
}

export const RC5_PLUS_VENDOR_ID = 0x04d8;
export const RC5_PLUS_PRODUCT_ID = 0x3005;
export const RC5_PLUS_MODEL = 0x3005;

export const PARAMETER_READ_RANGES = [
  { offset: 0, length: 48 },
  { offset: 48, length: 48 },
  { offset: 96, length: 48 },
  { offset: 152, length: 52 },
  { offset: 204, length: 48 },
  { offset: 253, length: 47 },
  { offset: 316, length: 25 },
] as const;

export const PARAMETER_WRITE_RANGES = [
  { offset: 0, length: 48 },
  { offset: 48, length: 48 },
  { offset: 96, length: 47 },
  { offset: 152, length: 52 },
  { offset: 204, length: 48 },
  { offset: 253, length: 47 },
  { offset: 316, length: 25 },
] as const;

const INACTIVE_TIMING_START_BYTES = new Uint8Array([12, 1, 1, 1, 1, 1, 1, 0]);
const PARAMETER_IMAGE_SIZE = 341; // 316 + 25 (0x00..0x154)

export interface ConfigurationWriteReceipt {
  serialNumber: string;
  model: number;
  expectedParameters: Uint8Array;
  expectedTimezoneOffsetMinutes: number;
  hostInstant: Date;
  startedAt: number;
}

export interface DeviceConfigurationReadResult {
  config: DataloggerConfiguration;
  timezoneOffsetMinutes: number;
  displayTimeoutCode: number;
}

export function calculateLoggingInterval(durationSeconds: number, capacity: number): number {
  if (!Number.isSafeInteger(durationSeconds) || durationSeconds <= 0) {
    throw new Error('Logging duration must be a positive integer number of seconds.');
  }
  if (!Number.isSafeInteger(capacity) || capacity <= 0) {
    throw new Error('Device capacity must be a positive integer.');
  }
  const ticks = Math.ceil(durationSeconds / capacity / 10);
  const intervalSeconds = ticks * 10;
  if (!Number.isSafeInteger(intervalSeconds) || intervalSeconds < 10 || intervalSeconds > 655350) {
    throw new Error(
      `Calculated interval (${intervalSeconds}s) is outside the supported 10..655350s range.`,
    );
  }
  return intervalSeconds;
}

export function decodeTimezoneOffset(hourByte: number, minuteByte: number): number {
  const hour = hourByte & 0x1f;
  const minute = minuteByte > 60 ? 0 : minuteByte;
  if (hour > 24 || minute < 0 || minute >= 60) {
    throw new Error(`Invalid device timezone encoding (hour=${hour}, minute=${minute}).`);
  }
  if (hour <= 12) {
    const total = hour * 60 + minute;
    if (total > 720) {
      throw new Error(`Unsupported positive timezone offset (+${total} minutes).`);
    }
    return total;
  }
  const negHours = 24 - hour;
  const total = -(negHours * 60 + minute);
  if (total <= -720) {
    throw new Error(`Unsupported negative timezone offset (${total} minutes).`);
  }
  return total;
}

export function encodeTimezoneOffset(offsetMinutes: number): { hour: number; minute: number } {
  if (!Number.isInteger(offsetMinutes) || offsetMinutes <= -720 || offsetMinutes > 720) {
    throw new Error(`Unsupported host timezone offset (${offsetMinutes} minutes).`);
  }
  const abs = Math.abs(offsetMinutes);
  const wholeHours = Math.floor(abs / 60);
  const minute = abs % 60;
  const hour = offsetMinutes >= 0 ? wholeHours : 24 - wholeHours;
  if (hour < 0 || hour > 24 || decodeTimezoneOffset(hour, minute) !== offsetMinutes) {
    throw new Error(`Timezone offset (${offsetMinutes} minutes) cannot round-trip in RC-5+ format.`);
  }
  return { hour, minute };
}

function isValidCalendarComponents(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): boolean {
  if (
    !Number.isInteger(year) ||
    year < 2000 ||
    year > 2099 ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12 ||
    !Number.isInteger(day) ||
    day < 1 ||
    day > 31 ||
    !Number.isInteger(hour) ||
    hour < 0 ||
    hour > 23 ||
    !Number.isInteger(minute) ||
    minute < 0 ||
    minute > 59 ||
    !Number.isInteger(second) ||
    second < 0 ||
    second > 59
  ) {
    return false;
  }
  const utc = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  return (
    utc.getUTCFullYear() === year &&
    utc.getUTCMonth() === month - 1 &&
    utc.getUTCDate() === day &&
    utc.getUTCHours() === hour &&
    utc.getUTCMinutes() === minute &&
    utc.getUTCSeconds() === second
  );
}

export function encodeDateTime7(date: Date): Uint8Array {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new Error('Invalid Date instance for DateTime7 encoding.');
  }
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const dow = date.getDay();
  const day = date.getDate();
  const hour = date.getHours();
  const minute = date.getMinutes();
  const second = date.getSeconds();
  if (!isValidCalendarComponents(year, month, day, hour, minute, second)) {
    throw new Error(`Timestamp year ${year} is outside the supported 2000..2099 range.`);
  }
  return new Uint8Array([year - 2000, month, dow, day, hour, minute, second]);
}

function decodeValidatedDateTime7Components(
  bytes: Uint8Array,
  offset = 0,
): {
  year: number;
  month: number;
  dow: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  formattedLocal: string;
} {
  if (bytes.length < offset + 7) {
    throw new Error('Insufficient bytes for DateTime7.');
  }
  const yearOffset = bytes[offset];
  const month = bytes[offset + 1];
  const dow = bytes[offset + 2];
  const day = bytes[offset + 3];
  const hour = bytes[offset + 4];
  const minute = bytes[offset + 5];
  const second = bytes[offset + 6];
  const year = 2000 + yearOffset;
  if (!isValidCalendarComponents(year, month, day, hour, minute, second)) {
    throw new Error('Invalid DateTime7 calendar components on device.');
  }
  const formattedLocal =
    `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` +
    `T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
  return { year, month, dow, day, hour, minute, second, formattedLocal };
}

export function parseAndValidateScheduledStartLocal(
  scheduledStartLocal: string,
  referenceNow: Date,
): { date: Date; encoded: Uint8Array } {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/.exec(scheduledStartLocal);
  if (!match) {
    throw new Error('Scheduled start time must use exact YYYY-MM-DDTHH:mm:ss format.');
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (!isValidCalendarComponents(year, month, day, hour, minute, second)) {
    throw new Error('Scheduled start time has invalid calendar components or year outside 2000..2099.');
  }

  const candidate = new Date(year, month - 1, day, hour, minute, second, 0);
  if (
    Number.isNaN(candidate.getTime()) ||
    candidate.getFullYear() !== year ||
    candidate.getMonth() !== month - 1 ||
    candidate.getDate() !== day ||
    candidate.getHours() !== hour ||
    candidate.getMinutes() !== minute ||
    candidate.getSeconds() !== second
  ) {
    throw new Error('Scheduled start time falls in a daylight-saving gap or cannot round-trip locally.');
  }

  // Detect DST fall-back folds by checking alternative timezone offsets +/- 24 hours.
  const candidateOffset = candidate.getTimezoneOffset();
  const dayMs = 86_400_000;
  const neighborOffsets = new Set<number>([
    new Date(candidate.getTime() - dayMs).getTimezoneOffset(),
    new Date(candidate.getTime() + dayMs).getTimezoneOffset(),
  ]);
  for (const altOffset of neighborOffsets) {
    if (altOffset === candidateOffset) continue;
    const altInstant = new Date(candidate.getTime() + (altOffset - candidateOffset) * 60_000);
    if (
      altInstant.getFullYear() === year &&
      altInstant.getMonth() === month - 1 &&
      altInstant.getDate() === day &&
      altInstant.getHours() === hour &&
      altInstant.getMinutes() === minute &&
      altInstant.getSeconds() === second
    ) {
      throw new Error('Scheduled start time is ambiguous during a daylight-saving transition.');
    }
  }

  if (candidate.getTime() - referenceNow.getTime() <= 60_000) {
    throw new Error('Scheduled start time must be more than 60 seconds in the future.');
  }

  return {
    date: candidate,
    encoded: encodeDateTime7(candidate),
  };
}

function isPrintableAsciiString(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code > 0x7e) {
      return false;
    }
  }
  return true;
}

function decodeStrictPrintableAsciiField(
  bytes: Uint8Array,
  fieldName: string,
  trimTrailingSpaces: boolean,
): string {
  let end = bytes.length;
  const firstNul = bytes.indexOf(0);
  if (firstNul !== -1) {
    for (let i = firstNul + 1; i < bytes.length; i++) {
      const b = bytes[i];
      if (b !== 0 && (b < 0x20 || b > 0x7e)) {
        throw new Error(`Device ${fieldName} contains unsupported non-ASCII bytes.`);
      }
    }
    end = firstNul;
  }
  let out = '';
  for (let i = 0; i < end; i++) {
    const b = bytes[i];
    if (b < 0x20 || b > 0x7e) {
      throw new Error(`Device ${fieldName} contains unsupported non-ASCII bytes.`);
    }
    out += String.fromCharCode(b);
  }
  return trimTrailingSpaces ? out.replace(/ +$/, '') : out;
}

function encodePrintableAsciiFixed(value: string, length: number, padByte: number): Uint8Array {
  if (!isPrintableAsciiString(value)) {
    throw new Error('Field must contain only printable ASCII characters.');
  }
  if (value.length > length) {
    throw new Error(`Field length (${value.length}) exceeds maximum ${length} bytes.`);
  }
  const out = new Uint8Array(length);
  out.fill(padByte);
  for (let i = 0; i < value.length; i++) {
    out[i] = value.charCodeAt(i);
  }
  return out;
}

async function readCompleteParameterImage(hid: ElitechHID): Promise<Uint8Array> {
  const image = new Uint8Array(PARAMETER_IMAGE_SIZE);
  for (const range of PARAMETER_READ_RANGES) {
    const chunk = await hid.getParameter(range.offset, range.length);
    if (!(chunk instanceof Uint8Array) || chunk.length !== range.length) {
      throw new Error(
        `Short parameter read at offset 0x${range.offset.toString(16)} (expected ${range.length}, got ${chunk?.length ?? 0}).`,
      );
    }
    image.set(chunk, range.offset);
  }
  return image;
}

function parseStartModeCode(code: number): DataloggerStartMode {
  switch (code) {
    case 0:
      return DATALOGGER_START_MODE.IMMEDIATE;
    case 1:
      return DATALOGGER_START_MODE.MANUAL;
    case 2:
      return DATALOGGER_START_MODE.TIMER;
    default:
      throw new Error(`Unsupported device start mode code (${code}).`);
  }
}

export async function readDeviceConfiguration(
  hid: ElitechHID,
): Promise<DeviceConfigurationReadResult> {
  const image = await readCompleteParameterImage(hid);

  const tripNumber = decodeStrictPrintableAsciiField(
    image.subarray(0x10, 0x1d),
    'trip number',
    false,
  );
  const startMode = parseStartModeCode(image[0x20] & 0x07);
  const timezoneOffsetMinutes = decodeTimezoneOffset(image[0x24], image[0x2f]);
  const displayTimeoutCode = (image[0x26] >> 4) & 0x0f;

  let scheduledStartLocal: string | null = null;
  if (startMode === DATALOGGER_START_MODE.TIMER) {
    const dt = decodeValidatedDateTime7Components(image, 0x30);
    scheduledStartLocal = dt.formattedLocal;
  }

  const rawDelayTicks = (image[0x40] << 8) | image[0x41];
  const startDelaySeconds =
    startMode === DATALOGGER_START_MODE.MANUAL ? rawDelayTicks * 10 : 0;

  const rawIntervalTicks = (image[0x4c] << 8) | image[0x4d];
  const intervalSeconds = rawIntervalTicks * 10;
  if (intervalSeconds < 10 || intervalSeconds > 655350) {
    throw new Error(`Invalid device logging interval (${intervalSeconds}s).`);
  }

  const tripDescription = decodeStrictPrintableAsciiField(
    image.subarray(0x98, 0xfc),
    'trip description',
    true,
  );

  return {
    config: {
      interval_seconds: intervalSeconds,
      duration_seconds: null,
      start_mode: startMode,
      start_delay_seconds: startDelaySeconds,
      scheduled_start_local: scheduledStartLocal,
      trip_number: tripNumber,
      trip_description: tripDescription,
    },
    timezoneOffsetMinutes,
    displayTimeoutCode,
  };
}

function validateWritableDeviceBaseline(
  hid: ElitechHID,
  info: DeviceInfo,
  rawImage: Uint8Array,
): { model: number; serialNumber: string } {
  const dev = hid.device;
  if (!dev || !dev.opened) {
    throw new Error('HID device is not connected.');
  }
  if (dev.vendorId !== RC5_PLUS_VENDOR_ID || dev.productId !== RC5_PLUS_PRODUCT_ID) {
    throw new Error(
      `Unsupported USB VID:PID (${dev.vendorId.toString(16).padStart(4, '0')}:${dev.productId.toString(16).padStart(4, '0')}). Only Elitech RC-5+ (04d8:3005) is supported for writes.`,
    );
  }
  const model = (rawImage[0x00] << 8) | rawImage[0x01];
  if (model !== RC5_PLUS_MODEL || info.model !== RC5_PLUS_MODEL) {
    throw new Error(
      `Unsupported logger model (0x${model.toString(16).padStart(4, '0')}). Only Elitech RC-5+ (0x3005) is supported for writes.`,
    );
  }
  const rawSerial = decodeStrictPrintableAsciiField(
    rawImage.subarray(0x02, 0x0e),
    'serial number',
    true,
  ).trim();
  if (!rawSerial || rawSerial === '—' || info.serialNumber === '—' || rawSerial !== info.serialNumber) {
    throw new Error('Device serial number is missing or invalid; refusing to write configuration.');
  }
  if ((rawImage[0x21] & 0x01) !== 0) {
    throw new Error('Password-enabled data loggers are read-only and cannot be reconfigured or reset.');
  }
  return { model, serialNumber: rawSerial };
}

function normalizePreparedParameterImage(
  prepared: Uint8Array,
  hostTime7: Uint8Array,
  tz: { hour: number; minute: number },
): void {
  // Reserved / read-only / status slot normalization
  prepared[0x0e] = 0;
  prepared[0x0f] = 0;
  prepared[0x1f] = 0;

  // Timezone hour in low 5 bits of 0x24; preserve upper 3 bits
  prepared[0x24] = (prepared[0x24] & 0xe0) | (tz.hour & 0x1f);

  // Retain only startup bits 0xc0 at 0x25, config bits 0xf8 at 0x26, CSV bit 0x10 at 0x27
  prepared[0x25] &= 0xc0;
  prepared[0x26] &= 0xf8;
  prepared[0x27] &= 0x10;

  // Host clock at 0x28..0x2e and timezone minute at 0x2f
  prepared.set(hostTime7, 0x28);
  prepared[0x2f] = tz.minute & 0xff;

  // Zero record/shadow counts and padding slots
  prepared.fill(0, 0x46, 0x4c);
  prepared[0x5a] = 0;
  prepared[0x5b] = 0;
  prepared[0x5d] = 0;
  prepared[0x6c] = 0;
  prepared[0x6d] = 0;
  prepared[0x7e] = 0;
  prepared[0x7f] = 0;
  prepared.fill(0, 0x86, 0x8f);
}

async function executeParameterWriteSequence(
  hid: ElitechHID,
  receipt: ConfigurationWriteReceipt,
  onFormatAttempt: (receipt: ConfigurationWriteReceipt) => void,
): Promise<ConfigurationWriteReceipt> {
  const packets = PARAMETER_WRITE_RANGES.map((range) => ({
    offset: range.offset,
    payload: receipt.expectedParameters.slice(range.offset, range.offset + range.length),
  }));

  for (let i = 0; i < packets.length; i++) {
    const pkt = packets[i];
    try {
      await hid.setParameter(pkt.offset, pkt.payload);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Failed writing parameter packet ${i + 1}/7 (offset 0x${pkt.offset.toString(16)}): ${detail}. Partial parameter changes may exist on the logger.`,
      );
    }
  }

  onFormatAttempt(receipt);

  try {
    await hid.formatMemory();
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Format command outcome is unknown (${detail}). Reconnect the same logger (${receipt.serialNumber}) to verify whether memory was formatted.`,
    );
  }

  return receipt;
}

export async function writeDeviceConfiguration(
  hid: ElitechHID,
  config: DataloggerConfiguration,
  onFormatAttempt: (receipt: ConfigurationWriteReceipt) => void,
  clock: () => Date = () => new Date(),
): Promise<ConfigurationWriteReceipt> {
  const info = await readDeviceInfo(hid);
  const rawImage = await readCompleteParameterImage(hid);
  const { model, serialNumber } = validateWritableDeviceBaseline(hid, info, rawImage);

  if (
    !Number.isInteger(config.interval_seconds) ||
    config.interval_seconds < 10 ||
    config.interval_seconds > 655350 ||
    config.interval_seconds % 10 !== 0
  ) {
    throw new Error('Logging interval must be between 10 and 655350 seconds in 10-second steps.');
  }

  let effectiveIntervalSeconds = config.interval_seconds;
  if (config.duration_seconds !== null) {
    effectiveIntervalSeconds = calculateLoggingInterval(
      config.duration_seconds,
      info.deviceCapacity,
    );
    if (config.interval_seconds !== effectiveIntervalSeconds) {
      throw new Error(
        `Interval (${config.interval_seconds}s) does not match duration-calculated interval (${effectiveIntervalSeconds}s) for capacity ${info.deviceCapacity}.`,
      );
    }
  }

  if (
    config.start_mode !== DATALOGGER_START_MODE.IMMEDIATE &&
    config.start_mode !== DATALOGGER_START_MODE.MANUAL &&
    config.start_mode !== DATALOGGER_START_MODE.TIMER
  ) {
    throw new Error(`Invalid start mode (${String(config.start_mode)}).`);
  }

  if (
    !Number.isInteger(config.start_delay_seconds) ||
    config.start_delay_seconds < 0 ||
    config.start_delay_seconds > 655350 ||
    config.start_delay_seconds % 10 !== 0
  ) {
    throw new Error('Start delay must be between 0 and 655350 seconds in 10-second steps.');
  }

  const tripBytes = encodePrintableAsciiFixed(config.trip_number, 13, 0x00);
  const descBytes = encodePrintableAsciiFixed(config.trip_description, 100, 0x20);

  const hostInstant = clock();
  const startedAt = performance.now();
  const hostTime7 = encodeDateTime7(hostInstant);
  const timezoneOffsetMinutes = -hostInstant.getTimezoneOffset();
  const tz = encodeTimezoneOffset(timezoneOffsetMinutes);

  const prepared = new Uint8Array(rawImage);
  prepared.set(tripBytes, 0x10);

  const modeCode =
    config.start_mode === DATALOGGER_START_MODE.IMMEDIATE
      ? 0
      : config.start_mode === DATALOGGER_START_MODE.MANUAL
        ? 1
        : 2;
  prepared[0x20] = (prepared[0x20] & 0xf8) | modeCode;

  if (config.start_mode === DATALOGGER_START_MODE.TIMER) {
    if (!config.scheduled_start_local) {
      throw new Error('Scheduled start time is required for timer start mode.');
    }
    const { encoded } = parseAndValidateScheduledStartLocal(
      config.scheduled_start_local,
      hostInstant,
    );
    prepared.set(encoded, 0x30);
    prepared[0x37] = 0x00;
  } else {
    prepared.set(INACTIVE_TIMING_START_BYTES, 0x30);
  }

  const delayTicks =
    config.start_mode === DATALOGGER_START_MODE.MANUAL ? config.start_delay_seconds / 10 : 0;
  prepared[0x40] = (delayTicks >> 8) & 0xff;
  prepared[0x41] = delayTicks & 0xff;

  const intervalTicks = effectiveIntervalSeconds / 10;
  prepared[0x4c] = (intervalTicks >> 8) & 0xff;
  prepared[0x4d] = intervalTicks & 0xff;

  prepared.set(descBytes.subarray(0, 52), 0x98);
  prepared.set(descBytes.subarray(52, 100), 0xcc);

  normalizePreparedParameterImage(prepared, hostTime7, tz);

  const receipt: ConfigurationWriteReceipt = {
    serialNumber,
    model,
    expectedParameters: prepared,
    expectedTimezoneOffsetMinutes: timezoneOffsetMinutes,
    hostInstant: new Date(hostInstant.getTime()),
    startedAt,
  };

  return executeParameterWriteSequence(hid, receipt, onFormatAttempt);
}

export async function quickResetDevice(
  hid: ElitechHID,
  onFormatAttempt: (receipt: ConfigurationWriteReceipt) => void,
  clock: () => Date = () => new Date(),
): Promise<ConfigurationWriteReceipt> {
  const info = await readDeviceInfo(hid);
  const rawImage = await readCompleteParameterImage(hid);
  const { model, serialNumber } = validateWritableDeviceBaseline(hid, info, rawImage);

  // Validate current device mode, interval, and timer schedule without overlaying draft/profile
  const startMode = parseStartModeCode(rawImage[0x20] & 0x07);
  const rawIntervalTicks = (rawImage[0x4c] << 8) | rawImage[0x4d];
  const intervalSeconds = rawIntervalTicks * 10;
  if (intervalSeconds < 10 || intervalSeconds > 655350) {
    throw new Error(`Current device logging interval (${intervalSeconds}s) is invalid.`);
  }

  const hostInstant = clock();
  const startedAt = performance.now();
  const hostTime7 = encodeDateTime7(hostInstant);
  const timezoneOffsetMinutes = -hostInstant.getTimezoneOffset();
  const tz = encodeTimezoneOffset(timezoneOffsetMinutes);

  const prepared = new Uint8Array(rawImage);
  if (startMode === DATALOGGER_START_MODE.TIMER) {
    const dt = decodeValidatedDateTime7Components(rawImage, 0x30);
    const { encoded } = parseAndValidateScheduledStartLocal(dt.formattedLocal, hostInstant);
    prepared.set(encoded, 0x30);
    prepared[0x37] = 0x00;
  } else {
    prepared.set(INACTIVE_TIMING_START_BYTES, 0x30);
  }

  normalizePreparedParameterImage(prepared, hostTime7, tz);

  const receipt: ConfigurationWriteReceipt = {
    serialNumber,
    model,
    expectedParameters: prepared,
    expectedTimezoneOffsetMinutes: timezoneOffsetMinutes,
    hostInstant: new Date(hostInstant.getTime()),
    startedAt,
  };

  return executeParameterWriteSequence(hid, receipt, onFormatAttempt);
}

function shouldCompareParameterByte(offset: number, startModeCode: number): boolean {
  // Ignored reserved / read-only / volatile count / live RTC slots
  if (offset === 0x0e || offset === 0x0f) return false;
  if (offset === 0x1f) return false;
  if (offset >= 0x28 && offset <= 0x2e) return false; // ConfigurationTime write slot; live clock is verified via 0x88..0x8e
  if (startModeCode !== 2 && offset >= 0x30 && offset <= 0x37) return false;
  if (offset === 0x37 || offset === 0x3f) return false;
  if (offset >= 0x46 && offset <= 0x4b) return false;
  if (offset === 0x5a || offset === 0x5b || offset === 0x5d) return false;
  if (offset === 0x6c || offset === 0x6d) return false;
  if (offset === 0x7e || offset === 0x7f) return false;
  if (offset >= 0x86 && offset <= 0x8e) return false;
  return true;
}

function maskedParameterByte(offset: number, value: number): number {
  if (offset === 0x25) return value & 0xc0; // StartupTime config bits only
  if (offset === 0x26) return value & 0xf8; // TemporaryPdf + DisplayTime config bits only
  if (offset === 0x27) return value & 0x10; // CsvAllow config bit only
  return value;
}

export async function verifyConfigurationReceipt(
  hid: ElitechHID,
  receipt: ConfigurationWriteReceipt,
  nowPerf: number = performance.now(),
): Promise<DeviceInfo> {
  const info = await readDeviceInfo(hid);
  const actual = await readCompleteParameterImage(hid);

  const actualModel = (actual[0x00] << 8) | actual[0x01];
  if (actualModel !== receipt.model || info.model !== receipt.model) {
    throw new Error(
      `Verification failed: connected device model (0x${actualModel.toString(16)}) does not match expected model (0x${receipt.model.toString(16)}).`,
    );
  }

  const actualSerial = decodeStrictPrintableAsciiField(
    actual.subarray(0x02, 0x0e),
    'serial number',
    true,
  ).trim();
  if (actualSerial !== receipt.serialNumber || info.serialNumber !== receipt.serialNumber) {
    throw new Error(
      `Verification failed: connected serial (${actualSerial || '—'}) does not match expected serial (${receipt.serialNumber}).`,
    );
  }

  if (info.recordNumber !== 0) {
    throw new Error(
      `Verification failed: device record count is ${info.recordNumber} (expected 0 after format).`,
    );
  }

  const actualTzOffset = decodeTimezoneOffset(actual[0x24], actual[0x2f]);
  if (actualTzOffset !== receipt.expectedTimezoneOffsetMinutes) {
    throw new Error(
      `Verification failed: device timezone offset (${actualTzOffset} min) does not match expected (${receipt.expectedTimezoneOffsetMinutes} min).`,
    );
  }

  // Verify live RTC at 0x88..0x8e decoded with captured timezone offset
  const rtc = decodeValidatedDateTime7Components(actual, 0x88);
  const rtcInstantMs =
    Date.UTC(rtc.year, rtc.month - 1, rtc.day, rtc.hour, rtc.minute, rtc.second) -
    receipt.expectedTimezoneOffsetMinutes * 60_000;
  const elapsedMs = Math.max(0, nowPerf - receipt.startedAt);
  const expectedInstantMs = receipt.hostInstant.getTime() + elapsedMs;
  if (Math.abs(rtcInstantMs - expectedInstantMs) > 5000) {
    throw new Error(
      `Verification failed: device RTC clock differs from expected synchronized time by ${Math.round(Math.abs(rtcInstantMs - expectedInstantMs) / 1000)}s.`,
    );
  }

  const expected = receipt.expectedParameters;
  const startModeCode = expected[0x20] & 0x07;
  for (const range of PARAMETER_WRITE_RANGES) {
    for (let offset = range.offset; offset < range.offset + range.length; offset++) {
      if (!shouldCompareParameterByte(offset, startModeCode)) continue;
      const gotByte = maskedParameterByte(offset, actual[offset]);
      const wantByte = maskedParameterByte(offset, expected[offset]);
      if (gotByte !== wantByte) {
        throw new Error(
          `Verification failed: parameter byte mismatch at offset 0x${offset.toString(16)} (expected 0x${wantByte.toString(16).padStart(2, '0')}, got 0x${gotByte.toString(16).padStart(2, '0')}).`,
        );
      }
    }
  }

  return info;
}
