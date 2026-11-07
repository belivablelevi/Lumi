// The Clip maker's 3D Lumi: the real case (the Mini Lumi PCB STLs) with Lumi's face playing
// on its screen. Loaded only on /admin/clips, with a dynamic import.

import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";
import { drawFrame } from "@/lib/lumi-frames";

// Case geometry in the case script's axes (mm, X right, -Y toward the viewer, Z up), from
// hardware/enclosure/mini_lumi_pcb/sizes.json and hardware/enclosure/blender/lumi_pcb_v1_refs.json.
// The STLs are laid out for printing: the body stands on Z = 0 (its base is at Z = -21), and the
// lid lies on its back plate. Recopy them to public/models when the case changes.
const BASE_Z = -21;
const LID_BACK_Y = 6.56 + 7.4; // lid_offset_y + lid_depth
const ACTIVE = { w: 21.74, h: 10.86, z: -0.5, y: -1.46 }; // the screen's lit area
const GLASS = { w: 26.7, h: 19.26, z: -2.6, y: -1.44 };
const CENTRE = { y: 0.5, z: 3.85 }; // middle of the case, the turntable's axis
const FLOOR = BASE_Z - CENTRE.z;

export interface SpinView {
  /** Turntable angle, radians. */
  angle: number;
  /** Camera height, degrees above level. */
  elevation: number;
  /** 1 = the default framing; bigger is closer. */
  zoom: number;
}

export interface SpinScene {
  setShell(hex: string): void;
  setFace(frame: Uint8Array | undefined): void;
  /** Renders a transparent frame (the background is drawn underneath by the caller). */
  render(width: number, height: number, view: SpinView): HTMLCanvasElement;
  dispose(): void;
}

function loadStl(loader: STLLoader, url: string) {
  return new Promise<THREE.BufferGeometry>((resolve, reject) => loader.load(url, resolve, undefined, reject));
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

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.ShadowMaterial({ opacity: 0.16 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = FLOOR - 0.05;
  floor.receiveShadow = true;
  scene.add(floor);

  // Turntable (spins about Y) > case in the script's axes, turned so Z is up and -Y faces the camera.
  const turntable = new THREE.Group();
  scene.add(turntable);
  const model = new THREE.Group();
  model.rotation.x = -Math.PI / 2;
  model.position.set(0, -CENTRE.z, CENTRE.y);
  turntable.add(model);

  const shell = new THREE.MeshPhysicalMaterial({ color: 0xdcddda, roughness: 0.6, metalness: 0, clearcoat: 0.08, clearcoatRoughness: 0.6 });
  const loader = new STLLoader();
  const [bodyGeo, lidGeo] = await Promise.all([loadStl(loader, "/models/lumi-body.stl"), loadStl(loader, "/models/lumi-lid.stl")]);
  const body = new THREE.Mesh(toCreasedNormals(bodyGeo, Math.PI / 7), shell);
  body.position.z = BASE_Z;
  const lid = new THREE.Mesh(toCreasedNormals(lidGeo, Math.PI / 7), shell);
  lid.rotation.x = Math.PI / 2; // printed lying on its back plate
  lid.position.y = LID_BACK_Y;
  for (const m of [body, lid]) {
    m.castShadow = true;
    m.receiveShadow = true;
    model.add(m);
  }

  // The screen: black glass, and the face on top of it, both facing -Y.
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(GLASS.w, GLASS.h),
    new THREE.MeshPhysicalMaterial({ color: 0x050608, roughness: 0.08, metalness: 0, clearcoat: 1 }),
  );
  glass.rotation.x = Math.PI / 2;
  glass.position.set(0, GLASS.y, GLASS.z);
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
  face.rotation.x = Math.PI / 2;
  face.position.set(0, ACTIVE.y, ACTIVE.z);
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
      // A soft glow under the crisp pixels, like a real OLED behind glass.
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
      camera.position.set(0, Math.sin(el) * dist - 4, Math.cos(el) * dist);
      camera.lookAt(0, -4, 0);
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
      return renderer.domElement;
    },
    dispose() {
      renderer.dispose();
      env.dispose();
      pmrem.dispose();
      faceTex.dispose();
      bodyGeo.dispose();
      lidGeo.dispose();
    },
  };
}
