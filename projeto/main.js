import * as THREE from "three";
import { EXRLoader } from "three/addons/loaders/EXRLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x080e16);
scene.fog = new THREE.FogExp2(0x080e16, 0.022);

const camera = new THREE.PerspectiveCamera(
  65,
  window.innerWidth / window.innerHeight,
  0.1,
  150,
);

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.BasicShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
document.body.style.margin = "0";
document.body.style.overflow = "hidden";
document.body.appendChild(renderer.domElement);

// ---------------------------------------------------------------
// Modos de diagnóstico do pipeline de visualização
// ---------------------------------------------------------------
let diagnosticMode = "none";
const originalWireframeStates = new Map();

// Cena auxiliar para a visualização superior do Frustum Culling.
const frustumScene = new THREE.Scene();
frustumScene.background = new THREE.Color(0x101820);

// Câmera ortográfica posicionada acima do cenário.
const frustumViewCamera = new THREE.OrthographicCamera(
  -55,
  55,
  55,
  -55,
  0.1,
  300,
);

frustumViewCamera.position.set(0, 130, 0);
frustumViewCamera.up.set(0, 0, -1);
frustumViewCamera.lookAt(0, 0, 0);

// Objetos utilizados no cálculo do Frustum Culling.
const cameraFrustum = new THREE.Frustum();
const frustumProjectionView = new THREE.Matrix4();

const treeBounds = [];

const insideFrustumColor = 0x35e06f;
const outsideFrustumColor = 0xff5252;

// Marcadores das árvores na visualização superior.
const treeMarkerGeometry = new THREE.PlaneGeometry(0.9, 0.9);
const treeMarkerMaterials = {
  inside: new THREE.MeshBasicMaterial({
    color: insideFrustumColor,
    side: THREE.DoubleSide,
    depthTest: false,
  }),
  outside: new THREE.MeshBasicMaterial({
    color: outsideFrustumColor,
    side: THREE.DoubleSide,
    depthTest: false,
  }),
};

// Grupo que contém os marcadores das árvores.
const treeMarkers = new THREE.Group();
frustumScene.add(treeMarkers);

// Representação do limite do cenário.
const mapBorderPoints = [
  new THREE.Vector3(-50, 0, -50),
  new THREE.Vector3(50, 0, -50),
  new THREE.Vector3(50, 0, 50),
  new THREE.Vector3(-50, 0, 50),
];

const mapBorderGeometry = new THREE.BufferGeometry().setFromPoints(
  mapBorderPoints,
);
const mapBorder = new THREE.LineLoop(
  mapBorderGeometry,
  new THREE.LineBasicMaterial({
    color: 0x64748b,
    depthTest: false,
  }),
);
mapBorder.position.y = 0.05;
frustumScene.add(mapBorder);

// Grade de referência do mapa.
const gridPoints = [];

for (let i = -50; i <= 50; i += 10) {
  gridPoints.push(
    new THREE.Vector3(i, 0, -50),
    new THREE.Vector3(i, 0, 50),
    new THREE.Vector3(-50, 0, i),
    new THREE.Vector3(50, 0, i),
  );
}

const gridGeometry = new THREE.BufferGeometry().setFromPoints(gridPoints);
const grid = new THREE.LineSegments(
  gridGeometry,
  new THREE.LineBasicMaterial({
    color: 0x263442,
    transparent: true,
    opacity: 0.7,
    depthTest: false,
  }),
);
grid.position.y = 0.02;
frustumScene.add(grid);

// Linhas que representam a projeção horizontal do frustum.
const frustumLineMaterial = new THREE.LineBasicMaterial({
  color: 0xffd166,
  depthTest: false,
  depthWrite: false,
});

const frustumFootprintGeometry = new THREE.BufferGeometry();
const frustumFootprint = new THREE.LineSegments(
  frustumFootprintGeometry,
  frustumLineMaterial,
);
frustumFootprint.renderOrder = 10;
frustumScene.add(frustumFootprint);

// Marcador da posição da câmera principal.
const cameraMarker = new THREE.Mesh(
  new THREE.CircleGeometry(1.2, 16),
  new THREE.MeshBasicMaterial({
    color: 0x00d4ff,
    side: THREE.DoubleSide,
    depthTest: false,
  }),
);
cameraMarker.rotation.x = -Math.PI / 2;
cameraMarker.position.y = 0.2;
cameraMarker.renderOrder = 11;
frustumScene.add(cameraMarker);

