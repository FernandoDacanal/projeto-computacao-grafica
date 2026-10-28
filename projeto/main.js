import * as THREE from 'three';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x080e16);
scene.fog = new THREE.FogExp2(0x080e16, 0.022);

const camera = new THREE.PerspectiveCamera(
  65,
  window.innerWidth / window.innerHeight,
  0.1,
  150
);

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.BasicShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
document.body.style.margin = '0';
document.body.style.overflow = 'hidden';
document.body.appendChild(renderer.domElement);

// ---------------------------------------------------------------
// Iluminação global
// ---------------------------------------------------------------
scene.add(new THREE.HemisphereLight(0x506080, 0x17130e, 1.0));

const moon = new THREE.DirectionalLight(0x9db9ff, 0.8);
moon.castShadow = true;
moon.shadow.mapSize.set(1024, 1024);
// CORREÇÃO: o frustum de sombra padrão é minúsculo (±5 unidades).
// Agora ele cobre a área ao redor do jogador e acompanha o personagem.
moon.shadow.camera.left = -30;
moon.shadow.camera.right = 30;
moon.shadow.camera.top = 30;
moon.shadow.camera.bottom = -30;
moon.shadow.camera.near = 1;
moon.shadow.camera.far = 80;
scene.add(moon);
scene.add(moon.target);
const moonOffset = new THREE.Vector3(-10, 20, 5);

// ---------------------------------------------------------------
// Materiais
// ---------------------------------------------------------------
const groundMat = new THREE.MeshStandardMaterial({
  color: 0x263b28,
  roughness: 1
});

const trunkMat = new THREE.MeshStandardMaterial({
  color: 0x493021,
  flatShading: true
});

const leavesMat = new THREE.MeshStandardMaterial({
  color: 0x142b20,
  flatShading: true
});

// ---------------------------------------------------------------
// Terreno
// ---------------------------------------------------------------
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(100, 100, 20, 20),
  groundMat
);

ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// ---------------------------------------------------------------
// Colisões (círculos no plano XZ)
// ---------------------------------------------------------------
const colliders = [];

// ---------------------------------------------------------------
// Árvores procedurais
// CORREÇÃO DE PERFORMANCE: antes eram ~270 árvores x 4 meshes
// (mais de 1000 objetos, todos projetando sombra na luz da fogueira).
// Agora usamos InstancedMesh: 4 draw calls no total.
// ---------------------------------------------------------------
const treeData = [];

function addTree(x, z, scale = 1) {
  treeData.push({ x, z, scale, yaw: Math.random() * Math.PI * 2 });
  // radius: colisão do jogador | camRadius/top: colisão da câmera (copa da árvore)
  colliders.push({
    x,
    z,
    radius: 0.65 * scale,
    camRadius: 1.3 * scale,
    top: 6.3 * scale
  });
}

// Árvores aleatórias, deixando espaço para o acampamento central
for (let i = 0; i < 180; i++) {
  const x = THREE.MathUtils.randFloatSpread(86);
  const z = THREE.MathUtils.randFloatSpread(86);

  if (Math.hypot(x, z) < 11) continue;

  addTree(x, z, THREE.MathUtils.randFloat(0.7, 1.5));
}

// Parede de árvores nas bordas
for (let i = -46; i <= 46; i += 4) {
  addTree(i, -47, 1.4);
  addTree(i, 47, 1.4);
  addTree(-47, i, 1.4);
  addTree(47, i, 1.4);
}

const trunkGeo = new THREE.CylinderGeometry(0.22, 0.38, 2.5, 5);
const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeData.length);
trunks.castShadow = true;
trunks.frustumCulled = false;

const leafLayers = [];
for (let i = 0; i < 3; i++) {
  const geo = new THREE.ConeGeometry(1.5 - i * 0.25, 2.5, 5);
  const layer = new THREE.InstancedMesh(geo, leavesMat, treeData.length);
  layer.castShadow = true;
  layer.frustumCulled = false;
  leafLayers.push(layer);
}

const dummy = new THREE.Object3D();

treeData.forEach((t, index) => {
  dummy.scale.setScalar(t.scale);

  dummy.position.set(t.x, 1.25 * t.scale, t.z);
  dummy.rotation.set(0, t.yaw, 0);
  dummy.updateMatrix();
  trunks.setMatrixAt(index, dummy.matrix);

  leafLayers.forEach((layer, i) => {
    dummy.position.set(t.x, (2.5 + i * 1.25) * t.scale, t.z);
    dummy.rotation.set(0, t.yaw + i * 0.7, 0);
    dummy.updateMatrix();
    layer.setMatrixAt(index, dummy.matrix);
  });
});

