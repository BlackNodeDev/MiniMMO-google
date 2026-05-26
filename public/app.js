/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';

// --- CONFIG & GLOBAL STATES ---
let scene, camera, renderer, clock;
let localPlayerId = 'p_local_' + Math.random().toString(36).substring(2, 8);
let localPlayerName = 'Llama_' + Math.floor(Math.random() * 900 + 100);
let localPlayerSkin = 'llama';

let keys = {};
let joystick = { active: false, x: 0, y: 0, id: null, startX: 0, startY: 0 };
let currentRoomId = 'home';
let isBuildMode = false;
let selectedMaterial = 'white';
let isSocketOnline = false;

// Bounding limit rules
const STAGE_BOUND = 21.0;
const COLLIDER_RADIUS = 0.52;
const MOUSE_RAYCAST_HEIGHT = 0.01;

// Core asset, player & block cache
const localPlayers = new Map(); // id -> Player3DInstance
const activeBlocks = new Map(); // id -> ThreeMesh object
const colliderBoxes = [];

// Fallback World Seed in case server or static JSON loading stalls
let worldConfig = {
  id: 'home_dev_001',
  name: 'Minimmo Home',
  spawn: { x: 0, y: 0.1, z: 0, yaw: Math.PI },
  materials: [
    { id: 'white', name: 'White Studio', color: 0xffffff, roughness: 0.44, metalness: 0.02 },
    { id: 'graphite', name: 'Graphite Matte', color: 0x202938, roughness: 0.52, metalness: 0.02 },
    { id: 'cyanGlass', name: 'Cyan Glass', color: 0xb8f2ff, roughness: 0.36, metalness: 0.04 },
    { id: 'silver', name: 'Silver Steel', color: 0xdfe7ee, roughness: 0.38, metalness: 0.03 },
    { id: 'softWood', name: 'Hinoki Wood', color: 0xe6cea8, roughness: 0.8, metalness: 0.0 }
  ]
};

// --- WEBSOCKET CLIENT ---
let ws = null;
let reconnectTimer = null;

function connectMultiplayer() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socketUrl = `${protocol}//${window.location.host}`;

  updateStatusIndicator(false);
  
  if (ws) {
    try { ws.close(); } catch (_) {}
  }

  try {
    ws = new WebSocket(socketUrl);
    
    ws.onopen = () => {
      console.log('Multiplayer networking active.');
      isSocketOnline = true;
      updateStatusIndicator(true);
      
      // Request spawn joining
      ws.send(JSON.stringify({
        type: 'join',
        id: localPlayerId,
        name: localPlayerName,
        skin: localPlayerSkin,
        x: localPlayerMesh ? localPlayerMesh.position.x : 0,
        y: localPlayerMesh ? localPlayerMesh.position.y : 0.1,
        z: localPlayerMesh ? localPlayerMesh.position.z : 0,
        yaw: localPlayerYaw
      }));
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        handleServerMessage(payload);
      } catch (err) {
        console.warn('Multiplayer transmission parse error:', err);
      }
    };

    ws.onclose = () => {
      isSocketOnline = false;
      updateStatusIndicator(false);
      console.warn('Socket closed. Reconnecting shortly.');
      
      // Clean off other players
      clearRemotePlayers();
      
      if (!reconnectTimer) {
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          connectMultiplayer();
        }, 5000);
      }
    };

    ws.onerror = () => {
      updateStatusIndicator(false);
    };

  } catch (error) {
    console.error('Multiplayer link initialization failed:', error);
  }
}

// --- WORLD DATA JSON LOADER ---
async function loadWorldConfig() {
  try {
    const response = await fetch('/worlds/home.json');
    if (response.ok) {
      const data = await response.json();
      worldConfig = data;
      console.log('Seed parameters resolved from home.json.');
    }
  } catch (err) {
    console.warn('No home.json template found; initializing with high-fidelity local cache.');
  }
}

// --- THREE.JS INITIALIZATION ---
let localPlayerMesh = null;
let shadowBlob = null;
let targetRing = null;
let localPlayerYaw = Math.PI;
let localVelocity = { x: 0, z: 0 };
let worldGridFloor = null;

// Shared material pools
const matCache = {};
function getSharedMaterial(matId) {
  if (matCache[matId]) return matCache[matId];
  
  const mDef = worldConfig.materials.find(m => m.id === matId) || worldConfig.materials[0];
  const matVal = typeof mDef.color === 'string' ? parseInt(mDef.color) : mDef.color;

  const mat = new THREE.MeshStandardMaterial({
    color: matVal,
    roughness: mDef.roughness,
    metalness: mDef.metalness
  });

  matCache[matId] = mat;
  return mat;
}

// Global material list mapping for color bubbles
const materialPalette = {
  white: { hex: '#ffffff', color: 0xffffff },
  graphite: { hex: '#202938', color: 0x202938 },
  cyanGlass: { hex: '#b8f2ff', color: 0xb8f2ff },
  silver: { hex: '#dfe7ee', color: 0xdfe7ee },
  softWood: { hex: '#e6cea8', color: 0xe6cea8 }
};

function bootEngine() {
  // 1. Setup Scene, Fog & Backdrops
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf4f7fa);
  scene.fog = new THREE.Fog(0xf4f7fa, 35, 75);

  // 2. Camera positioning (Optimized classic isometric style angle)
  camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 200);

  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); // Mobile battery optimization
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  document.getElementById('app').appendChild(renderer.domElement);
  clock = new THREE.Clock();

  // 3. Ambient & Studio lighting
  const hemi = new THREE.HemisphereLight(0xffffff, 0xc7d2fe, 1.8);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffffff, 2.0);
  sun.position.set(-15, 25, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -28;
  sun.shadow.camera.right = 28;
  sun.shadow.camera.top = 28;
  sun.shadow.camera.bottom = -28;
  sun.shadow.bias = -0.00035;
  scene.add(sun);

  // 4. Ground floor & Grid Lines
  const floorGeo = new THREE.BoxGeometry(45, 0.28, 45);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0xfbfcfe, roughness: 0.85, metalness: 0 });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.position.y = -0.14;
  floor.receiveShadow = true;
  scene.add(floor);

  worldGridFloor = floor;

  const gridLines = new THREE.GridHelper(44, 22, 0xdde4ed, 0xeef2f7);
  gridLines.position.y = 0.01;
  gridLines.material.transparent = true;
  gridLines.material.opacity = 0.42;
  scene.add(gridLines);

  // 5. Build default template blocks
  buildWorldObjects(worldConfig.objects);

  // 6. Build Local Player
  createLocalCharacter();

  // 7. Initialize DOM overlays
  initUserInterface();

  // Hide loader
  const bootScreen = document.getElementById('bootScreen');
  if (bootScreen) {
    bootScreen.style.opacity = 0;
    setTimeout(() => bootScreen.style.display = 'none', 400);
  }

  // 8. Launch Loop
  animateScene();
  
  // 9. Begin Networking
  connectMultiplayer();
}

