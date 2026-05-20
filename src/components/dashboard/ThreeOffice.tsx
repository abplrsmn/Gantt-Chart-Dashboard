"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export type ThreeOfficeAgent = {
  id: string;
  name: string;
  isDefault?: boolean;
  heartbeatEnabled?: boolean;
  heartbeatEvery?: string;
  model?: string;
};

export type ThreeOfficeSession = {
  id: string;
  name: string;
  status: string;
  model: string;
  percent: number;
};

type Props = {
  agents: ThreeOfficeSession[];
  configuredAgents: ThreeOfficeAgent[];
  gatewayOk: boolean;
};

const isActive = (status: string) => ["active", "processing", "busy", "running"].includes(status.toLowerCase());

function makeMat(color: number, roughness = 0.72) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.08 });
}

function addBox(
  group: THREE.Group,
  size: [number, number, number],
  pos: [number, number, number],
  color: number,
  name?: string,
) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), makeMat(color));
  mesh.position.set(...pos);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (name) mesh.name = name;
  group.add(mesh);
  return mesh;
}

function createPixelAvatar(accent: number, active: boolean) {
  const avatar = new THREE.Group();
  avatar.userData.baseY = 0;

  // Blocky / voxel-style body inspired by retro 3D office avatars.
  addBox(avatar, [0.52, 0.52, 0.52], [0, 1.52, 0], 0xf1c6a8, "head");
  addBox(avatar, [0.58, 0.2, 0.58], [0, 1.86, 0], 0x111827, "hairTop");
  addBox(avatar, [0.12, 0.26, 0.56], [-0.29, 1.66, 0], 0x111827, "hairLeft");
  addBox(avatar, [0.12, 0.26, 0.56], [0.29, 1.66, 0], 0x111827, "hairRight");
  addBox(avatar, [0.08, 0.08, 0.045], [-0.13, 1.54, 0.285], 0x020617, "leftEye");
  addBox(avatar, [0.08, 0.08, 0.045], [0.13, 1.54, 0.285], 0x020617, "rightEye");
  addBox(avatar, [0.22, 0.04, 0.045], [0, 1.39, 0.285], active ? 0x34d399 : 0xfb7185, "mouth");

  addBox(avatar, [0.66, 0.78, 0.42], [0, 0.92, 0], accent, "body");
  addBox(avatar, [0.74, 0.16, 0.46], [0, 1.25, 0.01], 0xffffff, "collar");
  addBox(avatar, [0.24, 0.62, 0.22], [-0.5, 0.94, 0], 0xf1c6a8, "leftArm");
  addBox(avatar, [0.24, 0.62, 0.22], [0.5, 0.94, 0], 0xf1c6a8, "rightArm");
  addBox(avatar, [0.24, 0.64, 0.24], [-0.2, 0.28, 0], 0x334155, "leftLeg");
  addBox(avatar, [0.24, 0.64, 0.24], [0.2, 0.28, 0], 0x334155, "rightLeg");
  addBox(avatar, [0.32, 0.14, 0.42], [-0.2, -0.08, 0.07], 0x0f172a, "leftShoe");
  addBox(avatar, [0.32, 0.14, 0.42], [0.2, -0.08, 0.07], 0x0f172a, "rightShoe");

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.52, 18),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22 }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -0.16;
  shadow.name = "avatarShadow";
  avatar.add(shadow);

  if (active) {
    const aura = new THREE.Mesh(
      new THREE.RingGeometry(0.62, 0.72, 4),
      new THREE.MeshBasicMaterial({ color: 0x34d399, transparent: true, opacity: 0.72, side: THREE.DoubleSide }),
    );
    aura.rotation.x = -Math.PI / 2;
    aura.position.y = -0.13;
    aura.name = "aura";
    avatar.add(aura);


  }

  return avatar;
}