// Indicador da direção da câmera.
const cameraDirectionGeometry = new THREE.BufferGeometry();
const cameraDirectionLine = new THREE.Line(
  cameraDirectionGeometry,
  new THREE.LineBasicMaterial({
    color: 0x00d4ff,
    depthTest: false,
  }),
);
cameraDirectionLine.renderOrder = 11;
frustumScene.add(cameraDirectionLine);

// Contador de objetos classificados pelo Frustum Culling.
const frustumStats = document.createElement("div");
frustumStats.style.cssText =
  "position:fixed;right:20px;top:282px;padding:8px 12px;" +
  "background:rgba(0,0,0,0.8);color:#fff;font:12px monospace;" +
  "line-height:1.7;border-radius:5px;pointer-events:none;" +
  "z-index:10;display:none;";
document.body.appendChild(frustumStats);

// Identificação visual do modo de diagnóstico ativo.
const diagnosticInfo = document.createElement("div");
diagnosticInfo.textContent = "Diagnóstico: desativado";
diagnosticInfo.style.cssText =
  "position:fixed;left:12px;top:12px;padding:8px 12px;" +
  "background:rgba(0,0,0,0.7);color:#fff;font:13px sans-serif;" +
  "border-radius:6px;pointer-events:none;z-index:10;display:none;";
document.body.appendChild(diagnosticInfo);

const frustumLabel = document.createElement("div");
frustumLabel.textContent = "Frustum Culling - vista superior";
frustumLabel.style.cssText =
  "position:fixed;right:20px;top:20px;padding:6px 9px;" +
  "background:rgba(0,0,0,0.75);color:#fff;font:12px sans-serif;" +
  "pointer-events:none;z-index:10;display:none;";
document.body.appendChild(frustumLabel);

// Shader de profundidade linearizada. A faixa exibida é de 0 a 45 unidades;
// objetos mais próximos ficam claros e os mais distantes ficam escuros.
// O cálculo considera também as matrizes de instanciamento das árvores.
const depthMaterial = new THREE.ShaderMaterial({
  uniforms: {
    nearPlane: { value: camera.near },
    displayFar: { value: 45.0 },
  },
  vertexShader: `
    varying float vViewDepth;

    void main() {
      vec4 localPosition = vec4(position, 1.0);

      #ifdef USE_INSTANCING
        localPosition = instanceMatrix * localPosition;
      #endif

      vec4 viewPosition = viewMatrix * modelMatrix * localPosition;
      vViewDepth = -viewPosition.z;
      gl_Position = projectionMatrix * viewPosition;
    }
  `,
  fragmentShader: `
    uniform float nearPlane;
    uniform float displayFar;
    varying float vViewDepth;

    void main() {
      float linearDepth = clamp(
        (vViewDepth - nearPlane) / (displayFar - nearPlane),
        0.0,
        1.0
      );

      float depthValue = 1.0 - linearDepth;
      gl_FragColor = vec4(vec3(depthValue), 1.0);
    }
  `,
  depthTest: true,
  depthWrite: true,
  side: THREE.DoubleSide,
});

function restoreWireframe() {
  originalWireframeStates.forEach((wireframe, material) => {
    material.wireframe = wireframe;
  });
  originalWireframeStates.clear();
}

function setDiagnosticMode(mode) {
  if (diagnosticMode === "wireframe") restoreWireframe();

  diagnosticMode = diagnosticMode === mode ? "none" : mode;
  scene.overrideMaterial = diagnosticMode === "depth" ? depthMaterial : null;

  diagnosticInfo.style.display = diagnosticMode === "none" ? "none" : "block";
  frustumLabel.style.display = diagnosticMode === "frustum" ? "block" : "none";
  frustumStats.style.display = diagnosticMode === "frustum" ? "block" : "none";

  if (diagnosticMode === "wireframe") {
    scene.traverse((object) => {
      if (!object.isMesh) return;

      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];

      materials.forEach((material) => {
        if (!material) return;
        if (!originalWireframeStates.has(material)) {
          originalWireframeStates.set(material, material.wireframe);
        }
        material.wireframe = true;
      });
    });
  }

  const labels = {
    none: "desativado",
    frustum: "Frustum Culling",
    wireframe: "Wireframe",
    depth: "Z-buffer (profundidade linear, 0–45 unidades)",
  };

  diagnosticInfo.textContent = `Diagnóstico: ${labels[diagnosticMode]} | F1: Frustum | F2: Wireframe | F3: Z-buffer`;
}