// --- CONSTRUCT BLOCK GEOMETRY CREATION ---
// Custom rounded-corner box utility to give that soft toy-world aesthetic
function createRoundedBlockGeometry(w, h, d, maxRadius) {
  const r = Math.min(maxRadius, h * 0.25, w * 0.25, d * 0.25);
  const shape = new THREE.Shape();
  const x = -w/2, y = -h/2;
  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y);
  shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + h - r);
  shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  shape.lineTo(x + r, y + h);
  shape.quadraticCurveTo(x, y + h, x, y + h - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);

  const extrudeSettings = {
    depth: d,
    bevelEnabled: false,
    steps: 1
  };
  const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  geo.center();
  // Rotate so depth is aligned with Z
  return geo;
}

function buildWorldObjects(objectsArray) {
  // Clean past obstacles
  activeBlocks.forEach(mesh => scene.remove(mesh));
  activeBlocks.clear();
  colliderBoxes.length = 0;

  for (const obj of objectsArray) {
    const [w, h, d] = obj.size;
    const [x, y, z] = obj.position;

    const geo = createRoundedBlockGeometry(w, h, d, 0.16);
    const mat = getSharedMaterial(obj.material);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    mesh.userData = { id: obj.id, material: obj.material, size: obj.size };

    scene.add(mesh);
    activeBlocks.set(obj.id, mesh);

    // Register simple collision grid bounding boxes
    colliderBoxes.push({
      id: obj.id,
      minX: x - w/2,
      maxX: x + w/2,
      minZ: z - d/2,
      maxZ: z + d/2
    });
  }
}

