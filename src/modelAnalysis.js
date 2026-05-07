import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export const MATERIALS = {
  pla: {
    label: "PLA",
    density: 1240,
    modulusGPa: 3.2,
    strengthMPa: 46,
    note: "단단하지만 충격과 열에 약함",
  },
  petg: {
    label: "PETG",
    density: 1270,
    modulusGPa: 2.1,
    strengthMPa: 38,
    note: "충격에 강하고 출력 안정적",
  },
  abs: {
    label: "ABS",
    density: 1040,
    modulusGPa: 2.0,
    strengthMPa: 34,
    note: "열에 강하지만 수축 관리 필요",
  },
  nylon: {
    label: "Nylon",
    density: 1130,
    modulusGPa: 1.6,
    strengthMPa: 50,
    note: "질기고 피로에 강함",
  },
  aluminum: {
    label: "Aluminum 6061",
    density: 2700,
    modulusGPa: 69,
    strengthMPa: 240,
    note: "가공/금속 출력 기준 비교용",
  },
};

export const UNIT_SCALES = {
  mm: { label: "mm", toMeters: 0.001 },
  cm: { label: "cm", toMeters: 0.01 },
  m: { label: "m", toMeters: 1 },
};

export const SUPPORT_FACES = {
  minY: { label: "아래면 고정", axis: "y", side: "min" },
  maxY: { label: "윗면 고정", axis: "y", side: "max" },
  minX: { label: "왼쪽면 고정", axis: "x", side: "min" },
  maxX: { label: "오른쪽면 고정", axis: "x", side: "max" },
  minZ: { label: "앞면 고정", axis: "z", side: "min" },
  maxZ: { label: "뒷면 고정", axis: "z", side: "max" },
};

export const LOAD_DIRECTIONS = {
  negY: { label: "아래로", vector: new THREE.Vector3(0, -1, 0) },
  posY: { label: "위로", vector: new THREE.Vector3(0, 1, 0) },
  negX: { label: "왼쪽으로", vector: new THREE.Vector3(-1, 0, 0) },
  posX: { label: "오른쪽으로", vector: new THREE.Vector3(1, 0, 0) },
  negZ: { label: "앞으로", vector: new THREE.Vector3(0, 0, -1) },
  posZ: { label: "뒤로", vector: new THREE.Vector3(0, 0, 1) },
};

const AXIS_INDEX = { x: 0, y: 1, z: 2 };
const AXES = ["x", "y", "z"];

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function formatNumber(value, maximumFractionDigits = 1) {
  return new Intl.NumberFormat("ko-KR", {
    maximumFractionDigits,
  }).format(value);
}

export function formatPercent(value) {
  return `${Math.round(value * 100)}%`;
}

export function utilizationLabel(value) {
  if (value >= 1) return "위험";
  if (value >= 0.7) return "주의";
  return "안정";
}

export function utilizationTone(value) {
  if (value >= 1) return "danger";
  if (value >= 0.7) return "warn";
  return "safe";
}

export function heatColor(utilization) {
  const green = new THREE.Color("#159a62");
  const yellow = new THREE.Color("#e0a51f");
  const red = new THREE.Color("#d64b3f");
  const magenta = new THREE.Color("#8b1f44");
  if (utilization <= 0.68) {
    return green.lerp(yellow, clamp(utilization / 0.68, 0, 1));
  }
  if (utilization <= 1.08) {
    return yellow.lerp(red, clamp((utilization - 0.68) / 0.4, 0, 1));
  }
  return red.lerp(magenta, clamp((utilization - 1.08) / 0.6, 0, 1));
}

