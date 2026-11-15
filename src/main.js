import './style.css';
import * as THREE from 'three';
import {
  createParticleCreature,
  updateParticleCreature
} from './effects/particleSystem.js';
import {
  FilesetResolver,
  HandLandmarker
} from '@mediapipe/tasks-vision';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020108);
const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);

camera.position.set(0, 0, 11);
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: false,
  powerPreference: 'high-performance'
});

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
document
  .querySelector('#scene-container')
  .appendChild(renderer.domElement);

const starGeometry = new THREE.BufferGeometry();
const starPositions = [];
for (let i = 0; i < 3000; i++) {
  starPositions.push(
    (Math.random() - 0.5) * 55,
    (Math.random() - 0.5) * 40,
    (Math.random() - 0.5) * 35
  );
}

starGeometry.setAttribute(
  'position',
  new THREE.Float32BufferAttribute(starPositions, 3)
);

const stars = new THREE.Points(
  starGeometry,
  new THREE.PointsMaterial({
    color: 0xaaa1ff,
    size: 0.025,
    transparent: true,
    opacity: 0.65
  })
);

scene.add(stars);

const modelSettings = {
  butterfly: {
    url: '/models/butterfly.glb',
    count: 18000,
    size: 0.045,
    scale: 4.5
  },

  jellyfish: {
    url: '/models/jellyfish-light.glb',
    count: 18000,
    size: 0.045,
    scale: 4.5
  },

  tree: {
    url: '/models/apple-tree-light.glb',
    count: 18000,
    size: 0.045,
    scale: 4.5
  },

  cactus: {
    url: '/models/cactus.glb',
    count: 18000,
    size: 0.045,
    scale: 4.5
  }
};

const expansionSlider = document.querySelector('#expansion');
const expansionValue = document.querySelector('#expansion-value');
let targetExpansion = 0;
let currentExpansion = 0;
let sliderIsActive = false;


const creatures = {};
let selectedCreature = 'butterfly';
const status = document.querySelector('#status');
async function loadCreatures() {
  try {
    status.textContent = 'BEEP BEPP LOADING...';

    for (const [name, settings] of Object.entries(modelSettings)) {
      creatures[name] = await createParticleCreature({
        scene,
        url: settings.url,
        particleCount: settings.count,
        size: settings.size,
        scale: settings.scale
      });

      creatures[name].visible = name === selectedCreature;
    }

    status.textContent = 'SYSTEM ONLINE';
    updateSelectionInterface();

  } catch (error) {
    console.error('Model loading failed:', error);
    status.textContent = 'BLEH MODEL LOADING ERROR';
  }
}

loadCreatures();

const modelButtons = document.querySelectorAll('.model-button');
function selectCreature(name) {
  if (!creatures[name]) return;

  selectedCreature = name;

  Object.entries(creatures).forEach(([key, creature]) => {
    creature.visible = key === name;
  });

  targetExpansion = 0;
  currentExpansion = 0;

  expansionSlider.value = 0;
  expansionValue.textContent = '0%';

  updateParticleCreature(creatures[name], 0);

  updateSelectionInterface();
}

function updateSelectionInterface() {
  modelButtons.forEach((button) => {
    const active = button.dataset.model === selectedCreature;

    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });

  const names = {
    butterfly: 'BUTTERFLY',
    jellyfish: 'JELLYFISH',
    tree: 'TREE',
    cactus: 'CACTUS'
  };

  document.querySelector('#creature-name').textContent =
    names[selectedCreature];
}

modelButtons.forEach((button) => {
  button.addEventListener('click', () => {
    selectCreature(button.dataset.model);
  });
});

expansionSlider.addEventListener('pointerdown', () => {
  sliderIsActive = true;
});

window.addEventListener('pointerup', () => {
  sliderIsActive = false;
});

expansionSlider.addEventListener('input', () => {
  targetExpansion = Number(expansionSlider.value) / 100;

  expansionValue.textContent = `${expansionSlider.value}%`;
});

