import type * as GeoJSON from 'geojson';
import rawNtbAreas from './ntbAreas.json';

export interface NtbAreaProperties {
  name: string;
  code: string;
  type: string;
}

export const NTB_BOUNDS: [[number, number], [number, number]] = [
  [115.75, -9.15],
  [119.38, -8.05],
];

export const NTB_AREA_CENTERS: Record<string, [number, number]> = {
  Mataram: [116.1167, -8.5833],
  'Kota Mataram': [116.1167, -8.5833],
  Ampenan: [116.0772, -8.5736],
  'Lombok Barat': [116.118, -8.695],
  'Lombok Tengah': [116.275, -8.705],
  'Lombok Timur': [116.535, -8.56],
  'Lombok Utara': [116.29, -8.35],
  'Sumbawa Barat': [116.84, -8.75],
  Sumbawa: [117.42, -8.68],
  'Sumbawa Besar': [117.42, -8.49],
  Dompu: [118.46, -8.53],
  Bima: [118.72, -8.58],
  'Kota Bima': [118.7267, -8.46],
};

export function normalizeNtbAreaPolygonName(areaName: string): string {
  const cleaned = areaName.trim();
  if (!cleaned) return '';
  const lower = cleaned.toLowerCase();
  if (lower === 'kota mataram' || lower === 'ampenan' || lower === 'mataram') {
    return 'Mataram';
  }
  if (lower === 'sumbawa besar' || lower === 'sumbawa' || lower === 'kabupaten sumbawa' || lower === 'kab. sumbawa') {
    return 'Sumbawa';
  }
  if (lower === 'kabupaten bima' || lower === 'kab. bima' || lower === 'bima') {
    return 'Bima';
  }
  if (lower === 'kota bima') {
    return 'Kota Bima';
  }
  if (lower === 'lombok barat' || lower === 'lobar') {
    return 'Lombok Barat';
  }
  if (lower === 'lombok tengah' || lower === 'loteng') {
    return 'Lombok Tengah';
  }
  if (lower === 'lombok timur' || lower === 'lotim') {
    return 'Lombok Timur';
  }
  if (lower === 'lombok utara' || lower === 'klu') {
    return 'Lombok Utara';
  }
  if (lower === 'sumbawa barat' || lower === 'ksb') {
    return 'Sumbawa Barat';
  }
  if (lower === 'dompu') {
    return 'Dompu';
  }
  return cleaned;
}

export const NTB_AREAS_GEOJSON = rawNtbAreas as GeoJSON.FeatureCollection<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  NtbAreaProperties
>;