export function createDemoGeometry() {
  const parts = [];

  const wall = new THREE.BoxGeometry(0.32, 2.08, 1.36, 2, 14, 8);
  wall.translate(-1.42, 0, 0);
  parts.push(wall.toNonIndexed());

  const arm = new THREE.BoxGeometry(2.86, 0.36, 0.56, 20, 3, 4);
  arm.translate(-0.08, 0.48, 0);
  parts.push(arm.toNonIndexed());

  const loadPad = new THREE.BoxGeometry(0.78, 0.5, 0.82, 5, 4, 5);
  loadPad.translate(1.18, 0.48, 0);
  parts.push(loadPad.toNonIndexed());

  const frontRib = createTriangularPrismGeometry(
    [
      [-1.28, -0.74],
      [-1.28, 0.3],
      [0.76, 0.3],
    ],
    0.34,
    0.62,
  );
  parts.push(frontRib.toNonIndexed());

  const backRib = createTriangularPrismGeometry(
    [
      [-1.28, -0.74],
      [-1.28, 0.3],
      [0.76, 0.3],
    ],
    -0.62,
    -0.34,
  );
  parts.push(backRib.toNonIndexed());

  [
    [-1.58, 0.58, 0.44],
    [-1.58, 0.58, -0.44],
    [-1.58, -0.58, 0.44],
    [-1.58, -0.58, -0.44],
  ].forEach(([x, y, z]) => {
    const boss = new THREE.CylinderGeometry(0.15, 0.15, 0.12, 28, 1);
    boss.rotateZ(Math.PI / 2);
    boss.translate(x, y, z);
    parts.push(boss.toNonIndexed());
  });

  const geometry = mergeGeometries(parts.map(cleanMergeGeometry), false);
  geometry.scale(40, 40, 40);
  return prepareGeometry(geometry);
}

function cleanMergeGeometry(geometry) {
  const cleanGeometry = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  cleanGeometry.deleteAttribute("uv");
  cleanGeometry.deleteAttribute("uv1");
  return cleanGeometry;
}