// --- ANIMAL CHARACTER ASSEMBLE ENGINE (Skin Generator) ---
// Builds 3D cute low-poly characters dynamically based on active skin IDs.
// Shared across local character and other online players.
function assembleAnimalModel(skinName) {
  const group = new THREE.Group();

  // Basic dimensions & colors config
  let primaryColor = 0x1e293b;   // Llama Charcoal 
  let secondaryColor = 0xf8fafc; // Soft White
  let accentColor = 0x06b6d4;    // Bright Cyan Scarfs
  let isOwl = false, isFrog = false, isPanda = false, isWhale = false;

  if (skinName === 'whale') {
    primaryColor = 0x0ea5e9;    // Blue Ocean
    secondaryColor = 0xe0f2fe;  // Sky belly
    accentColor = 0xf43f5e;     // Coral red seal
    isWhale = true;
  } else if (skinName === 'panda') {
    primaryColor = 0x111827;    // Inky Black limbs
    secondaryColor = 0xffffff;  // Polar White body
    accentColor = 0x10b981;     // Jade green leaf
    isPanda = true;
  } else if (skinName === 'owl') {
    primaryColor = 0x78350f;    // Soft brown
    secondaryColor = 0xfef3c7;  // Cream belly
    accentColor = 0xd97706;     // Amber orange beak
    isOwl = true;
  } else if (skinName === 'frog') {
    primaryColor = 0x22c55e;    // Green grass
    secondaryColor = 0xf0fdf4;  // Lime throat
    accentColor = 0xeab308;     // Buttercup crown
    isFrog = true;
  }

  // Material Pool
  const primaryMat = new THREE.MeshStandardMaterial({ color: primaryColor, roughness: 0.5, metalness: 0.01 });
  const secondaryMat = new THREE.MeshStandardMaterial({ color: secondaryColor, roughness: 0.46, metalness: 0.01 });
  const accentMat = new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.3, metalness: 0.02 });
  const darkEyeMat = new THREE.MeshBasicMaterial({ color: 0x090d16 });
  const blushMat = new THREE.MeshBasicMaterial({ color: 0xffa3be });

  if (isWhale) {
    // 🐋 Blue Whale Assemble
    const body = new THREE.Mesh(createRoundedBlockGeometry(1.22, 0.9, 1.4, 0.3), primaryMat);
    body.position.y = 0.55;
    body.castShadow = true;
    group.add(body);

    const belly = new THREE.Mesh(createRoundedBlockGeometry(0.9, 0.2, 1.0, 0.1), secondaryMat);
    belly.position.set(0, 0.12, 0.08);
    group.add(belly);

    // Whale Tail flukes
    const tailTail = new THREE.Mesh(createRoundedBlockGeometry(0.8, 0.2, 0.4, 0.08), primaryMat);
    tailTail.position.set(0, 0.5, -0.85);
    tailTail.rotation.x = 0.1;
    group.add(tailTail);

    // Whale Side fins
    const flipperL = new THREE.Mesh(createRoundedBlockGeometry(0.5, 0.12, 0.3, 0.06), primaryMat);
    flipperL.position.set(-0.72, 0.34, 0.1);
    flipperL.rotation.z = 0.3;
    group.add(flipperL);

    const flipperR = flipperL.clone();
    flipperR.position.x = 0.72;
    flipperR.rotation.z = -0.3;
    group.add(flipperR);

    // Little Blowhole spout cap
    const blowHole = new THREE.Mesh(createRoundedBlockGeometry(0.18, 0.06, 0.18, 0.03), accentMat);
    blowHole.position.set(0, 1.02, 0.1);
    group.add(blowHole);

    // Wide Whale eyes on sides
    const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.08), darkEyeMat);
    eyeL.position.set(-0.62, 0.64, 0.38);
    group.add(eyeL);

    const eyeR = eyeL.clone();
    eyeR.position.x = 0.62;
    group.add(eyeR);

  } else if (isPanda) {
    // 🐼 Panda Assemble
    // Main white egg body
    const body = new THREE.Mesh(createRoundedBlockGeometry(1.04, 1.14, 0.76, 0.22), secondaryMat);
    body.position.y = 0.74;
    body.castShadow = true;
    group.add(body);

    const scarfArms = new THREE.Mesh(createRoundedBlockGeometry(1.18, 0.28, 0.86, 0.06), primaryMat);
    scarfArms.position.y = 1.08;
    scarfArms.castShadow = true;
    group.add(scarfArms);

    const headHeight = 1.56;
    const head = new THREE.Mesh(createRoundedBlockGeometry(1.1, 0.86, 0.84, 0.24), secondaryMat);
    head.position.y = headHeight;
    head.castShadow = true;
    group.add(head);

    // Circular Panda black eyes patches
    const patchL = new THREE.Mesh(createRoundedBlockGeometry(0.24, 0.34, 0.03, 0.06), primaryMat);
    patchL.position.set(-0.25, 1.54, 0.43);
    patchL.rotation.z = 0.15;
    group.add(patchL);
    
    const patchR = patchL.clone();
    patchR.position.x = 0.25;
    patchR.rotation.z = -0.15;
    group.add(patchR);

    // Tiny sparkling white pupils inside
    const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.02), darkEyeMat);
    eyeL.position.set(-0.24, 1.54, 0.45);
    group.add(eyeL);

    const eyeR = eyeL.clone();
    eyeR.position.x = 0.24;
    group.add(eyeR);

    // Bulgy black ears
    const earL = new THREE.Mesh(createRoundedBlockGeometry(0.28, 0.28, 0.14, 0.08), primaryMat);
    earL.position.set(-0.46, 2.0, -0.05);
    group.add(earL);

    const earR = earL.clone();
    earR.position.x = 0.46;
    group.add(earR);

    // Little cute button nose
    const nose = new THREE.Mesh(createRoundedBlockGeometry(0.14, 0.08, 0.04, 0.02), primaryMat);
    nose.position.set(0, 1.4, 0.44);
    group.add(nose);

    // Thick black feet
    const footL = new THREE.Mesh(createRoundedBlockGeometry(0.34, 0.24, 0.46, 0.08), primaryMat);
    footL.position.set(-0.28, 0.12, 0.06);
    footL.castShadow = true;
    group.add(footL);

    const footR = footL.clone();
    footR.position.x = 0.28;
    group.add(footR);

  } else if (isOwl) {
    // 🦉 Round Owl Assemble
    // Chubby egg-shaped owl body
    const body = new THREE.Mesh(createRoundedBlockGeometry(1.08, 1.25, 0.88, 0.34), primaryMat);
    body.position.y = 0.74;
    body.castShadow = true;
    group.add(body);

    // Large circular heart faceplate
    const facePlate = new THREE.Mesh(createRoundedBlockGeometry(0.85, 0.65, 0.045, 0.18), secondaryMat);
    facePlate.position.set(0, 1.05, 0.44);
    group.add(facePlate);

    // Giant circular cute yellow eyes
    const eyeLOuter = new THREE.Mesh(createRoundedBlockGeometry(0.3, 0.3, 0.02, 0.1), accentMat);
    eyeLOuter.position.set(-0.2, 1.1, 0.47);
    group.add(eyeLOuter);

    const eyeROuter = eyeLOuter.clone();
    eyeROuter.position.x = 0.2;
    group.add(eyeROuter);

    const pupilL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.02), darkEyeMat);
    pupilL.position.set(-0.2, 1.1, 0.49);
    group.add(pupilL);

    const pupilR = pupilL.clone();
    pupilR.position.x = 0.2;
    group.add(pupilR);

    // Little wedge beak
    const beak = new THREE.Mesh(createRoundedBlockGeometry(0.12, 0.16, 0.12, 0.03), accentMat);
    beak.position.set(0, 0.9, 0.48);
    beak.rotation.x = 0.3;
    group.add(beak);

    // Left and Right wing wings
    const wingL = new THREE.Mesh(createRoundedBlockGeometry(0.16, 0.74, 0.44, 0.06), primaryMat);
    wingL.position.set(-0.58, 0.72, 0.05);
    wingL.rotation.z = 0.12;
    group.add(wingL);

    const wingR = wingL.clone();
    wingR.position.x = 0.58;
    wingR.rotation.z = -0.12;
    group.add(wingR);

    // Owl Horn tufts
    const tuftL = new THREE.Mesh(createRoundedBlockGeometry(0.2, 0.2, 0.2, 0.04), primaryMat);
    tuftL.position.set(-0.35, 1.45, 0.1);
    group.add(tuftL);

    const tuftR = tuftL.clone();
    tuftR.position.x = 0.35;
    group.add(tuftR);

    // Small orange talons
    const footL = new THREE.Mesh(createRoundedBlockGeometry(0.25, 0.12, 0.34, 0.04), accentMat);
    footL.position.set(-0.24, 0.06, 0.14);
    group.add(footL);

    const footR = footL.clone();
    footR.position.x = 0.24;
    group.add(footR);

  } else if (isFrog) {
    // 🐸 Wide Frog Assemble
    // Flat wide body
    const body = new THREE.Mesh(createRoundedBlockGeometry(1.22, 0.95, 0.88, 0.28), primaryMat);
    body.position.y = 0.58;
    body.castShadow = true;
    group.add(body);

    // Throat sac throat definition
    const sac = new THREE.Mesh(createRoundedBlockGeometry(0.86, 0.52, 0.48, 0.12), secondaryMat);
    sac.position.set(0, 0.44, 0.3);
    group.add(sac);

    // Bulging eyes on top
    const eyeRingL = new THREE.Mesh(createRoundedBlockGeometry(0.28, 0.28, 0.28, 0.08), primaryMat);
    eyeRingL.position.set(-0.28, 1.04, 0.16);
    group.add(eyeRingL);

    const eyeRingR = eyeRingL.clone();
    eyeRingR.position.x = 0.28;
    group.add(eyeRingR);

    const whiteL = new THREE.Mesh(createRoundedBlockGeometry(0.18, 0.18, 0.04, 0.06), secondaryMat);
    whiteL.position.set(-0.28, 1.04, 0.3);
    group.add(whiteL);

    const whiteR = whiteL.clone();
    whiteR.position.x = 0.28;
    group.add(whiteR);

    const eyeBallL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.02), darkEyeMat);
    eyeBallL.position.set(-0.28, 1.04, 0.32);
    group.add(eyeBallL);

    const eyeBallR = eyeBallL.clone();
    eyeBallR.position.x = 0.28;
    group.add(eyeBallR);

    // Golden buttercup aesthetic tiny crown on top
    const crown = new THREE.Mesh(createRoundedBlockGeometry(0.22, 0.14, 0.22, 0.03), accentMat);
    crown.position.set(0, 1.12, 0.06);
    group.add(crown);

    // Large cheerful cheeks buttons
    const cheekL = new THREE.Mesh(createRoundedBlockGeometry(0.14, 0.08, 0.02, 0.03), blushMat);
    cheekL.position.set(-0.42, 0.64, 0.42);
    group.add(cheekL);

    const cheekR = cheekL.clone();
    cheekR.position.x = 0.42;
    group.add(cheekR);

    // Webbed feet
    const footL = new THREE.Mesh(createRoundedBlockGeometry(0.36, 0.12, 0.46, 0.04), primaryMat);
    footL.position.set(-0.35, 0.06, 0.22);
    group.add(footL);

    const footR = footL.clone();
    footR.position.x = 0.35;
    group.add(footR);

  } else {
    // 🦙 Classic Dev Skin: Black Llama
    // Cylinder-block body segment
    const body = new THREE.Mesh(createRoundedBlockGeometry(1.02, 1.12, 0.68, 0.16), primaryMat);
    body.position.y = 0.74;
    body.castShadow = true;
    group.add(body);

    const neck = new THREE.Mesh(createRoundedBlockGeometry(0.52, 0.86, 0.48, 0.08), primaryMat);
    neck.position.set(0, 1.48, 0.12);
    neck.castShadow = true;
    group.add(neck);

    const head = new THREE.Mesh(createRoundedBlockGeometry(1.08, 0.82, 0.84, 0.18), primaryMat);
    head.position.set(0, 1.83, 0.2);
    head.castShadow = true;
    group.add(head);

    // Faceplate muzzle
    const face = new THREE.Mesh(createRoundedBlockGeometry(0.76, 0.42, 0.045, 0.08), secondaryMat);
    face.position.set(0, 1.76, 0.632);
    group.add(face);

    // Dark square eyes
    const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.026), darkEyeMat);
    eyeL.position.set(-0.2, 1.82, 0.665);
    group.add(eyeL);

    const eyeR = eyeL.clone();
    eyeR.position.x = 0.2;
    group.add(eyeR);

    const cheekL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.045, 0.026), blushMat);
    cheekL.position.set(-0.34, 1.69, 0.66);
    group.add(cheekL);

    const cheekR = cheekL.clone();
    cheekR.position.x = 0.34;
    group.add(cheekR);

    // Standing alert ears
    const earL = new THREE.Mesh(createRoundedBlockGeometry(0.18, 0.36, 0.18, 0.04), primaryMat);
    earL.position.set(-0.42, 2.30, 0.1);
    earL.rotation.z = 0.25;
    group.add(earL);

    const earR = earL.clone();
    earR.position.x = 0.42;
    earR.rotation.z = -0.25;
    group.add(earR);

    // Styled Cozy Scarf
    const scarf = new THREE.Mesh(createRoundedBlockGeometry(1.18, 0.18, 0.78, 0.06), accentMat);
    scarf.position.set(0, 1.13, 0.16);
    scarf.castShadow = true;
    group.add(scarf);

    // Hanging feet legs
    const footL = new THREE.Mesh(createRoundedBlockGeometry(0.32, 0.23, 0.44, 0.06), primaryMat);
    footL.position.set(-0.28, 0.115, 0.08);
    footL.castShadow = true;
    group.add(footL);

    const footR = footL.clone();
    footR.position.x = 0.28;
    group.add(footR);
  }

  return group;
}