// Atualiza o frustum da câmera e classifica as árvores.
function updateFrustumView() {
  camera.updateMatrixWorld(true);

  // Matriz que combina a projeção e a transformação da câmera.
  frustumProjectionView.multiplyMatrices(
    camera.projectionMatrix,
    camera.matrixWorldInverse,
  );

  // Atualiza os seis planos do frustum.
  cameraFrustum.setFromProjectionMatrix(frustumProjectionView);

  let insideCount = 0;
  let outsideCount = 0;

  // Verifica individualmente o volume delimitador de cada árvore.
  treeBounds.forEach((tree) => {
    const isInside = cameraFrustum.intersectsBox(tree.box);

    tree.marker.material = isInside
      ? treeMarkerMaterials.inside
      : treeMarkerMaterials.outside;

    if (isInside) {
      insideCount++;
    } else {
      outsideCount++;
    }
  });

  // Atualiza o contador apresentado na interface.
  frustumStats.innerHTML =
    `<span style="color:#35e06f">■ Dentro do frustum: ${insideCount}</span><br>` +
    `<span style="color:#ff5252">■ Fora do frustum: ${outsideCount}</span><br>` +
    `<span style="color:#ffffff">Total de árvores: ${treeBounds.length}</span>`;

  // Atualiza a posição do marcador da câmera.
  cameraMarker.position.set(camera.position.x, 0.2, camera.position.z);

  // Atualiza a direção horizontal da câmera.
  const direction = new THREE.Vector3();
  camera.getWorldDirection(direction);
  direction.y = 0;
  direction.normalize();

  const directionEnd = new THREE.Vector3(
    camera.position.x + direction.x * 8,
    0.2,
    camera.position.z + direction.z * 8,
  );

  cameraDirectionGeometry.setFromPoints([
    new THREE.Vector3(camera.position.x, 0.2, camera.position.z),
    directionEnd,
  ]);

  cameraDirectionGeometry.attributes.position.needsUpdate = true;

  // Calcula os quatro cantos do plano distante do frustum.
  // A projeção no mapa superior representa o campo de visão horizontal.
  const farCorners = [
    new THREE.Vector3(-1, -1, 1).unproject(camera),
    new THREE.Vector3(1, -1, 1).unproject(camera),
    new THREE.Vector3(1, 1, 1).unproject(camera),
    new THREE.Vector3(-1, 1, 1).unproject(camera),
  ];

  const cameraGround = new THREE.Vector3(
    camera.position.x,
    0.15,
    camera.position.z,
  );

  const footprintPoints = [];

  // Linhas entre a posição da câmera e os quatro cantos distantes.
  farCorners.forEach((corner) => {
    const projectedCorner = new THREE.Vector3(corner.x, 0.15, corner.z);

    footprintPoints.push(cameraGround.clone(), projectedCorner);
  });

  // Fecha o contorno do plano distante.
  for (let i = 0; i < farCorners.length; i++) {
    const current = farCorners[i];
    const next = farCorners[(i + 1) % farCorners.length];

    footprintPoints.push(
      new THREE.Vector3(current.x, 0.15, current.z),
      new THREE.Vector3(next.x, 0.15, next.z),
    );
  }

  frustumFootprintGeometry.setFromPoints(footprintPoints);
  frustumFootprintGeometry.attributes.position.needsUpdate = true;
}

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
// Carregamento de texturas
// ---------------------------------------------------------------
const textureLoader = new THREE.TextureLoader();
const exrLoader = new EXRLoader();
const gltfLoader = new GLTFLoader();
const fbxLoader = new FBXLoader();
const objLoader = new OBJLoader();

// ---------------------------------------------------------------
// Modelos 3D externos (formato GLB)
// ---------------------------------------------------------------
// Os modelos são carregados de forma assíncrona e adicionados à cena
// assim que cada arquivo termina de carregar.
function loadGLBModel(path, options) {
  gltfLoader.load(
    path,
    (gltf) => {
      const model = gltf.scene;

      model.position.set(options.x, options.y ?? 0, options.z);
      model.rotation.y = options.rotationY ?? 0;
      model.scale.setScalar(options.scale);

      // Habilita sombras e ajusta os materiais do modelo.
      model.traverse((object) => {
        if (!object.isMesh) return;

        object.castShadow = true;
        object.receiveShadow = true;

        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];

        materials.forEach((material) => {
          if (!material) return;

          material.color.set(0xffffff);
          material.metalness = 0;
          material.needsUpdate = true;
        });
      });

      scene.add(model);

      // Adiciona uma colisão circular aproximada para evitar que o
      // jogador atravesse os modelos maiores do cenário.
      if (options.colliderRadius) {
        colliders.push({
          x: options.x,
          z: options.z,
          radius: options.colliderRadius,
          camRadius: options.colliderRadius,
          top: options.colliderTop ?? 3,
        });
      }

      console.log(`[MODELO GLB CARREGADO] ${path}`);
    },
    undefined,
    (error) => {
      console.error(`[ERRO AO CARREGAR MODELO GLB] ${path}`, error);
    },
  );
}

