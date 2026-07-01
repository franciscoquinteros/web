import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// --- Configuración ---
const AR_LAT = -38;   // latitud de Argentina
const AR_LON = -63;   // longitud de Argentina
const RADIUS = 1;     // radio del globo
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const canvas = document.getElementById('globe');

// --- Escena / cámara / renderer ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070d);

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 100);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

// Convierte lat/lon a un punto sobre la esfera (alineado con la textura equirectangular)
function latLonToVector3(lat, lon, radius) {
  const phi = (90 - lat) * Math.PI / 180;
  const theta = (lon + 180) * Math.PI / 180;
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

// --- Globo ---
const globe = new THREE.Group();
scene.add(globe);

const earthMat = new THREE.MeshStandardMaterial({ color: 0x123047, roughness: 1, metalness: 0 });
const earth = new THREE.Mesh(new THREE.SphereGeometry(RADIUS, 64, 64), earthMat);
globe.add(earth);

// Malla de respaldo: solo se muestra si la textura no carga
const wire = new THREE.LineSegments(
  new THREE.WireframeGeometry(new THREE.SphereGeometry(RADIUS * 1.001, 24, 24)),
  new THREE.LineBasicMaterial({ color: 0x2b5a80, transparent: true, opacity: 0.28 })
);
wire.visible = false;
globe.add(wire);

// Textura de la Tierra (CDN) con fallback a color plano + wireframe
const loader = new THREE.TextureLoader();
loader.setCrossOrigin('anonymous');
loader.load(
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/textures/planets/earth_atmos_2048.jpg',
  (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    earthMat.map = tex;
    earthMat.color.set(0xffffff);
    earthMat.needsUpdate = true;
  },
  undefined,
  () => { wire.visible = true; }
);

// --- Atmósfera (glow tipo fresnel) ---
const atmosphere = new THREE.Mesh(
  new THREE.SphereGeometry(RADIUS * 1.18, 64, 64),
  new THREE.ShaderMaterial({
    uniforms: { glowColor: { value: new THREE.Color(0x5aa9e6) } },
    vertexShader: /* glsl */`
      varying vec3 vNormal;
      varying vec3 vPos;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vPos = mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vNormal;
      varying vec3 vPos;
      uniform vec3 glowColor;
      void main() {
        vec3 viewDir = normalize(-vPos);
        float rim = 1.0 - abs(dot(viewDir, vNormal));
        rim = pow(rim, 3.0);
        gl_FragColor = vec4(glowColor, rim);
      }`,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false
  })
);
scene.add(atmosphere);

// --- Marcador sobre Argentina ---
const markerGroup = new THREE.Group();
markerGroup.position.copy(latLonToVector3(AR_LAT, AR_LON, RADIUS * 1.005));
globe.add(markerGroup);

const dot = new THREE.Mesh(
  new THREE.SphereGeometry(0.018, 16, 16),
  new THREE.MeshBasicMaterial({ color: 0xffcf5c })
);
markerGroup.add(dot);

// Halo dorado pulsante (sprite con textura radial generada por canvas)
function makeGlowTexture() {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,207,92,0.95)');
  g.addColorStop(0.25, 'rgba(255,180,60,0.5)');
  g.addColorStop(1, 'rgba(255,180,60,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const halo = new THREE.Sprite(new THREE.SpriteMaterial({
  map: makeGlowTexture(),
  blending: THREE.AdditiveBlending,
  transparent: true,
  depthWrite: false
}));
halo.scale.setScalar(0.22);
markerGroup.add(halo);

// --- Estrellas de fondo ---
function makeStars(count, radius) {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = radius * (0.6 + Math.random() * 0.4);
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.cos(phi);
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xffffff, size: 0.02, sizeAttenuation: true,
    transparent: true, opacity: 0.85, depthWrite: false
  });
  return new THREE.Points(geo, mat);
}
const stars = makeStars(1400, 40);
scene.add(stars);

// --- Luces ---
scene.add(new THREE.AmbientLight(0x557799, 0.35));
const keyLight = new THREE.DirectionalLight(0xffffff, 1.7);
keyLight.position.set(-2, 1.2, 2.5);
scene.add(keyLight);
const rimLight = new THREE.DirectionalLight(0x88bbff, 0.4);
rimLight.position.set(3, -1, -2);
scene.add(rimLight);

// --- Cámara mirando a Argentina + controles ---
const camDir = latLonToVector3(AR_LAT, AR_LON, 1).normalize();
camera.position.copy(camDir.multiplyScalar(3.1));
camera.position.y += 0.35;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableZoom = false;
controls.enablePan = false;
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.rotateSpeed = 0.4;
controls.minPolarAngle = Math.PI * 0.25;
controls.maxPolarAngle = Math.PI * 0.78;
controls.autoRotate = !reduceMotion;
controls.autoRotateSpeed = 0.35; // giro lento
controls.target.set(0, 0, 0);
controls.update();

// --- Resize ---
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Bucle de animación ---
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();
  if (!reduceMotion) {
    stars.rotation.y = t * 0.005;
    halo.scale.setScalar(0.2 + Math.sin(t * 2.2) * 0.05);
    halo.material.opacity = 0.7 + Math.sin(t * 2.2) * 0.25;
  }
  controls.update();
  renderer.render(scene, camera);
}
animate();
