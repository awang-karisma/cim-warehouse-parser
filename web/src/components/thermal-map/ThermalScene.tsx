import { captureEvent } from '~/posthog';
import { createEffect, createSignal, onCleanup, onMount, untrack } from 'solid-js';
import {
  BoxGeometry, BufferAttribute, BufferGeometry, DataTexture, FloatType, GLSL3, Group, Mesh,
  MeshBasicMaterial, NearestFilter, OrthographicCamera, PerspectiveCamera, Points, RGBAFormat,
  Scene, ShaderMaterial, SphereGeometry, Vector3, WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { heatFragmentShader, heatVertexShader } from './heat';
import type { RoomLayout } from './layout';
import type { Reading, Provenance } from './series';

export type Projection = 'floor' | 'volume';

interface Marker {
  label: HTMLElement;
  value: Text;
  id: string;
  x: number;
  y: number;
  z: number;
}

function floorGrid() {
  const size = 64;
  const stride = size + 1;
  const positions = new Float32Array(stride * stride * 3);
  const indices = new Uint16Array(size * size * 6);
  let face = 0;
  for (let z = 0; z <= size; z++) {
    for (let x = 0; x <= size; x++) {
      const i = z * stride + x;
      positions[3 * i] = x / size;
      positions[3 * i + 2] = z / size;
      if (x === size || z === size) continue;
      indices[face++] = i;
      indices[face++] = i + stride;
      indices[face++] = i + 1;
      indices[face++] = i + 1;
      indices[face++] = i + stride;
      indices[face++] = i + stride + 1;
    }
  }
  return new BufferGeometry().setAttribute('position', new BufferAttribute(positions, 3)).setIndex(new BufferAttribute(indices, 1));
}

function volumeGrid() {
  const positions = new Float32Array(33 * 33 * 9 * 3);
  let i = 0;
  for (let y = 0; y <= 8; y++) {
    for (let z = 0; z <= 32; z++) {
      for (let x = 0; x <= 32; x++) {
        positions[i++] = x / 32;
        positions[i++] = y / 8;
        positions[i++] = z / 32;
      }
    }
  }
  return new BufferGeometry().setAttribute('position', new BufferAttribute(positions, 3));
}

export function ThermalScene(props: {
  layout: RoomLayout;
  projection: Projection;
  readings: ReadonlyMap<string, Reading>;
  min: number | undefined;
  max: number | undefined;
  format: (value: number) => string;
  provenance: (kind: Provenance) => string;
  requestFrame: () => void;
  bindDraw: (draw: () => void) => () => void;
  onReady: () => void;
  onUnavailable: () => void;
}) {
  let host!: HTMLDivElement;
  onMount(() => {
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
    } catch {
      props.onUnavailable();
      return;
    }
    const scene = new Scene();
    const floorCamera = new OrthographicCamera();
    floorCamera.up.set(0, 0, -1);
    const volumeCamera = new PerspectiveCamera(42);
    const labels = new CSS2DRenderer();
    renderer.domElement.className = 'absolute inset-0 size-full';
    labels.domElement.className = 'pointer-events-none absolute inset-0 select-none';
    labels.domElement.setAttribute('aria-hidden', 'true');
    host.append(renderer.domElement, labels.domElement);

    const controls = new OrbitControls(volumeCamera, renderer.domElement);
    controls.enableDamping = false;
    controls.enablePan = false;
    controls.maxPolarAngle = Math.PI / 2;
    let projection: Projection = 'floor';
    let lost = false;
    let dirty = false;
    let sizeX = 0, sizeY = 0;
    let width = 1, depth = 1, height = 1;
    let capacity = -1;
    let pack = new Float32Array(4);
    let markerMeta: Marker[] = [];
    const walls = new Group();
    const markers = new Group();
    const box = new BoxGeometry(1, 1, 1);
    const markerShape = new SphereGeometry(1, 12, 8);
    const baseMaterial = new MeshBasicMaterial({ color: 0x9ca6ad });
    const wallMaterial = new MeshBasicMaterial({ color: 0x647582, transparent: true, opacity: 0.27, depthWrite: false });
    const markerMaterial = new MeshBasicMaterial({ color: 0xf4f5f5 });
    const base = new Mesh(box, baseMaterial);
    const direction = new Vector3();
    const oblique = new Vector3(3, 2.25, 3).normalize();
    const center = new Vector3();
    const [geometryRevision, geometryChanged] = createSignal(0);
    const uniforms = {
      uSensors: { value: null as DataTexture | null },
      uTextureWidth: { value: 1 },
      uCount: { value: 0 },
      uMin: { value: 0 },
      uMax: { value: 0 },
      uPointSize: { value: 8 },
    };
    const floorMaterial = new ShaderMaterial({ uniforms, glslVersion: GLSL3, vertexShader: heatVertexShader, fragmentShader: heatFragmentShader(false), toneMapped: false });
    const volumeMaterial = new ShaderMaterial({ uniforms, glslVersion: GLSL3, vertexShader: heatVertexShader, fragmentShader: heatFragmentShader(true), transparent: true, depthWrite: false, toneMapped: false });
    const floor = new Mesh(floorGrid(), floorMaterial);
    const volume = new Points(volumeGrid(), volumeMaterial);
    floor.visible = volume.visible = false;
    volume.renderOrder = 1;
    scene.add(base, walls, markers, floor, volume);

    function invalidate() {
      if (lost) return;
      dirty = true;
      props.requestFrame();
    }

    const unbind = props.bindDraw(() => {
      if (!dirty || lost || !sizeX || !sizeY) return;
      dirty = false;
      const camera = projection === 'floor' ? floorCamera : volumeCamera;
      renderer.render(scene, camera);
      labels.render(scene, camera);
    });

    function fit(resetOrbit: boolean) {
      if (!sizeX || !sizeY) return;
      const aspect = sizeX / sizeY;
      const extent = Math.max(width, depth, height);
      const halfWidth = Math.max(width, depth * aspect) * 0.60;
      floorCamera.left = -halfWidth;
      floorCamera.right = halfWidth;
      floorCamera.top = halfWidth / aspect;
      floorCamera.bottom = -halfWidth / aspect;
      floorCamera.near = extent * 0.001;
      floorCamera.far = height + extent * 3;
      floorCamera.position.set(width / 2, height + extent, depth / 2);
      floorCamera.lookAt(width / 2, 0, depth / 2);
      floorCamera.updateProjectionMatrix();

      if (resetOrbit || volumeCamera.position.distanceToSquared(controls.target) === 0) direction.copy(oblique);
      else direction.copy(volumeCamera.position).sub(controls.target).normalize();
      const radius = Math.hypot(width, height, depth) / 2;
      const vfov = volumeCamera.fov * Math.PI / 360;
      const hfov = Math.atan(Math.tan(vfov) * aspect);
      const distance = (radius / Math.sin(Math.min(vfov, hfov))) * 1.13;
      center.set(width / 2, height / 2, depth / 2);
      volumeCamera.position.copy(center).addScaledVector(direction, distance);
      volumeCamera.aspect = aspect;
      volumeCamera.near = radius * 0.005;
      volumeCamera.far = distance + radius * 16;
      volumeCamera.updateProjectionMatrix();
      controls.minDistance = radius * 0.18;
      controls.maxDistance = distance * 4;
      controls.target.copy(center);
      controls.update();
    }

    function resize() {
      if (lost) return;
      sizeX = host.clientWidth;
      sizeY = host.clientHeight;
      if (!sizeX || !sizeY) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      renderer.setPixelRatio(ratio);
      renderer.setSize(sizeX, sizeY, false);
      labels.setSize(sizeX, sizeY);
      uniforms.uPointSize.value = Math.max(5, Math.min(12, sizeX / 70)) * ratio;
      fit(false);
      invalidate();
    }

    function clearMarkers() {
      for (const marker of markerMeta) marker.label.remove();
      markerMeta = [];
      markers.clear();
    }

    function reserve(count: number) {
      if (capacity === count) return true;
      const limit = renderer.capabilities.maxTextureSize;
      const columns = Math.max(1, Math.min(count, limit));
      const rows = Math.max(1, Math.ceil(count / columns));
      if (rows > limit) {
        lost = true;
        props.onUnavailable();
        return false;
      }
      uniforms.uSensors.value?.dispose();
      pack = new Float32Array(columns * rows * 4);
      const texture = new DataTexture(pack, columns, rows, RGBAFormat, FloatType);
      texture.minFilter = texture.magFilter = NearestFilter;
      texture.needsUpdate = true;
      uniforms.uSensors.value = texture;
      uniforms.uTextureWidth.value = columns;
      capacity = count;
      return true;
    }

    const contextLost = (event: Event) => {
      event.preventDefault();
      lost = true;
      captureEvent('webgl_context_lost', { surface: 'thermal_map' });
      props.onUnavailable();
    };
    renderer.domElement.addEventListener('webglcontextlost', contextLost);
    controls.addEventListener('change', invalidate);
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    onCleanup(() => {
      unbind();
      observer.disconnect();
      controls.removeEventListener('change', invalidate);
      controls.dispose();
      renderer.domElement.removeEventListener('webglcontextlost', contextLost);
      clearMarkers();
      labels.domElement.remove();
      renderer.domElement.remove();
      uniforms.uSensors.value?.dispose();
      floor.geometry.dispose();
      volume.geometry.dispose();
      box.dispose();
      markerShape.dispose();
      floorMaterial.dispose();
      volumeMaterial.dispose();
      baseMaterial.dispose();
      wallMaterial.dispose();
      markerMaterial.dispose();
      renderer.dispose();
      if (!lost) renderer.forceContextLoss();
    });

    createEffect(() => {
      const layout = props.layout;
      width = layout.room.width;
      depth = layout.room.depth;
      height = layout.room.height;
      if (lost || !reserve(layout.sensors.length)) return;
      floor.scale.set(width, 1, depth);
      volume.scale.set(width, height, depth);
      const thickness = Math.min(0.08, Math.min(width, depth) * 0.013);
      base.scale.set(width, thickness, depth);
      base.position.set(width / 2, -thickness, depth / 2);
      walls.clear();
      const addWall = (x1: number, y1: number, x2: number, y2: number) => {
        const wall = new Mesh(box, wallMaterial);
        wall.position.set(x1 / 2 + x2 / 2, height / 2, y1 / 2 + y2 / 2);
        wall.rotation.y = -Math.atan2(y2 - y1, x2 - x1);
        wall.scale.set(Math.hypot(x2 - x1, y2 - y1), height, thickness);
        walls.add(wall);
      };
      addWall(0, 0, width, 0);
      addWall(width, 0, width, depth);
      addWall(width, depth, 0, depth);
      addWall(0, depth, 0, 0);
      for (const wall of layout.walls) addWall(wall.x1, wall.y1, wall.x2, wall.y2);
      clearMarkers();
      const radius = Math.min(width, depth) * 0.015;
      for (const sensor of layout.sensors) {
        // Plan x/y is world x/z; physical height is world y.
        const { id, x, z: y, y: z } = sensor;
        const marker = new Mesh(markerShape, markerMaterial);
        marker.position.set(x, y, z);
        marker.scale.setScalar(radius);
        const label = document.createElement('div');
        label.className = 'flex max-w-36 items-center gap-1 rounded border bg-background px-1.5 py-0.5 text-xs text-foreground shadow-sm';
        const identifier = document.createElement('span');
        identifier.className = 'min-w-0 truncate font-medium';
        identifier.append(document.createTextNode(id));
        const readout = document.createElement('span');
        readout.className = 'shrink-0 font-mono tabular-nums';
        const value = document.createTextNode('—');
        readout.append(value);
        label.append(identifier, readout);
        const badge = new CSS2DObject(label);
        badge.center.set(0.5, 1.35);
        badge.position.y = 1.4;
        marker.add(badge);
        markers.add(marker);
        markerMeta.push({ label, value, id, x, y, z });
      }
      fit(true);
      geometryChanged((revision) => revision + 1);
      invalidate();
    });

    createEffect(() => {
      projection = props.projection;
      controls.enabled = projection === 'volume';
      renderer.domElement.style.touchAction = controls.enabled ? 'none' : 'pan-y';
      floor.visible = projection === 'floor' && uniforms.uCount.value > 0;
      volume.visible = projection === 'volume' && uniforms.uCount.value > 0;
      invalidate();
    });

    createEffect(() => {
      geometryRevision();
      const readings = props.readings;
      const min = props.min ?? 0;
      const max = props.max ?? 0;
      if (lost) return;
      let offset = 0;
      for (const item of markerMeta) {
        const reading = readings.get(item.id);
        const available = reading && reading.status !== 'unavailable' && Number.isFinite(reading.value);
        const value = available ? props.format(reading.value) : '—';
        const status = props.provenance(available ? reading.status : 'unavailable');
        if (item.value.data !== value) item.value.data = value;
        if (item.label.title !== status) item.label.title = status;
        if (!available) continue;
        pack[offset++] = item.x;
        pack[offset++] = item.y;
        pack[offset++] = item.z;
        pack[offset++] = reading.value;
      }
      const count = offset / 4;
      uniforms.uCount.value = count;
      uniforms.uMin.value = min;
      uniforms.uMax.value = max;
      if (uniforms.uSensors.value && count > 0) uniforms.uSensors.value.needsUpdate = true;
      floor.visible = projection === 'floor' && count > 0;
      volume.visible = projection === 'volume' && count > 0;
      invalidate();
    });
    resize();
    untrack(props.onReady);
  });
  return <div ref={host} class="absolute inset-0" aria-hidden="true" />;
}