function createLocalCharacter() {
  localPlayerMesh = new THREE.Group();
  
  // Outer animal layout wrapper
  const animalGroup = assembleAnimalModel(localPlayerSkin);
  localPlayerMesh.add(animalGroup);

  localPlayerMesh.position.set(worldConfig.spawn.x, worldConfig.spawn.y, worldConfig.spawn.z);
  localPlayerMesh.rotation.y = localPlayerYaw;

  scene.add(localPlayerMesh);

  // Soft circle ambient shadow blob
  const shadowGeo = new THREE.CircleGeometry(0.82, 32);
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x0f172a, transparent: true, opacity: 0.12, depthWrite: false });
  shadowBlob = new THREE.Mesh(shadowGeo, shadowMat);
  shadowBlob.rotation.x = -Math.PI / 2;
  shadowBlob.position.y = 0.015;
  scene.add(shadowBlob);

  // Selector Ring that rotates relative to the active movement
  const ringGeo = new THREE.RingGeometry(0.52, 0.62, 32);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x06b6d4, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
  targetRing = new THREE.Mesh(ringGeo, ringMat);
  targetRing.rotation.x = -Math.PI / 2;
  targetRing.position.y = 0.018;
  scene.add(targetRing);
}

// --- SWEET SOUND ENGINE PIPELINES ---
function playWoodClick(type = 'snap') {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;
    
    if (type === 'bell') {
      // Harmonic 5-key bell
      const freqs = [180, 220, 280, 310, 440];
      const master = ctx.createGain();
      master.gain.setValueAtTime(0.08, now);
      master.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
      master.connect(ctx.destination);

      freqs.forEach((freq) => {
        const osc = ctx.createOscillator();
        osc.frequency.setValueAtTime(freq, now);
        osc.connect(master);
        osc.start(now);
        osc.stop(now + 1.3);
      });
    } else {
      // Solid wood block sound
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(type === 'remove' ? 180 : 360, now);
      osc.frequency.exponentialRampToValueAtTime(80, now + 0.06);

      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.08);
    }
  } catch (_) {}
}

// --- BUILD GRID ALIGNMENT MATRICES (Raycasting & Placement) ---
let gridCursor = null;
const raycaster = new THREE.Raycaster();
const mouseScreenPos = new THREE.Vector2();

function createGridCursor() {
  if (gridCursor) return;
  const geometry = new THREE.BoxGeometry(1.0, 1.0, 1.0);
  const material = new THREE.MeshBasicMaterial({
    color: 0x06b6d4,
    transparent: true,
    opacity: 0.35,
    wireframe: false
  });
  gridCursor = new THREE.Mesh(geometry, material);
  gridCursor.visible = false;
  scene.add(gridCursor);
}

function updateGridCursorIntersection(event) {
  if (!isBuildMode) {
    if (gridCursor) gridCursor.visible = false;
    return;
  }

  // Handle multitouch client safety coordinates
  let x = event.clientX;
  let y = event.clientY;
  if (event.touches?.length > 0) {
    x = event.touches[0].clientX;
    y = event.touches[0].clientY;
  }

  mouseScreenPos.x = (x / window.innerWidth) * 2 - 1;
  mouseScreenPos.y = -(y / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouseScreenPos, camera);

  // Intersect against floor platform
  const intersects = raycaster.intersectObject(worldGridFloor);
  
  if (intersects.length > 0) {
    const point = intersects[0].point;
    
    // Snaps coordinate grid positions to cleanly rounded indices (1.0 grid size blocks)
    const blockX = Math.round(point.x);
    const blockZ = Math.round(point.z);
    const blockY = 0.5; // Raised block center

    createGridCursor();
    gridCursor.position.set(blockX, blockY, blockZ);
    gridCursor.visible = true;

    // Adjust color indicator reflecting placement boundary constraints
    const canBuild = Math.abs(blockX) <= STAGE_BOUND && Math.abs(blockZ) <= STAGE_BOUND;
    gridCursor.material.color.setHex(canBuild ? 0x06b6d4 : 0xef4444);
  } else {
    if (gridCursor) gridCursor.visible = false;
  }
}

function handleSceneSelectionClick(event) {
  if (!isBuildMode) return;
  
  // Guard clicks inside HUD containers (such as bottom bar buttons and side slide drawers)
  if (event.target.closest('#shell') || event.target.closest('#controls')) return;

  raycaster.setFromCamera(mouseScreenPos, camera);

  // Check block deletion/remove selection
  const blocksList = Array.from(activeBlocks.values());
  const blockIntersects = raycaster.intersectObjects(blocksList);

  if (blockIntersects.length > 0) {
    // Prioritize clicking on a block for deletion over ground placements
    const hitObj = blockIntersects[0].object;
    const hitId = hitObj.userData?.id;
    if (hitId) {
      removeSandboxBlock(hitId);
      return;
    }
  }

  // Otherwise, place block on computed floor coordinate snaps
  const floorIntersects = raycaster.intersectObject(worldGridFloor);
  if (floorIntersects.length > 0) {
    const point = floorIntersects[0].point;
    const bx = Math.round(point.x);
    const bz = Math.round(point.z);

    if (Math.abs(bx) <= STAGE_BOUND && Math.abs(bz) <= STAGE_BOUND) {
      placeSandboxBlock(bx, bz, selectedMaterial);
    }
  }
}

// --- SANDBOX PLACE & DELETE METHODS ---
function placeSandboxBlock(x, z, matType) {
  const newId = 'blk_' + Math.random().toString(36).substring(2, 9);
  const position = [x, 0.5, z];
  const size = [1.0, 1.0, 1.0];

  // Instantly place inside client cache representation
  const objSpec = { id: newId, type: 'block', position, size, material: matType };
  
  // Compile rounded mesh
  const geo = createRoundedBlockGeometry(1.0, 1.0, 1.0, 0.14);
  const mat = getSharedMaterial(matType);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, 0.5, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData = { id: newId, material: matType, size };

  scene.add(mesh);
  activeBlocks.set(newId, mesh);

  // Register spatial bounds
  colliderBoxes.push({ id: newId, minX: x - 0.5, maxX: x + 0.5, minZ: z - 0.5, maxZ: z + 0.5 });
  playWoodClick('place');

  // Push updates over Websocket to other online connected players
  if (isSocketOnline && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'placeObject',
      id: newId,
      objType: 'block',
      position,
      size,
      material: matType
    }));
  }
}

function removeSandboxBlock(blockId) {
  const mesh = activeBlocks.get(blockId);
  if (!mesh) return;

  scene.remove(mesh);
  activeBlocks.delete(blockId);

  // Remove corresponding bound indices
  const boundsIdx = colliderBoxes.findIndex(c => c.id === blockId);
  if (boundsIdx !== -1) colliderBoxes.splice(boundsIdx, 1);

  playWoodClick('remove');

  // Sync delete request over websocket
  if (isSocketOnline && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'removeObject',
      id: blockId
    }));
  }
}