window.addEventListener('keydown', (event) => {
  if (
    event.code === 'Space' &&
    !['INPUT', 'BUTTON'].includes(event.target.tagName)
  ) {
    event.preventDefault();

    targetExpansion = targetExpansion > 0.5 ? 0 : 1;

    expansionSlider.value = Math.round(targetExpansion * 100);
    expansionValue.textContent = `${expansionSlider.value}%`;
  }
});


const cameraToggle = document.querySelector('#camera-toggle');
const cameraPanel = document.querySelector('#camera-panel');
const webcamVideo = document.querySelector('#webcam-video');
const cameraStatus = document.querySelector('#camera-status');
const cameraPlaceholder = document.querySelector('#camera-placeholder');

let handLandmarker = null;
let cameraStream = null;
let cameraEnabled = false;
let trackingFrame = null;
let lastVideoTime = -1;
let stableGesture = 0;
let pendingGesture = null;
let gestureFrameCount = 0;
let twoHandsDetected = false;
let modelSwitchReady = true;
let handCountFrame = 0;

const REQUIRED_TWO_HAND_FRAMES = 8;

const REQUIRED_GESTURE_FRAMES = 5;

async function initializeHandTracking() {
  if (handLandmarker) return;

  cameraStatus.textContent = 'LOADING HAND TRACKING...';

  const vision = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
  );

  const modelUrl =
    'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

  try {
    handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: modelUrl,
        delegate: 'GPU'
      },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

  } catch (gpuError) {
    console.warn('GPU hand tracking unavailable. Trying CPU.', gpuError);

    handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: modelUrl,
        delegate: 'CPU'
      },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5
    });
  }
}

async function startCamera() {
  if (cameraEnabled) return;

  if (!navigator.mediaDevices?.getUserMedia) {
    cameraStatus.textContent = 'CAMERA NOT AVAILABLE';
    return;
  }

  cameraToggle.disabled = true;
  cameraStatus.textContent = 'STARTING CAMERA...';

  try {
    await initializeHandTracking();

    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        facingMode: 'user'
      },
      audio: false
    });

    webcamVideo.srcObject = cameraStream;
    await webcamVideo.play();

    cameraEnabled = true;

    cameraPanel.classList.add('camera-active');
    cameraPanel.classList.remove('camera-off');
    webcamVideo.style.display = 'block';
    cameraPlaceholder.style.display = 'none';
    cameraToggle.textContent = 'TURN CAMERA OFF';
    cameraToggle.classList.add('camera-on');
    cameraStatus.textContent = 'CAMERA ON · SHOW YOUR HAND';
    lastVideoTime = -1;

    detectHands();

    } catch (error) {
    console.error('Camera error:', error);

    const message =
      error.name === 'NotAllowedError'
        ? 'CAMERA PERMISSION DENIED'
        : 'CAMERA START FAILED';

    stopCamera();
    cameraStatus.textContent = message;

  } finally {
    cameraToggle.disabled = false;
  }
}

function stopCamera() {
  cameraEnabled = false;

  if (trackingFrame !== null) {
    cancelAnimationFrame(trackingFrame);
    trackingFrame = null;
  }

  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
  }

  webcamVideo.pause();
  webcamVideo.srcObject = null;
  webcamVideo.style.display = 'none';
  cameraPlaceholder.style.display = 'flex';
  cameraPanel.classList.remove('camera-active');
  cameraPanel.classList.add('camera-off');
  cameraToggle.textContent = 'TURN CAMERA ON';
  cameraToggle.classList.remove('camera-on');
  cameraStatus.textContent = 'CAMERA OFF';

  if (handLandmarker) {
    handLandmarker.close();
    handLandmarker = null;
  }
}

cameraToggle.addEventListener('click', () => {
  if (cameraEnabled) {
    stopCamera();
  } else {
    startCamera();
  }
});