// Pinguim: carregado no formato FBX.
function loadFBXModel(path, options) {
  fbxLoader.load(
    path,
    (model) => {
      model.position.set(options.x, options.y ?? 0, options.z);
      model.rotation.y = options.rotationY ?? 0;
      model.scale.setScalar(options.scale);

      // Habilita sombras em todas as malhas do modelo.
      model.traverse((object) => {
        if (!object.isMesh) return;

        object.castShadow = true;
        object.receiveShadow = true;
      });

      scene.add(model);

      // Adiciona uma colisão circular aproximada para evitar que o
      // jogador atravesse os modelos maiores do cenário.
      if (options.colliderRadius) {
        colliders.push({
          x: options.x,
          z: options.z,
          radius: options.colliderRadius,
          camRadius: options.colliderRadius,
          top: options.colliderTop ?? 3,
        });
      }

      console.log(`[MODELO FBX CARREGADO] ${path}`);
    },
    undefined,
    (error) => {
      console.error(`[ERRO AO CARREGAR MODELO FBX] ${path}`, error);
    },
  );
}

// Cervo: carregado no formato OBJ.
function loadOBJModel(path, options) {
  objLoader.load(
    path,
    (model) => {
      model.position.set(options.x, options.y ?? 0, options.z);
      model.rotation.y = options.rotationY ?? 0;
      model.scale.setScalar(options.scale);

      // Habilita sombras em todas as malhas do modelo.
      model.traverse((object) => {
        if (!object.isMesh) return;

        object.castShadow = true;
        object.receiveShadow = true;
      });

      scene.add(model);

      // Adiciona uma colisão circular aproximada para evitar que o
      // jogador atravesse os modelos maiores do cenário.
      if (options.colliderRadius) {
        colliders.push({
          x: options.x,
          z: options.z,
          radius: options.colliderRadius,
          camRadius: options.colliderRadius,
          top: options.colliderTop ?? 3,
        });
      }

      console.log(`[MODELO OBJ CARREGADO] ${path}`);
    },
    undefined,
    (error) => {
      console.error(`[ERRO AO CARREGAR MODELO OBJ] ${path}`, error);
    },
  );
}

// Barraca: posicionada a noroeste da fogueira.
// O arquivo possui dimensões originais maiores que os demais modelos,
// por isso recebe uma escala reduzida.
loadGLBModel("/models/Tent.glb", {
  x: -9,
  z: -5,
  scale: 0.22,
  rotationY: Math.PI / 2,
  colliderRadius: 2.7,
  colliderTop: 2.5,
});

// Carrinho de golfe: estacionado a nordeste do acampamento.
loadGLBModel("/models/Golf.glb", {
  x: 9,
  y: 0.86,
  z: -8,
  scale: 1,
  rotationY: -Math.PI / 4,
  colliderRadius: 1.6,
  colliderTop: 2,
});

// Pinguim: elemento decorativo próximo à fogueira.
loadFBXModel("/models/Pinguin.fbx", {
  x: -2,
  z: 2,
  scale: 0.8,
  rotationY: Math.PI / 1.35,
  colliderRadius: 0.55,
  colliderTop: 1.5,
});

// Cervo: animal posicionado na borda da clareira.
loadOBJModel("/models/Deer.obj", {
  x: 11,
  z: 6,
  scale: 1,
  rotationY: -Math.PI / 3,
  colliderRadius: 0.9,
  colliderTop: 2.2,
});

// Configura repetição e filtragem das texturas.
function configureTexture(texture, repeatX = 1, repeatY = 1) {
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  return texture;
}

// Carrega texturas convencionais (JPG e PNG).
function loadTexture(path, colorSpace, repeatX = 1, repeatY = 1) {
  const texture = textureLoader.load(
    path,
    () => console.log(`[TEXTURA CARREGADA] ${path}`),
    undefined,
    (error) => console.error(`[ERRO AO CARREGAR] ${path}`, error),
  );

  texture.colorSpace = colorSpace;

  return configureTexture(texture, repeatX, repeatY);
}