// --- STAGES SAVE AND RESTORES ---
function saveLayoutToLocalStorage() {
  const list = [];
  activeBlocks.forEach((mesh, id) => {
    list.push({
      id,
      type: 'block',
      position: [mesh.position.x, mesh.position.y, mesh.position.z],
      size: mesh.userData.size,
      material: mesh.userData.material
    });
  });

  localStorage.setItem('minimmo.home.v0.1', JSON.stringify(list));
  playWoodClick('bell');
}

function loadLayoutFromLocalStorage() {
  const saved = localStorage.getItem('minimmo.home.v0.1');
  if (!saved) return;
  try {
    const list = JSON.parse(saved);
    buildWorldObjects(list);
    playWoodClick('bell');
  } catch (err) {
    console.warn('Backup reload failed:', err);
  }
}

// --- COLLISION LOOPS ---
function resolveCharacterCollisions(posRef, radius = COLLIDER_RADIUS) {
  for (const box of colliderBoxes) {
    if (posRef.x + radius > box.minX && posRef.x - radius < box.maxX &&
        posRef.z + radius > box.minZ && posRef.z - radius < box.maxZ) {
      
      const pushL = (posRef.x + radius) - box.minX;
      const pushR = box.maxX - (posRef.x - radius);
      const pushT = (posRef.z + radius) - box.minZ;
      const pushB = box.maxZ - (posRef.z - radius);

      const minVal = Math.min(pushL, pushR, pushT, pushB);

      if (minVal === pushL) {
        posRef.x -= pushL;
        localVelocity.x = Math.min(0, localVelocity.x);
      } else if (minVal === pushR) {
        posRef.x += pushR;
        localVelocity.x = Math.max(0, localVelocity.x);
      } else if (minVal === pushT) {
        posRef.z -= pushT;
        localVelocity.z = Math.min(0, localVelocity.z);
      } else {
        posRef.z += pushB;
        localVelocity.z = Math.max(0, localVelocity.z);
      }
    }
  }
}

// --- ANIMATION / GAME LOOP ---
function animateScene() {
  requestAnimationFrame(animateScene);

  const dt = Math.min(clock.getDelta(), 0.033);

  // 1. Process movement inputs
  updateMovement(dt);

  // 2. Linear interpolate remote players coordinate frames
  interpolateRemotePlayers(dt);

  // 3. Keep HUD overlays, names, and speech bubbles mapped onto correct 2D viewport coordinates
  projectHeadHUDs();

  renderer.render(scene, camera);
}

function updateMovement(dt) {
  // Translate camera plane projection relative to isometric movement targets
  const camFwd = new THREE.Vector3(1, 0, 1).normalize();
  const camRight = new THREE.Vector3(1, 0, -1).normalize();

  let xInput = 0;
  let zInput = 0;

  if (keys['KeyW'] || keys['ArrowUp']) zInput += 1;
  if (keys['KeyS'] || keys['ArrowDown']) zInput -= 1;
  if (keys['KeyA'] || keys['ArrowLeft']) xInput -= 1;
  if (keys['KeyD'] || keys['ArrowRight']) xInput += 1;

  // Append joystick vector weights
  xInput += joystick.x;
  zInput += joystick.y;

  const vector = new THREE.Vector2(xInput, zInput);
  if (vector.length() > 1) vector.normalize();

  const moveDir = new THREE.Vector3();
  moveDir.addScaledVector(camRight, vector.x);
  moveDir.addScaledVector(camFwd, vector.y);

  const maxSpeed = 5.6;
  const accel = 16;
  const friction = 15;

  const targetVX = moveDir.x * maxSpeed;
  const targetVZ = moveDir.z * maxSpeed;

  if (vector.lengthSq() > 0.001) {
    localVelocity.x = lerp(localVelocity.x, targetVX, 1 - Math.exp(-accel * dt));
    localVelocity.z = lerp(localVelocity.z, targetVZ, 1 - Math.exp(-accel * dt));
    localPlayerYaw = Math.atan2(localVelocity.x, localVelocity.z);
  } else {
    localVelocity.x = lerp(localVelocity.x, 0, 1 - Math.exp(-friction * dt));
    localVelocity.z = lerp(localVelocity.z, 0, 1 - Math.exp(-friction * dt));
  }

  const nextPos = new THREE.Vector3(
    localPlayerMesh.position.x + localVelocity.x * dt,
    0.1,
    localPlayerMesh.position.z + localVelocity.z * dt
  );

  // Slide collisions
  resolveCharacterCollisions(nextPos);

  // Wall boundaries clamp
  localPlayerMesh.position.x = clamp(nextPos.x, -STAGE_BOUND, STAGE_BOUND);
  localPlayerMesh.position.z = clamp(nextPos.z, -STAGE_BOUND, STAGE_BOUND);

  // Dampen facing yaw rotation
  localPlayerMesh.rotation.y = angleLerp(localPlayerMesh.rotation.y, localPlayerYaw, 1 - Math.exp(-15 * dt));

  // Visual walking bounce bobs based on current rate of speed
  const speed = Math.hypot(localVelocity.x, localVelocity.z);
  const scaleTick = Math.sin(performance.now() * 0.013) * Math.min(speed / maxSpeed, 1.0);
  
  const meshGroup = localPlayerMesh.children[0];
  if (meshGroup) {
    localPlayerMesh.position.y = 0.1 + Math.abs(scaleTick) * 0.05;
    meshGroup.scale.set(
      1 - Math.abs(scaleTick) * 0.02,
      1 + Math.abs(scaleTick) * 0.04,
      1 - Math.abs(scaleTick) * 0.02
    );
  }

  // Update target indicators and shadow elements
  shadowBlob.position.set(localPlayerMesh.position.x, 0.015, localPlayerMesh.position.z);
  targetRing.position.set(localPlayerMesh.position.x, 0.018, localPlayerMesh.position.z);
  targetRing.rotation.z += dt * 1.15; // Slow rotation spin

  // Sync Camera Rig position smoothly
  const targetCam = localPlayerMesh.position.clone();
  const offset = new THREE.Vector3(-12.5, 13.5, -12.5); // Classic clean view offset
  camera.position.lerp(targetCam.clone().add(offset), 1 - Math.exp(-7.2 * dt));
  camera.lookAt(targetCam.x, targetCam.y + 0.64, targetCam.z);

  // Throttle transmit client coordinate sweeps at 15Hz to protect band limits
  throttleTransmitState();
}

// --- THROTLED TRANSMISSION ---
let lastSendTime = 0;
function throttleTransmitState() {
  if (!isSocketOnline || ws.readyState !== WebSocket.OPEN) return;
  const now = performance.now();
  if (now - lastSendTime < 66) return; // ~15 FPS sweeps
  lastSendTime = now;

  ws.send(JSON.stringify({
    type: 'playerState',
    x: localPlayerMesh.position.x,
    y: localPlayerMesh.position.y,
    z: localPlayerMesh.position.z,
    yaw: localPlayerYaw
  }));
}

