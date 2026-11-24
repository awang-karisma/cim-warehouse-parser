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
  const firmwareVersion = p[0x1f];
  const protocolVersion = tail[0x95 - 0x88];
  const recordNumber = (p[0x48] << 8) | p[0x49];
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
    tempRaw |= Number((q >> 9n) & 1n) << 10;
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

  for (let index = 0; index < recordNumber; index += RECORDS_PER_REQUEST) {
    const count = Math.min(RECORDS_PER_REQUEST, recordNumber - index);
    let rawData = await hid.getRecord(index, count);

    // Protocol 0x38 loggers (e.g. RC-5+ V5.7) may return 0 records until trip summary (0x0005) is queried.
    if (index === 0 && rawData.length === 0 && recordNumber > 0) {
      try {
        const tripFrame = hid._buildFrame(ElitechHID.OP_GET_TRIP, 0, 48);
        await hid._transact(tripFrame, 500);
        await new Promise((r) => setTimeout(r, 50));
      } catch {
        // Ignore if device does not support 0x0005
      }
      rawData = await hid.getRecord(index, count);
    }

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

    if (onProgress) {
      onProgress(Math.min(index + actualCount, recordNumber), recordNumber);
    }

    if (hitSentinel || actualCount < count) break;
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
