import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { AnatomicalSystemId, AnatomyPartMetadata } from '../types/anatomy';

export interface AnimatedPartHandle {
  role: 'heart' | 'lung' | 'bell' | 'wing' | 'gill';
  object: THREE.Object3D;
}

export interface BuiltAnatomyAssembly {
  root: THREE.Group;
  systemGroups: Map<AnatomicalSystemId, THREE.Group>;
  partObjects: Map<string, THREE.Object3D>;
  animatedParts: AnimatedPartHandle[];
  materialsToDispose: THREE.Material[];
  geometriesToDispose: THREE.BufferGeometry[];
  atlasScale: number;
}

export interface HumanAtlasStreamProgress {
  loadedCount: number;
  totalCount: number;
  currentSystemLabel: string;
  done: boolean;
}

interface ManifestOrgan {
  organ_id: string;
  ta2_latin?: string;
  name_en: string;
  system: string;
  mesh_file: string;
  node: string;
  path?: string[];
}

interface HumanManifest {
  version: number;
  organs: Record<string, ManifestOrgan> | ManifestOrgan[];
}

export interface SystemGlbSpec {
  file: string;
  systemId: AnatomicalSystemId;
  label: string;
  stackDepth: number; // Z-axis depth plane in world units matching reference picture
  priority: 1 | 2;
}

// Ordered back-to-front along Z-axis to match the parallel layered human stack visualization:
// Lymphatic -> Circulatory -> Nervous -> Muscular -> Skeletal -> Respiratory -> Digestive/Visceral
export const HUMAN_SYSTEM_GLBS: SystemGlbSpec[] = [
  { file: 'skeletal_male.glb', systemId: 'skeletal', label: 'Skeletal System', stackDepth: 0.72, priority: 1 },
  { file: 'respiratory_male.glb', systemId: 'respiratory', label: 'Respiratory System', stackDepth: 1.42, priority: 1 },
  { file: 'digestive_male.glb', systemId: 'digestive', label: 'Digestive System', stackDepth: 2.08, priority: 1 },
  { file: 'renal_male.glb', systemId: 'urinary', label: 'Urinary System', stackDepth: 2.08, priority: 1 },
  { file: 'endocrine_male.glb', systemId: 'endocrine', label: 'Endocrine System', stackDepth: 1.75, priority: 1 },
  { file: 'reproductive_male.glb', systemId: 'reproductive', label: 'Reproductive System', stackDepth: 2.08, priority: 1 },
  { file: 'regional_male.glb', systemId: 'integumentary', label: 'Outer Body & Skin', stackDepth: -2.75, priority: 1 },
  { file: 'lymphatic_male.glb', systemId: 'lymphatic', label: 'Lymphatic System', stackDepth: -2.08, priority: 2 },
  { file: 'cardiovascular_male.glb', systemId: 'circulatory', label: 'Circulatory System', stackDepth: -1.38, priority: 2 },
  { file: 'nervous_male.glb', systemId: 'nervous', label: 'Nervous System', stackDepth: -0.68, priority: 2 },
  { file: 'muscular_male.glb', systemId: 'muscular', label: 'Muscular System', stackDepth: 0.0, priority: 2 },
];

export const SYSTEM_STACK_DEPTH: Record<AnatomicalSystemId, number> = {
  integumentary: -2.75,
  lymphatic: -2.08,
  circulatory: -1.38,
  nervous: -0.68,
  muscular: 0.0,
  skeletal: 0.72,
  respiratory: 1.42,
  endocrine: 1.75,
  digestive: 2.08,
  urinary: 2.08,
  reproductive: 2.08,
  exoskeleton: 0.0,
};

let manifestLookupsPromise: Promise<{
  manifestLookup: Map<string, ManifestOrgan>;
  nodeLookup: Map<string, ManifestOrgan>;
}> | null = null;

const glbSceneCache = new Map<string, Promise<THREE.Group>>();

let sharedDracoLoader: DRACOLoader | null = null;
function getSharedGltfLoader(): GLTFLoader {
  if (!sharedDracoLoader) {
    sharedDracoLoader = new DRACOLoader();
    sharedDracoLoader.setDecoderPath('/draco/');
  }
  const loader = new GLTFLoader();
  loader.setDRACOLoader(sharedDracoLoader);
  return loader;
}

