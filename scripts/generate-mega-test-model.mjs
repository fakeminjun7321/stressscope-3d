import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import * as THREE from "three";
import { OBJExporter } from "three/examples/jsm/exporters/OBJExporter.js";

const outDir = path.resolve("public/test-assets");
const outFile = path.join(outDir, "stressscope-mega-architecture.obj");
const group = new THREE.Group();
group.name = "StressScope_Mega_Architecture_Load_Test";

const material = new THREE.MeshStandardMaterial();

function addMesh(name, geometry, position = [0, 0, 0], rotation = [0, 0, 0]) {
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  group.add(mesh);
  return mesh;
}

function addBox(name, size, position, segments = [1, 1, 1], rotation = [0, 0, 0]) {
  return addMesh(name, new THREE.BoxGeometry(...size, ...segments), position, rotation);
}

function addCylinder(name, radius, height, position, radialSegments = 14, rotation = [0, 0, 0]) {
  return addMesh(name, new THREE.CylinderGeometry(radius, radius, height, radialSegments, 2), position, rotation);
}

function addTubeBetween(name, start, end, radius = 1.2, radialSegments = 10) {
  const a = new THREE.Vector3(...start);
  const b = new THREE.Vector3(...end);
  const direction = new THREE.Vector3().subVectors(b, a);
  const length = direction.length();
  const geometry = new THREE.CylinderGeometry(radius, radius, length, radialSegments, 1);
  const mesh = addMesh(name, geometry, new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5).toArray());
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return mesh;
}

function addArch(name, radius, tubeRadius, position, rotation = [0, 0, 0]) {
  const geometry = new THREE.TorusGeometry(radius, tubeRadius, 10, 72, Math.PI);
  return addMesh(name, geometry, position, rotation);
}

// Ground, podium, and asymmetric cantilever slabs.
addBox("raft_foundation_deep_slab", [290, 10, 180], [0, 5, 0], [16, 1, 10]);
addBox("lower_podium", [210, 20, 118], [0, 22, 0], [10, 2, 6]);
addBox("upper_podium_shifted", [168, 16, 92], [-10, 42, 8], [8, 1, 5]);
addBox("east_cantilever_deck", [92, 10, 58], [126, 52, 10], [8, 1, 4]);
addBox("west_cantilever_deck", [74, 8, 48], [-128, 62, -28], [6, 1, 4]);
addBox("thin_roof_plate", [228, 6, 132], [8, 168, 4], [12, 1, 8]);

const towerSpecs = [
  [-88, -48, 118, 26, 34],
  [-36, -40, 154, 30, 28],
  [28, -42, 132, 28, 32],
  [84, -46, 104, 24, 34],
  [-72, 42, 92, 24, 30],
  [2, 45, 126, 34, 28],
  [72, 42, 148, 26, 30],
];

towerSpecs.forEach(([x, z, height, width, depth], index) => {
  const y = 52 + height / 2;
  addBox(`tower_${index + 1}_segmented_core`, [width, height, depth], [x, y, z], [4, 18, 4]);
  addBox(`tower_${index + 1}_service_spine`, [width * 0.36, height + 18, depth * 0.28], [x - width * 0.35, y + 2, z + depth * 0.38], [2, 12, 2]);

  for (let level = 0; level <= 5; level += 1) {
    const floorY = 56 + level * (height / 5);
    addBox(`tower_${index + 1}_belt_${level}`, [width + 8, 2.2, depth + 7], [x, floorY, z], [2, 1, 2]);
  }

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      addCylinder(
        `tower_${index + 1}_corner_column_${sx}_${sz}`,
        2.0,
        height + 10,
        [x + sx * (width / 2 + 3.2), y, z + sz * (depth / 2 + 3.2)],
        12,
      );
    }
  }
});

// Skybridges and heavy diagonal braces.
const bridgePairs = [
  [[-88, 120, -48], [-36, 132, -40], "west_high_bridge"],
  [[-36, 106, -40], [28, 112, -42], "central_mid_bridge"],
  [[28, 146, -42], [84, 122, -46], "east_sloped_bridge"],
  [[-72, 98, 42], [2, 112, 45], "south_low_bridge"],
  [[2, 138, 45], [72, 150, 42], "south_high_bridge"],
  [[-36, 78, -40], [2, 88, 45], "diagonal_city_bridge"],
];

bridgePairs.forEach(([a, b, name], index) => {
  const center = new THREE.Vector3().addVectors(new THREE.Vector3(...a), new THREE.Vector3(...b)).multiplyScalar(0.5);
  const length = new THREE.Vector3(...a).distanceTo(new THREE.Vector3(...b));
  const angle = Math.atan2(b[2] - a[2], b[0] - a[0]);
  addBox(`${name}_box`, [length, 8, 16], center.toArray(), [6, 1, 3], [0, -angle, 0]);
  addTubeBetween(`${name}_top_chord`, [a[0], a[1] + 8, a[2] + 8], [b[0], b[1] + 8, b[2] + 8], 1.5, 10);
  addTubeBetween(`${name}_bottom_chord`, [a[0], a[1] - 8, a[2] - 8], [b[0], b[1] - 8, b[2] - 8], 1.5, 10);

  const steps = 7;
  for (let i = 0; i < steps; i += 1) {
    const t0 = i / steps;
    const t1 = (i + 1) / steps;
    const p0 = lerp3(a, b, t0);
    const p1 = lerp3(a, b, t1);
    const flip = i % 2 === 0 ? 1 : -1;
    addTubeBetween(`${name}_web_${index}_${i}`, [p0[0], p0[1] - 8, p0[2] + flip * 8], [p1[0], p1[1] + 8, p1[2] - flip * 8], 0.9, 8);
  }
});

