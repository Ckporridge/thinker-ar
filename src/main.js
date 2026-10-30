import * as THREE from 'three';
import { USDLoader } from 'three/addons/loaders/USDLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const canvas = document.getElementById('scene');
const loading = document.getElementById('loading');
const loadText = document.getElementById('loadText');
const progressBar = document.getElementById('progressBar');
const progressWrap = progressBar?.parentElement;
const errorPanel = document.getElementById('error');
const errorText = document.getElementById('errorText');
const retryButton = document.getElementById('retry');
const hint = document.getElementById('hint');
const btnRotate = document.getElementById('btnRotate');
const btnReset = document.getElementById('btnReset');
const btnFullscreen = document.getElementById('btnFullscreen');
const arBtn = document.getElementById('arBtn');
const sceneAr = document.getElementById('sceneAr');
const iosAr = document.getElementById('iosAr');
const arNote = document.getElementById('arNote');
const arOverlay = document.getElementById('arOverlay');
const arInstruction = document.getElementById('arInstruction');
const arExit = document.getElementById('arExit');

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isAndroid = /Android/i.test(navigator.userAgent);
const isTouch = matchMedia('(pointer: coarse)').matches;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
} catch (error) {
  showError('This browser cannot start WebGL. Try a current Safari, Chrome, or Android browser.');
  throw error;
}

renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, window.innerWidth / window.innerHeight, 0.01, 200);
camera.position.set(1.15, 0.92, 1.45);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.enablePan = false;
controls.minDistance = 0.7;
controls.maxDistance = 6;
controls.minPolarAngle = 0.18;
controls.maxPolarAngle = Math.PI * 0.54;
controls.target.set(0, 0.50, 0);
controls.autoRotate = !isTouch && !reduceMotion;
controls.autoRotateSpeed = 0.72;

scene.add(new THREE.HemisphereLight(0xffffff, 0x929aa4, 2.45));
const keyLight = new THREE.DirectionalLight(0xffffff, 2.75);
keyLight.position.set(2.3, 4.2, 3.1);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024);
keyLight.shadow.camera.left = -1.3;
keyLight.shadow.camera.right = 1.3;
keyLight.shadow.camera.top = 1.3;
keyLight.shadow.camera.bottom = -1.3;
keyLight.shadow.camera.near = 0.1;
keyLight.shadow.camera.far = 9;
keyLight.shadow.bias = -0.00035;
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0xffffff, 1.15);
fillLight.position.set(-3.2, 2.2, -2.4);
scene.add(fillLight);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(7, 7),
  new THREE.ShadowMaterial({ color: 0x3d4a59, opacity: 0.16 })
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.006;
floor.receiveShadow = true;
scene.add(floor);

const modelPivot = new THREE.Group();
scene.add(modelPivot);

const arRingGeometry = new THREE.RingGeometry(0.075, 0.095, 40).rotateX(-Math.PI / 2);
const arRing = new THREE.Mesh(
  arRingGeometry,
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthTest: false })
);
arRing.matrixAutoUpdate = false;
arRing.renderOrder = 999;
arRing.visible = false;
scene.add(arRing);

const AR_SIZE = 0.18;
const AR_HINT_IDLE = 'Move your phone slowly to find a surface';
const AR_HINT_FOUND = 'Tap the ring to place the Table Alarm';
const AR_HINT_PLACED = 'Placed. Exit AR when you are done';

let modelRoot = null;
let modelLoaded = false;
let stationaryTransform = null;
let currentCameraTarget = new THREE.Vector3(0, 0.50, 0);
let viewTargetY = 0.50;
let arSession = null;
let arHitTestSource = null;
let arPlaced = false;
let arStarting = false;
let hintTimer = 0;

function showError(message) {
  loading.classList.add('is-hidden');
  errorPanel.hidden = false;
  errorText.textContent = message;
}

function hideError() {
  errorPanel.hidden = true;
}

function setProgress(loaded, total) {
  if (!total || !Number.isFinite(total) || total <= 0) {
    progressWrap.classList.add('indeterminate');
    loadText.textContent = loaded ? `${(loaded / 1024 / 1024).toFixed(1)} MB` : 'Fetching USDZ model…';
    return;
  }
  progressWrap.classList.remove('indeterminate');
  const pct = Math.min(100, Math.max(0, (loaded / total) * 100));
  progressBar.style.width = `${pct.toFixed(1)}%`;
  loadText.textContent = pct >= 99 ? 'Preparing geometry…' : `${pct.toFixed(0)}% · ${(loaded / 1024 / 1024).toFixed(1)} / ${(total / 1024 / 1024).toFixed(1)} MB`;
}

function finishLoading() {
  loading.classList.add('is-hidden');
  setTimeout(() => { loading.hidden = true; }, 420);
  hint.classList.remove('is-hidden');
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => hint.classList.add('is-hidden'), 5200);
}