function getManifestLookups() {
  if (manifestLookupsPromise) return manifestLookupsPromise;
  manifestLookupsPromise = fetch('/models/human/manifest.json')
    .then((r) => {
      if (!r.ok) throw new Error('Failed to load human anatomical manifest.');
      return r.json() as Promise<HumanManifest>;
    })
    .then((manifest) => {
      const manifestLookup = new Map<string, ManifestOrgan>();
      const nodeLookup = new Map<string, ManifestOrgan>();
      const organValues = Array.isArray(manifest.organs)
        ? manifest.organs
        : Object.values(manifest.organs || {});
      for (const org of organValues) {
        if (!org.node) continue;
        manifestLookup.set(`${org.mesh_file}::${org.node.toLowerCase()}`, org);
        nodeLookup.set(org.node.toLowerCase(), org);
      }
      return { manifestLookup, nodeLookup };
    })
    .catch((err) => {
      manifestLookupsPromise = null;
      throw err;
    });
  return manifestLookupsPromise;
}

function loadSystemGlbCached(file: string): Promise<THREE.Group> {
  const existing = glbSceneCache.get(file);
  if (existing) return existing;

  const loader = getSharedGltfLoader();
  const promise = new Promise<THREE.Group>((resolve, reject) => {
    loader.load(
      `/models/human/${file}`,
      (gltf) => resolve(gltf.scene),
      undefined,
      (err) => {
        glbSceneCache.delete(file);
        reject(err);
      },
    );
  });
  glbSceneCache.set(file, promise);
  return promise;
}

function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

function createOrganMaterial(
  systemId: AnatomicalSystemId,
  rawName: string,
): THREE.MeshPhysicalMaterial {
  const n = rawName.toLowerCase();
  const jitter = (hashString(rawName) - 0.5) * 0.08;

  if (/cornea|anterior chamber|aqueous|vitreous|lens\b/i.test(n)) {
    return new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#dbeafe'),
      roughness: 0.08,
      metalness: 0.0,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    });
  }
  if (/\bsclera\b/i.test(n)) {
    return new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#f4f1ea'),
      roughness: 0.25,
      clearcoat: 0.45,
    });
  }
  if (/\biris\b/i.test(n)) {
    return new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#3b5f5c'),
      roughness: 0.4,
    });
  }

  let baseHex = '#c9b8a8';
  let roughness = 0.48;
  let clearcoat = 0.0;
  let sheen = 0.0;
  let sheenColorHex = '#ffffff';
  let polygonOffset = false;
  let polygonOffsetFactor = 0;

  switch (systemId) {
    case 'integumentary': {
      baseHex = '#c98c70';
      roughness = 0.66;
      sheen = 0.14;
      sheenColorHex = '#e6b8a2';
      clearcoat = 0.02;
      polygonOffset = true;
      polygonOffsetFactor = -2;
      break;
    }
    case 'skeletal': {
      if (/tooth|teeth|incisor|canine|premolar|molar/i.test(n)) {
        baseHex = '#ebe5d5';
        roughness = 0.24;
        clearcoat = 0.38;
      } else if (/cartilage|meniscus|disc|symphysis|labrum/i.test(n)) {
        baseHex = '#99b0bf';
        roughness = 0.38;
        clearcoat = 0.16;
      } else {
        baseHex = '#d4c4a6';
        roughness = 0.52;
      }
      break;
    }
    case 'muscular': {
      if (/tendon|aponeurosis|bursa|fascia|retinaculum|sheath|ligament|linea alba|raphe/i.test(n)) {
        baseHex = '#ccc1ae';
        roughness = 0.46;
        polygonOffset = true;
        polygonOffsetFactor = -1;
      } else {
        baseHex = '#8d2d34';
        roughness = 0.48;
        sheen = 0.18;
        sheenColorHex = '#c85e65';
      }
      break;
    }
    case 'circulatory': {
      if (/\b(vena|venae|venous|vein|veins)\b|sinus\b/i.test(n) && !/carotid sinus/i.test(n)) {
        baseHex = '#32589a';
        roughness = 0.38;
        clearcoat = 0.16;
      } else if (/heart|atrium|ventricle|auricle|myocardium|pericard/i.test(n)) {
        baseHex = '#842329';
        roughness = 0.34;
        clearcoat = 0.24;
      } else {
        baseHex = '#b82e26';
        roughness = 0.36;
        clearcoat = 0.18;
      }
      break;
    }
    case 'nervous': {
      if (/gyrus|lobe|cortex|cerebell|pons|medulla oblongata|thalamus|hippocamp|amygdala|ventricle of brain|corpus callosum/i.test(n)) {
        baseHex = '#c79a90';
        roughness = 0.46;
        clearcoat = 0.08;
      } else {
        baseHex = '#ccb554';
        roughness = 0.42;
      }
      break;
    }
    case 'respiratory': {
      if (/trachea|larynx|cartilage|cricoid|thyroid cartilage|epiglottis|hyoid/i.test(n)) {
        baseHex = '#a4b8c4';
        roughness = 0.38;
      } else {
        baseHex = '#ba7178';
        roughness = 0.56;
        sheen = 0.12;
        sheenColorHex = '#dfa6ab';
      }
      break;
    }
    case 'digestive': {
      if (/liver|hepatic/i.test(n)) {
        baseHex = '#6e2e23';
        roughness = 0.3;
        clearcoat = 0.28;
      } else if (/gallbladder|biliary|cystic/i.test(n)) {
        baseHex = '#4e6932';
        roughness = 0.35;
        clearcoat = 0.2;
      } else {
        baseHex = '#b37354';
        roughness = 0.44;
        clearcoat = 0.12;
      }
      break;
    }
    case 'urinary': {
      baseHex = /bladder/i.test(n) ? '#a66256' : '#873e33';
      roughness = 0.36;
      clearcoat = 0.18;
      break;
    }
    case 'reproductive': {
      baseHex = '#a46b85';
      roughness = 0.44;
      break;
    }
    case 'endocrine': {
      baseHex = '#c28b2c';
      roughness = 0.4;
      clearcoat = 0.12;
      break;
    }
    case 'lymphatic': {
      baseHex = /spleen/i.test(n) ? '#632533' : '#5e9b56';
      roughness = 0.42;
      break;
    }
    default:
      break;
  }

  const color = new THREE.Color(baseHex);
  color.offsetHSL(jitter * 0.18, jitter * 0.25, jitter * 0.6);

  return new THREE.MeshPhysicalMaterial({
    color,
    roughness,
    metalness: 0.02,
    envMapIntensity: 0.62,
    clearcoat,
    clearcoatRoughness: 0.35,
    sheen,
    sheenColor: new THREE.Color(sheenColorHex),
    sheenRoughness: 0.65,
    polygonOffset,
    polygonOffsetFactor,
    polygonOffsetUnits: polygonOffsetFactor,
    side: THREE.DoubleSide,
  });
}

