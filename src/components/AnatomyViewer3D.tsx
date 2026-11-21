import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import {
  Camera,
  ChevronDown,
  ChevronUp,
  Expand,
  Eye,
  Layers,
  Maximize2,
  Minimize2,
  Move,
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Sun,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { AnatomicalSystemId, AnatomyPartMetadata, SpeciesRecord } from '../types/anatomy';
import {
  loadHumanAtlasProgressive,
  BuiltAnatomyAssembly,
  HumanAtlasStreamProgress,
  SYSTEM_STACK_DEPTH,
} from '../three/HumanAtlasLoader';

export type CameraPreset = 'iso' | 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';
type DockTab = 'camera' | 'axes' | 'explode' | 'lighting';

interface AnatomyViewer3DProps {
  species: SpeciesRecord;
  theme: 'light' | 'dark';
  variant?: 'hero' | 'workspace';
  visibleSystems: Set<AnatomicalSystemId>;
  hiddenPartIds: Set<string>;
  isolatedPartId: string | null;
  selectedPartId: string | null;
  ghostOuter: boolean;
  explodeAmount: number;
  onExplodeAmountChange: (val: number) => void;
  layerStackAmount?: number;
  onLayerStackAmountChange?: (val: number) => void;
  cameraPresetRequest?: { preset: CameraPreset; seq: number } | null;
  partOffsets: Record<string, [number, number, number]>;
  onResetPartOffsets: () => void;
  onSelectPart: (partId: string | null) => void;
  onDetectedMeshParts?: (parts: AnatomyPartMetadata[], supportsExplode: boolean) => void;
}

// Pre-allocated scratch math helpers (zero GC inside animation loop)
const _vec3A = new THREE.Vector3();
const _vec3B = new THREE.Vector3();

function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(128, 128, 10, 128, 128, 124);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.42)');
  grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.16)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export const AnatomyViewer3D: React.FC<AnatomyViewer3DProps> = ({
  species,
  theme,
  variant = 'workspace',
  visibleSystems,
  hiddenPartIds,
  isolatedPartId,
  selectedPartId,
  ghostOuter,
  explodeAmount,
  onExplodeAmountChange,
  layerStackAmount = 0,
  onLayerStackAmountChange,
  cameraPresetRequest,
  partOffsets,
  onResetPartOffsets,
  onSelectPart,
  onDetectedMeshParts,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasMountRef = useRef<HTMLDivElement>(null);

  const [dockOpen, setDockOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<DockTab>('camera');
  const [autoRotate, setAutoRotate] = useState(variant === 'hero');
  const [panMode, setPanMode] = useState(false);
  const [animatePhysiology, setAnimatePhysiology] = useState(true);
  const [keyLightIntensity, setKeyLightIntensity] = useState(1.25);
  const [fillLightIntensity, setFillLightIntensity] = useState(0.55);
  const [axisRotDeg, setAxisRotDeg] = useState<[number, number, number]>([0, 0, 0]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [loadingModel, setLoadingModel] = useState(false);
  const [streamProgress, setStreamProgress] = useState<HumanAtlasStreamProgress | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [webglError, setWebglError] = useState(false);
  const [supportsExplode, setSupportsExplode] = useState(true);
  const [hoveredPartLabel, setHoveredPartLabel] = useState<string | null>(null);

  // Refs for mutable sync with Three.js loop without re-initializing WebGL
  const stateRef = useRef({
    autoRotate,
    panMode,
    animatePhysiology,
    keyLightIntensity,
    fillLightIntensity,
    axisRotDeg,
    explodeAmount,
    layerStackAmount,
    partOffsets,
    visibleSystems,
    hiddenPartIds,
    isolatedPartId,
    selectedPartId,
    ghostOuter,
    theme,
    species,
  });

  stateRef.current = {
    autoRotate,
    panMode,
    animatePhysiology,
    keyLightIntensity,
    fillLightIntensity,
    axisRotDeg,
    explodeAmount,
    layerStackAmount,
    partOffsets,
    visibleSystems,
    hiddenPartIds,
    isolatedPartId,
    selectedPartId,
    ghostOuter,
    theme,
    species,
  };

  const callbacksRef = useRef({ onSelectPart, onDetectedMeshParts });
  callbacksRef.current = { onSelectPart, onDetectedMeshParts };

  const sceneRefs = useRef<{
    renderer?: THREE.WebGLRenderer;
    scene?: THREE.Scene;
    camera?: THREE.PerspectiveCamera;
    controls?: OrbitControls;
    specimenPivot?: THREE.Group;
    keyLight?: THREE.DirectionalLight;
    hemiLight?: THREE.HemisphereLight;
    rimLight?: THREE.DirectionalLight;
    shadowMat?: THREE.MeshBasicMaterial;
    gridMat?: THREE.Material;
    assembly?: BuiltAnatomyAssembly | null;
    loadedParts?: AnatomyPartMetadata[];
    gltfMixer?: THREE.AnimationMixer | null;
    gltfDisposable?: { materials: THREE.Material[]; geometries: THREE.BufferGeometry[] };
    cameraTargetPos?: THREE.Vector3 | null;
    cameraTargetLook?: THREE.Vector3 | null;
    currentExplode?: number;
    currentLayerStack?: number;
    isSoftwareGl?: boolean;
  }>({ currentExplode: 0, currentLayerStack: 0, loadedParts: [] });

  // Sync camera preset transitions (dynamically accommodates Z-axis stacked layers)
  const applyCameraPreset = useCallback((preset: CameraPreset) => {
    const { controls } = sceneRefs.current;
    if (!controls) return;
    const baseDist = variant === 'hero' ? 3.55 : 3.95;
    const sStack = stateRef.current.layerStackAmount || 0;
    const stackPad =
      sStack * (preset === 'front' || preset === 'back' ? 1.85 : 2.75);
    const dist = baseDist + stackPad;
    const targetLook = new THREE.Vector3(0, 0.05, 0);
    let pos = new THREE.Vector3(dist * 0.65, dist * 0.36, dist * 0.72);
    switch (preset) {
      case 'front':
        pos = new THREE.Vector3(0, 0.12, dist);
        break;
      case 'back':
        pos = new THREE.Vector3(0, 0.12, -dist);
        break;
      case 'left':
        pos = new THREE.Vector3(-dist, 0.14, sStack > 0.1 ? dist * 0.25 : 0);
        break;
      case 'right':
        pos = new THREE.Vector3(dist, 0.14, sStack > 0.1 ? dist * 0.25 : 0);
        break;
      case 'top':
        pos = new THREE.Vector3(0, dist, 0.01);
        break;
      case 'bottom':
        pos = new THREE.Vector3(0, -dist, 0.01);
        break;
      case 'iso':
      default:
        pos = new THREE.Vector3(dist * 0.72, dist * 0.32, dist * 0.64);
        break;
    }
    sceneRefs.current.cameraTargetPos = pos;
    sceneRefs.current.cameraTargetLook = targetLook;
  }, [variant]);

  useEffect(() => {
    if (cameraPresetRequest?.preset) {
      applyCameraPreset(cameraPresetRequest.preset);
    }
  }, [cameraPresetRequest, applyCameraPreset]);

  const handleZoomStep = useCallback((factor: number) => {
    const { camera, controls } = sceneRefs.current;
    if (!camera || !controls) return;
    _vec3A.copy(camera.position).sub(controls.target).multiplyScalar(factor);
    const len = _vec3A.length();
    if (len >= 1.1 && len <= 16.0) {
      camera.position.copy(controls.target).add(_vec3A);
      controls.update();
    }
  }, []);

  const handleResetAll = useCallback(() => {
    setAxisRotDeg([0, 0, 0]);
    onExplodeAmountChange(0);
    onLayerStackAmountChange?.(0);
    onResetPartOffsets();
    applyCameraPreset('iso');
  }, [applyCameraPreset, onExplodeAmountChange, onLayerStackAmountChange, onResetPartOffsets]);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Initialize WebGLRenderer & Scene ONCE
  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const isSoftwareGl = detectSoftwareWebGL();
    sceneRefs.current.isSoftwareGl = isSoftwareGl;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
        alpha: false,
      });
    } catch {
      setWebglError(true);
      return;
    }

    const isInitialLight = stateRef.current.theme !== 'dark';
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = isInitialLight ? 0.86 : 1.02;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const width = mount.clientWidth || 800;
    const height = mount.clientHeight || 520;
    renderer.setSize(width, height);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const bgHex = isInitialLight ? 0xdce8f4 : 0x070b14;
    scene.background = new THREE.Color(bgHex);
    scene.fog = new THREE.FogExp2(bgHex, isInitialLight ? 0.008 : 0.032);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTexture = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTexture;
    scene.environmentIntensity = isInitialLight ? 0.28 : 0.62;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    const initDist = variant === 'hero' ? 3.55 : 3.9;
    camera.position.set(initDist * 0.65, initDist * 0.36, initDist * 0.72);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.enablePan = true;
    controls.enableZoom = true;
    controls.minDistance = 1.1;
    controls.maxDistance = 16.0;
    controls.target.set(0, 0.05, 0);

    controls.addEventListener('start', () => {
      sceneRefs.current.cameraTargetPos = null;
      sceneRefs.current.cameraTargetLook = null;
    });

    // Studio 3-point lighting
    const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x334155, 0.75);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff7ed, 1.65);
    keyLight.position.set(4.5, 6.5, 4.5);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 22;
    keyLight.shadow.camera.left = -4.2;
    keyLight.shadow.camera.right = 4.2;
    keyLight.shadow.camera.top = 4.2;
    keyLight.shadow.camera.bottom = -4.2;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.65);
    rimLight.position.set(-4.5, 3.0, -4.5);
    scene.add(rimLight);

    // Subtle scientific stage floor & enlarged contact shadow (supports Z-axis stacked layers)
    const shadowTex = createContactShadowTexture();
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: isInitialLight ? 0.74 : 0.68,
    });
    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(7.2, 7.2),
      shadowMat,
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = -1.26;
    scene.add(shadowPlane);

    const gridHelper = new THREE.GridHelper(9, 22, 0x64748b, 0x334155);
    gridHelper.position.y = -1.28;
    const gridMat = gridHelper.material as THREE.Material;
    gridMat.transparent = true;
    gridMat.opacity = isInitialLight ? 0.24 : 0.16;
    scene.add(gridHelper);

    const specimenPivot = new THREE.Group();
    scene.add(specimenPivot);

    sceneRefs.current = {
      ...sceneRefs.current,
      renderer,
      scene,
      camera,
      controls,
      specimenPivot,
      keyLight,
      hemiLight,
      rimLight,
      shadowMat,
      gridMat,
      assembly: null,
      loadedParts: [],
      gltfMixer: null,
      currentExplode: 0,
      isSoftwareGl,
    };

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      setWebglError(true);
    };
    const handleContextRestored = () => setWebglError(false);
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', handleContextRestored);

    // ResizeObserver for crisp responsive resizing
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const w = Math.max(entry.contentRect.width, 100);
      const h = Math.max(entry.contentRect.height, 100);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObserver.observe(mount);

    // Raycasting pointer picking & hover
    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    let pointerDownPos = { x: 0, y: 0 };
    let lastHoverTime = 0;

    const findPartIdFromObject = (obj: THREE.Object3D | null): string | null => {
      let cur: THREE.Object3D | null = obj;
      while (cur && cur !== specimenPivot) {
        if (cur.userData?.partId) {
          return String(cur.userData.partId);
        }
        cur = cur.parent;
      }
      return null;
    };

    const onPointerDown = (e: PointerEvent) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
    };

    const onPointerMove = (e: PointerEvent) => {
      const now = performance.now();
      if (now - lastHoverTime < 60) return;
      lastHoverTime = now;
      const rect = renderer.domElement.getBoundingClientRect();
      pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointerNdc, camera);
      const hits = raycaster.intersectObjects(specimenPivot.children, true);
      const visibleHit = hits.find((h) => {
        let cur: THREE.Object3D | null = h.object;
        while (cur && cur !== specimenPivot) {
          if (!cur.visible) return false;
          cur = cur.parent;
        }
        return true;
      });
      if (visibleHit) {
        const partId = findPartIdFromObject(visibleHit.object);
        const partMeta =
          sceneRefs.current.loadedParts?.find((p) => p.id === partId) ||
          stateRef.current.species.parts.find((p) => p.id === partId);
        renderer.domElement.style.cursor = partId ? 'pointer' : 'grab';
        setHoveredPartLabel(partMeta?.name || visibleHit.object.name || null);
      } else {
        renderer.domElement.style.cursor = 'grab';
        setHoveredPartLabel(null);
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      const dx = e.clientX - pointerDownPos.x;
      const dy = e.clientY - pointerDownPos.y;
      if (Math.hypot(dx, dy) > 6) return; // Dragging camera, not clicking a part
      const rect = renderer.domElement.getBoundingClientRect();
      pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointerNdc, camera);
      const hits = raycaster.intersectObjects(specimenPivot.children, true);
      const visibleHit = hits.find((h) => {
        let cur: THREE.Object3D | null = h.object;
        while (cur && cur !== specimenPivot) {
          if (!cur.visible) return false;
          cur = cur.parent;
        }
        return true;
      });
      if (visibleHit) {
        const partId = findPartIdFromObject(visibleHit.object);
        if (partId) {
          callbacksRef.current.onSelectPart(partId);
          return;
        }
      }
      callbacksRef.current.onSelectPart(null);
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    // Animation & Paced Loop (Software WebGL Safe)
    let frameId = 0;
    let disposed = false;
    const clock = new THREE.Clock();

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (typeof gl.fenceSync === 'function') {
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          if (disposed) return;
          const status = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
          if (status === gl.UNSIGNALED) {
            frameId = window.setTimeout(poll, 5);
          } else {
            if (sync) gl.deleteSync(sync);
            frameId = window.setTimeout(cb, 80);
          }
        };
        frameId = window.setTimeout(poll, 5);
      } else {
        frameId = window.setTimeout(cb, 80);
      }
    }

    function tick() {
      if (disposed) return;
      const delta = Math.min(clock.getDelta(), 0.1);
      const elapsed = clock.getElapsedTime();
      const s = stateRef.current;

      // Sync theme background & calibrated studio lighting (prevents light-mode overexposure)
      const isLight = s.theme !== 'dark';
      const targetBg = isLight ? 0xdce8f4 : 0x070b14;
      (scene.background as THREE.Color).setHex(targetBg);
      if (scene.fog instanceof THREE.FogExp2) {
        scene.fog.color.setHex(targetBg);
        scene.fog.density = isLight ? 0.008 : 0.032;
      }
      renderer.toneMappingExposure = isLight ? 0.86 : 1.02;
      scene.environmentIntensity = isLight ? 0.28 : 0.62;
      keyLight.intensity = isLight ? s.keyLightIntensity * 0.85 : s.keyLightIntensity;
      hemiLight.intensity = isLight ? s.fillLightIntensity * 0.55 : s.fillLightIntensity;
      hemiLight.color.setHex(isLight ? 0xe0f2fe : 0xdbeafe);
      hemiLight.groundColor.setHex(isLight ? 0x1e293b : 0x334155);
      rimLight.intensity = isLight ? 0.36 : 0.65;
      rimLight.color.setHex(isLight ? 0x0369a1 : 0x38bdf8);
      if (sceneRefs.current.shadowMat) {
        sceneRefs.current.shadowMat.opacity = isLight ? 0.74 : 0.68;
      }
      if (sceneRefs.current.gridMat) {
        sceneRefs.current.gridMat.opacity = isLight ? 0.24 : 0.16;
      }

      // Orbit & Pan configuration
      controls.autoRotate = !isSoftwareGl && s.autoRotate;
      controls.autoRotateSpeed = 1.4;
      controls.mouseButtons.LEFT = s.panMode ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;

      // Smooth Camera Preset Transition
      if (sceneRefs.current.cameraTargetPos && sceneRefs.current.cameraTargetLook) {
        camera.position.lerp(sceneRefs.current.cameraTargetPos, 1 - Math.exp(-6 * delta));
        controls.target.lerp(sceneRefs.current.cameraTargetLook, 1 - Math.exp(-6 * delta));
        if (camera.position.distanceTo(sceneRefs.current.cameraTargetPos) < 0.02) {
          camera.position.copy(sceneRefs.current.cameraTargetPos);
          sceneRefs.current.cameraTargetPos = null;
          sceneRefs.current.cameraTargetLook = null;
        }
      }

      // Smooth X / Y / Z Axis Rotation on specimenPivot
      const targetRx = THREE.MathUtils.degToRad(s.axisRotDeg[0]);
      const targetRy = THREE.MathUtils.degToRad(s.axisRotDeg[1]);
      const targetRz = THREE.MathUtils.degToRad(s.axisRotDeg[2]);
      specimenPivot.rotation.x = THREE.MathUtils.damp(specimenPivot.rotation.x, targetRx, 8, delta);
      specimenPivot.rotation.y = THREE.MathUtils.damp(specimenPivot.rotation.y, targetRy, 8, delta);
      specimenPivot.rotation.z = THREE.MathUtils.damp(specimenPivot.rotation.z, targetRz, 8, delta);

      // Smooth Exploded Separation + Z-Axis Layer Stack + Custom Part Offsets + Visibility + Highlighting
      const asm = sceneRefs.current.assembly;
      if (asm) {
        const expTarget = s.explodeAmount;
        sceneRefs.current.currentExplode = THREE.MathUtils.damp(
          sceneRefs.current.currentExplode ?? 0,
          expTarget,
          8,
          delta,
        );
        const expFactor = sceneRefs.current.currentExplode;

        const stackTarget = s.layerStackAmount || 0;
        sceneRefs.current.currentLayerStack = THREE.MathUtils.damp(
          sceneRefs.current.currentLayerStack ?? 0,
          stackTarget,
          8,
          delta,
        );
        const stackFactor = sceneRefs.current.currentLayerStack;

        if (asm.systemGroups.size > 0) {
          const invScale = 1 / (asm.atlasScale || 1);
          asm.systemGroups.forEach((sysGroup, sysId) => {
            const targetZ = (SYSTEM_STACK_DEPTH[sysId] ?? 0) * stackFactor * invScale;
            sysGroup.position.x = 0;
            sysGroup.position.y = 0;
            sysGroup.position.z = targetZ;
          });
        }

        asm.partObjects.forEach((partObj, _key) => {
          const partId = String(partObj.userData.partId || '');
          const sysId = partObj.userData.systemId as AnatomicalSystemId;

          const isIsolated = s.isolatedPartId !== null;
          const visible = isIsolated
            ? partId === s.isolatedPartId
            : s.visibleSystems.has(sysId) && !s.hiddenPartIds.has(partId);
          partObj.visible = visible;

          const basePos: THREE.Vector3 = partObj.userData.basePosition || _vec3A.set(0, 0, 0);
          const explodeVec: THREE.Vector3 = partObj.userData.explodeVector || _vec3B.set(0, 0, 0);
          const customOffset = s.partOffsets[partId] || [0, 0, 0];

          const tx = basePos.x + explodeVec.x * expFactor + customOffset[0];
          const ty = basePos.y + explodeVec.y * expFactor + customOffset[1];
          const tz = basePos.z + explodeVec.z * expFactor + customOffset[2];

          partObj.position.x = THREE.MathUtils.damp(partObj.position.x, tx, 9, delta);
          partObj.position.y = THREE.MathUtils.damp(partObj.position.y, ty, 9, delta);
          partObj.position.z = THREE.MathUtils.damp(partObj.position.z, tz, 9, delta);

          // Highlight selected part & Ghost outer envelope
          const isSelected = s.selectedPartId === partId;
          const isOuterShell =
            sysId === 'integumentary' ||
            partId.includes('carapace') ||
            partId.includes('mantle') ||
            partId.includes('coat');

          partObj.traverse((child) => {
            if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
              if (child.userData.origEmissive === undefined) {
                child.userData.origEmissive = child.material.emissive.getHex();
                child.userData.origEmissiveInt = child.material.emissiveIntensity;
                child.userData.origOpacity = child.material.opacity;
                child.userData.origTransparent = child.material.transparent;
              }
              if (isSelected) {
                child.material.emissive.setHex(0x0284c7);
                child.material.emissiveIntensity = 0.48;
              } else {
                child.material.emissive.setHex(child.userData.origEmissive);
                child.material.emissiveIntensity = child.userData.origEmissiveInt;
              }
              const nextTransparent = Boolean(s.ghostOuter && isOuterShell && !isSelected);
              const nextOpacity = nextTransparent
                ? 0.14
                : child.userData.origOpacity !== undefined
                  ? child.userData.origOpacity
                  : 1;
              const finalTransparent =
                nextTransparent || Boolean(child.userData.origTransparent);
              if (child.material.transparent !== finalTransparent) {
                child.material.transparent = finalTransparent;
                child.material.needsUpdate = true;
              }
              child.material.opacity = nextOpacity;
            }
          });
        });

        // Subtle Physiological Animations (Heart Beat, Respiration, Jellyfish Pulse)
        if (s.animatePhysiology) {
          for (const anim of asm.animatedParts) {
            if (anim.role === 'heart') {
              const beat = 1 + Math.pow(Math.max(0, Math.sin(elapsed * 4.2)), 6) * 0.08;
              anim.object.scale.setScalar(beat);
            } else if (anim.role === 'lung') {
              const breath = 1 + Math.sin(elapsed * 1.8) * 0.045;
              anim.object.scale.set(breath, 1 + Math.sin(elapsed * 1.8) * 0.02, breath);
            } else if (anim.role === 'bell') {
              const pulse = 1 + Math.sin(elapsed * 2.4) * 0.06;
              anim.object.scale.set(pulse, 1 / pulse, pulse);
            } else if (anim.role === 'wing') {
              anim.object.rotation.x = Math.sin(elapsed * 2.2) * 0.06;
            } else if (anim.role === 'gill') {
              const flare = 1 + Math.sin(elapsed * 2.8) * 0.035;
              anim.object.scale.set(1, 1, flare);
            }
          }
        }
      }

      if (sceneRefs.current.gltfMixer && s.animatePhysiology) {
        sceneRefs.current.gltfMixer.update(delta);
      }

      controls.update();
      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }
    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', handleContextRestored);

      shadowTex.dispose();
      envTexture.dispose();
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [variant]);

  // Rebuild / Load 3D Specimen whenever `species` changes
  useEffect(() => {
    const { specimenPivot, isSoftwareGl } = sceneRefs.current;
    if (!specimenPivot) return;

    // Clean previous specimen
    if (sceneRefs.current.assembly) {
      specimenPivot.remove(sceneRefs.current.assembly.root);
      sceneRefs.current.assembly.geometriesToDispose.forEach((g) => g.dispose());
      sceneRefs.current.assembly.materialsToDispose.forEach((m) => m.dispose());
      sceneRefs.current.assembly = null;
    }
    if (sceneRefs.current.gltfDisposable) {
      sceneRefs.current.gltfDisposable.geometries.forEach((g) => g.dispose());
      sceneRefs.current.gltfDisposable.materials.forEach((m) => m.dispose());
      sceneRefs.current.gltfDisposable = undefined;
    }
    while (specimenPivot.children.length > 0) {
      specimenPivot.remove(specimenPivot.children[0]);
    }
    sceneRefs.current.gltfMixer = null;
    sceneRefs.current.loadedParts = [];
    setLoadError(null);
    setStreamProgress(null);

    // Case A: Complete 11-System Medical Human Atlas (Progressive Fast Load + Streaming)
    if (species.modelSource === 'human_atlas') {
      let cancelled = false;
      setLoadingModel(true);

      loadHumanAtlasProgressive({
        isSoftwareGl: Boolean(isSoftwareGl),
        isCancelled: () => cancelled,
        onCoreReady: (assembly, coreParts, progress) => {
          if (cancelled) {
            assembly.materialsToDispose.forEach((m) => m.dispose());
            return;
          }
          setLoadingModel(false);
          setStreamProgress(progress.done ? null : progress);
          specimenPivot.add(assembly.root);
          sceneRefs.current.assembly = assembly;
          sceneRefs.current.loadedParts = coreParts;
          const canExplode = coreParts.length >= 2;
          setSupportsExplode(canExplode);
          callbacksRef.current.onDetectedMeshParts?.(coreParts, canExplode);
        },
        onLayerAppended: (allParts, progress) => {
          if (cancelled) return;
          setStreamProgress(progress.done ? null : progress);
          sceneRefs.current.loadedParts = allParts;
          const canExplode = allParts.length >= 2;
          setSupportsExplode(canExplode);
          callbacksRef.current.onDetectedMeshParts?.(allParts, canExplode);
        },
      }).catch(() => {
        if (cancelled) return;
        setLoadingModel(false);
        setStreamProgress(null);
        setLoadError('Unable to load the 11-system human anatomical atlas GLB assets.');
        setSupportsExplode(false);
      });

      return () => {
        cancelled = true;
      };
    }

    // Case B: Real Uploaded or External GLB / GLTF File
    if (
      (species.modelSource === 'uploaded_glb' || species.modelSource === 'external_glb') &&
      species.modelUrl
    ) {
      setLoadingModel(true);
      const dracoLoader = new DRACOLoader();
      dracoLoader.setDecoderPath('/draco/');
      const gltfLoader = new GLTFLoader();
      gltfLoader.setDRACOLoader(dracoLoader);

      let cancelled = false;
      gltfLoader.load(
        species.modelUrl,
        (gltf) => {
          if (cancelled) return;
          setLoadingModel(false);
          const model = gltf.scene;

          // Center & normalize scale
          const box = new THREE.Box3().setFromObject(model);
          const size = new THREE.Vector3();
          const center = new THREE.Vector3();
          box.getSize(size);
          box.getCenter(center);
          const maxDim = Math.max(size.x, size.y, size.z) || 1;
          const scale = 2.3 / maxDim;
          model.scale.setScalar(scale);
          model.position.set(-center.x * scale, -center.y * scale + 0.05, -center.z * scale);

          const partObjects = new Map<string, THREE.Group>();
          const detectedParts: AnatomyPartMetadata[] = [];
          const materialsToDispose: THREE.Material[] = [];
          const geometriesToDispose: THREE.BufferGeometry[] = [];
          let meshIdx = 0;

          model.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              meshIdx += 1;
              child.castShadow = !isSoftwareGl;
              child.receiveShadow = !isSoftwareGl;
              geometriesToDispose.push(child.geometry);
              if (Array.isArray(child.material)) {
                child.material.forEach((m) => materialsToDispose.push(m));
              } else if (child.material) {
                // Clone material per mesh so individual highlight doesn't tint siblings
                child.material = child.material.clone();
                materialsToDispose.push(child.material);
              }

              const meshName = child.name || `mesh_part_${meshIdx}`;
              const matchedMeta = species.parts.find(
                (p) => p.meshName === meshName || p.name.toLowerCase() === meshName.toLowerCase(),
              );

              const meshBox = new THREE.Box3().setFromObject(child);
              const meshCenter = new THREE.Vector3();
              meshBox.getCenter(meshCenter);
              const radial = meshCenter.clone().normalize().multiplyScalar(0.75);
              if (radial.lengthSq() < 0.01) radial.set(0, 0.4, 0);

              const partId = matchedMeta?.id || `glb-part-${meshIdx}`;
              // Tag directly on child mesh
              child.userData.partId = partId;
              child.userData.meshName = meshName;
              child.userData.systemId = matchedMeta?.system || 'skeletal';
              child.userData.basePosition = child.position.clone();
              child.userData.explodeVector = new THREE.Vector3(
                ...(matchedMeta?.explodeVector || [radial.x, radial.y, radial.z]),
              );
              partObjects.set(meshName, child as unknown as THREE.Group);

              detectedParts.push(
                matchedMeta || {
                  id: partId,
                  meshName,
                  name: meshName.replace(/[_-]+/g, ' '),
                  system: 'skeletal',
                  biologicalFunction: 'Mesh component extracted from uploaded 3D GLB/GLTF asset.',
                  structure: 'Polygonal 3D mesh node.',
                  location: 'Model hierarchy node.',
                  relatedStructures: [],
                  educationalNotes: 'Add detailed biological metadata for this mesh node in Manage Library.',
                  explodeVector: [radial.x, radial.y, radial.z],
                },
              );
            }
          });

          const canExplode = detectedParts.length >= 2;
          setSupportsExplode(canExplode);
          sceneRefs.current.loadedParts = detectedParts;
          callbacksRef.current.onDetectedMeshParts?.(detectedParts, canExplode);

          if (gltf.animations.length > 0) {
            const mixer = new THREE.AnimationMixer(model);
            gltf.animations.forEach((clip) => mixer.clipAction(clip).play());
            sceneRefs.current.gltfMixer = mixer;
          }

          specimenPivot.add(model);
          sceneRefs.current.assembly = {
            root: model,
            systemGroups: new Map(),
            partObjects,
            animatedParts: [],
            materialsToDispose,
            geometriesToDispose,
            atlasScale: 1,
          };
          sceneRefs.current.gltfDisposable = {
            materials: materialsToDispose,
            geometries: geometriesToDispose,
          };
        },
        undefined,
        () => {
          if (cancelled) return;
          setLoadingModel(false);
          setLoadError('Unable to load external/uploaded GLB model file. Verify file path or CORS permissions.');
          setSupportsExplode(false);
        },
      );

      return () => {
        cancelled = true;
        dracoLoader.dispose();
      };
    }

    // No realistic GLB asset provided for native Three.js canvas
    setLoadingModel(false);
    setSupportsExplode(false);
    setLoadError('No suitable realistic 3D GLB model is currently available for native rendering.');
    callbacksRef.current.onDetectedMeshParts?.([], false);
  }, [species]);

  if (webglError) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300">
        <p className="font-display text-lg font-semibold mb-2">3D WebGL Viewport Paused</p>
        <p className="text-sm max-w-md text-slate-500 dark:text-slate-400">
          Your browser encountered a WebGL context interruption. Refresh or enable hardware acceleration to inspect {species.commonName} in 3D.
        </p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden select-none">
      {/* Isolated WebGL Mount Container */}
      <div ref={canvasMountRef} className="w-full h-full" />

      {/* Top-Left Minimal Hover Readout (No backdrop-blur over WebGL) */}
      {hoveredPartLabel && (
        <div className="pointer-events-none absolute top-4 left-4 z-10 px-3 py-1.5 rounded-lg bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-800 dark:text-slate-100 shadow-sm">
          {hoveredPartLabel}
        </div>
      )}

      {/* Loading / Background Streaming / Error State */}
      {loadingModel && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/60 text-white text-sm font-medium">
          Loading initial 3D skeleton &amp; core anatomy...
        </div>
      )}
      {streamProgress && !streamProgress.done && !loadingModel && (
        <div className="pointer-events-none absolute top-4 right-4 z-10 px-3 py-1.5 rounded-lg bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-700 dark:text-slate-200 shadow-sm">
          Layers {streamProgress.loadedCount}/{streamProgress.totalCount} · {streamProgress.currentSystemLabel}
        </div>
      )}
      {loadError && (
        <div className="absolute top-14 left-4 right-4 z-20 max-w-md mx-auto p-3 rounded-lg bg-rose-950/95 border border-rose-700 text-rose-100 text-xs">
          {loadError}
        </div>
      )}

      {/* Hero Variant Compact Dock */}
      {variant === 'hero' ? (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white/95 dark:bg-slate-900/95 border border-sky-200 dark:border-slate-700 shadow-md">
          <button
            type="button"
            onClick={() => setAutoRotate((v) => !v)}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
              autoRotate
                ? 'bg-sky-600 text-white'
                : 'text-slate-700 dark:text-slate-200 hover:bg-sky-50 dark:hover:bg-slate-800'
            }`}
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span>{autoRotate ? 'Rotating' : 'Rotate'}</span>
          </button>
          {species.modelSource === 'human_atlas' && onLayerStackAmountChange && (
            <button
              type="button"
              onClick={() => onLayerStackAmountChange(layerStackAmount > 0.1 ? 0 : 0.85)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
                layerStackAmount > 0.1
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-700 dark:text-slate-200 hover:bg-sky-50 dark:hover:bg-slate-800'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>{layerStackAmount > 0.1 ? 'Unified Body' : 'Picture Stack'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => onExplodeAmountChange(explodeAmount > 0.1 ? 0 : 0.65)}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
              explodeAmount > 0.1
                ? 'bg-emerald-600 text-white'
                : 'text-slate-700 dark:text-slate-200 hover:bg-sky-50 dark:hover:bg-slate-800'
            }`}
          >
            <Expand className="w-3.5 h-3.5" />
            <span>{explodeAmount > 0.1 ? 'Reassemble' : 'Explode Parts'}</span>
          </button>
          <button
            type="button"
            onClick={handleResetAll}
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-sky-50 dark:hover:bg-slate-800 flex items-center gap-1 whitespace-nowrap shrink-0"
            title="Reset Camera"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
        </div>
      ) : (
        /* Full Workspace Collapsible Bottom Control Dock */
        <div
          className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center transition-transform duration-200"
          style={{
            maxWidth: 'min(920px, 95%)',
            transform: dockOpen ? 'translate(-50%, 0)' : 'translate(-50%, calc(100% - 34px))',
          }}
        >
          {/* Collapse / Expand Handle */}
          <button
            type="button"
            onClick={() => setDockOpen((v) => !v)}
            className="mb-1 px-3 py-1 rounded-t-lg bg-white/95 dark:bg-slate-900/95 border border-b-0 border-sky-200 dark:border-slate-700 text-[11px] font-medium text-sky-800 dark:text-slate-300 flex items-center gap-1.5 shadow-sm whitespace-nowrap shrink-0"
          >
            {dockOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
            <span>{dockOpen ? 'Hide Controls' : 'Show Controls'}</span>
          </button>

          {/* Main Control Dock Surface */}
          <div className="w-full rounded-xl bg-white/95 dark:bg-slate-900/95 border border-sky-200 dark:border-slate-700 shadow-lg p-2.5">
            {/* Top Row: Tabs + Quick Utility Actions */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-sky-100 dark:border-slate-800">
              <div className="flex items-center gap-1 bg-sky-50 dark:bg-slate-800 p-0.5 rounded-lg overflow-x-auto">
                {(
                  [
                    { id: 'camera', label: 'Views', icon: Camera },
                    { id: 'axes', label: 'X / Y / Z Axes', icon: RotateCw },
                    { id: 'explode', label: 'Exploded View', icon: Layers },
                    { id: 'lighting', label: 'Lighting', icon: Sun },
                  ] as const
                ).map((t) => {
                  const Icon = t.icon;
                  const active = activeTab === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setActiveTab(t.id)}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
                        active
                          ? 'bg-gradient-to-r from-sky-600 to-emerald-600 text-white shadow-sm'
                          : 'text-slate-600 dark:text-slate-400 hover:text-sky-800 dark:hover:text-slate-100'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{t.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setPanMode((v) => !v)}
                  title="Toggle Pan / Orbit Drag"
                  className={`px-2 py-1 rounded-md text-xs font-medium flex items-center gap-1 whitespace-nowrap shrink-0 ${
                    panMode
                      ? 'bg-sky-600 text-white'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-sky-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <Move className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{panMode ? 'Pan On' : 'Pan'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAutoRotate((v) => !v)}
                  title="Auto Rotate"
                  className={`px-2 py-1 rounded-md text-xs font-medium flex items-center gap-1 whitespace-nowrap shrink-0 ${
                    autoRotate
                      ? 'bg-sky-600 text-white'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-sky-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Auto</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAnimatePhysiology((v) => !v)}
                  title="Toggle Organ Animation"
                  className={`px-2 py-1 rounded-md text-xs font-medium flex items-center gap-1 whitespace-nowrap shrink-0 ${
                    animatePhysiology
                      ? 'bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-100'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {animatePhysiology ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  <span className="hidden sm:inline">Pulse</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleZoomStep(0.84)}
                  title="Zoom In"
                  className="p-1.5 rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleZoomStep(1.18)}
                  title="Zoom Out"
                  className="p-1.5 rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleResetAll}
                  title="Reset Camera & Assembly"
                  className="p-1.5 rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={toggleFullscreen}
                  title="Fullscreen"
                  className="p-1.5 rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Tab Content */}
            <div className="pt-2">
              {activeTab === 'camera' && (
                <div className="flex flex-wrap items-center justify-center gap-1.5">
                  {(
                    [
                      ['iso', '3/4 Isometric'],
                      ['front', 'Front'],
                      ['back', 'Back'],
                      ['left', 'Left'],
                      ['right', 'Right'],
                      ['top', 'Top'],
                      ['bottom', 'Bottom'],
                    ] as Array<[CameraPreset, string]>
                  ).map(([preset, label]) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => applyCameraPreset(preset)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-sky-50 dark:bg-slate-800 text-sky-800 dark:text-slate-200 hover:bg-sky-600 hover:text-white dark:hover:bg-sky-600 transition-colors whitespace-nowrap shrink-0"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}

              {activeTab === 'axes' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 px-1">
                  {(['X', 'Y', 'Z'] as const).map((axis, idx) => (
                    <label key={axis} className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                      <span className="font-mono-tabular font-semibold w-12 shrink-0">
                        {axis}: {axisRotDeg[idx]}°
                      </span>
                      <input
                        type="range"
                        min={-180}
                        max={180}
                        value={axisRotDeg[idx]}
                        onChange={(e) => {
                          const next: [number, number, number] = [...axisRotDeg];
                          next[idx] = Number(e.target.value);
                          setAxisRotDeg(next);
                        }}
                        className="w-full cursor-pointer"
                      />
                    </label>
                  ))}
                </div>
              )}

              {activeTab === 'explode' && (
                <div className="space-y-2.5 px-1">
                  {species.modelSource === 'human_atlas' && onLayerStackAmountChange && (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <label className="flex-1 min-w-[200px] flex items-center gap-3 text-xs text-slate-700 dark:text-slate-300">
                        <span className="font-medium whitespace-nowrap w-32">Z-Axis Picture Stack</span>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={Math.round(layerStackAmount * 100)}
                          onChange={(e) => onLayerStackAmountChange(Number(e.target.value) / 100)}
                          className="flex-1 cursor-pointer"
                        />
                        <span className="font-mono-tabular w-10 text-right">{Math.round(layerStackAmount * 100)}%</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => onLayerStackAmountChange(layerStackAmount > 0.1 ? 0 : 0.85)}
                        className="px-3 py-1 rounded-lg text-xs font-medium bg-sky-50 dark:bg-slate-800 hover:bg-emerald-600 hover:text-white text-sky-800 dark:text-slate-200 transition-colors whitespace-nowrap shrink-0"
                      >
                        {layerStackAmount > 0.1 ? 'Unify Body' : 'Picture Stack'}
                      </button>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    {supportsExplode ? (
                      <>
                        <label className="flex-1 min-w-[200px] flex items-center gap-3 text-xs text-slate-700 dark:text-slate-300">
                          <span className="font-medium whitespace-nowrap w-32">Separate Parts</span>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            value={Math.round(explodeAmount * 100)}
                            onChange={(e) => onExplodeAmountChange(Number(e.target.value) / 100)}
                            className="flex-1 cursor-pointer"
                          />
                          <span className="font-mono-tabular w-10 text-right">{Math.round(explodeAmount * 100)}%</span>
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            onExplodeAmountChange(0);
                            onLayerStackAmountChange?.(0);
                            onResetPartOffsets();
                          }}
                          className="px-3 py-1 rounded-lg text-xs font-medium bg-sky-50 dark:bg-slate-800 hover:bg-sky-600 hover:text-white text-sky-800 dark:text-slate-200 transition-colors whitespace-nowrap shrink-0"
                        >
                          Reassemble Model
                        </button>
                      </>
                    ) : (
                      <p className="text-xs text-amber-700 dark:text-amber-300 flex items-center gap-2">
                        <Eye className="w-4 h-4 shrink-0" />
                        <span>
                          Single-mesh 3D asset: individual part separation is unavailable because this GLB contains one unified mesh.
                        </span>
                      </p>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'lighting' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 px-1">
                  <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                    <span className="whitespace-nowrap w-28">Key Light: {keyLightIntensity.toFixed(1)}</span>
                    <input
                      type="range"
                      min={0.4}
                      max={3.0}
                      step={0.1}
                      value={keyLightIntensity}
                      onChange={(e) => setKeyLightIntensity(Number(e.target.value))}
                      className="flex-1 cursor-pointer"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                    <span className="whitespace-nowrap w-28">Fill Light: {fillLightIntensity.toFixed(1)}</span>
                    <input
                      type="range"
                      min={0.2}
                      max={2.0}
                      step={0.1}
                      value={fillLightIntensity}
                      onChange={(e) => setFillLightIntensity(Number(e.target.value))}
                      className="flex-1 cursor-pointer"
                    />
                  </label>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
