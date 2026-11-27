export interface Room {
  width: number;
  depth: number;
  height: number;
}

export interface Wall {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface Sensor {
  id: string;
  x: number;
  y: number;
  z: number;
}

export interface RoomLayout {
  version: 1;
  room: Room;
  walls: Wall[];
  sensors: Sensor[];
}

export type LayoutIssue = {
  field: string;
  code: 'shape' | 'version' | 'positive' | 'bounds' | 'id' | 'duplicate' | 'length';
};

export function emptyLayout(): RoomLayout {
  return { version: 1, room: { width: 6, depth: 4, height: 3 }, walls: [], sensors: [] };
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function inside(value: unknown, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max;
}

export function validateLayout(value: unknown): { layout: RoomLayout } | { issue: LayoutIssue } {
  const fail = (field: string, code: LayoutIssue['code']) => ({ issue: { field, code } });
  if (!object(value)) return fail('$', 'shape');
  if (value.version !== 1) return fail('version', 'version');
  if (!object(value.room)) return fail('room', 'shape');
  const { width, depth, height } = value.room;
  const positive = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;
  if (!positive(width)) return fail('room.width', 'positive');
  if (!positive(depth)) return fail('room.depth', 'positive');
  if (!positive(height)) return fail('room.height', 'positive');
  if (!Array.isArray(value.walls)) return fail('walls', 'shape');
  if (!Array.isArray(value.sensors)) return fail('sensors', 'shape');
  const walls: Wall[] = [];
  const sensors: Sensor[] = [];
  const wallIDs = new Set<string>();
  const sensorIDs = new Set<string>();
  for (const [i, wall] of value.walls.entries()) {
    const path = `walls[${i}]`;
    if (!object(wall)) return fail(path, 'shape');
    const { id, x1, y1, x2, y2 } = wall;
    if (typeof id !== 'string' || !id.trim()) return fail(`${path}.id`, 'id');
    if (wallIDs.has(id.trim())) return fail(`${path}.id`, 'duplicate');
    if (!inside(x1, width)) return fail(`${path}.x1`, 'bounds');
    if (!inside(y1, depth)) return fail(`${path}.y1`, 'bounds');
    if (!inside(x2, width)) return fail(`${path}.x2`, 'bounds');
    if (!inside(y2, depth)) return fail(`${path}.y2`, 'bounds');
    if (x1 === x2 && y1 === y2) return fail(path, 'length');
    wallIDs.add(id.trim());
    walls.push({ id: id.trim(), x1, y1, x2, y2 });
  }
  for (const [i, sensor] of value.sensors.entries()) {
    const path = `sensors[${i}]`;
    if (!object(sensor)) return fail(path, 'shape');
    const { id, x, y, z } = sensor;
    if (typeof id !== 'string' || !id.trim()) return fail(`${path}.id`, 'id');
    if (sensorIDs.has(id.trim())) return fail(`${path}.id`, 'duplicate');
    if (!inside(x, width)) return fail(`${path}.x`, 'bounds');
    if (!inside(y, depth)) return fail(`${path}.y`, 'bounds');
    if (!inside(z, height)) return fail(`${path}.z`, 'bounds');
    sensorIDs.add(id.trim());
    sensors.push({ id: id.trim(), x, y, z });
  }
  return { layout: { version: 1, room: { width, depth, height }, walls, sensors } };
}

export function nextID(prefix: 'S' | 'W', rows: readonly { id: string }[]): string {
  const ids = new Set(rows.map((row) => row.id));
  let n = 1;
  while (ids.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}
