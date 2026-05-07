import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

function disposeObject(object) {
  object.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) {
        child.material.forEach((material) => material.dispose());
      } else {
        child.material.dispose();
      }
    }
  });
}

function clearGroup(group) {
  while (group.children.length > 0) {
    const child = group.children.pop();
    disposeObject(child);
  }
}

function makeSupportPlane(analysis) {
  const { bbox } = analysis;
  const support =
    analysis.viewMode === "print"
      ? { axis: analysis.printStability?.buildAxis ?? "z", side: "min" }
      : analysis.support;
  const size = bbox.getSize(new THREE.Vector3());
  const center = bbox.getCenter(new THREE.Vector3());
  const material = new THREE.MeshBasicMaterial({
    color: analysis.viewMode === "print" ? "#1d7f9f" : "#159a62",
    transparent: true,
    opacity: 0.18,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  let geometry;
  const position = center.clone();
  const offset = Math.max(size.x, size.y, size.z) * 0.006;

  if (support.axis === "y") {
    geometry = new THREE.PlaneGeometry(Math.max(size.x, 0.001), Math.max(size.z, 0.001));
    geometry.rotateX(-Math.PI / 2);
    position.y = support.side === "min" ? bbox.min.y - offset : bbox.max.y + offset;
  } else if (support.axis === "x") {
    geometry = new THREE.PlaneGeometry(Math.max(size.z, 0.001), Math.max(size.y, 0.001));
    geometry.rotateY(Math.PI / 2);
    position.x = support.side === "min" ? bbox.min.x - offset : bbox.max.x + offset;
  } else {
    geometry = new THREE.PlaneGeometry(Math.max(size.x, 0.001), Math.max(size.y, 0.001));
    position.z = support.side === "min" ? bbox.min.z - offset : bbox.max.z + offset;
  }

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(position);
  mesh.renderOrder = 2;
  return mesh;
}

function makeLoadArrow(analysis) {
  const size = analysis.bbox.getSize(new THREE.Vector3());
  const maxSize = Math.max(size.x, size.y, size.z, 0.001);
  const length = maxSize * 0.28;
  const direction = analysis.loadDirection.clone().normalize();
  const origin = analysis.loadPoint.clone().addScaledVector(direction, -length);
  return new THREE.ArrowHelper(direction, origin, length, "#d66d22", length * 0.28, length * 0.14);
}

function makeBuildArrow(analysis) {
  const size = analysis.bbox.getSize(new THREE.Vector3());
  const center = analysis.bbox.getCenter(new THREE.Vector3());
  const maxSize = Math.max(size.x, size.y, size.z, 0.001);
  const length = maxSize * 0.26;
  const axis = analysis.printStability?.buildAxis ?? "z";
  const direction = axisVector(axis);
  const origin = center.clone();
  origin[axis] = analysis.bbox.min[axis] - length * 0.82;
  return new THREE.ArrowHelper(direction, origin, length, "#23607a", length * 0.25, length * 0.13);
}

function makeHotspotMarkers(analysis) {
  const group = new THREE.Group();
  const size = analysis.bbox.getSize(new THREE.Vector3());
  const maxSize = Math.max(size.x, size.y, size.z);
  const radius = Math.max(maxSize * 0.023, 0.01);
  const hotspots = analysis.viewMode === "print" ? analysis.printStability?.hotspots ?? [] : analysis.hotspots;
  hotspots.forEach((hotspot, index) => {
    const color = index === 0 ? "#d64b3f" : analysis.viewMode === "print" ? "#d66d22" : "#e0a51f";
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
      depthWrite: false,
    });
    const marker = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, radius * 0.055, 8, 42), material);
    const ringSide = ring.clone();
    const ringTilt = ring.clone();
    ringSide.rotation.y = Math.PI / 2;
    ringTilt.rotation.x = Math.PI / 2;
    marker.add(ring, ringSide, ringTilt);

    const lineMaterial = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
    });
    const crossLength = radius * 1.25;
    [
      [new THREE.Vector3(-crossLength, 0, 0), new THREE.Vector3(crossLength, 0, 0)],
      [new THREE.Vector3(0, -crossLength, 0), new THREE.Vector3(0, crossLength, 0)],
      [new THREE.Vector3(0, 0, -crossLength), new THREE.Vector3(0, 0, crossLength)],
    ].forEach(([start, end]) => {
      const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
      marker.add(new THREE.Line(geometry, lineMaterial));
    });

    marker.position.copy(hotspot.position);
    marker.renderOrder = 4;
    group.add(marker);
  });
  return group;
}

