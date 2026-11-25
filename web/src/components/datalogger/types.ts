export interface DeviceInfo {
  model: number;
  modelName: string;
  serialNumber: string;
  firmwareVersion: number;
  protocolVersion: number;
  recordNumber: number;
  deviceCapacity: number;
  batteryLevel: number;
  deviceTime: Date;
  intervalSeconds: number;
  intervalFormatted: string;
  temperatureUnit: '°C' | '°F';
  displayTimeoutCode: number;
}

export interface RawRecord {
  time: Date;
  temperature: number;
  humidity: number | null;
  flags: string;
}

export interface CsvColumnMapping {
  timestampCol: number;
  temperatureCol: number;
  humidityCol: number | null;
  flagsCol: number | null;
  hasHeader: boolean;
}

export interface CsvParsePreview {
  delimiter: string;
  headers: string[];
  sampleRows: string[][];
  totalRows: number;
  detectedMapping: CsvColumnMapping;
}

export interface SessionStats {
  sessionId: number;
  name: string;
  deviceModel: string;
  count: number;
  tempMin: number | null;
  tempMax: number | null;
  tempAvg: number | null;
  humMin: number | null;
  humMax: number | null;
  humAvg: number | null;
  startTime: string;
  endTime: string;
  durationMs: number;
}