function createDesk(accent: number, active: boolean) {
  const desk = new THREE.Group();
  addBox(desk, [1.85, 0.18, 1.05], [0, 0.65, 0], 0x9a6b3f, "deskTop");
  addBox(desk, [0.18, 0.65, 0.18], [-0.72, 0.28, -0.36], 0x6f4828);
  addBox(desk, [0.18, 0.65, 0.18], [0.72, 0.28, -0.36], 0x6f4828);
  addBox(desk, [0.18, 0.65, 0.18], [-0.72, 0.28, 0.36], 0x6f4828);
  addBox(desk, [0.18, 0.65, 0.18], [0.72, 0.28, 0.36], 0x6f4828);

  // Monitor sits on the desk and faces the seated agent at +Z.
  addBox(desk, [0.78, 0.48, 0.08], [-0.32, 1.02, -0.35], 0x020617, "monitor");
  addBox(desk, [0.58, 0.08, 0.035], [-0.32, 1.08, -0.295], active ? 0xfbbf24 : 0x38bdf8, "screenLine1");
  addBox(desk, [0.36, 0.08, 0.035], [-0.42, 0.92, -0.295], active ? 0x34d399 : 0x818cf8, "screenLine2");
  addBox(desk, [0.18, 0.08, 0.035], [-0.05, 0.92, -0.295], active ? 0xfb7185 : 0x475569, "screenLine3");
  addBox(desk, [0.5, 0.05, 0.28], [-0.1, 0.78, 0.1], 0x0f172a, "keyboard");

  // Proper chair behind the agent; avatar sits and faces the desk/monitor.
  addBox(desk, [0.62, 0.16, 0.58], [0.5, 0.34, 1.0], accent, "chairSeat");
  addBox(desk, [0.62, 0.76, 0.14], [0.5, 0.78, 1.28], accent, "chairBack");
  addBox(desk, [0.12, 0.38, 0.12], [0.25, 0.14, 0.78], 0x374151);
  addBox(desk, [0.12, 0.38, 0.12], [0.75, 0.14, 0.78], 0x374151);

  const avatar = createPixelAvatar(accent, active);
  avatar.position.set(0.5, 0.18, 0.88);
  avatar.rotation.y = Math.PI;
  avatar.scale.set(0.9, 0.9, 0.9);
  const leftLeg = avatar.getObjectByName("leftLeg");
  const rightLeg = avatar.getObjectByName("rightLeg");
  if (leftLeg) leftLeg.rotation.x = -0.95;
  if (rightLeg) rightLeg.rotation.x = -0.95;
  desk.add(avatar);
  desk.userData.avatar = avatar;
  desk.userData.active = active;

  return desk;
}

function createLabel(text: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(15,23,42,0.78)";
  ctx.roundRect(14, 22, 484, 84, 22);
  ctx.fill();
  ctx.fillStyle = "#e2e8f0";
  ctx.font = "700 34px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text.slice(0, 22), 256, 64);
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
  sprite.scale.set(1.7, 0.42, 1);
  return sprite;
}

function createPixelFloorPattern(parent: THREE.Group) {
  const colors = [0xd8c7a8, 0xcdb894, 0xe2d2b7, 0xbfa782];
  for (let x = -6; x <= 6; x += 1) {
    for (let z = -4; z <= 4; z += 1) {
      const tile = new THREE.Mesh(
        new THREE.BoxGeometry(0.92, 0.025, 0.92),
        makeMat(colors[Math.abs(x + z) % colors.length], 0.9),
      );
      tile.position.set(x, 0.025, z);
      tile.receiveShadow = true;
      parent.add(tile);
    }
  }
}

function createStatusLabel(text: string, color = "#e2e8f0") {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(2,6,23,0.82)";
  ctx.roundRect(22, 28, 468, 72, 18);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.font = "900 30px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text.slice(0, 24), 256, 64);
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
  sprite.scale.set(1.85, 0.46, 1);
  return sprite;
}


type SavedOfficeLayout = Record<string, { x: number; z: number }>;
const OFFICE_LAYOUT_KEY = "project-dashboard:three-office-layout:v1";

