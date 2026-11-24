import type { CsvColumnMapping, CsvParsePreview, RawRecord } from './types';

function detectDelimiter(firstLine: string): string {
  const commas = (firstLine.match(/,/g) || []).length;
  const semis = (firstLine.match(/;/g) || []).length;
  const tabs = (firstLine.match(/\t/g) || []).length;
  if (tabs > commas && tabs > semis) return '\t';
  if (semis > commas) return ';';
  return ',';
}

function splitCsvLines(text: string): string[] {
  return text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function parseCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

function parseNumber(raw: string): number | null {
  const cleaned = raw.trim().replace(/°[CF]$/i, '').replace(/%RH$|%$/i, '').trim();
  if (!cleaned || cleaned === '-' || cleaned === '—' || cleaned.toLowerCase() === 'null') {
    return null;
  }
  // Support comma decimal separator when no dot is present
  const normalized = cleaned.includes(',') && !cleaned.includes('.') ? cleaned.replace(',', '.') : cleaned;
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

export function parseTimestamp(raw: string): Date | null {
  const s = raw.trim();
  if (!s) return null;

  // ISO 8601 or standard YYYY-MM-DD HH:mm:ss
  const isoLike = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/i;
  if (isoLike.test(s)) {
    const d = new Date(s.includes('T') || s.endsWith('Z') ? s : s.replace(' ', 'T'));
    if (!Number.isNaN(d.getTime())) return d;
  }

  // DD/MM/YYYY HH:mm:ss or YYYY/MM/DD HH:mm:ss
  const slashMatch = s.match(
    /^(\d{1,4})[/.-](\d{1,2})[/.-](\d{1,4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (slashMatch) {
    const a = Number(slashMatch[1]);
    const b = Number(slashMatch[2]);
    const c = Number(slashMatch[3]);
    const hh = Number(slashMatch[4] ?? 0);
    const mm = Number(slashMatch[5] ?? 0);
    const ss = Number(slashMatch[6] ?? 0);

    let year: number;
    let month: number;
    let day: number;
    if (a > 1000) {
      year = a;
      month = b;
      day = c;
    } else if (c > 1000) {
      year = c;
      // Default DD/MM/YYYY unless middle > 12
      if (b > 12) {
        month = a;
        day = b;
      } else {
        day = a;
        month = b;
      }
    } else {
      year = 2000 + a;
      month = b;
      day = c;
    }
    const d = new Date(year, month - 1, day, hh, mm, ss);
    if (!Number.isNaN(d.getTime())) return d;
  }

  const fallback = new Date(s);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function detectMappingFromHeaders(headers: string[], firstDataRow: string[]): CsvColumnMapping {
  const lower = headers.map((h) => h.toLowerCase());

  // Heuristic: does row 0 look like a header row?
  const hasHeader = headers.some((h) => /[a-zA-Z#°]/.test(h) && parseTimestamp(h) === null && parseNumber(h) === null);

  let timestampCol = lower.findIndex((h) => /date|time|timestamp|waktu|tanggal/.test(h));
  let temperatureCol = lower.findIndex((h) => /temp|suhu|°c|°f/.test(h));
  let humidityCol: number | null = lower.findIndex((h) => /hum|rh|kelemb/.test(h));
  let flagsCol: number | null = lower.findIndex((h) => /flag|mark|alarm|status/.test(h));

  if (humidityCol === -1) humidityCol = null;
  if (flagsCol === -1) flagsCol = null;

  // Fallback by inspecting first data row if header names weren't matched
  const probe = hasHeader ? firstDataRow : headers;
  if (timestampCol === -1) {
    timestampCol = probe.findIndex((cell) => parseTimestamp(cell) !== null);
    if (timestampCol === -1) timestampCol = Math.min(1, Math.max(0, probe.length - 1));
  }
  if (temperatureCol === -1) {
    temperatureCol = probe.findIndex((cell, idx) => idx !== timestampCol && parseNumber(cell) !== null);
    if (temperatureCol === -1) temperatureCol = Math.min(2, Math.max(0, probe.length - 1));
  }

  return {
    timestampCol,
    temperatureCol,
    humidityCol,
    flagsCol,
    hasHeader,
  };
}

export function inspectCsv(text: string): CsvParsePreview {
  const lines = splitCsvLines(text);
  if (lines.length === 0) {
    return {
      delimiter: ',',
      headers: [],
      sampleRows: [],
      totalRows: 0,
      detectedMapping: {
        timestampCol: 0,
        temperatureCol: 1,
        humidityCol: null,
        flagsCol: null,
        hasHeader: true,
      },
    };
  }

  const delimiter = detectDelimiter(lines[0]);
  const parsedFirst = parseCsvLine(lines[0], delimiter);
  const parsedSecond = lines.length > 1 ? parseCsvLine(lines[1], delimiter) : [];
  const detectedMapping = detectMappingFromHeaders(parsedFirst, parsedSecond);

  const headers = detectedMapping.hasHeader
    ? parsedFirst
    : parsedFirst.map((_, idx) => `Column ${idx + 1}`);

  const startIdx = detectedMapping.hasHeader ? 1 : 0;
  const sampleRows: string[][] = [];
  for (let i = startIdx; i < Math.min(lines.length, startIdx + 10); i++) {
    sampleRows.push(parseCsvLine(lines[i], delimiter));
  }

  return {
    delimiter,
    headers,
    sampleRows,
    totalRows: Math.max(0, lines.length - startIdx),
    detectedMapping,
  };
}

export function parseCsvWithMapping(
  text: string,
  mapping: CsvColumnMapping,
): { records: RawRecord[]; skippedRows: number } {
  const lines = splitCsvLines(text);
  if (lines.length === 0) {
    return { records: [], skippedRows: 0 };
  }

  const delimiter = detectDelimiter(lines[0]);
  const startIdx = mapping.hasHeader ? 1 : 0;
  const records: RawRecord[] = [];
  let skippedRows = 0;

  for (let i = startIdx; i < lines.length; i++) {
    const row = parseCsvLine(lines[i], delimiter);
    const tsRaw = row[mapping.timestampCol] ?? '';
    const tempRaw = row[mapping.temperatureCol] ?? '';

    const time = parseTimestamp(tsRaw);
    const temperature = parseNumber(tempRaw);
    if (!time || temperature === null) {
      skippedRows++;
      continue;
    }

    const humidity =
      mapping.humidityCol !== null && mapping.humidityCol >= 0
        ? parseNumber(row[mapping.humidityCol] ?? '')
        : null;

    const flagsRaw =
      mapping.flagsCol !== null && mapping.flagsCol >= 0 ? (row[mapping.flagsCol] ?? '').trim() : '';

    records.push({
      time,
      temperature,
      humidity,
      flags: flagsRaw || '—',
    });
  }

  records.sort((a, b) => a.time.getTime() - b.time.getTime());
  return { records, skippedRows };
}

export function parseElitechCsv(text: string): {
  records: RawRecord[];
  skippedRows: number;
  preview: CsvParsePreview;
} {
  const preview = inspectCsv(text);
  const { records, skippedRows } = parseCsvWithMapping(text, preview.detectedMapping);
  return { records, skippedRows, preview };
}
