// The homepage's 3D Lumi: the case we print now (hardware/enclosure/lumi_case.scad, parts "front" and
// "back" exported as STL) with Lumi's face playing on its screen. Loaded with a dynamic import.
//
// The case script's axes: X across the screen, Y up towards the keyring, Z = 0 at the front face and
// positive into the case. Three.js looks down -Z, so Z is flipped here and the front faces the camera.
// Re-export both STLs to public/models when the case changes.

import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";
import { drawFrame } from "@/lib/lumi-frames";
import type { SpinScene, SpinView } from "../clips/scene3d";

export type { SpinScene, SpinView };

// From lumi_case.scad: wall, the screen's offset, and the sizes of the glass and the lit area (mm).
const WALL = 1.4;
const DEPTH = 25.5; // D: the whole case from the front face to the back
const GLASS = { w: 26.7, h: 19.3, y: -1.2 + 0.55 };
const ACTIVE = { w: 21.74, h: 10.86, y: -1.2 + 1.55 };

function loadStl(loader: STLLoader, url: string) {
  return new Promise<THREE.BufferGeometry>((resolve, reject) => loader.load(url, resolve, undefined, reject));
}

/** The back part is exported upside down for printing (turned 180 degrees about X and moved up by D). Turn it back. */
function unprint(geo: THREE.BufferGeometry) {
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) pos.setXYZ(i, pos.getX(i), -pos.getY(i), DEPTH - pos.getZ(i));
  pos.needsUpdate = true;
  return geo;
}

/** Flips Z (so the front faces the camera) and keeps the triangles facing outwards. */
function flipZ(geo: THREE.BufferGeometry) {
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i += 3) {
    for (let k = 0; k < 3; k++) pos.setZ(i + k, -pos.getZ(i + k));
    const x = pos.getX(i + 1), y = pos.getY(i + 1), z = pos.getZ(i + 1);
    pos.setXYZ(i + 1, pos.getX(i + 2), pos.getY(i + 2), pos.getZ(i + 2));
    pos.setXYZ(i + 2, x, y, z);
  }
  pos.needsUpdate = true;
  geo.deleteAttribute("normal");
  return geo;
}

export async function createSpinScene(): Promise<SpinScene> {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 0.85;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.45;

  const key = new THREE.DirectionalLight(0xffffff, 1.1);
  key.position.set(40, 120, 80);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.radius = 8;
  Object.assign(key.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 400 });
  key.shadow.bias = -0.0005;
  scene.add(key);

  const loader = new STLLoader();
  const [frontGeo, backGeo] = await Promise.all([loadStl(loader, "/models/lumi-front.stl"), loadStl(loader, "/models/lumi-back.stl")]);
  flipZ(frontGeo);
  flipZ(unprint(backGeo));
  const creased = [toCreasedNormals(frontGeo, Math.PI / 7), toCreasedNormals(backGeo, Math.PI / 7)];

  // Turntable (spins about Y), centred on the middle of the case.
  const depth = DEPTH;
  const turntable = new THREE.Group();
  scene.add(turntable);
  const model = new THREE.Group();
  model.position.z = depth / 2;
  turntable.add(model);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.ShadowMaterial({ opacity: 0.16 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -18.6;
  floor.receiveShadow = true;
  scene.add(floor);

  const shell = new THREE.MeshPhysicalMaterial({ color: 0xb6dfc2, roughness: 0.6, metalness: 0, clearcoat: 0.08, clearcoatRoughness: 0.6 });
  for (const g of creased) {
    const m = new THREE.Mesh(g, shell);
    m.castShadow = true;
    m.receiveShadow = true;
    model.add(m);
  }

  // The screen: black glass behind the window, and the face on top of it, both facing the camera.
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(GLASS.w, GLASS.h),
    new THREE.MeshPhysicalMaterial({ color: 0x050608, roughness: 0.08, metalness: 0, clearcoat: 1 }),
  );
  glass.position.set(0, GLASS.y, -WALL - 0.06);
  model.add(glass);

  const faceCanvas = document.createElement("canvas");
  faceCanvas.width = 128 * 4;
  faceCanvas.height = 64 * 4;
  const glowCanvas = document.createElement("canvas");
  glowCanvas.width = faceCanvas.width;
  glowCanvas.height = faceCanvas.height;
  const faceTex = new THREE.CanvasTexture(faceCanvas);
  faceTex.colorSpace = THREE.SRGBColorSpace;
  faceTex.anisotropy = 4;
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(ACTIVE.w, ACTIVE.h),
    new THREE.MeshBasicMaterial({ map: faceTex, transparent: true, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  face.position.set(0, ACTIVE.y, -WALL - 0.03);
  model.add(face);

  const camera = new THREE.PerspectiveCamera(30, 9 / 16, 1, 2000);
  let lastFrame: Uint8Array | undefined | null = null;

  return {
    setShell(hex) {
      shell.color.set(hex);
    },
    setFace(frame) {
      if (frame === lastFrame) return;
      lastFrame = frame;
      const g = glowCanvas.getContext("2d")!;
      drawFrame(g, frame, 4, true);
      const c = faceCanvas.getContext("2d")!;
      c.clearRect(0, 0, faceCanvas.width, faceCanvas.height);
      c.filter = "blur(6px)";
      c.globalAlpha = 0.7;
      c.drawImage(glowCanvas, 0, 0);
      c.filter = "none";
      c.globalAlpha = 1;
      c.drawImage(glowCanvas, 0, 0);
      faceTex.needsUpdate = true;
    },
    render(width, height, view) {
      if (renderer.domElement.width !== width || renderer.domElement.height !== height) renderer.setSize(width, height, false);
      turntable.rotation.y = view.angle;
      camera.aspect = width / height;
      const dist = 200 / view.zoom;
      const el = THREE.MathUtils.degToRad(view.elevation);
      camera.position.set(0, Math.sin(el) * dist, Math.cos(el) * dist);
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
      return renderer.domElement;
    },
    dispose() {
      renderer.dispose();
      env.dispose();
      pmrem.dispose();
      faceTex.dispose();
      frontGeo.dispose();
      backGeo.dispose();
    },
  };
}