function readOfficeLayout(): SavedOfficeLayout {
  try {
    const raw = window.localStorage.getItem(OFFICE_LAYOUT_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SavedOfficeLayout;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeOfficeLayout(layout: SavedOfficeLayout) {
  try {
    window.localStorage.setItem(OFFICE_LAYOUT_KEY, JSON.stringify(layout));
  } catch {
    // localStorage may be unavailable in private/locked-down browsers; ignore.
  }
}

function applySavedPosition(group: THREE.Group, layout: SavedOfficeLayout, key: string) {
  const saved = layout[key];
  group.userData.layoutKey = key;
  if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.z)) {
    group.position.x = THREE.MathUtils.clamp(saved.x, -6.0, 6.0);
    group.position.z = THREE.MathUtils.clamp(saved.z, -3.65, 3.75);
  }
}


export default function ThreeOffice({ agents, configuredAgents, gatewayOk }: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.clientWidth || 900;
    const height = mount.clientHeight || 440;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf3f0e8);
    scene.fog = new THREE.Fog(0xf3f0e8, 14, 28);

    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
    camera.position.set(5.2, 7.2, 8.2);
    camera.lookAt(0, 0.25, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 6.2;
    controls.maxDistance = 15;
    controls.minPolarAngle = Math.PI / 5;
    controls.maxPolarAngle = Math.PI / 2.25;
    controls.target.set(0, 0.25, 0);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let hoveredObject: THREE.Group | null = null;
    let selectedObject: THREE.Group | null = null;
    let draggingObject: THREE.Group | null = null;
    const draggableObjects: THREE.Group[] = [];
    const savedLayout = readOfficeLayout();
    const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const dragHit = new THREE.Vector3();
    const dragOffset = new THREE.Vector3();

    const loader = new GLTFLoader();
    const addClawAsset = (
      parent: THREE.Group,
      url: string,
      position: [number, number, number],
      scale: number,
      rotation: [number, number, number] = [0, 0, 0],
    ) => {
      const holder = new THREE.Group();
      holder.position.set(...position);
      parent.add(holder);
      loader.load(url, (gltf) => {
        const model = gltf.scene.clone(true);
        model.scale.setScalar(scale);
        model.rotation.set(...rotation);
        model.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        holder.add(model);
      });
      return holder;
    };

    const ambient = new THREE.HemisphereLight(0xdbeafe, 0x1e293b, 1.4);
    scene.add(ambient);
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(5, 9, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    scene.add(key);
    const cyan = new THREE.PointLight(0x22d3ee, 2.2, 10);
    cyan.position.set(5.25, 2.2, 2.45);
    scene.add(cyan);

    const office = new THREE.Group();
    scene.add(office);

    const plant = addClawAsset(office, "/claw3d-assets/models/furniture/pottedPlant.glb", [6.05, 0.05, 3.55], 1.35, [0, -Math.PI / 4, 0]);
    plant.userData.kind = "plant";
    applySavedPosition(plant, savedLayout, "plant:corner");
    draggableObjects.push(plant);

    const floor = new THREE.Mesh(new THREE.BoxGeometry(13.2, 0.22, 8.6), makeMat(0xc9b99f));
    floor.position.y = -0.12;
    floor.receiveShadow = true;
    office.add(floor);

    createPixelFloorPattern(office);
    const grid = new THREE.GridHelper(13.2, 26, 0xd7c4a5, 0xb79d7b);
    grid.position.y = 0.045;
    office.add(grid);

    const backWall = new THREE.Mesh(new THREE.BoxGeometry(13.2, 3, 0.22), makeMat(0xe8ddc9));
    backWall.position.set(0, 1.38, -4.4);
    backWall.receiveShadow = true;
    office.add(backWall);
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.22, 3, 8.6), makeMat(0xd9c9ad));
    leftWall.position.set(-6.7, 1.38, 0);
    leftWall.receiveShadow = true;
    office.add(leftWall);

    const gateway = new THREE.Group();
    addBox(gateway, [1.25, 1.65, 1.25], [0, 0.95, 0], 0x020617, "gatewayCore");
    addBox(gateway, [0.8, 0.1, 0.08], [0, 1.35, 0.66], gatewayOk ? 0x34d399 : 0xef4444, "gatewayLed1");
    addBox(gateway, [0.56, 0.1, 0.08], [0, 1.1, 0.66], 0x22d3ee, "gatewayLed2");
    const gatewayPosition = new THREE.Vector3(5.25, 0, 2.45);
    gateway.position.copy(gatewayPosition);
    applySavedPosition(gateway, savedLayout, "gateway:main");
    cyan.position.set(gateway.position.x, 2.2, gateway.position.z);
    gateway.userData.kind = "gateway";
    gateway.userData.homeY = gateway.position.y;
    office.add(gateway);
    draggableObjects.push(gateway);

    const roster = (configuredAgents.length > 0
      ? configuredAgents.map((cfg) => {
          const related = agents.find(a => a.id.includes(`agent:${cfg.id}:`) || a.id === cfg.id || a.name.toLowerCase().includes(cfg.id.toLowerCase()));
          return {
            id: cfg.id,
            name: cfg.name || cfg.id,
            model: related?.model || cfg.model || "configured",
            active: related ? isActive(related.status) : false,
          };
        })
      : agents.map(a => ({ id: a.id, name: a.name, model: a.model, active: isActive(a.status) }))
    ).slice(0, 8);

    const positions: Array<[number, number, number]> = [
      [-4.65, 0, -2.35], [-1.55, 0, -2.55], [1.55, 0, -2.55], [4.65, 0, -2.35],
      [-4.65, 0, 2.55], [-1.55, 0, 2.75], [1.55, 0, 2.75], [4.65, 0, 2.55],
    ];
    const accents = [0x3b82f6, 0x8b5cf6, 0x06b6d4, 0x10b981, 0xf59e0b, 0xd946ef, 0x6366f1, 0xf43f5e];
    const animated: THREE.Group[] = [];
    const activeBeams: THREE.Mesh[] = [];

    roster.forEach((agent, index) => {
      const desk = createDesk(accents[index % accents.length], agent.active);
      desk.position.set(...positions[index]);
      applySavedPosition(desk, savedLayout, `agent:${agent.id}`);
      desk.rotation.y = index < 4 ? 0 : Math.PI;
      desk.userData.agentName = agent.name;
      desk.userData.active = agent.active;
      desk.userData.homeY = desk.position.y;
      desk.userData.kind = "agentDesk";
      draggableObjects.push(desk);
      addClawAsset(desk, "/claw3d-assets/models/furniture/desk.glb", [0, 0.5, -0.08], 0.78, [0, Math.PI, 0]);
      addClawAsset(desk, "/claw3d-assets/models/furniture/chairDesk.glb", [0.58, 0.18, 0.9], 0.55, [0, Math.PI, 0]);
      addClawAsset(desk, "/claw3d-assets/models/furniture/computerScreen.glb", [-0.32, 0.9, -0.34], 0.55, [0, Math.PI, 0]);
      office.add(desk);
      animated.push(desk);

      const label = createLabel(agent.name);
      label.position.set(0, 2.95, 0);
      desk.add(label);

      const statusLabel = createStatusLabel(agent.active ? "WORKING" : "STANDBY", agent.active ? "#fbbf24" : "#93c5fd");
      statusLabel.position.set(0, 2.52, 0);
      desk.add(statusLabel);

      if (agent.active) {
        const start = desk.position.clone().setY(1.45);
        const end = gatewayPosition.clone().setY(1.45);
        const mid = start.clone().lerp(end, 0.5);
        const length = start.distanceTo(end);
        const beam = new THREE.Mesh(
          new THREE.BoxGeometry(0.055, 0.055, length),
          new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.55 }),
        );
        beam.position.copy(mid);
        beam.lookAt(end);
        beam.name = "activeBeam";
        beam.userData.source = desk;
        beam.userData.target = gateway;
        beam.userData.baseLength = length;
        office.add(beam);
        activeBeams.push(beam);
      }
    });

    let frame = 0;
    const clock = new THREE.Clock();

    const resize = () => {
      if (!mount) return;
      const w = mount.clientWidth || width;
      const h = mount.clientHeight || height;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", resize);


    const setPointerFromEvent = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
    };

    const pickObject = (event: PointerEvent) => {
      setPointerFromEvent(event);
      const hits = raycaster.intersectObjects(draggableObjects, true);
      if (!hits.length) return null;
      return draggableObjects.find(obj => hits[0].object === obj || obj.getObjectById(hits[0].object.id)) ?? null;
    };

    const moveDraggedObject = (event: PointerEvent) => {
      if (!draggingObject) return;
      setPointerFromEvent(event);
      if (!raycaster.ray.intersectPlane(dragPlane, dragHit)) return;
      draggingObject.position.x = THREE.MathUtils.clamp(dragHit.x + dragOffset.x, -6.0, 6.0);
      draggingObject.position.z = THREE.MathUtils.clamp(dragHit.z + dragOffset.z, -3.65, 3.75);
      draggingObject.position.y = (draggingObject.userData.homeY ?? 0) + 0.18;
      if (draggingObject === gateway) {
        cyan.position.set(gateway.position.x, 2.2, gateway.position.z);
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      if (draggingObject) {
        moveDraggedObject(event);
        return;
      }
      const hit = pickObject(event);
      if (hoveredObject && hoveredObject !== hit && hoveredObject !== selectedObject) hoveredObject.position.y = hoveredObject.userData.homeY ?? 0;
      hoveredObject = hit;
      renderer.domElement.style.cursor = hit ? "grab" : "default";
      if (hit && hit !== selectedObject) hit.position.y = (hit.userData.homeY ?? 0) + 0.08;
    };

    const onPointerDown = (event: PointerEvent) => {
      const hit = pickObject(event);
      if (!hit) return;
      event.preventDefault();
      if (selectedObject && selectedObject !== hit) selectedObject.position.y = selectedObject.userData.homeY ?? 0;
      selectedObject = hit;
      draggingObject = hit;
      controls.enabled = false;
      renderer.domElement.style.cursor = "grabbing";
      setPointerFromEvent(event);
      if (raycaster.ray.intersectPlane(dragPlane, dragHit)) {
        dragOffset.set(hit.position.x - dragHit.x, 0, hit.position.z - dragHit.z);
      }
      selectedObject.position.y = (selectedObject.userData.homeY ?? 0) + 0.18;
      const target = selectedObject.position.clone();
      target.y = 0.95;
      controls.target.lerp(target, 0.35);
    };

    const onPointerUp = () => {
      if (draggingObject) {
        draggingObject.position.y = draggingObject.userData.homeY ?? 0;
        const key = draggingObject.userData.layoutKey as string | undefined;
        if (key) {
          savedLayout[key] = {
            x: Number(draggingObject.position.x.toFixed(3)),
            z: Number(draggingObject.position.z.toFixed(3)),
          };
          writeOfficeLayout(savedLayout);
        }
      }
      draggingObject = null;
      controls.enabled = true;
      renderer.domElement.style.cursor = hoveredObject ? "grab" : "default";
    };

    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);

    const animate = () => {
      frame = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();
      gateway.rotation.y = t * 0.32;
      cyan.intensity = 1.7 + Math.sin(t * 2.2) * 0.55;
      controls.update();

      animated.forEach((desk, i) => {
        const avatar = desk.userData.avatar as THREE.Group | undefined;
        if (avatar) {
          avatar.position.y = 0.45 + Math.sin(t * 2.6 + i) * 0.045;
          const leftArm = avatar.getObjectByName("leftArm");
          const rightArm = avatar.getObjectByName("rightArm");
          if (leftArm) leftArm.rotation.x = Math.sin(t * 7 + i) * 0.35;
          if (rightArm) rightArm.rotation.x = Math.cos(t * 7 + i) * 0.35;
          const aura = avatar.getObjectByName("aura");
          if (aura) aura.rotation.z = t * 1.7;
          
        }
      });

      activeBeams.forEach((beam, i) => {
        const mat = beam.material as THREE.MeshBasicMaterial;
        mat.opacity = 0.28 + Math.abs(Math.sin(t * 2.8 + i)) * 0.42;
        const source = beam.userData.source as THREE.Group | undefined;
        const target = beam.userData.target as THREE.Group | undefined;
        if (source && target) {
          const start = source.position.clone().setY(1.45);
          const end = target.position.clone().setY(1.45);
          beam.position.copy(start.clone().lerp(end, 0.5));
          beam.lookAt(end);
          beam.scale.z = start.distanceTo(end) / (beam.userData.baseLength || 1);
        }
      });

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      mount.removeChild(renderer.domElement);
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          const material = obj.material;
          if (Array.isArray(material)) material.forEach(m => m.dispose());
          else material.dispose();
        }
      });
      controls.dispose();
      renderer.dispose();
    };
  }, [agents, configuredAgents, gatewayOk]);

  return <div ref={mountRef} className="h-[640px] w-full rounded-2xl overflow-hidden bg-[#f3f0e8]" />;
}