function axisVector(axis) {
  if (axis === "x") return new THREE.Vector3(1, 0, 0);
  if (axis === "y") return new THREE.Vector3(0, 1, 0);
  return new THREE.Vector3(0, 0, 1);
}

function fitCamera(camera, controls, bbox, viewportRatio) {
  const center = bbox.getCenter(new THREE.Vector3());
  const sphere = bbox.getBoundingSphere(new THREE.Sphere());
  const radius = Math.max(sphere.radius, 0.1);
  camera.aspect = viewportRatio;
  camera.near = Math.max(radius / 1000, 0.001);
  camera.far = radius * 60;
  camera.position.copy(center).add(new THREE.Vector3(radius * 1.7, radius * 1.05, radius * 1.55));
  camera.lookAt(center);
  camera.updateProjectionMatrix();
  controls.target.copy(center);
  controls.minDistance = radius * 0.35;
  controls.maxDistance = radius * 8;
  controls.update();
}

export default function ThreeStressViewer({ analysis }) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#f4f8fa");

    const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.screenSpacePanning = true;

    const group = new THREE.Group();
    scene.add(group);

    const ambient = new THREE.HemisphereLight("#ffffff", "#d4e1e6", 2.1);
    scene.add(ambient);
    const keyLight = new THREE.DirectionalLight("#ffffff", 2.6);
    keyLight.position.set(4, 5, 6);
    keyLight.castShadow = true;
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight("#b9e1ff", 1.1);
    fillLight.position.set(-4, 2, -5);
    scene.add(fillLight);

    let animationFrame = 0;
    const resize = () => {
      const rect = mount.getBoundingClientRect();
      const width = Math.max(rect.width, 320);
      const height = Math.max(rect.height, 320);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();

    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      animationFrame = window.requestAnimationFrame(animate);
    };
    animate();

    sceneRef.current = { scene, camera, renderer, controls, group };

    return () => {
      window.cancelAnimationFrame(animationFrame);
      observer.disconnect();
      clearGroup(group);
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    const context = sceneRef.current;
    if (!context || !analysis) return;

    const { camera, controls, group, renderer } = context;
    clearGroup(group);

    const geometry = analysis.geometry.clone();
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.64,
      metalness: 0.04,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    if (analysis.triangleCount < 80000) {
      const edges = new THREE.EdgesGeometry(geometry, 34);
      const edgeMaterial = new THREE.LineBasicMaterial({
        color: "#21333c",
        transparent: true,
        opacity: 0.18,
      });
      const wire = new THREE.LineSegments(edges, edgeMaterial);
      group.add(wire);
    }

    group.add(makeSupportPlane(analysis));
    if (analysis.viewMode === "print") {
      group.add(makeBuildArrow(analysis));
    } else {
      group.add(makeLoadArrow(analysis));
    }
    group.add(makeHotspotMarkers(analysis));

    const rect = renderer.domElement.getBoundingClientRect();
    fitCamera(camera, controls, analysis.bbox, Math.max(rect.width, 1) / Math.max(rect.height, 1));
  }, [analysis]);

  return (
    <div
      className="viewer-canvas"
      ref={mountRef}
      aria-label={analysis?.viewMode === "print" ? "3D 프린팅 출력 안정성 히트맵 뷰어" : "3D 응력 히트맵 뷰어"}
    />
  );
}