// --- REMOTE PLAYERS MANAGER ---
class RemotePlayerInstance {
  constructor(id, name, skin) {
    this.id = id;
    this.name = name;
    this.skin = skin;
    
    // Smooth targets
    this.targetPos = new THREE.Vector3();
    this.targetYaw = 0;
    this.currentYaw = 0;

    // Build model Group
    this.mesh = new THREE.Group();
    const model = assembleAnimalModel(skin);
    this.mesh.add(model);
    scene.add(this.mesh);

    // Bouncing walk timer
    this.walkTicks = 0;

    // Create DOM element speech / name banners overlay
    this.hudElement = document.createElement('div');
    this.hudElement.className = 'remote-hud-banner';
    this.hudElement.style.position = 'absolute';
    this.hudElement.style.pointerEvents = 'none';
    this.hudElement.style.transform = 'translate(-50%, -100%)';
    this.hudElement.style.zIndex = '8';

    this.hudElement.innerHTML = `
      <div class="hud-bubble" style="display:none; transition: opacity 0.2s; font-family: inherit; font-size:11px; font-weight:500; background:white; color:#0f172a; padding:6px 12px; border-radius:12px; margin-bottom:5px; border:1px solid #e2e8f0; border-radius:12px; box-shadow:0 8px 16px rgba(0,0,0,0.06); filter: drop-shadow(0 2px 4px rgba(0,0,0,0.04)); white-space:nowrap;"></div>
      <div class="hud-name" style="font-family: inherit; font-size:9.5px; font-weight:700; color:white; background:rgba(30,41,59,0.72); padding:3px 9px; border-radius:99px; text-transform:uppercase; tracking:0.04em; white-space:nowrap; text-shadow:0 1px 1px rgba(0,0,0,0.1); border: 0.5px solid rgba(255,255,255,0.155);"><span style="margin-right:3px;">🎨</span>${name}</div>
    `;
    document.body.appendChild(this.hudElement);
    this.bubbleTimer = null;
  }

  setUpdate(x, y, z, yaw) {
    this.targetPos.set(x, y, z);
    this.targetYaw = yaw;
  }

  showBubble(text) {
    const b = this.hudElement.querySelector('.hud-bubble');
    if (!b) return;
    b.textContent = text;
    b.style.display = 'block';
    
    if (this.bubbleTimer) clearTimeout(this.bubbleTimer);
    this.bubbleTimer = setTimeout(() => {
      b.style.display = 'none';
    }, 4500);
  }

  destroy() {
    scene.remove(this.mesh);
    if (this.hudElement && this.hudElement.parentNode) {
      this.hudElement.parentNode.removeChild(this.hudElement);
    }
    if (this.bubbleTimer) clearTimeout(this.bubbleTimer);
  }
}

function interpolateRemotePlayers(dt) {
  localPlayers.forEach((p) => {
    // Smooth vector linear interpolations
    const lerpWeight = 11 * dt;
    p.mesh.position.lerp(p.targetPos, lerpWeight);
    
    p.mesh.rotation.y = angleLerp(p.mesh.rotation.y, p.targetYaw, lerpWeight);

    // Simulate cute walk bobs based on change speed rate
    const dPos = p.mesh.position.distanceTo(p.targetPos);
    if (dPos > 0.05) {
      p.walkTicks += dt * 14;
      const bobY = Math.abs(Math.sin(p.walkTicks)) * 0.045;
      const scaleS = Math.sin(p.walkTicks) * 0.04;
      
      p.mesh.children[0].scale.set(1 - Math.abs(scaleS) * 0.02, 1 + Math.abs(scaleS) * 0.04, 1 - Math.abs(scaleS) * 0.02);
      p.mesh.position.y = p.targetPos.y + bobY;
    } else {
      p.mesh.children[0].scale.set(1, 1, 1);
      p.mesh.position.y = lerp(p.mesh.position.y, p.targetPos.y, 4 * dt);
    }
  });
}

function clearRemotePlayers() {
  localPlayers.forEach(p => p.destroy());
  localPlayers.clear();
}

// --- PROJECT HUD BANNER OVERLAYS ---
// Transforms 3D coordinate vectors onto 2D display coordinates 
const tempVec = new THREE.Vector3();
function projectHeadHUDs() {
  // Update local chat bubble
  if (localHudElement && localPlayerMesh) {
    tempVec.set(localPlayerMesh.position.x, localPlayerMesh.position.y + 2.1, localPlayerMesh.position.z);
    tempVec.project(camera);

    const x = (tempVec.x * .5 + .5) * window.innerWidth;
    const y = (-(tempVec.y * .5) + .5) * window.innerHeight;

    localHudElement.style.left = `${x}px`;
    localHudElement.style.top = `${y}px`;
  }

  // Update outer players overlays
  localPlayers.forEach((p) => {
    tempVec.set(p.mesh.position.x, p.mesh.position.y + 2.1, p.mesh.position.z);
    tempVec.project(camera);

    const x = (tempVec.x * .5 + .5) * window.innerWidth;
    const y = (-(tempVec.y * .5) + .5) * window.innerHeight;

    p.hudElement.style.left = `${x}px`;
    p.hudElement.style.top = `${y}px`;
  });
}

// --- NETWORK MESSAGES RESOLUTIONS ---
function handleServerMessage(data) {
  switch (data.type) {
    case 'welcome': {
      console.log(`Multiclient registered. ID assigned: ${data.id}`);
      localPlayerId = data.id;
      
      // Update our world layout matching server list (if any items updated globally)
      if (data.objects) {
        buildWorldObjects(data.objects);
      }
      break;
    }

    case 'snapshot': {
      // Synchronize list frames of active multiplayer peers
      const serverPlayersIds = new Set();
      
      data.players.forEach((pData) => {
        if (pData.id === localPlayerId) return; // Skip local mirror frame
        serverPlayersIds.add(pData.id);

        if (!localPlayers.has(pData.id)) {
          // Construct player dynamic instance
          const remPlayer = new RemotePlayerInstance(pData.id, pData.name, pData.skin);
          localPlayers.set(pData.id, remPlayer);
          pData.y = 0.1;
          remPlayer.mesh.position.set(pData.x, pData.y, pData.z);
          remPlayer.setUpdate(pData.x, pData.y, pData.z, pData.yaw);
        } else {
          // Update targets
          const pInstance = localPlayers.get(pData.id);
          pInstance.setUpdate(pData.x, pData.y, pData.z, pData.yaw);
          
          if (pInstance.skin !== pData.skin) {
            // Rebuild model in case other player changed their animal type
            pInstance.skin = pData.skin;
            pInstance.mesh.remove(pInstance.mesh.children[0]);
            pInstance.mesh.add(assembleAnimalModel(pData.skin));
          }
        }
      });

      // Erase dead records that exited or timed out
      localPlayers.forEach((inst, id) => {
        if (!serverPlayersIds.has(id)) {
          inst.destroy();
          localPlayers.delete(id);
        }
      });
      break;
    }

    case 'chat': {
      appendChatMessage(data.name, data.text);
      
      // Trigger character chat speech bubbles overlay
      if (data.id === localPlayerId) {
        showLocalChatBubble(data.text);
      } else {
        const rem = localPlayers.get(data.id);
        if (rem) rem.showBubble(data.text);
      }
      break;
    }

    case 'objectAdded': {
      const obj = data.object;
      if (activeBlocks.has(obj.id)) return; // Already rendered locally

      const [w, h, d] = obj.size;
      const [x, y, z] = obj.position;

      const geo = createRoundedBlockGeometry(w, h, d, 0.15);
      const mat = getSharedMaterial(obj.material);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData = { id: obj.id, material: obj.material, size: obj.size };

      scene.add(mesh);
      activeBlocks.set(obj.id, mesh);

      colliderBoxes.push({
        id: obj.id,
        minX: x - w/2,
        maxX: x + w/2,
        minZ: z - d/2,
        maxZ: z + d/2
      });
      
      playWoodClick('place');
      break;
    }

    case 'objectRemoved': {
      const blockId = data.id;
      const mesh = activeBlocks.get(blockId);
      if (!mesh) return;

      scene.remove(mesh);
      activeBlocks.delete(blockId);

      const colliderIdx = colliderBoxes.findIndex(c => c.id === blockId);
      if (colliderIdx !== -1) colliderBoxes.splice(colliderIdx, 1);

      playWoodClick('remove');
      break;
    }

    case 'system': {
      appendChatMessage('SYSTEM', data.message || data.error || 'System event triggered');
      break;
    }

    default:
      break;
  }
}