function getSystemBiologicalSummary(systemId: AnatomicalSystemId): {
  functionText: string;
  structureText: string;
} {
  switch (systemId) {
    case 'skeletal':
      return {
        functionText: 'Provides rigid structural leverage, visceral protection, hematopoiesis, and mineral storage.',
        structureText: 'Mineralized cortical and trabecular osseous tissue articulated with fibrocartilage and joints.',
      };
    case 'muscular':
      return {
        functionText: 'Generates contractile force for posture, joint articulation, and locomotion.',
        structureText: 'Multinucleated striated skeletal muscle fascicles anchored via collagenous tendons.',
      };
    case 'nervous':
      return {
        functionText: 'Transmits rapid electrochemical sensory integration and motor command signals.',
        structureText: 'Neuronal soma, myelinated axonal tracts, and glial supporting sheaths.',
      };
    case 'circulatory':
      return {
        functionText: 'Maintains pressurized systemic and pulmonary perfusion of oxygen, nutrients, and metabolites.',
        structureText: 'Endothelial-lined muscular cardiac chambers and elastic/muscular arterial-venous conduits.',
      };
    case 'respiratory':
      return {
        functionText: 'Conducts atmospheric air and mediates alveolar O₂/CO₂ diffusion across capillary membranes.',
        structureText: 'Hyaline-cartilage reinforced airways leading into elastic parenchymal lung lobes.',
      };
    case 'digestive':
      return {
        functionText: 'Performs mechanical breakdown, enzymatic hydrolysis, nutrient absorption, and metabolic detoxification.',
        structureText: 'Mucosa-lined alimentary smooth-muscle tube paired with hepatic and biliary glands.',
      };
    case 'urinary':
      return {
        functionText: 'Filters plasma filtrate, regulates osmotic and acid-base balance, and excretes nitrogenous waste.',
        structureText: 'Nephron-rich renal cortex/medulla draining via smooth-muscle ureters to the bladder.',
      };
    case 'reproductive':
      return {
        functionText: 'Produces gametes and secretes steroid sex hormones within the pelvic cavity.',
        structureText: 'Gonadal parenchyma, ductal conduits, and supportive fibromuscular tissues.',
      };
    case 'endocrine':
      return {
        functionText: 'Secretes homeostatic hormones directly into systemic capillaries to regulate metabolism and growth.',
        structureText: 'Vascularized ductless secretory parenchyma.',
      };
    case 'lymphatic':
      return {
        functionText: 'Returns interstitial lymph fluid to venous circulation and coordinates adaptive immune surveillance.',
        structureText: 'Encapsulated lymphoid organs and valved endothelial lymphatic vessels.',
      };
    case 'integumentary':
    default:
      return {
        functionText: 'Forms the external protective barrier regulating thermoregulation, hydration, and cutaneous sensation.',
        structureText: 'Stratified keratinized epidermis over vascularized dermis and regional subcutaneous fascia.',
      };
  }
}