// Atrium rings, arch ribs, and curved canopy pieces.
addCylinder("central_atrium_outer_tube", 22, 86, [4, 96, 5], 40, [Math.PI / 2, 0, 0]);
addCylinder("central_atrium_vertical_core", 13, 116, [4, 98, 5], 40);
for (let i = 0; i < 10; i += 1) {
  const angle = (i / 10) * Math.PI * 2;
  const x = Math.cos(angle) * 34 + 4;
  const z = Math.sin(angle) * 26 + 5;
  addTubeBetween(`atrium_radial_spoke_${i}`, [4, 152, 5], [x, 122, z], 0.95, 8);
}

addArch("north_arch_rib_outer", 58, 2.2, [0, 44, -78], [0, 0, 0]);
addArch("north_arch_rib_inner", 43, 1.5, [0, 50, -78], [0, 0, 0]);
addArch("south_arch_rib_outer", 66, 2.0, [0, 50, 76], [0, Math.PI, 0]);
addArch("south_arch_rib_inner", 51, 1.4, [0, 58, 76], [0, Math.PI, 0]);

for (let i = 0; i <= 14; i += 1) {
  const t = i / 14;
  const x = -115 + t * 230;
  const y = 70 + Math.sin(t * Math.PI) * 38;
  addTubeBetween(`north_arch_vertical_hanger_${i}`, [x, 52, -78], [x, y, -78], 0.85, 8);
  addTubeBetween(`south_arch_vertical_hanger_${i}`, [x, 56, 76], [x, y + 4, 76], 0.85, 8);
}

// Dense roof lattice.
for (let i = 0; i < 13; i += 1) {
  const x = -110 + i * 18;
  addTubeBetween(`roof_lattice_x_${i}`, [x, 172, -66], [x + 16, 176, 72], 0.85, 8);
}
for (let i = 0; i < 9; i += 1) {
  const z = -64 + i * 16;
  addTubeBetween(`roof_lattice_z_${i}`, [-116, 176, z], [116, 172, z + 8], 0.85, 8);
}

// Column forest under cantilevers.
for (let xi = 0; xi < 9; xi += 1) {
  for (let zi = 0; zi < 5; zi += 1) {
    const x = -110 + xi * 27;
    const z = -52 + zi * 26;
    const h = 36 + ((xi + zi) % 3) * 8;
    addCylinder(`podium_column_${xi}_${zi}`, 1.7, h, [x, 16 + h / 2, z], 12);
  }
}

// Diagrid facade braces.
for (let i = 0; i < towerSpecs.length; i += 1) {
  const [x, z, height, width, depth] = towerSpecs[i];
  const floors = 6;
  for (let floor = 0; floor < floors; floor += 1) {
    const y0 = 58 + floor * (height / floors);
    const y1 = 58 + (floor + 1) * (height / floors);
    addTubeBetween(`tower_${i + 1}_front_diagrid_a_${floor}`, [x - width / 2, y0, z - depth / 2 - 2], [x + width / 2, y1, z - depth / 2 - 2], 0.65, 7);
    addTubeBetween(`tower_${i + 1}_front_diagrid_b_${floor}`, [x + width / 2, y0, z - depth / 2 - 2], [x - width / 2, y1, z - depth / 2 - 2], 0.65, 7);
  }
}

// Terraced stairs and small load concentrators.
for (let i = 0; i < 18; i += 1) {
  addBox(`grand_stair_step_${i}`, [54 - i * 1.8, 2.2, 5], [-82 + i * 3.2, 53 + i * 1.6, 74 - i * 2.2], [2, 1, 1]);
}
for (let i = 0; i < 22; i += 1) {
  const x = -126 + (i % 11) * 25;
  const z = i < 11 ? -84 : 84;
  addBox(`edge_load_pad_${i}`, [8, 4, 8], [x, 64 + (i % 3) * 4, z], [1, 1, 1], [0, (i % 4) * 0.18, 0]);
}

group.updateMatrixWorld(true);
const exporter = new OBJExporter();
const obj = exporter.parse(group);
await mkdir(outDir, { recursive: true });
await writeFile(outFile, obj, "utf8");

let meshCount = 0;
let triangleCount = 0;
group.traverse((child) => {
  if (!child.isMesh) return;
  meshCount += 1;
  const geometry = child.geometry;
  triangleCount += geometry.index ? geometry.index.count / 3 : geometry.getAttribute("position").count / 3;
});

console.log(JSON.stringify({
  outFile,
  meshCount,
  triangleCount: Math.round(triangleCount),
  sizeMm: { x: 290, y: 176, z: 180 },
}, null, 2));

function lerp3(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}
