
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

// Iluminação global
scene.add(new THREE.HemisphereLight(0x506080, 0x17130e, 1.0));

const moon = new THREE.DirectionalLight(0x9db9ff, 0.8);
moon.position.set(-10, 20, 5);
moon.castShadow = true;
moon.shadow.mapSize.set(1024, 1024);
scene.add(moon);

// Materiais
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

// Terreno
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(100, 100, 20, 20),
                              groundMat
);

ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Árvores procedurais
const trees = [];
const treeGroup = new THREE.Group();
scene.add(treeGroup);

function createTree(x, z, scale = 1) {
  const tree = new THREE.Group();
  tree.position.set(x, 0, z);
  tree.scale.setScalar(scale);

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.38, 2.5, 5),
                               trunkMat
  );
  trunk.position.y = 1.25;
  trunk.castShadow = true;
  tree.add(trunk);

  // Copas em camadas para um visual low-poly
  for (let i = 0; i < 3; i++) {
    const leaves = new THREE.Mesh(
      new THREE.ConeGeometry(1.5 - i * 0.25, 2.5, 5),
                                  leavesMat
    );

    leaves.position.y = 2.5 + i * 1.25;
    leaves.rotation.y = i * 0.7;
    leaves.castShadow = true;
    tree.add(leaves);
  }

  treeGroup.add(tree);
  trees.push({ x, z, radius: 0.65 * scale });
}

// Árvores distribuídas aleatoriamente,
// deixando espaço para o acampamento central.
for (let i = 0; i < 180; i++) {
  const x = THREE.MathUtils.randFloatSpread(86);
  const z = THREE.MathUtils.randFloatSpread(86);

  if (Math.hypot(x, z) < 11) continue;

  createTree(
    x,
    z,
    THREE.MathUtils.randFloat(0.7, 1.5)
  );
}

// Parede de árvores nas bordas
for (let i = -46; i <= 46; i += 4) {
  createTree(i, -47, 1.4);
  createTree(i, 47, 1.4);
  createTree(-47, i, 1.4);
  createTree(47, i, 1.4);
}

// Fogueira central
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
  log.rotation.y = i * Math.PI / 4;
  log.position.y = 0.22;
  log.castShadow = true;
  log.receiveShadow = true;
  fireGroup.add(log);
}

const flameMat = new THREE.MeshBasicMaterial({
  color: 0xff6a16,
  flatShading: true
});

const flame = new THREE.Mesh(
  new THREE.ConeGeometry(0.65, 2.2, 5),
                             flameMat
);

flame.position.y = 1.35;
fireGroup.add(flame);

const fireLight = new THREE.PointLight(0xff7928, 8, 18, 2);
fireLight.position.set(0, 1.5, 0);
fireLight.castShadow = true;
fireLight.shadow.mapSize.set(512, 512);
fireGroup.add(fireLight);

// Troncos para sentar ao redor da fogueira
for (let i = 0; i < 4; i++) {
  const angle = i * Math.PI / 2 + Math.PI / 4;

  const log = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.36, 2.2, 6),
                             trunkMat
  );

  log.position.set(
    Math.cos(angle) * 4,
                   0.35,
                   Math.sin(angle) * 4
  );

  log.rotation.y = -angle;
  log.rotation.z = Math.PI / 2;
  log.castShadow = true;
  scene.add(log);
}

// Personagem provisório
const player = new THREE.Group();
scene.add(player);

const bodyMat = new THREE.MeshStandardMaterial({
  color: 0x536b79,
  flatShading: true
});

const body = new THREE.Mesh(
  new THREE.BoxGeometry(0.8, 1.2, 0.5),
                            bodyMat
);

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

// Braço e lampião provisórios
const arm = new THREE.Mesh(
  new THREE.BoxGeometry(0.22, 0.75, 0.22),
                           bodyMat
);

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

const lanternLight = new THREE.PointLight(
  0xffc66e, 5, 13, 2
);

lanternLight.position.set(0, 0, 0);
lantern.add(lanternLight);

// Controles
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

// Movimento e câmera
const clock = new THREE.Clock();
const playerDirection = new THREE.Vector3(0, 0, 1);
const cameraTarget = new THREE.Vector3();
const desiredCameraPosition = new THREE.Vector3();

const worldLimit = 43;
const playerRadius = 0.55;
const moveSpeed = 5;

function canMoveTo(x, z) {
  if (
    Math.abs(x) > worldLimit ||
    Math.abs(z) > worldLimit
  ) {
    return false;
  }

  // Colisão simples com troncos das árvores
  for (const tree of trees) {
    const dx = x - tree.x;
    const dz = z - tree.z;
    const minDistance = tree.radius + playerRadius;

    if (dx * dx + dz * dz < minDistance * minDistance) {
      return false;
    }
  }

  return true;
}

camera.position.set(0, 5, 9);
camera.lookAt(player.position);

function animate() {
  requestAnimationFrame(animate);

  const delta = Math.min(clock.getDelta(), 0.05);
  const elapsed = clock.elapsedTime;

  // Movimento relativo à orientação atual do personagem
  let forward = 0;
  let sideways = 0;

  if (keys.KeyW || keys.ArrowUp) forward += 1;
  if (keys.KeyS || keys.ArrowDown) forward -= 1;
  if (keys.KeyD || keys.ArrowRight) sideways += 1;
  if (keys.KeyA || keys.ArrowLeft) sideways -= 1;

  const moving = forward !== 0 || sideways !== 0;

  if (moving) {
    const inputLength = Math.hypot(forward, sideways);
    forward /= inputLength;
    sideways /= inputLength;

    const moveX =
    playerDirection.x * forward +
    playerDirection.z * sideways;

    const moveZ =
    playerDirection.z * forward -
    playerDirection.x * sideways;

    const nextX = player.position.x + moveX * moveSpeed * delta;
    const nextZ = player.position.z + moveZ * moveSpeed * delta;

    if (canMoveTo(nextX, player.position.z)) {
      player.position.x = nextX;
    }

    if (canMoveTo(player.position.x, nextZ)) {
      player.position.z = nextZ;
    }

    // Orienta o personagem na direção do movimento
    const targetAngle = Math.atan2(moveX, moveZ);

    player.rotation.y = THREE.MathUtils.damp(
      player.rotation.y,
      targetAngle,
      12,
      delta
    );

    playerDirection.set(
      Math.sin(player.rotation.y),
                        0,
                        Math.cos(player.rotation.y)
    );
  }

  // Câmera seguindo por trás do personagem
  desiredCameraPosition.set(
    player.position.x - playerDirection.x * 7,
    player.position.y + 4.5,
    player.position.z - playerDirection.z * 7
  );

  camera.position.lerp(
    desiredCameraPosition,
    1 - Math.exp(-5 * delta)
  );

  cameraTarget.set(
    player.position.x,
    player.position.y + 1.3,
    player.position.z
  );

  camera.lookAt(cameraTarget);

  // Animação estilizada das chamas e da luz
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