// --- CORE USER INTERFACES & INPUT ROUTERS ---
let localHudElement = null;
let localBubbleTimer = null;

function showLocalChatBubble(text) {
  const b = localHudElement.querySelector('.hud-bubble');
  if (!b) return;
  b.textContent = text;
  b.style.display = 'block';

  if (localBubbleTimer) clearTimeout(localBubbleTimer);
  localBubbleTimer = setTimeout(() => {
    b.style.display = 'none';
  }, 4500);
}

function initLocalHUD() {
  localHudElement = document.createElement('div');
  localHudElement.id = 'local-player-hud';
  localHudElement.style.position = 'absolute';
  localHudElement.style.pointerEvents = 'none';
  localHudElement.style.transform = 'translate(-50%, -100%)';
  localHudElement.style.zIndex = '9';

  localHudElement.innerHTML = `
    <div class="hud-bubble" style="display:none; transition: opacity 0.2s; font-family: inherit; font-size:11px; font-weight:500; background:white; color:#0f172a; padding:6px 12px; border-radius:12px; margin-bottom:5px; border:1px solid #e2e8f0; box-shadow:0 8px 16px rgba(0,0,0,0.06); filter: drop-shadow(0 2px 4px rgba(0,0,0,0.04)); white-space:nowrap;"></div>
    <div class="hud-name" style="font-family: inherit; font-size:9.5px; font-weight:700; color:#06b6d4; background:white; padding:3px 9px; border-radius:99px; text-transform:uppercase; tracking:0.04em; white-space:nowrap; border:0.5px solid #06b6d4; box-shadow:0 3px 8px rgba(6,182,212,0.155);"><span style="margin-right:3px;">⭐</span>YOU</div>
  `;
  document.body.appendChild(localHudElement);
}

function initUserInterface() {
  // Setup inputs hooks
  window.addEventListener('keydown', e => keys[e.code] = true);
  window.addEventListener('keyup', e => keys[e.code] = false);

  // Initialize your HUD overlays
  initLocalHUD();

  // Drawers setup
  const sidePanel = document.getElementById('sidePanel');
  const tabPanel = document.getElementById('tabPanel');
  const closeMenu = document.getElementById('closeMenu');
  const closePanel = document.getElementById('closePanel');
  const hamburger = document.getElementById('hamburger');

  hamburger.onclick = () => {
    sidePanel.classList.toggle('open');
    tabPanel.classList.remove('open');
    playWoodClick('snap');
  };

  closeMenu.onclick = () => {
    sidePanel.classList.remove('open');
    playWoodClick('snap');
  };

  closePanel.onclick = () => {
    tabPanel.classList.remove('open');
    playWoodClick('snap');
  };

  // Menu button triggers
  document.getElementById('saveHome').onclick = () => {
    saveLayoutToLocalStorage();
    appendChatMessage('SYSTEM', 'Home coordinates saved safely on your client storage!');
    sidePanel.classList.remove('open');
  };

  document.getElementById('loadHome').onclick = () => {
    loadLayoutFromLocalStorage();
    appendChatMessage('SYSTEM', 'Sandbox layout rebuilt from your local cache backup.');
    sidePanel.classList.remove('open');
  };

  document.getElementById('inviteFriends').onclick = () => {
    navigator.clipboard.writeText(window.location.href);
    appendChatMessage('SYSTEM', 'Minimmo invite link copied to your clipboard!');
    sidePanel.classList.remove('open');
    playWoodClick('bell');
  };

  document.getElementById('resetCam').onclick = () => {
    localPlayerMesh.position.set(0, 0.1, 0);
    localVelocity = { x: 0, z: 0 };
    appendChatMessage('SYSTEM', 'Camera coordinate frames recentered.');
    sidePanel.classList.remove('open');
    playWoodClick('snap');
  };

  // Sound and click feedback on generic items
  document.querySelectorAll('.menuItem').forEach(btn => {
    if (btn.id !== 'saveHome' && btn.id !== 'loadHome' && btn.id !== 'inviteFriends' && btn.id !== 'resetCam') {
      btn.onclick = () => playWoodClick('snap');
    }
  });

  // Nav buttons tab configurations
  document.querySelectorAll('.navBtn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.navBtn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      switchTab(btn.dataset.tab);
      playWoodClick('snap');
    };
  });

  // Material and Skin custom layouts builder loaders
  switchTab('home');

  // Multi-touch Analog Stick Zone listeners
  bindTactileJoystick();

  // Chat bar submissions
  const chatInput = document.getElementById('chatInput');
  const chatSend = document.getElementById('chatSend');

  const submitChatMsg = () => {
    const text = chatInput.value.trim();
    if (!text) return;
    
    // Send message to Server
    if (isSocketOnline && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'chat',
        text: text
      }));
    } else {
      // Local fallback mode chat
      appendChatMessage(localPlayerName, text);
      showLocalChatBubble(text);
    }
    chatInput.value = '';
  };

  chatSend.onclick = submitChatMsg;
  chatInput.onkeydown = (e) => {
    if (e.code === 'Enter') {
      submitChatMsg();
    }
  };

  // Wire mouse and touch movements across canvas target areas
  window.addEventListener('mousemove', updateGridCursorIntersection);
  window.addEventListener('click', handleSceneSelectionClick);
  // Ensure passive touch listener for better performance
  window.addEventListener('touchmove', updateGridCursorIntersection, { passive: true });
}

