import { NTB_AREA_CENTERS, normalizeNtbAreaPolygonName } from '~/data/ntbAreasGeojson';

// Open Location Code (Plus Code) specification constants
const SEPARATOR = '+';
const SEPARATOR_POSITION = 8;
const PADDING_CHARACTER = '0';
const CODE_ALPHABET = '23456789CFGHJMPQRVWX';
const ENCODING_BASE = CODE_ALPHABET.length; // 20
const LATITUDE_MAX = 90;
const LONGITUDE_MAX = 180;
const PAIR_CODE_LENGTH = 10;
const PAIR_FIRST_PLACE_VALUE = Math.pow(ENCODING_BASE, PAIR_CODE_LENGTH / 2 - 1); // 20^4
const PAIR_PRECISION = Math.pow(ENCODING_BASE, 3); // 8000
const GRID_COLUMNS = 4;
const GRID_ROWS = 5;
const GRID_CODE_LENGTH = 5;
const GRID_LAT_FIRST_PLACE_VALUE = Math.pow(GRID_ROWS, GRID_CODE_LENGTH - 1);
const GRID_LNG_FIRST_PLACE_VALUE = Math.pow(GRID_COLUMNS, GRID_CODE_LENGTH - 1);
const FINAL_LAT_PRECISION = PAIR_PRECISION * Math.pow(GRID_ROWS, GRID_CODE_LENGTH);
const FINAL_LNG_PRECISION = PAIR_PRECISION * Math.pow(GRID_COLUMNS, GRID_CODE_LENGTH);
const MIN_TRIMMABLE_CODE_LEN = 6;

const DEFAULT_NTB_REF: [number, number] = [-8.65, 116.45]; // [lat, lng]

function clipLatitude(lat: number): number {
  return Math.min(LATITUDE_MAX, Math.max(-LATITUDE_MAX, lat));
}

function normalizeLongitude(lng: number): number {
  let res = lng;
  while (res < -LONGITUDE_MAX) res += 360;
  while (res >= LONGITUDE_MAX) res -= 360;
  return res;
}

function isValidCode(code: string): boolean {
  if (!code || code.length < 2) return false;
  const sepIdx = code.indexOf(SEPARATOR);
  if (sepIdx === -1 || sepIdx !== code.lastIndexOf(SEPARATOR)) return false;
  if (code.length === 1) return false;
  if (sepIdx > SEPARATOR_POSITION || sepIdx % 2 === 1) return false;

  const padIdx = code.indexOf(PADDING_CHARACTER);
  if (padIdx !== -1) {
    if (sepIdx < SEPARATOR_POSITION) return false;
    if (padIdx === 0 || padIdx % 2 === 1) return false;
    if (code.length > sepIdx + 1) return false;
    const padSection = code.slice(padIdx, sepIdx);
    if (/[^0]/.test(padSection)) return false;
  }

  if (code.length - sepIdx - 1 === 1) return false;

  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    if (ch === SEPARATOR || ch === PADDING_CHARACTER) continue;
    if (CODE_ALPHABET.indexOf(ch) === -1) return false;
  }
  return true;
}

function isShortCode(code: string): boolean {
  if (!isValidCode(code)) return false;
  const sepIdx = code.indexOf(SEPARATOR);
  return sepIdx >= 0 && sepIdx < SEPARATOR_POSITION;
}

function isFullCode(code: string): boolean {
  if (!isValidCode(code) || isShortCode(code)) return false;
  const firstLat = CODE_ALPHABET.indexOf(code[0]) * ENCODING_BASE;
  if (firstLat >= LATITUDE_MAX * 2) return false;
  if (code.length > 1) {
    const firstLng = CODE_ALPHABET.indexOf(code[1]) * ENCODING_BASE;
    if (firstLng >= LONGITUDE_MAX * 2) return false;
  }
  return true;
}