function calculateHandOpenness(landmarks) {
  const wrist = landmarks[0];

  const fingers = [
    [8, 6],   // Index
    [12, 10], // Middle
    [16, 14], // Ring
    [20, 18]  // Pinky
  ];

  let extendedFingers = 0;

  fingers.forEach(([tipIndex, jointIndex]) => {
    const tip = landmarks[tipIndex];
    const joint = landmarks[jointIndex];
    const tipDistance = Math.hypot(
      tip.x - wrist.x,
      tip.y - wrist.y
    );

    const jointDistance = Math.hypot(
      joint.x - wrist.x,
      joint.y - wrist.y
    );

    if (tipDistance > jointDistance * 1.15) {
      extendedFingers++;
    }
  });

  if (extendedFingers >= 3) return 1;
  if (extendedFingers <= 1) return 0;

  return null;
}

function detectHands() {
  if (!cameraEnabled || !handLandmarker) return;

  if (
    webcamVideo.readyState >= 2 &&
    webcamVideo.currentTime !== lastVideoTime
  ) {
    lastVideoTime = webcamVideo.currentTime;

    try {
      const results = handLandmarker.detectForVideo(
        webcamVideo,
        performance.now()
      );

      const handCount = results.landmarks
        ? results.landmarks.length
        : 0;
      if (handCount >= 2) {
        twoHandsDetected = true;
        handCountFrame++;
        if (
          handCountFrame >= REQUIRED_TWO_HAND_FRAMES &&
          modelSwitchReady
        ) {
          const modelOrder = Object.keys(modelSettings);
          const currentIndex = modelOrder.indexOf(selectedCreature);
          const nextIndex =
            (currentIndex + 1) % modelOrder.length;
          const nextCreature = modelOrder[nextIndex];
          selectCreature(nextCreature);
          stableGesture = 0;
          pendingGesture = null;
          gestureFrameCount = 0;
          modelSwitchReady = false;
          cameraStatus.textContent =
            'MODEL CHANGED · SHOW ONE HAND';
        } else if (!modelSwitchReady) {
          cameraStatus.textContent =
            'TWO HANDS · MODEL SELECTED';
        } else {
          cameraStatus.textContent =
            'TWO HANDS · SWITCHING...';
        }
      }

      else if (handCount === 1) {
        twoHandsDetected = false;
        handCountFrame = 0;
        modelSwitchReady = true;

        const landmarks = results.landmarks[0];
        const openness = calculateHandOpenness(landmarks);

        if (openness !== null) {
          if (openness === pendingGesture) {
            gestureFrameCount++;
          } else {
            pendingGesture = openness;
            gestureFrameCount = 1;
          }

          if (gestureFrameCount >= REQUIRED_GESTURE_FRAMES) {
            stableGesture = pendingGesture;
          }
        }

        if (!sliderIsActive) {
          targetExpansion = stableGesture;

          const percentage = targetExpansion * 100;
          expansionSlider.value = percentage;
          expansionValue.textContent = `${percentage}%`;
        }

        cameraStatus.textContent =
          stableGesture === 1
            ? 'HAND OPEN · EXPANDING'
            : 'HAND CLOSED · CONTRACTING';
      }
      else {
        twoHandsDetected = false;
        handCountFrame = 0;
        modelSwitchReady = true;
        cameraStatus.textContent = 'NO HAND DETECTED';
      }

    } catch (error) {
      console.error('Hand detection error:', error);
      cameraStatus.textContent = 'TRACKING ERROR';
    }
  }
  trackingFrame = requestAnimationFrame(detectHands);
}

function animate() {
  requestAnimationFrame(animate);
  currentExpansion +=
  (targetExpansion - currentExpansion) * 0.035;
  const activeCreature = creatures[selectedCreature];
  if (activeCreature) {
    updateParticleCreature(
      activeCreature,
      currentExpansion
    );

    activeCreature.rotation.y += 0.0007;
  }

  stars.rotation.y += 0.00004;
  renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(
    Math.min(window.devicePixelRatio, 2)
  );
});

window.addEventListener('beforeunload', () => {
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
  }

  if (handLandmarker) {
    handLandmarker.close();
  }
});