// Carrega mapas EXR utilizados como dados (Normal e Roughness).
function loadEXRTexture(path, repeatX = 1, repeatY = 1) {
  const texture = exrLoader.load(
    path,
    () => console.log(`[TEXTURA EXR CARREGADA] ${path}`),
    undefined,
    (error) => console.error(`[ERRO AO CARREGAR EXR] ${path}`, error),
  );

  texture.colorSpace = THREE.NoColorSpace;

  return configureTexture(texture, repeatX, repeatY);
}

// ---------------------------------------------------------------
// Texturas do terreno
// ---------------------------------------------------------------
const grassTextures = {
  map: loadTexture("/textures/grass/diffuse.jpg", THREE.SRGBColorSpace, 12, 12),

  normalMap: loadEXRTexture("/textures/grass/normal.exr", 12, 12),

  roughnessMap: loadEXRTexture("/textures/grass/roughness.exr", 12, 12),
};

// ---------------------------------------------------------------
// Texturas das árvores
// ---------------------------------------------------------------
const barkTextures = {
  map: loadTexture("/textures/bark/diffuse.jpg", THREE.SRGBColorSpace),

  normalMap: loadEXRTexture("/textures/bark/normal.exr"),

  roughnessMap: loadTexture("/textures/bark/roughness.jpg", THREE.NoColorSpace),
};

// ---------------------------------------------------------------
// Texturas do lampião
// ---------------------------------------------------------------
const metalTextures = {
  map: loadTexture("/textures/metal/diffuse.jpg", THREE.SRGBColorSpace),

  normalMap: loadEXRTexture("/textures/metal/normal.exr"),

  roughnessMap: loadTexture(
    "/textures/metal/roughness.jpg",
    THREE.NoColorSpace,
  ),
};

// ---------------------------------------------------------------
// Materiais
// ---------------------------------------------------------------
const groundMat = new THREE.MeshStandardMaterial({
  ...grassTextures,
  color: 0xffffff,
  roughness: 1.0,
  metalness: 0.0,
  normalScale: new THREE.Vector2(0.5, 0.5),
});

const trunkMat = new THREE.MeshStandardMaterial({
  color: 0x493021,
  flatShading: true,
});

const treeTrunkMat = new THREE.MeshStandardMaterial({
  ...barkTextures,
  color: 0xffffff,
  roughness: 1.0,
  metalness: 0.0,
  flatShading: true,
  normalScale: new THREE.Vector2(0.6, 0.6),
});

const leavesMat = new THREE.MeshStandardMaterial({
  color: 0x142b20,
  flatShading: true,
});

// ---------------------------------------------------------------
// Terreno
// ---------------------------------------------------------------
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(100, 100, 20, 20),
  groundMat,
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
    top: 6.3 * scale,
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

// Cria os volumes delimitadores e os marcadores de cada árvore.
treeData.forEach((tree) => {
  const extent = 1.5 * tree.scale;

  const box = new THREE.Box3(
    new THREE.Vector3(tree.x - extent, 0, tree.z - extent),
    new THREE.Vector3(tree.x + extent, 6.3 * tree.scale, tree.z + extent),
  );

  const marker = new THREE.Mesh(
    treeMarkerGeometry,
    treeMarkerMaterials.outside,
  );

  marker.rotation.x = -Math.PI / 2;
  marker.position.set(tree.x, 0.12, tree.z);
  marker.renderOrder = 5;

  treeMarkers.add(marker);

  treeBounds.push({
    box,
    marker,
  });
});

const trunkGeo = new THREE.CylinderGeometry(0.22, 0.38, 2.5, 5);
const trunks = new THREE.InstancedMesh(trunkGeo, treeTrunkMat, treeData.length);
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
  color: 0x533323,
});

for (let i = 0; i < 4; i++) {
  const log = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.22, 2.2, 6),
    woodMat,
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
    trunkMat,
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
      top: 0.8,
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
  flatShading: true,
});

const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, 0.5), bodyMat);
body.position.y = 1.25;
body.castShadow = true;
player.add(body);

const head = new THREE.Mesh(
  new THREE.IcosahedronGeometry(0.38, 0),
  new THREE.MeshStandardMaterial({ color: 0xbba18a }),
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
    ...metalTextures,
    color: 0xffffff,
    metalness: 0.15,
    roughness: 0.75,
    normalScale: new THREE.Vector2(0.4, 0.4),
  }),
);
lantern.add(lanternBody);