function encodeFull(latitude: number, longitude: number, codeLength = PAIR_CODE_LENGTH): string {
  const lat = clipLatitude(latitude);
  const lng = normalizeLongitude(longitude);

  let latVal = Math.floor(Math.round((lat + LATITUDE_MAX) * FINAL_LAT_PRECISION * 1e6) / 1e6);
  let lngVal = Math.floor(Math.round((lng + LONGITUDE_MAX) * FINAL_LNG_PRECISION * 1e6) / 1e6);

  if (lat >= LATITUDE_MAX) {
    latVal = Math.floor(LATITUDE_MAX * 2 * FINAL_LAT_PRECISION) - 1;
  }

  const revChars: string[] = [];
  for (let i = 0; i < GRID_CODE_LENGTH; i++) {
    const latDigit = latVal % GRID_ROWS;
    const lngDigit = lngVal % GRID_COLUMNS;
    const ndx = latDigit * GRID_COLUMNS + lngDigit;
    revChars.push(CODE_ALPHABET[ndx]);
    latVal = Math.floor(latVal / GRID_ROWS);
    lngVal = Math.floor(lngVal / GRID_COLUMNS);
  }

  for (let i = 0; i < PAIR_CODE_LENGTH / 2; i++) {
    revChars.push(CODE_ALPHABET[lngVal % ENCODING_BASE]);
    revChars.push(CODE_ALPHABET[latVal % ENCODING_BASE]);
    latVal = Math.floor(latVal / ENCODING_BASE);
    lngVal = Math.floor(lngVal / ENCODING_BASE);
  }

  const full = revChars.reverse().join('');
  const withSep = full.slice(0, SEPARATOR_POSITION) + SEPARATOR + full.slice(SEPARATOR_POSITION);
  const len = Math.min(Math.max(codeLength, MIN_TRIMMABLE_CODE_LEN), PAIR_CODE_LENGTH + GRID_CODE_LENGTH);
  return withSep.slice(0, len + 1);
}

function decodeFull(code: string): { lat: number; lng: number } {
  const clean = code.replace(/[+0]/g, '');
  let normalLat = -LATITUDE_MAX * PAIR_PRECISION;
  let normalLng = -LONGITUDE_MAX * PAIR_PRECISION;
  let gridLat = 0;
  let gridLng = 0;

  const digits = Math.min(clean.length, PAIR_CODE_LENGTH);
  let pv = PAIR_FIRST_PLACE_VALUE;
  for (let i = 0; i < digits; i += 2) {
    normalLat += CODE_ALPHABET.indexOf(clean[i]) * pv;
    normalLng += CODE_ALPHABET.indexOf(clean[i + 1]) * pv;
    if (i < digits - 2) {
      pv /= ENCODING_BASE;
    }
  }

  let latPrecision = pv / PAIR_PRECISION;
  let lngPrecision = pv / PAIR_PRECISION;

  if (clean.length > PAIR_CODE_LENGTH) {
    let rowPv = GRID_LAT_FIRST_PLACE_VALUE;
    let colPv = GRID_LNG_FIRST_PLACE_VALUE;
    const gridDigits = Math.min(clean.length, PAIR_CODE_LENGTH + GRID_CODE_LENGTH);
    for (let i = PAIR_CODE_LENGTH; i < gridDigits; i++) {
      const d = CODE_ALPHABET.indexOf(clean[i]);
      const row = Math.floor(d / GRID_COLUMNS);
      const col = d % GRID_COLUMNS;
      gridLat += row * rowPv;
      gridLng += col * colPv;
      if (i < gridDigits - 1) {
        rowPv /= GRID_ROWS;
        colPv /= GRID_COLUMNS;
      }
    }
    latPrecision = rowPv / FINAL_LAT_PRECISION;
    lngPrecision = colPv / FINAL_LNG_PRECISION;
  }

  const latLo = normalLat / PAIR_PRECISION + gridLat / FINAL_LAT_PRECISION;
  const lngLo = normalLng / PAIR_PRECISION + gridLng / FINAL_LNG_PRECISION;
  return {
    lat: Math.min(LATITUDE_MAX, latLo + latPrecision / 2),
    lng: Math.min(LONGITUDE_MAX, lngLo + lngPrecision / 2),
  };
}