trunks.instanceMatrix.needsUpdate = true;
leafLayers.forEach((l) => (l.instanceMatrix.needsUpdate = true));

scene.add(trunks, ...leafLayers);

// ---------------------------------------------------------------
// Fogueira central
// ---------------------------------------------------------------
const fireGroup = new THREE.Group();
scene.add(fireGroup);

const woodMat = new THREE.MeshStandardMaterial({
  color: 0x533323
});

for (let i = 0; i < 4; i++) {
  const log = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.22, 2.2, 6),
    woodMat
  );

  log.rotation.z = Math.PI / 2;
  log.rotation.y = (i * Math.PI) / 4;
  log.position.y = 0.22;
  log.castShadow = true;
  log.receiveShadow = true;
  fireGroup.add(log);
}

const flameMat = new THREE.MeshBasicMaterial({ color: 0xff6a16 });

const flame = new THREE.Mesh(new THREE.ConeGeometry(0.65, 2.2, 5), flameMat);
flame.position.y = 1.35;
fireGroup.add(flame);

const fireLight = new THREE.PointLight(0xff7928, 8, 18, 2);
fireLight.position.set(0, 1.5, 0);
fireLight.castShadow = true;
fireLight.shadow.mapSize.set(512, 512);
fireGroup.add(fireLight);

// CORREÇÃO: o jogador atravessava a fogueira
colliders.push({ x: 0, z: 0, radius: 1.3, camRadius: 1.3, top: 3 });

// ---------------------------------------------------------------
// Troncos para sentar ao redor da fogueira
// ---------------------------------------------------------------
for (let i = 0; i < 4; i++) {
  const angle = (i * Math.PI) / 2 + Math.PI / 4;

  const log = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.36, 2.2, 6),
    trunkMat
  );

  const cx = Math.cos(angle) * 4;
  const cz = Math.sin(angle) * 4;

  log.position.set(cx, 0.35, cz);

  // CORREÇÃO: antes os troncos ficavam apontando para a fogueira
  // (como raios). Agora ficam tangentes ao círculo, como bancos.
  log.rotation.z = Math.PI / 2;
  log.rotation.y = -angle + Math.PI / 2;
  log.castShadow = true;
  log.receiveShadow = true;
  scene.add(log);

  // Colisão do tronco usando 3 círculos ao longo do comprimento
  const tx = -Math.sin(angle);
  const tz = Math.cos(angle);
  for (const off of [-0.8, 0, 0.8]) {
    colliders.push({
      x: cx + tx * off,
      z: cz + tz * off,
      radius: 0.4,
      camRadius: 0.45,
      top: 0.8
    });
  }
}

// ---------------------------------------------------------------
// Personagem provisório
// ---------------------------------------------------------------
const player = new THREE.Group();
scene.add(player);

const bodyMat = new THREE.MeshStandardMaterial({
  color: 0x536b79,
  flatShading: true
});

const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, 0.5), bodyMat);
body.position.y = 1.25;
body.castShadow = true;
player.add(body);

const head = new THREE.Mesh(
  new THREE.IcosahedronGeometry(0.38, 0),
  new THREE.MeshStandardMaterial({ color: 0xbba18a })
);
head.position.y = 2.1;
head.castShadow = true;
player.add(head);

const arm = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.75, 0.22), bodyMat);
arm.position.set(0.52, 1.25, -0.15);
arm.rotation.z = -0.65;
player.add(arm);

const lantern = new THREE.Group();
lantern.position.set(0.7, 0.95, -0.2);
player.add(lantern);

const lanternBody = new THREE.Mesh(
  new THREE.BoxGeometry(0.32, 0.42, 0.32),
  new THREE.MeshStandardMaterial({
    color: 0x493c2b,
    metalness: 0.5,
    roughness: 0.6
  })
);
lantern.add(lanternBody);

const lanternGlass = new THREE.Mesh(
  new THREE.OctahedronGeometry(0.16, 0),
  new THREE.MeshBasicMaterial({ color: 0xffd47a })
);
lanternGlass.position.y = -0.03;
lantern.add(lanternGlass);

const lanternLight = new THREE.PointLight(0xffc66e, 5, 13, 2);
lantern.add(lanternLight);

// CORREÇÃO: o personagem nascia dentro da fogueira (0, 0).
// Agora começa ao sul do acampamento, olhando para a fogueira.
player.position.set(0, 0, 7);
player.rotation.y = Math.PI;

// ---------------------------------------------------------------
// Controles
// ---------------------------------------------------------------
const keys = {};