function switchTab(tabId) {
  const name = document.getElementById('panelName');
  const body = document.getElementById('panelBody');
  const content = document.getElementById('tabContent');
  const actionButton = document.getElementById('action');

  const sidePanel = document.getElementById('sidePanel');
  sidePanel.classList.remove('open');

  // Default close up action button unless Create list is requested
  actionButton.classList.remove('active');
  isBuildMode = false;
  if (gridCursor) gridCursor.visible = false;

  const tabPanel = document.getElementById('tabPanel');

  switch (tabId) {
    case 'home':
      name.textContent = 'Minimmo Sandbox space';
      body.textContent = 'Welcome back! Move around using virtual or keyboard WASD controllers. Customize, place blocks in the build section, or adjust skins.';
      content.innerHTML = '';
      tabPanel.classList.add('open');
      break;

    case 'discover':
      name.textContent = 'Discover Spaces // 探検';
      body.textContent = 'MMO public servers and private client worlds browser. Select standard spaces created by other developers in upcoming revisions.';
      content.innerHTML = `
        <div style="background: rgba(255,255,255,0.25); border: 1px solid var(--glass-line); border-radius: 16px; padding: 14px; margin-top: 12px; display: grid; gap: 8px;">
          <div style="font-size: 13px; font-weight: 700; color: #0891b2;">🚀 Central persistent MMO world</div>
          <div style="font-size: 11px; color: var(--muted); line-height: 1.3;">A global common where customizable animals gather, trade assets, host social parties, and access massive custom dungeons. Available in Phase 2.</div>
        </div>
      `;
      tabPanel.classList.add('open');
      break;

    case 'create':
      isBuildMode = true;
      actionButton.classList.add('active'); // Action button represents delete
      actionButton.textContent = 'DELETE';
      name.textContent = 'Build System // 創造';
      body.textContent = 'Tap blocks in the scene to demolish/delete them, or click on grid floor tiles to spawn blocks. Select a build texture theme:';
      
      const bubblesHTML = Object.keys(materialPalette).map((key) => {
        const hex = materialPalette[key].hex;
        const activeClass = selectedMaterial === key ? 'active' : '';
        return `
          <div class="matBubble ${activeClass}" data-mat="${key}">
            <span style="background-color: ${hex};"></span>
          </div>
        `;
      }).join('');

      content.innerHTML = `
        <div style="font-weight: 700; font-size: 11px; color: var(--muted); text-transform: uppercase margin-bottom: 6px;">SELECT MATERIAL:</div>
        <div id="materialPicker">${bubblesHTML}</div>
      `;

      // Assign click triggers onto material options
      setTimeout(() => {
        const bubbles = content.querySelectorAll('.matBubble');
        bubbles.forEach((b) => {
          b.onclick = () => {
            bubbles.forEach(x => x.classList.remove('active'));
            b.classList.add('active');
            selectedMaterial = b.dataset.mat;
            playWoodClick('snap');
          };
        });
      }, 50);

      tabPanel.classList.add('open');
      break;

    case 'avatar':
      name.textContent = 'Animal Generator // アバター';
      body.textContent = 'Assemble cute Low-Poly animal avatars using the multi-choice parts generator below:';
      
      const animals = [
        { id: 'llama', icon: '🦙', name: 'Dev Llama' },
        { id: 'whale', icon: '🐳', name: 'Whale' },
        { id: 'panda', icon: '🐼', name: 'Panda' },
        { id: 'owl', icon: '🦉', name: 'Owl' },
        { id: 'frog', icon: '🐸', name: 'Frog' }
      ];

      const skinItemsHTML = animals.map((a) => {
        const activeClass = localPlayerSkin === a.id ? 'active' : '';
        return `
          <div class="skinItem ${activeClass}" data-skin="${a.id}">
            <div>${a.icon}</div>
            <span>${a.name}</span>
          </div>
        `;
      }).join('');

      content.innerHTML = `
        <div id="skinPicker">${skinItemsHTML}</div>
      `;

      // Assign click handlers
      setTimeout(() => {
        const items = content.querySelectorAll('.skinItem');
        items.forEach((item) => {
          item.onclick = () => {
            items.forEach(x => x.classList.remove('active'));
            item.classList.add('active');
            
            const chosen = item.dataset.skin;
            localPlayerSkin = chosen;
            
            // Rebuild local mesh representation
            localPlayerMesh.remove(localPlayerMesh.children[0]);
            localPlayerMesh.add(assembleAnimalModel(chosen));

            playWoodClick('snap');

            // Send dynamic skin notifications up to WebSocket
            if (isSocketOnline && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: 'playerState',
                skin: localPlayerSkin
              }));
            }
          };
        });
      }, 50);

      tabPanel.classList.add('open');
      break;

    default:
      tabPanel.classList.remove('open');
      break;
  }
}

// --- CHAT MESSAGE APPENDER ---
function appendChatMessage(sender, text) {
  const box = document.getElementById('chatMessages');
  if (!box) return;

  const line = document.createElement('div');
  line.className = 'chatLine';
  
  if (sender === 'SYSTEM') {
    line.className = 'chatLine system';
    line.innerHTML = `<span>📢 ${text}</span>`;
  } else {
    // Escape standard code templates to prevent injection
    const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const labelHex = sender === localPlayerName ? '#06b6d4' : '#1e293b';
    line.innerHTML = `<strong style="color: ${labelHex}">${sender}:</strong> ${escaped}`;
  }

  box.appendChild(line);
  box.scrollTop = box.scrollHeight;
}

// --- STICKY TOUCH CONTROLS ---
const stickBase = document.getElementById('stickBase');
const stickKnob = document.getElementById('stickKnob');

function bindTactileJoystick() {
  const zone = document.getElementById('stickZone');

  zone.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0];
    joystick.active = true;
    joystick.id = t.identifier;
    joystick.startX = t.clientX;
    joystick.startY = t.clientY;

    stickBase.style.left = `${joystick.startX - 54}px`;
    stickBase.style.top = `${joystick.startY - 54}px`;
    stickBase.style.bottom = 'auto';
    stickBase.style.opacity = '1.0';
    stickBase.style.transform = 'scale(1.05)';

    e.preventDefault();
  }, { passive: false });

  zone.addEventListener('touchmove', (e) => {
    if (!joystick.active) return;
    for (const t of e.changedTouches) {
      if (t.identifier === joystick.id) {
        let dx = t.clientX - joystick.startX;
        let dy = t.clientY - joystick.startY;
        
        const limitRange = 36;
        const len = Math.hypot(dx, dy);

        if (len > limitRange) {
          dx = (dx / len) * limitRange;
          dy = (dy / len) * limitRange;
        }

        stickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
        
        // Feed normalized control axis outputs
        joystick.x = -dx / limitRange;
        joystick.y = -dy / limitRange;
      }
    }
    e.preventDefault();
  }, { passive: false });

  const endJoy = (e) => {
    if (!joystick.active) return;
    joystick.active = false;
    joystick.id = null;
    joystick.x = 0;
    joystick.y = 0;

    stickKnob.style.transform = 'translate(0px, 0px)';
    
    // Reset defaults position
    stickBase.style.left = '28px';
    stickBase.style.top = 'auto';
    stickBase.style.bottom = 'calc(96px + env(safe-area-inset-bottom))';
    stickBase.style.opacity = '0.65';
    stickBase.style.transform = 'scale(1)';
  };

  zone.addEventListener('touchend', endJoy, { passive: true });
  zone.addEventListener('touchcancel', endJoy, { passive: true });
}

// --- WINDOW SIZE UPDATER ---
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- HELPER WRAPPERS ---
function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function angleLerp(a, b, t) {
  const diff = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + diff * t;
}

function updateStatusIndicator(isOnline) {
  const status = document.getElementById('statusDot');
  if (!status) return;

  if (isOnline) {
    status.classList.remove('offline');
    status.title = 'Online Connected';
  } else {
    status.classList.add('offline');
    status.title = 'Offline Play Mode';
  }
}

// --- BOOT PROCESS CHOREOGRAPHER ---
window.addEventListener('DOMContentLoaded', async () => {
  await loadWorldConfig();
  bootEngine();
});