function createTriangularPrismGeometry(points, zMin, zMax) {
  const [[x1, y1], [x2, y2], [x3, y3]] = points;
  const vertices = new Float32Array([
    x1, y1, zMin,
    x2, y2, zMin,
    x3, y3, zMin,
    x1, y1, zMax,
    x2, y2, zMax,
    x3, y3, zMax,
  ]);
  const indices = [
    0, 2, 1,
    3, 4, 5,
    0, 1, 4,
    0, 4, 3,
    1, 2, 5,
    1, 5, 4,
    2, 0, 3,
    2, 3, 5,
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function prepareGeometry(inputGeometry) {
  const geometry = inputGeometry.index ? inputGeometry.toNonIndexed() : inputGeometry.clone();
  geometry.deleteAttribute("uv");
  geometry.deleteAttribute("uv1");
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function geometryFromObject(object3D) {
  const geometries = [];
  object3D.updateMatrixWorld(true);
  object3D.traverse((child) => {
    if (!child.isMesh || !child.geometry) return;
    const geometry = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();
    geometry.applyMatrix4(child.matrixWorld);
    geometries.push(geometry);
  });

  if (geometries.length === 0) {
    throw new Error("파일 안에서 읽을 수 있는 메시를 찾지 못했습니다.");
  }

  const merged = geometries.length === 1 ? geometries[0] : mergeGeometries(geometries, false);
  return prepareGeometry(merged);
}

export function analyzeGeometry(sourceGeometry, settings) {
  const geometry = prepareGeometry(sourceGeometry);
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const bbox = new THREE.Box3().setFromBufferAttribute(position);
  const rawSize = bbox.getSize(new THREE.Vector3());
  const maxRawSize = Math.max(rawSize.x, rawSize.y, rawSize.z, 1e-6);
  const unitScale = UNIT_SCALES[settings.units].toMeters;
  const sizeMeters = rawSize.clone().multiplyScalar(unitScale);
  const material = MATERIALS[settings.material];
  const support = SUPPORT_FACES[settings.supportFace];
  const loadDirection = LOAD_DIRECTIONS[settings.loadDirection].vector.clone().normalize();
  const axisIndex = AXIS_INDEX[support.axis];
  const axisLengthRaw = Math.max(rawSize.getComponent(axisIndex), 1e-6);
  const axisLengthMeters = Math.max(axisLengthRaw * unitScale, 0.001);
  const forceN = settings.loadKg * 9.80665;
  const triangleCount = position.count / 3;
  const meshQuality = estimateMeshQuality(position, unitScale, bbox);
  const volumeMeters3 = estimateVolumeMeters3(position, unitScale);
  const fallbackVolume = Math.max(sizeMeters.x * sizeMeters.y * sizeMeters.z * 0.16, 1e-9);
  const modelVolume = Math.max(volumeMeters3, fallbackVolume);
  const infillFactor = 0.18 + settings.infill / 100 * 0.82;
  const shellFactor = clamp(settings.shells / 3, 0.34, 1.15);
  const effectiveArea = Math.max((modelVolume / axisLengthMeters) * infillFactor * shellFactor, 1e-8);
  const baseStressMPa = forceN / effectiveArea / 1e6;
  const crossDims = AXES.filter((axis) => axis !== support.axis).map((axis) => Math.max(sizeMeters[axis], 0.001));
  const sectionInertia = Math.max(effectiveArea * Math.min(...crossDims) ** 2 / 12, 1e-12);
  const deflectionMm =
    (forceN * axisLengthMeters ** 3) /
    Math.max(3 * material.modulusGPa * 1e9 * sectionInertia, 1) *
    1000 *
    clamp(0.72 + (100 - settings.infill) / 120, 0.72, 1.55);
  const massGrams = modelVolume * material.density * infillFactor * 1000;
  const binAreas = buildSectionBins(position, support, bbox, unitScale);
  const medianBinArea = median(binAreas.filter((area) => area > 0));
  const colors = new Float32Array(position.count * 3);
  const vertexStats = [];
  let maxUtilization = 0;
  let maxStressMPa = 0;
  let stressSum = 0;
  let highVertexCount = 0;
  const loadPoint = getLoadPoint(bbox, settings, loadDirection);
  const loadAxis = dominantAxis(loadDirection);
  const loadRadius = Math.max(maxRawSize * (0.12 + settings.loadSpread / 100 * 0.32), 1e-6);
  const allowableMPa = material.strengthMPa / Math.max(settings.targetSafety, 1);
  const layerVector = layerDirection(settings.layerAxis);
  const layerPenalty = 1 + Math.abs(layerVector.dot(loadDirection)) * 0.18;

  for (let index = 0; index < position.count; index += 1) {
    const point = readPoint(position, index);
    const normalized = normalizePoint(point, bbox);
    const normalVector = readPoint(normal, index).normalize();
    const supportDistance = distanceFromSupport(normalized, support);
    const nearSupport = Math.exp(-supportDistance * 8.5);
    const loadDistance = perpendicularDistance(point, loadPoint, loadAxis);
    const nearLoad = Math.exp(-((loadDistance / loadRadius) ** 2));
    const loadPlaneDistance = distanceToLoadPlane(point, bbox, loadDirection);
    const loadContact = nearLoad * Math.exp(-loadPlaneDistance * 5.5);
    const edgeFactor = 1 + countBoxEdges(normalized) * 0.12;
    const sectionFactor = sectionStressFactor(point, bbox, support, binAreas, medianBinArea);
    const momentFactor = 0.58 + supportDistance ** 1.35 * 1.38;
    const normalFacing = Math.abs(normalVector.dot(loadDirection));
    const shearFactor = 0.78 + (1 - normalFacing) * 0.48 + normalFacing * 0.18;
    const contactFactor = 1 + nearSupport * 0.55 + loadContact * 0.82;
    const printPenalty = layerPenalty * clamp(1.2 - settings.infill / 180, 0.78, 1.05);
    const stressMPa =
      baseStressMPa *
      sectionFactor *
      momentFactor *
      contactFactor *
      edgeFactor *
      shearFactor *
      printPenalty;
    const utilization = stressMPa / Math.max(allowableMPa, 0.001);
    const color = heatColor(utilization);
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
    maxUtilization = Math.max(maxUtilization, utilization);
    maxStressMPa = Math.max(maxStressMPa, stressMPa);
    stressSum += stressMPa;
    if (utilization >= 0.7) highVertexCount += 1;
    vertexStats.push({
      point,
      utilization,
      stressMPa,
      supportDistance,
      loadContact,
      sectionFactor,
      nearSupport,
    });
  }

  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const hotspots = buildHotspots(vertexStats, maxRawSize);
  const warningRatio = highVertexCount / Math.max(position.count, 1);

  return {
    geometry,
    bbox,
    size: rawSize,
    sizeMeters,
    forceN,
    massGrams,
    modelVolume,
    baseStressMPa,
    maxStressMPa,
    avgStressMPa: stressSum / Math.max(position.count, 1),
    allowableMPa,
    maxUtilization,
    safetyFactor: 1 / Math.max(maxUtilization, 0.01),
    warningRatio,
    deflectionMm,
    triangleCount,
    vertexCount: position.count,
    meshQuality,
    hotspots,
    loadPoint,
    loadDirection,
    support,
    material,
  };
}

function readPoint(attribute, index) {
  return new THREE.Vector3(attribute.getX(index), attribute.getY(index), attribute.getZ(index));
}

function normalizePoint(point, bbox) {
  const size = bbox.getSize(new THREE.Vector3());
  return new THREE.Vector3(
    safeNormalize(point.x, bbox.min.x, size.x),
    safeNormalize(point.y, bbox.min.y, size.y),
    safeNormalize(point.z, bbox.min.z, size.z),
  );
}

function safeNormalize(value, min, size) {
  return size <= 1e-9 ? 0.5 : clamp((value - min) / size, 0, 1);
}

function distanceFromSupport(normalized, support) {
  const value = normalized[support.axis];
  return support.side === "min" ? value : 1 - value;
}

function sectionStressFactor(point, bbox, support, binAreas, medianBinArea) {
  const coord = point[support.axis];
  const min = bbox.min[support.axis];
  const size = Math.max(bbox.max[support.axis] - min, 1e-6);
  const bin = clamp(Math.floor(((coord - min) / size) * binAreas.length), 0, binAreas.length - 1);
  const area = binAreas[bin] || medianBinArea * 0.3;
  return clamp(medianBinArea / Math.max(area, medianBinArea * 0.18), 0.72, 2.35);
}

function buildSectionBins(position, support, bbox, unitScale) {
  const bins = new Array(42).fill(0);
  const min = bbox.min[support.axis];
  const size = Math.max(bbox.max[support.axis] - min, 1e-6);
  for (let i = 0; i < position.count; i += 3) {
    const a = readPoint(position, i);
    const b = readPoint(position, i + 1);
    const c = readPoint(position, i + 2);
    const center = (a[support.axis] + b[support.axis] + c[support.axis]) / 3;
    const bin = clamp(Math.floor(((center - min) / size) * bins.length), 0, bins.length - 1);
    const area = triangleArea(a, b, c) * unitScale * unitScale;
    bins[bin] += area;
  }
  return bins;
}

function estimateVolumeMeters3(position, unitScale) {
  let volume = 0;
  for (let i = 0; i < position.count; i += 3) {
    const a = readPoint(position, i).multiplyScalar(unitScale);
    const b = readPoint(position, i + 1).multiplyScalar(unitScale);
    const c = readPoint(position, i + 2).multiplyScalar(unitScale);
    volume += a.dot(b.cross(c)) / 6;
  }
  return Math.abs(volume);
}

function estimateMeshQuality(position, unitScale, bbox) {
  const triangleCount = position.count / 3;
  const size = bbox.getSize(new THREE.Vector3());
  const quantizeStep = Math.max(size.x, size.y, size.z, 1) * 1e-5;
  const edges = new Map();
  let degenerateTriangles = 0;
  let surfaceAreaMeters2 = 0;

  for (let i = 0; i < position.count; i += 3) {
    const a = readPoint(position, i);
    const b = readPoint(position, i + 1);
    const c = readPoint(position, i + 2);
    const areaRaw = triangleArea(a, b, c);
    surfaceAreaMeters2 += areaRaw * unitScale * unitScale;
    if (areaRaw <= quantizeStep * quantizeStep * 0.02) degenerateTriangles += 1;

    const keys = [vertexKey(a, quantizeStep), vertexKey(b, quantizeStep), vertexKey(c, quantizeStep)];
    addEdge(edges, keys[0], keys[1]);
    addEdge(edges, keys[1], keys[2]);
    addEdge(edges, keys[2], keys[0]);
  }

  let openEdges = 0;
  let manifoldEdges = 0;
  let nonManifoldEdges = 0;
  for (const count of edges.values()) {
    if (count === 1) openEdges += 1;
    else if (count === 2) manifoldEdges += 1;
    else nonManifoldEdges += 1;
  }

  const edgeCount = Math.max(edges.size, 1);
  const problemEdgeRatio = (openEdges + nonManifoldEdges) / edgeCount;
  const degenerateRatio = degenerateTriangles / Math.max(triangleCount, 1);
  const watertightRatio = manifoldEdges / edgeCount;
  const score = clamp(1 - problemEdgeRatio * 1.6 - degenerateRatio * 3.2, 0, 1);

  const label = meshQualityLabel(score, openEdges, nonManifoldEdges);

  return {
    score,
    label,
    surfaceAreaMeters2,
    watertightRatio,
    openEdges,
    nonManifoldEdges,
    degenerateTriangles,
    degenerateRatio,
    edgeCount: edges.size,
    warning:
      label === "체적 메시 적합"
        ? "체적 메시 생성에 적합한 표면 메시로 보입니다."
        : "열린 경계나 비정상 edge가 있어 FEA 전 메시 수리가 필요할 수 있습니다.",
  };
}

function vertexKey(point, step) {
  return [
    Math.round(point.x / step),
    Math.round(point.y / step),
    Math.round(point.z / step),
  ].join(",");
}

function addEdge(edges, a, b) {
  const key = a < b ? `${a}|${b}` : `${b}|${a}`;
  edges.set(key, (edges.get(key) || 0) + 1);
}

function meshQualityLabel(score, openEdges, nonManifoldEdges) {
  if (score >= 0.9 && openEdges === 0 && nonManifoldEdges === 0) return "체적 메시 적합";
  if (score >= 0.72) return "주의";
  return "수리 필요";
}

function triangleArea(a, b, c) {
  return new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).length() / 2;
}

function median(values) {
  if (values.length === 0) return 1e-6;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] || 1e-6;
}

function countBoxEdges(normalized) {
  let count = 0;
  if (normalized.x < 0.08 || normalized.x > 0.92) count += 1;
  if (normalized.y < 0.08 || normalized.y > 0.92) count += 1;
  if (normalized.z < 0.08 || normalized.z > 0.92) count += 1;
  return count;
}

function getLoadPoint(bbox, settings, loadDirection) {
  const size = bbox.getSize(new THREE.Vector3());
  const point = new THREE.Vector3(
    bbox.min.x + size.x * settings.loadU,
    bbox.min.y + size.y * settings.loadV,
    bbox.min.z + size.z * settings.loadW,
  );
  const axis = dominantAxis(loadDirection);
  if (axis.name === "x") point.x = axis.sign < 0 ? bbox.max.x : bbox.min.x;
  if (axis.name === "y") point.y = axis.sign < 0 ? bbox.max.y : bbox.min.y;
  if (axis.name === "z") point.z = axis.sign < 0 ? bbox.max.z : bbox.min.z;
  return point;
}

function dominantAxis(vector) {
  const abs = {
    x: Math.abs(vector.x),
    y: Math.abs(vector.y),
    z: Math.abs(vector.z),
  };
  if (abs.x >= abs.y && abs.x >= abs.z) return { name: "x", sign: Math.sign(vector.x) || 1 };
  if (abs.y >= abs.x && abs.y >= abs.z) return { name: "y", sign: Math.sign(vector.y) || 1 };
  return { name: "z", sign: Math.sign(vector.z) || 1 };
}

function perpendicularDistance(point, loadPoint, loadAxis) {
  const axes = AXES.filter((axis) => axis !== loadAxis.name);
  const a = point[axes[0]] - loadPoint[axes[0]];
  const b = point[axes[1]] - loadPoint[axes[1]];
  return Math.sqrt(a * a + b * b);
}

function distanceToLoadPlane(point, bbox, loadDirection) {
  const axis = dominantAxis(loadDirection);
  const min = bbox.min[axis.name];
  const size = Math.max(bbox.max[axis.name] - min, 1e-6);
  const normalized = (point[axis.name] - min) / size;
  return axis.sign < 0 ? 1 - normalized : normalized;
}

function layerDirection(axisName) {
  if (axisName === "x") return new THREE.Vector3(1, 0, 0);
  if (axisName === "y") return new THREE.Vector3(0, 1, 0);
  return new THREE.Vector3(0, 0, 1);
}

function buildHotspots(vertexStats, maxRawSize) {
  const sorted = [...vertexStats]
    .filter((item) => Number.isFinite(item.utilization))
    .sort((a, b) => b.utilization - a.utilization);
  const hotspots = [];
  const minDistance = Math.max(maxRawSize * 0.1, 1e-5);

  for (const item of sorted) {
    if (hotspots.length >= 5) break;
    const tooClose = hotspots.some((hotspot) => hotspot.position.distanceTo(item.point) < minDistance);
    if (tooClose) continue;
    hotspots.push({
      position: item.point.clone(),
      utilization: item.utilization,
      stressMPa: item.stressMPa,
      reason: hotspotReason(item),
    });
  }

  return hotspots;
}

function hotspotReason(item) {
  if (item.loadContact > 0.45) return "하중 작용점 주변";
  if (item.nearSupport > 0.42) return "고정면 반력 집중";
  if (item.sectionFactor > 1.35) return "단면이 좁아지는 구간";
  if (item.supportDistance > 0.68) return "고정면에서 먼 휨 구간";
  return "곡면/모서리 응력 집중";
}