const lanternGlass = new THREE.Mesh(
  new THREE.OctahedronGeometry(0.16, 0),
  new THREE.MeshBasicMaterial({ color: 0xffd47a }),
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

window.addEventListener("keydown", (event) => {
  keys[event.code] = true;

  if (!event.repeat && event.code === "F1") {
    event.preventDefault();
    setDiagnosticMode("frustum");
  } else if (!event.repeat && event.code === "F2") {
    event.preventDefault();
    setDiagnosticMode("wireframe");
  } else if (!event.repeat && event.code === "F3") {
    event.preventDefault();
    setDiagnosticMode("depth");
  }

  if (event.code === "KeyF" && !event.repeat) {
    lanternLight.visible = !lanternLight.visible;
    lanternGlass.material.color.set(lanternLight.visible ? 0xffd47a : 0x332b20);
  }
});

window.addEventListener("keyup", (event) => {
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

const hint = document.createElement("div");
hint.textContent = "Clique para controlar a câmera com o mouse (ESC para sair)";
hint.style.cssText =
  "position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);" +
  "padding:12px 20px;background:rgba(0,0,0,0.6);color:#fff;" +
  "font:16px sans-serif;border-radius:8px;pointer-events:none;";
document.body.appendChild(hint);

canvas.addEventListener("click", () => {
  if (document.pointerLockElement !== canvas) canvas.requestPointerLock();
});

document.addEventListener("pointerlockchange", () => {
  hint.style.display =
    document.pointerLockElement === canvas ? "none" : "block";
});

document.addEventListener("mousemove", (event) => {
  if (document.pointerLockElement !== canvas) return;

  cameraYaw -= event.movementX * mouseSensitivity;
  // Mouse para cima = olhar para cima = câmera desce
  cameraPitch = THREE.MathUtils.clamp(
    cameraPitch + event.movementY * mouseSensitivity,
    minPitch,
    maxPitch,
  );
});

// Roda do mouse ajusta o zoom desejado
window.addEventListener("wheel", (event) => {
  preferredDistance = THREE.MathUtils.clamp(
    preferredDistance + Math.sign(event.deltaY) * 0.8,
    3,
    14,
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
    player.position.z,
  );

  // Direção do alvo para a câmera (esférica: yaw + pitch)
  const cosP = Math.cos(cameraPitch);
  camDir.set(
    -Math.sin(cameraYaw) * cosP,
    Math.sin(cameraPitch),
    -Math.cos(cameraYaw) * cosP,
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
          preferredDistance,
        )
      : preferredDistance;

  // Aproxima rápido (evita atravessar objetos) e afasta devagar (suave)
  if (snap) {
    currentDistance = allowed;
  } else {
    const rate = allowed < currentDistance ? 25 : 3;
    currentDistance +=
      (allowed - currentDistance) * (1 - Math.exp(-rate * delta));
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
      Math.cos(targetAngle - player.rotation.y),
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
    0.9 + Math.cos(elapsed * 7) * 0.1,
  );

  flame.rotation.y = Math.sin(elapsed * 3) * 0.15;
  fireLight.intensity = 8 * flicker;

  // Renderização principal.
  renderer.render(scene, camera);

  // Renderiza o mapa superior do Frustum Culling.
  if (diagnosticMode === "frustum") {
    updateFrustumView();

    const insetWidth = Math.min(440, Math.floor(window.innerWidth * 0.45));
    const insetHeight = Math.min(360, Math.floor(window.innerHeight * 0.45));
    const insetX = window.innerWidth - insetWidth - 12;
    const insetY = window.innerHeight - insetHeight - 12;

    renderer.clearDepth();
    renderer.setScissorTest(true);
    renderer.setViewport(insetX, insetY, insetWidth, insetHeight);
    renderer.setScissor(insetX, insetY, insetWidth, insetHeight);

    // Ajusta o enquadramento superior para manter o mapa quadrado.
    const aspect = insetWidth / insetHeight;
    const viewSize = 55;

    frustumViewCamera.left = -viewSize * aspect;
    frustumViewCamera.right = viewSize * aspect;
    frustumViewCamera.top = viewSize;
    frustumViewCamera.bottom = -viewSize;
    frustumViewCamera.updateProjectionMatrix();

    renderer.render(frustumScene, frustumViewCamera);

    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
  }
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();