window.addEventListener('keydown', (event) => {
  keys[event.code] = true;

  if (event.code === 'KeyF' && !event.repeat) {
    lanternLight.visible = !lanternLight.visible;
    lanternGlass.material.color.set(
      lanternLight.visible ? 0xffd47a : 0x332b20
    );
  }
});

window.addEventListener('keyup', (event) => {
  keys[event.code] = false;
});

// Estado da câmera
let cameraYaw = Math.PI; // direção horizontal para onde a câmera olha
let cameraPitch = 0.55; // inclinação: positivo = câmera acima do personagem
let preferredDistance = 7; // zoom desejado (roda do mouse)
let currentDistance = preferredDistance; // zoom real, após colisão

const mouseSensitivity = 0.0025;
const minPitch = -0.1;
const maxPitch = 1.3;

// Pointer Lock: clique uma vez na tela e o mouse passa a controlar a
// câmera sem precisar ficar pressionado. ESC libera o cursor.
const canvas = renderer.domElement;

const hint = document.createElement('div');
hint.textContent = 'Clique para controlar a câmera com o mouse (ESC para sair)';
hint.style.cssText =
  'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);' +
  'padding:12px 20px;background:rgba(0,0,0,0.6);color:#fff;' +
  'font:16px sans-serif;border-radius:8px;pointer-events:none;';
document.body.appendChild(hint);

canvas.addEventListener('click', () => {
  if (document.pointerLockElement !== canvas) canvas.requestPointerLock();
});

document.addEventListener('pointerlockchange', () => {
  hint.style.display = document.pointerLockElement === canvas ? 'none' : 'block';
});

document.addEventListener('mousemove', (event) => {
  if (document.pointerLockElement !== canvas) return;

  cameraYaw -= event.movementX * mouseSensitivity;
  // Mouse para cima = olhar para cima = câmera desce
  cameraPitch = THREE.MathUtils.clamp(
    cameraPitch + event.movementY * mouseSensitivity,
    minPitch,
    maxPitch
  );
});

// Roda do mouse ajusta o zoom desejado
window.addEventListener('wheel', (event) => {
  preferredDistance = THREE.MathUtils.clamp(
    preferredDistance + Math.sign(event.deltaY) * 0.8,
    3,
    14
  );
});

// ---------------------------------------------------------------
// Movimento e câmera
// ---------------------------------------------------------------
const clock = new THREE.Clock();
const cameraTarget = new THREE.Vector3();
const camDir = new THREE.Vector3();
const cameraForward = new THREE.Vector3();
const cameraRight = new THREE.Vector3();
const moveDirection = new THREE.Vector3();

const worldLimit = 43;
const playerRadius = 0.55;
const moveSpeed = 5;
const cameraTurnSpeed = 2; // rad/s com Q/E
const minCameraDistance = 1.2; // zoom mínimo quando algo bloqueia a câmera
const cameraMargin = 0.4; // folga entre a câmera e o obstáculo
const cameraMinHeight = 0.4; // a câmera nunca entra no chão

function canMoveTo(x, z) {
  if (Math.abs(x) > worldLimit || Math.abs(z) > worldLimit) {
    return false;
  }

  for (const c of colliders) {
    const dx = x - c.x;
    const dz = z - c.z;
    const minDistance = c.radius + playerRadius;

    if (dx * dx + dz * dz < minDistance * minDistance) {
      return false;
    }
  }

  return true;
}

// Câmera orbital com colisão e zoom dinâmico.
// Lança um "raio" do personagem até a posição ideal da câmera; se ele
// atravessar uma árvore, a fogueira ou um tronco, a câmera se aproxima.
function updateCamera(delta, snap = false) {
  cameraTarget.set(
    player.position.x,
    player.position.y + 1.3,
    player.position.z
  );

  // Direção do alvo para a câmera (esférica: yaw + pitch)
  const cosP = Math.cos(cameraPitch);
  camDir.set(
    -Math.sin(cameraYaw) * cosP,
    Math.sin(cameraPitch),
    -Math.cos(cameraYaw) * cosP
  );

  // Vetor completo do alvo até a posição ideal
  const vx = camDir.x * preferredDistance;
  const vy = camDir.y * preferredDistance;
  const vz = camDir.z * preferredDistance;

  let tMax = 1; // fração do caminho livre (1 = sem obstáculos)

  // Colisão com cenário: segmento 2D contra círculos + checagem de altura
  const a = vx * vx + vz * vz;
  if (a > 1e-6) {
    for (const c of colliders) {
      const ox = cameraTarget.x - c.x;
      const oz = cameraTarget.z - c.z;
      const cc = ox * ox + oz * oz - c.camRadius * c.camRadius;

      if (cc <= 0) continue; // jogador já está dentro da área do objeto

      const b = 2 * (vx * ox + vz * oz);
      if (b >= 0) continue; // câmera indo para longe do objeto

      const disc = b * b - 4 * a * cc;
      if (disc < 0) continue;

      const t = (-b - Math.sqrt(disc)) / (2 * a);
      if (t >= tMax) continue;

      // Só bloqueia se o raio estiver abaixo do topo do objeto nesse ponto
      if (cameraTarget.y + vy * t < c.top) tMax = t;
    }
  }

  // Colisão com o chão
  if (cameraTarget.y + vy < cameraMinHeight) {
    const t = (cameraMinHeight - cameraTarget.y) / vy;
    if (t < tMax) tMax = Math.max(t, 0);
  }

  const allowed =
    tMax < 1
      ? THREE.MathUtils.clamp(
          tMax * preferredDistance - cameraMargin,
          minCameraDistance,
          preferredDistance
        )
      : preferredDistance;

  // Aproxima rápido (evita atravessar objetos) e afasta devagar (suave)
  if (snap) {
    currentDistance = allowed;
  } else {
    const rate = allowed < currentDistance ? 25 : 3;
    currentDistance += (allowed - currentDistance) * (1 - Math.exp(-rate * delta));
  }

  camera.position.copy(cameraTarget).addScaledVector(camDir, currentDistance);
  camera.lookAt(cameraTarget);
}