function viewDistance() {
  const aspect = window.innerWidth / Math.max(1, window.innerHeight);
  if (aspect < 0.85) return 3.15;
  if (aspect < 1.15) return 2.9;
  return 2.5;
}

function fitInitialCamera(instant = true) {
  const target = new THREE.Vector3(0, viewTargetY, 0);
  const position = new THREE.Vector3(1.18, 0.94, 1.52);
  camera.position.copy(position.normalize().multiplyScalar(viewDistance()));
  controls.target.copy(target);
  currentCameraTarget.copy(target);
  controls.update();
  if (instant) {
    camera.lookAt(target);
  }
}

function resetCamera() {
  if (renderer.xr.isPresenting) return;
  controls.target.set(0, viewTargetY, 0);
  const start = camera.position.clone();
  const end = new THREE.Vector3(1.18, 0.94, 1.52).normalize().multiplyScalar(viewDistance());
  const t0 = performance.now();
  const duration = 420;
  function step(now) {
    const t = Math.min(1, (now - t0) / duration);
    const e = 1 - Math.pow(1 - t, 3);
    camera.position.lerpVectors(start, end, e);
    controls.update();
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function setAutoRotate(on) {
  controls.autoRotate = on;
  btnRotate.classList.toggle('is-on', on);
  btnRotate.setAttribute('aria-pressed', String(on));
}

function loadModel() {
  hideError();
  loading.hidden = false;
  loading.classList.remove('is-hidden');
  progressBar.style.width = '0%';
  progressWrap.classList.remove('indeterminate');
  loadText.textContent = 'Fetching USDZ model…';

  const loader = new USDLoader();
  loader.load(
    'model.usdz',
    (root) => {
      if (modelRoot) {
        modelPivot.remove(modelRoot);
        disposeObject(modelRoot);
      }

      root.updateWorldMatrix(true, true);
      const box = new THREE.Box3().setFromObject(root);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const scale = 1 / maxDim;
      viewTargetY = (size.y * scale) / 2;

      const wrap = new THREE.Group();
      wrap.add(root);
      wrap.scale.setScalar(scale);
      wrap.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
      root.traverse((object) => {
        if (!object.isMesh) return;
        object.castShadow = true;
        object.receiveShadow = true;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          if (!material) continue;
          material.side = THREE.FrontSide;
          if ('envMapIntensity' in material) material.envMapIntensity = 0.85;
        }
      });

      modelRoot = wrap;
      modelPivot.add(wrap);
      modelPivot.position.set(0, 0, 0);
      modelPivot.quaternion.identity();
      modelPivot.scale.setScalar(1);
      modelPivot.visible = true;

      stationaryTransform = {
        position: modelPivot.position.clone(),
        quaternion: modelPivot.quaternion.clone(),
        scale: modelPivot.scale.clone(),
      };

      modelLoaded = true;
      arBtn.disabled = false;
      fitInitialCamera(true);
      finishLoading();
      setAutoRotate(!isTouch && !reduceMotion);
      window.__arReady = true;
    },
    (event) => setProgress(event.loaded || 0, event.total || 0),
    (error) => {
      console.error(error);
      showError('The USDZ model could not load. Check the file and reload.');
    }
  );
}

function disposeObject(object) {
  object.traverse((child) => {
    if (!child.isMesh) return;
    child.geometry?.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (!material) continue;
      for (const value of Object.values(material)) {
        if (value && value.isTexture) value.dispose();
      }
      material.dispose();
    }
  });
}