function recoverNearest(shortCode: string, refLat: number, refLng: number): string {
  const lat = clipLatitude(refLat);
  const lng = normalizeLongitude(refLng);
  const paddingLength = SEPARATOR_POSITION - shortCode.indexOf(SEPARATOR);
  const resolution = Math.pow(20, 2 - paddingLength / 2);
  const halfResolution = resolution / 2;

  const refCode = encodeFull(lat, lng);
  const candidate = refCode.slice(0, paddingLength) + shortCode;
  const decoded = decodeFull(candidate);

  let adjLat = decoded.lat;
  let adjLng = decoded.lng;
  if (lat + halfResolution < adjLat && adjLat - resolution >= -LATITUDE_MAX) {
    adjLat -= resolution;
  } else if (lat - halfResolution > adjLat && adjLat + resolution <= LATITUDE_MAX) {
    adjLat += resolution;
  }

  if (lng + halfResolution < adjLng) {
    adjLng -= resolution;
  } else if (lng - halfResolution > adjLng) {
    adjLng += resolution;
  }

  return encodeFull(adjLat, adjLng, candidate.length - 1);
}

const LOCALITY_ALIASES: Array<[string, string]> = [
  ['west lombok', 'Lombok Barat'],
  ['central lombok', 'Lombok Tengah'],
  ['east lombok', 'Lombok Timur'],
  ['north lombok', 'Lombok Utara'],
  ['west sumbawa', 'Sumbawa Barat'],
  ['bima city', 'Kota Bima'],
  ['mataram city', 'Mataram'],
  ['kota bima', 'Kota Bima'],
  ['kota mataram', 'Mataram'],
  ['sumbawa barat', 'Sumbawa Barat'],
  ['sumbawa besar', 'Sumbawa'],
  ['lombok barat', 'Lombok Barat'],
  ['lombok tengah', 'Lombok Tengah'],
  ['lombok timur', 'Lombok Timur'],
  ['lombok utara', 'Lombok Utara'],
  ['ampenan', 'Ampenan'],
  ['mataram', 'Mataram'],
  ['sumbawa', 'Sumbawa'],
  ['dompu', 'Dompu'],
  ['bima', 'Bima'],
];

function resolveReferencePoint(localityHint: string, area?: string): [number, number] {
  const lowerHint = localityHint.toLowerCase();
  if (lowerHint) {
    for (const [needle, canonical] of LOCALITY_ALIASES) {
      if (lowerHint.includes(needle)) {
        const center = NTB_AREA_CENTERS[canonical];
        if (center) return [center[1], center[0]]; // [lat, lng]
      }
    }
  }
  if (area) {
    const normalized = normalizeNtbAreaPolygonName(area);
    const center = NTB_AREA_CENTERS[normalized] || NTB_AREA_CENTERS[area.trim()];
    if (center) {
      return [center[1], center[0]]; // [lat, lng]
    }
  }
  return DEFAULT_NTB_REF;
}

/**
 * Decodes a full or short Google Plus Code (Open Location Code) into WGS84 coordinates.
 * Accepts formats like "6P3RC488+MW", "C488+MW", "C488+MW Mataram, NTB",
 * or "QC98+VVF, Anyar, Bayan, North Lombok Regency, West Nusa Tenggara 83354".
 * Returns null if the input is not a valid Plus Code.
 */
export function decodePlusCode(
  input: string,
  options?: { area?: string; refLat?: number | null; refLng?: number | null }
): { lat: number; lng: number } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^([^\s,;]+)[\s,;]*(.*)$/);
  if (!match) return null;
  const token = match[1].toUpperCase();
  const locality = match[2].trim();
  if (isFullCode(token)) {
    return decodeFull(token);
  }

  if (isShortCode(token)) {
    let refLat: number;
    let refLng: number;
    if (
      options?.refLat != null &&
      options?.refLng != null &&
      Number.isFinite(options.refLat) &&
      Number.isFinite(options.refLng) &&
      !locality
    ) {
      refLat = options.refLat;
      refLng = options.refLng;
    } else {
      [refLat, refLng] = resolveReferencePoint(locality, options?.area);
    }
    const recovered = recoverNearest(token, refLat, refLng);
    return decodeFull(recovered);
  }

  return null;
}