updateCamera(0, true);

function animate() {
  requestAnimationFrame(animate);

  const delta = Math.min(clock.getDelta(), 0.05);
  const elapsed = clock.elapsedTime;

  // Q / E giram a câmera
  if (keys.KeyQ) cameraYaw += cameraTurnSpeed * delta;
  if (keys.KeyE) cameraYaw -= cameraTurnSpeed * delta;

  // -------------------------------------------------------------
  // Entrada de movimento
  // -------------------------------------------------------------
  let forward = 0;
  let sideways = 0;

  if (keys.KeyW || keys.ArrowUp) forward += 1;
  if (keys.KeyS || keys.ArrowDown) forward -= 1;
  if (keys.KeyD || keys.ArrowRight) sideways += 1;
  if (keys.KeyA || keys.ArrowLeft) sideways -= 1;

  // CORREÇÃO PRINCIPAL: a direção da câmera vem de `cameraYaw`,
  // que NÃO depende da rotação do personagem. Antes, a câmera ficava
  // sempre "atrás" do modelo; ao andar para trás o modelo virava para
  // você e a câmera girava junto, criando um loop de rotação.
  cameraForward.set(Math.sin(cameraYaw), 0, Math.cos(cameraYaw));
  // Direita = forward x up
  cameraRight.set(-cameraForward.z, 0, cameraForward.x);

  moveDirection.set(0, 0, 0);
  moveDirection.addScaledVector(cameraForward, forward);
  moveDirection.addScaledVector(cameraRight, sideways);

  if (moveDirection.lengthSq() > 0) {
    // Impede que as diagonais sejam mais rápidas
    moveDirection.normalize();

    const nextX = player.position.x + moveDirection.x * moveSpeed * delta;
    const nextZ = player.position.z + moveDirection.z * moveSpeed * delta;

    // Colisão independente por eixo: permite deslizar nas laterais
    if (canMoveTo(nextX, player.position.z)) {
      player.position.x = nextX;
    }

    if (canMoveTo(player.position.x, nextZ)) {
      player.position.z = nextZ;
    }

    // Orienta o modelo na direção do deslocamento (só o visual)
    const targetAngle = Math.atan2(moveDirection.x, moveDirection.z);

    // Menor diferença angular, evitando saltos ao cruzar ±PI
    const angleDifference = Math.atan2(
      Math.sin(targetAngle - player.rotation.y),
      Math.cos(targetAngle - player.rotation.y)
    );

    player.rotation.y += angleDifference * (1 - Math.exp(-12 * delta));
  }

  // Câmera (yaw, pitch, zoom e colisão)
  updateCamera(delta);

  // A luz da lua e sua sombra acompanham o jogador
  moon.target.position.copy(player.position);
  moon.position.copy(player.position).add(moonOffset);

  // -------------------------------------------------------------
  // Chamas e luz da fogueira
  // -------------------------------------------------------------
  const flicker = 0.85 + Math.random() * 0.3;

  flame.scale.set(
    0.9 + Math.sin(elapsed * 8) * 0.1,
    0.85 + Math.sin(elapsed * 11) * 0.15,
    0.9 + Math.cos(elapsed * 7) * 0.1
  );

  flame.rotation.y = Math.sin(elapsed * 3) * 0.15;
  fireLight.intensity = 8 * flicker;

  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();