function attachSystemToAssembly(
  spec: SystemGlbSpec,
  sourceScene: THREE.Group,
  assembly: BuiltAnatomyAssembly,
  manifestLookup: Map<string, ManifestOrgan>,
  nodeLookup: Map<string, ManifestOrgan>,
  usedIds: Set<string>,
  isSoftwareGl: boolean,
): AnatomyPartMetadata[] {
  const clone = sourceScene.clone(true);
  clone.name = `system_${spec.systemId}`;
  clone.userData.systemId = spec.systemId;
  clone.userData.stackDepth = spec.stackDepth;
  assembly.root.add(clone);
  assembly.systemGroups.set(spec.systemId, clone);
  clone.updateMatrixWorld(true);

  const bioDefaults = getSystemBiologicalSummary(spec.systemId);
  const bodyCenterWorld = new THREE.Vector3(0, 0, 0);
  const tempBox = new THREE.Box3();
  const tempCenter = new THREE.Vector3();
  const newParts: AnatomyPartMetadata[] = [];
  let counter = 0;

  clone.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;

    obj.castShadow = !isSoftwareGl && spec.systemId !== 'integumentary';
    obj.receiveShadow = !isSoftwareGl;

    const rawNodeName = obj.name || `${spec.systemId}_part_${++counter}`;
    const lookupKey = `${spec.file}::${rawNodeName.toLowerCase()}`;
    const manifestOrg =
      manifestLookup.get(lookupKey) || nodeLookup.get(rawNodeName.toLowerCase());

    const mat = createOrganMaterial(spec.systemId, manifestOrg?.name_en || rawNodeName);
    obj.material = mat;
    assembly.materialsToDispose.push(mat);

    let partId =
      manifestOrg?.organ_id ||
      `${spec.systemId}-${rawNodeName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    if (usedIds.has(partId)) {
      partId = `${partId}-${++counter}`;
    }
    usedIds.add(partId);

    tempBox.setFromObject(obj);
    tempBox.getCenter(tempCenter);
    const radial = tempCenter.clone().sub(bodyCenterWorld);
    radial.y *= 0.38;
    if (radial.lengthSq() < 0.002) {
      radial.set(0, 0.22, 0.55);
    } else {
      radial.normalize().multiplyScalar(0.62 / assembly.atlasScale);
    }

    obj.userData.partId = partId;
    obj.userData.meshName = rawNodeName;
    obj.userData.systemId = spec.systemId;
    obj.userData.basePosition = obj.position.clone();
    obj.userData.explodeVector = radial.clone();
    assembly.partObjects.set(partId, obj);

    const displayName =
      manifestOrg?.name_en ||
      rawNodeName
        .replace(/\.l$/i, ' (left)')
        .replace(/\.r$/i, ' (right)')
        .replace(/[_-]+/g, ' ');

    const pathTrail = manifestOrg?.path?.length
      ? manifestOrg.path.join(' › ')
      : spec.label;

    newParts.push({
      id: partId,
      meshName: rawNodeName,
      name: displayName,
      scientificName: manifestOrg?.ta2_latin,
      system: spec.systemId,
      biologicalFunction: bioDefaults.functionText,
      structure: bioDefaults.structureText,
      location: `Anatomical Region: ${pathTrail}`,
      relatedStructures: [],
      educationalNotes: manifestOrg?.ta2_latin
        ? `Terminologia Anatomica (TA2): ${manifestOrg.ta2_latin}. Source: Z-Anatomy / BodyParts3D (CC BY-SA 4.0).`
        : `Source: Z-Anatomy / BodyParts3D medical human atlas (CC BY-SA 4.0).`,
      explodeVector: [
        Number(radial.x.toFixed(3)),
        Number(radial.y.toFixed(3)),
        Number(radial.z.toFixed(3)),
      ],
    });
  });

  return newParts;
}

export async function loadHumanAtlasProgressive(options: {
  isSoftwareGl: boolean;
  isCancelled: () => boolean;
  onCoreReady: (
    assembly: BuiltAnatomyAssembly,
    parts: AnatomyPartMetadata[],
    progress: HumanAtlasStreamProgress,
  ) => void;
  onLayerAppended: (
    allParts: AnatomyPartMetadata[],
    progress: HumanAtlasStreamProgress,
  ) => void;
}): Promise<void> {
  const { isSoftwareGl, isCancelled, onCoreReady, onLayerAppended } = options;

  const { manifestLookup, nodeLookup } = await getManifestLookups();
  if (isCancelled()) return;

  const priority1Specs = HUMAN_SYSTEM_GLBS.filter((s) => s.priority === 1);
  const priority2Specs = HUMAN_SYSTEM_GLBS.filter((s) => s.priority === 2);

  // Stage 1: Load skeletal + core viscera + outer shell (~4.8 MB total -> renders in ~1s)
  const coreLoaded = await Promise.all(
    priority1Specs.map(async (spec) => ({
      spec,
      scene: await loadSystemGlbCached(spec.file),
    })),
  );
  if (isCancelled()) return;

  const root = new THREE.Group();
  root.name = 'human_z_anatomy_atlas';

  // Compute exact stable normalization transform from the skeleton bounding box so
  // streaming additional systems never causes any jump or rescale
  const skeletonEntry = coreLoaded.find((e) => e.spec.systemId === 'skeletal') || coreLoaded[0];
  const skelBox = new THREE.Box3().setFromObject(skeletonEntry.scene);
  const skelSize = new THREE.Vector3();
  const skelCenter = new THREE.Vector3();
  skelBox.getSize(skelSize);
  skelBox.getCenter(skelCenter);

  const maxDim = Math.max(skelSize.x, skelSize.y, skelSize.z) || 1;
  const atlasScale = 2.42 / maxDim;
  root.scale.setScalar(atlasScale);
  root.position.set(
    -skelCenter.x * atlasScale,
    -skelBox.min.y * atlasScale - 1.25,
    -skelCenter.z * atlasScale,
  );
  root.updateMatrixWorld(true);

  const assembly: BuiltAnatomyAssembly = {
    root,
    systemGroups: new Map(),
    partObjects: new Map(),
    animatedParts: [],
    materialsToDispose: [],
    geometriesToDispose: [],
    atlasScale,
  };

  const usedIds = new Set<string>();
  const allParts: AnatomyPartMetadata[] = [];

  for (const { spec, scene } of coreLoaded) {
    const added = attachSystemToAssembly(
      spec,
      scene,
      assembly,
      manifestLookup,
      nodeLookup,
      usedIds,
      isSoftwareGl,
    );
    allParts.push(...added);
  }

  let loadedCount = coreLoaded.length;
  const totalCount = HUMAN_SYSTEM_GLBS.length;

  onCoreReady(assembly, [...allParts], {
    loadedCount,
    totalCount,
    currentSystemLabel:
      loadedCount < totalCount
        ? `Streaming ${priority2Specs[0]?.label || 'deep layers'}...`
        : 'All 11 medical systems ready',
    done: loadedCount >= totalCount,
  });

  // Stage 2: Stream heavier layers (Lymphatic, Circulatory, Nervous, Muscular) smoothly
  for (let i = 0; i < priority2Specs.length; i += 1) {
    if (isCancelled()) return;
    const spec = priority2Specs[i];
    const scene = await loadSystemGlbCached(spec.file);
    if (isCancelled()) return;

    const added = attachSystemToAssembly(
      spec,
      scene,
      assembly,
      manifestLookup,
      nodeLookup,
      usedIds,
      isSoftwareGl,
    );
    allParts.push(...added);
    loadedCount += 1;

    const nextSpec = priority2Specs[i + 1];
    onLayerAppended([...allParts], {
      loadedCount,
      totalCount,
      currentSystemLabel: nextSpec
        ? `Streaming ${nextSpec.label}...`
        : 'All 11 medical systems ready',
      done: loadedCount >= totalCount,
    });
  }
}