function isMobileDevice() {
  return isTouch || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

async function setupARAvailability() {
  const glbUrl = new URL('model-android.glb', window.location.href).href;
  sceneAr.href = 'https://arvr.google.com/scene-viewer/1.0'
    + `?file=${encodeURIComponent(glbUrl)}&mode=ar_preferred&resizable=true&title=${encodeURIComponent('Table Alarm')}`;

  if (isIOS) {
    iosAr.hidden = false;
    arBtn.hidden = true;
    sceneAr.hidden = true;
    arNote.classList.add('is-hidden');
    return;
  }

  if (navigator.xr && navigator.xr.isSessionSupported) {
    try {
      const supported = await navigator.xr.isSessionSupported('immersive-ar');
      if (supported) {
        arBtn.hidden = false;
        sceneAr.hidden = true;
        arNote.classList.add('is-hidden');
        return;
      }
    } catch (error) {
      console.info('WebXR check failed', error);
    }
  }

  arBtn.hidden = true;
  if (isAndroid) {
    sceneAr.hidden = false;
    arNote.classList.remove('is-hidden');
    arNote.textContent = 'Opens Google Scene Viewer · ARCore required.';
    return;
  }
  sceneAr.hidden = true;
  arNote.classList.remove('is-hidden');
  arNote.textContent = isMobileDevice()
    ? 'AR needs a compatible browser with AR support. You can still explore the 3D model.'
    : 'Open on a phone to place the model in AR.';
}

function getSavedTransform() {
  if (!stationaryTransform) return null;
  return {
    position: stationaryTransform.position.clone(),
    quaternion: stationaryTransform.quaternion.clone(),
    scale: stationaryTransform.scale.clone(),
  };
}

async function startAR() {
  if (arStarting || !navigator.xr || !modelLoaded) return;
  arStarting = true;
  hideError();
  arOverlay.hidden = false;
  arInstruction.textContent = AR_HINT_IDLE;
  try {
    const session = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['hit-test'],
      optionalFeatures: ['dom-overlay', 'light-estimation'],
      domOverlay: { root: arOverlay },
    });

    arSession = session;
    session.addEventListener('end', onAREnd);
    session.addEventListener('select', onARSelect);

    await renderer.xr.setSession(session);
    const viewerSpace = await session.requestReferenceSpace('viewer');
    arHitTestSource = await session.requestHitTestSource({ space: viewerSpace });

    stationaryTransform = getSavedTransform() || stationaryTransform;
    modelPivot.visible = false;
    arPlaced = false;
    arRing.visible = false;
    floor.visible = false;
    document.body.classList.add('ar-active');
    setAutoRotate(false);
    controls.enabled = false;
    hint.classList.add('is-hidden');
  } catch (error) {
    console.error('AR start failed', error);
    arSession = null;
    arStarting = false;
    arOverlay.hidden = true;
    if (isAndroid) {
      sceneAr.hidden = false;
      arNote.textContent = 'Tap View in AR to open Google Scene Viewer.';
    } else {
      arNote.textContent = 'AR could not start here. Try Safari on iPhone/iPad.';
    }
    arNote.classList.remove('is-hidden');
  }
}

function onARSelect() {
  if (!arSession || arPlaced || !arRing.visible) return;
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  arRing.matrix.decompose(position, quaternion, scale);
  modelPivot.position.copy(position);
  modelPivot.quaternion.copy(quaternion);
  modelPivot.scale.setScalar(AR_SIZE);
  modelPivot.visible = true;
  modelPivot.updateMatrixWorld(true);
  arPlaced = true;
  arRing.visible = false;
  arInstruction.textContent = AR_HINT_PLACED;
}

function onAREnd() {
  arSession = null;
  arHitTestSource = null;
  arStarting = false;
  arPlaced = false;
  arRing.visible = false;
  floor.visible = true;
  arOverlay.hidden = true;
  document.body.classList.remove('ar-active');
  controls.enabled = true;
  const saved = getSavedTransform();
  if (saved) {
    modelPivot.position.copy(saved.position);
    modelPivot.quaternion.copy(saved.quaternion);
    modelPivot.scale.copy(saved.scale);
    modelPivot.visible = true;
  }
  setAutoRotate(!isTouch && !reduceMotion);
}

function onFrame(time, frame) {
  if (renderer.xr.isPresenting) {
    if (!arPlaced && frame && arHitTestSource) {
      const referenceSpace = renderer.xr.getReferenceSpace();
      if (referenceSpace) {
        const results = frame.getHitTestResults(arHitTestSource);
        if (results.length > 0) {
          const pose = results[0].getPose(referenceSpace);
          if (pose) {
            arRing.visible = true;
            arRing.matrix.fromArray(pose.transform.matrix);
            arRing.matrixWorldNeedsUpdate = true;
            if (arInstruction.textContent !== AR_HINT_FOUND) arInstruction.textContent = AR_HINT_FOUND;
          }
        } else {
          arRing.visible = false;
          if (arInstruction.textContent !== AR_HINT_IDLE) arInstruction.textContent = AR_HINT_IDLE;
        }
      }
    }
  } else {
    controls.update();
  }
  renderer.render(scene, camera);
}

btnRotate.addEventListener('click', () => {
  setAutoRotate(!controls.autoRotate);
  hint.classList.add('is-hidden');
});
btnReset.addEventListener('click', () => {
  resetCamera();
  hint.classList.add('is-hidden');
});
btnFullscreen.addEventListener('click', async () => {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  } catch (error) {
    console.info('Fullscreen unavailable', error);
  }
});
arBtn.addEventListener('click', startAR);
arExit.addEventListener('click', () => arSession?.end());
retryButton.addEventListener('click', () => {
  errorPanel.hidden = true;
  modelLoaded = false;
  loadModel();
});

canvas.addEventListener('pointerdown', () => hint.classList.add('is-hidden'), { passive: true });
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) controls.autoRotate = false;
  else if (modelLoaded && !renderer.xr.isPresenting) setAutoRotate(!isTouch && !reduceMotion);
});

if (!document.documentElement.requestFullscreen || isIOS) btnFullscreen.hidden = true;

setAutoRotate(!isTouch && !reduceMotion);
renderer.setAnimationLoop(onFrame);
fitInitialCamera(true);
loadModel();
setupARAvailability();
