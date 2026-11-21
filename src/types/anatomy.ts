export type TaxonomicGroup =
  | 'human'
  | 'mammals'
  | 'birds'
  | 'reptiles'
  | 'amphibians'
  | 'fish'
  | 'insects'
  | 'arachnids'
  | 'crustaceans'
  | 'mollusks'
  | 'marine'
  | 'invertebrates';

export type ModelAvailability =
  | 'segmented_3d'
  | 'interactive_3d'
  | 'external_3d'
  | 'metadata_only';

export type AnatomicalSystemId =
  | 'skeletal'
  | 'muscular'
  | 'nervous'
  | 'circulatory'
  | 'respiratory'
  | 'digestive'
  | 'urinary'
  | 'reproductive'
  | 'endocrine'
  | 'lymphatic'
  | 'integumentary'
  | 'exoskeleton';

export interface AnatomicalSystemInfo {
  id: AnatomicalSystemId;
  name: string;
  color: string;
  description: string;
  speciesSpecificNote: string;
}

export interface AnatomyPartMetadata {
  id: string;
  meshName: string;
  name: string;
  scientificName?: string;
  system: AnatomicalSystemId;
  biologicalFunction: string;
  structure: string;
  location: string;
  relatedStructures: string[];
  educationalNotes: string;
  explodeVector: [number, number, number];
}

export interface AlternativeModelOption {
  id: string;
  label: string;
  embedUrl: string;
  viewerPageUrl?: string;
  author?: string;
  vertexCount?: number;
  note?: string;
}

export interface SpeciesRecord {
  id: string;
  commonName: string;
  scientificName: string;
  aliases?: string[];
  group: TaxonomicGroup;
  kingdom: string;
  phylum: string;
  className: string;
  order: string;
  family: string;
  genus: string;
  conservationStatus: string;
  habitat: string;
  summary: string;
  anatomyNotes: string;
  availability: ModelAvailability;
  modelSource: 'human_atlas' | 'uploaded_glb' | 'external_glb' | 'sketchfab_embed' | 'none';
  modelUrl?: string;
  embedUrl?: string;
  viewerPageUrl?: string;
  thumbnailUrl?: string;
  referenceUrl?: string;
  creatorAttribution?: string;
  vertexCount?: number;
  alternativeModels?: AlternativeModelOption[];
  systems: AnatomicalSystemInfo[];
  parts: AnatomyPartMetadata[];
  isCustom?: boolean;
  createdAt?: string;
}

export interface ExternalModelResult {
  id: string;
  title: string;
  source: 'sketchfab' | 'open_glb';
  previewUrl?: string;
  embedUrl?: string;
  glbUrl?: string;
  viewerPageUrl?: string;
  author: string;
  license: string;
  vertexCount?: number;
  faceCount?: number;
  isDownloadable?: boolean;
  verifiedRealistic: boolean;
  tags?: string[];
  description: string;
}

export interface SearchResponse {
  query: string;
  internalMatches: SpeciesRecord[];
  catalogMatches: SpeciesRecord[];
  gbifMatches: SpeciesRecord[];
  externalModels: ExternalModelResult[];
  rejectedStylizedCount?: number;
  totalInternalCount: number;
  totalCatalogCount: number;
}

export interface BioAIMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  language: 'en' | 'si' | 'singlish';
  timestamp: string;
  suggestedQuestions?: string[];
}

export interface TaxonomicGroupMeta {
  id: TaxonomicGroup;
  label: string;
  scientificLabel: string;
  description: string;
  accentColor: string;
}

export const TAXONOMIC_GROUPS: TaxonomicGroupMeta[] = [
  {
    id: 'human',
    label: 'Human Anatomy',
    scientificLabel: 'Homo sapiens',
    description: 'Complete 11-system medical human gross and visceral anatomy.',
    accentColor: '#0D9488',
  },
  {
    id: 'mammals',
    label: 'Mammals',
    scientificLabel: 'Class Mammalia',
    description: 'Carnivores, herbivores, primates, ungulates, and proboscideans.',
    accentColor: '#D97706',
  },
  {
    id: 'birds',
    label: 'Birds',
    scientificLabel: 'Class Aves',
    description: 'Pneumatic skeletons, keeled sterna, and 9-sac avian respiration.',
    accentColor: '#0284C7',
  },
  {
    id: 'reptiles',
    label: 'Reptiles',
    scientificLabel: 'Class Reptilia',
    description: 'Crocodilians, testudines, squamates, and armored ectotherms.',
    accentColor: '#16A34A',
  },
  {
    id: 'amphibians',
    label: 'Amphibians',
    scientificLabel: 'Class Amphibia',
    description: '3-chambered hearts, urostyles, and dual cutaneous-pulmonary breathing.',
    accentColor: '#65A30D',
  },
  {
    id: 'fish',
    label: 'Fish',
    scientificLabel: 'Chondrichthyes & Osteichthyes',
    description: 'Branchial gill arches, spiral valves, swim bladders, and 2-chambered hearts.',
    accentColor: '#0EA5E9',
  },
  {
    id: 'insects',
    label: 'Insects',
    scientificLabel: 'Class Insecta',
    description: 'Chitinous exoskeletons, tracheal air tubes, and open dorsal hearts.',
    accentColor: '#CA8A04',
  },
  {
    id: 'arachnids',
    label: 'Arachnids',
    scientificLabel: 'Class Arachnida',
    description: 'Prosoma-opisthosoma body plans, book lungs, and silk spinnerets.',
    accentColor: '#DC2626',
  },
  {
    id: 'crustaceans',
    label: 'Crustaceans',
    scientificLabel: 'Subphylum Crustacea',
    description: 'Calcified carapaces, gastric mills, antennal glands, and gills.',
    accentColor: '#EA580C',
  },
  {
    id: 'mollusks',
    label: 'Mollusks',
    scientificLabel: 'Phylum Mollusca',
    description: 'Cephalopods with 3 hearts, hemocyanin blood, and brachial nerve cords.',
    accentColor: '#7C3AED',
  },
  {
    id: 'marine',
    label: 'Marine Animals',
    scientificLabel: 'Cetacea & Pelagic Fauna',
    description: 'Cetaceans, pinnipeds, and marine vertebrates adapted for ocean depths.',
    accentColor: '#2563EB',
  },
  {
    id: 'invertebrates',
    label: 'Other Invertebrates',
    scientificLabel: 'Cnidaria, Echinodermata & Annelida',
    description: 'Radial nerve nets, hydrostatic skeletons, and water vascular systems.',
    accentColor: '#0891B2',
  },
];

export const SYSTEM_COLOR_MAP: Record<AnatomicalSystemId, string> = {
  skeletal: '#E2D8C3',
  muscular: '#9E3F45',
  nervous: '#DDD08A',
  circulatory: '#C0392F',
  respiratory: '#D3A0A3',
  digestive: '#C08A63',
  urinary: '#9C5344',
  reproductive: '#BD8AA4',
  endocrine: '#D3A03F',
  lymphatic: '#8FB583',
  integumentary: '#DFB098',
  exoskeleton: '#B45309',
};
