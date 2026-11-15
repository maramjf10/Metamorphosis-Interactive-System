import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';
const loader = new GLTFLoader();
export async function createParticleCreature({
  scene,
  url,
  particleCount = 16000,
  size = 0.045,
  scale = 4.5
}) {
  const gltf = await new Promise((resolve, reject) => {
    loader.load(url, resolve, undefined, reject);
  });
  const model = gltf.scene;
  model.updateMatrixWorld(true);
  const meshes = [];
  model.traverse((object) => {
    if (object.isMesh && object.geometry) {
      meshes.push(object);
    }
  });

  if (!meshes.length) {
    throw new Error(`No mesh found in ${url}`);
  }
  const meshSamplers = meshes.map((mesh) => {
    const sampler = new MeshSurfaceSampler(mesh).build();
    return { mesh, sampler };
  });

  const weights = meshSamplers.map(({ mesh }) => {
    return mesh.geometry.attributes.position.count;
  });

  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const positions = [];
  const colors = [];
  const point = new THREE.Vector3();
  const vertexColor = new THREE.Color(1, 1, 1);
  for (let m = 0; m < meshSamplers.length; m++) {
    const { mesh, sampler } = meshSamplers[m];
    const material = Array.isArray(mesh.material)
      ? mesh.material[0]
      : mesh.material;
    const count = Math.round(
      particleCount * weights[m] / totalWeight
    );

    const hasVertexColors = !!mesh.geometry.attributes.color;
    for (let i = 0; i < count; i++) {
      if (hasVertexColors) {
        sampler.sample(point, undefined, vertexColor);
      } else {
        sampler.sample(point);
        vertexColor.set(0xffffff);
      }
      const worldPoint = point.clone()
        .applyMatrix4(mesh.matrixWorld);
      positions.push(
        worldPoint.x,
        worldPoint.y,
        worldPoint.z
      );

      const particleColor = material?.color
        ? material.color.clone()
        : new THREE.Color(0xffffff);

      if (hasVertexColors) {
        particleColor.multiply(vertexColor);
      }
      colors.push(
        particleColor.r,
        particleColor.g,
        particleColor.b
      );
    }
  }

  const sourceGeometry = new THREE.BufferGeometry();
  sourceGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3)
  );
  sourceGeometry.computeBoundingBox();
  const center = sourceGeometry.boundingBox.getCenter(
    new THREE.Vector3()
  );

  const dimensions = new THREE.Vector3();
  sourceGeometry.boundingBox.getSize(dimensions);
  const maxDimension = Math.max(
    dimensions.x,
    dimensions.y,
    dimensions.z
  );

  const scaleFactor = maxDimension > 0
    ? scale / maxDimension
    : 1;
  const count = positions.length / 3;
  const basePositions = new Float32Array(count * 3);
  const expandedPositions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const index = i * 3;
    const x = (positions[index] - center.x) * scaleFactor;
    const y = (positions[index + 1] - center.y) * scaleFactor;
    const z = (positions[index + 2] - center.z) * scaleFactor;

    basePositions[index] = x;
    basePositions[index + 1] = y;
    basePositions[index + 2] = z;

    const direction = new THREE.Vector3(
      Math.random() * 2 - 1,
      Math.random() * 2 - 1,
      Math.random() * 2 - 1
    ).normalize();
    const spread = 3.5 + Math.random() * 4.5;

    expandedPositions[index] = x + direction.x * spread;
    expandedPositions[index + 1] = y + direction.y * spread;
    expandedPositions[index + 2] = z + direction.z * spread;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(basePositions.slice(), 3)
  );

  geometry.setAttribute(
    'color',
    new THREE.Float32BufferAttribute(colors, 3)
  );

  geometry.userData.basePositions = basePositions;
  geometry.userData.expandedPositions = expandedPositions;
  const particleMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uSize: { value: size }
    },

    vertexShader: `
      uniform float uSize;

      attribute vec3 color;
      varying vec3 vColor;

      void main() {
        vColor = color;

        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);

        gl_PointSize = clamp(
          uSize * 300.0 / max(-mvPosition.z, 0.1),
          1.0,
          12.0
        );

        gl_Position = projectionMatrix * mvPosition;
      }
    `,

    fragmentShader: `
      varying vec3 vColor;

      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        float d = length(uv);

        if (d > 0.5) discard;

        float glow = exp(-d * 10.0);
        float core = 1.0 - smoothstep(0.05, 0.5, d);

        gl_FragColor = vec4(
          vColor * (0.8 + glow * 1.5),
          core
        );

        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,

    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  const particles = new THREE.Points(geometry, particleMaterial);
  scene.add(particles);
  return particles;
}

export function updateParticleCreature(particles, expansion) {
  const geometry = particles.geometry;
  const base = geometry.userData.basePositions;
  const expanded = geometry.userData.expandedPositions;
  const positions = geometry.attributes.position.array;
  const t = THREE.MathUtils.clamp(expansion, 0, 1);
  const eased = t * t * (3 - 2 * t);
  for (let i = 0; i < positions.length; i++) {
    positions[i] =
      base[i] + (expanded[i] - base[i]) * eased;
  }

  geometry.attributes.position.needsUpdate = true;
}
