import React, { useState, useEffect, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Focus,
  Layers,
  Info,
  MessageSquare,
  RotateCcw,
  Search,
  Sliders,
  ExternalLink,
  BookOpen,
  Upload,
  Box,
} from 'lucide-react';
import {
  AnatomicalSystemId,
  AnatomyPartMetadata,
  SpeciesRecord,
  SYSTEM_COLOR_MAP,
} from '../types/anatomy';
import { AnatomyViewer3D, CameraPreset } from './AnatomyViewer3D';
import { BioAIPanel } from './BioAIPanel';

interface ExplorerWorkspaceProps {
  species: SpeciesRecord;
  all3DSpecies: SpeciesRecord[];
  theme: 'light' | 'dark';
  onSelectSpecies: (species: SpeciesRecord) => void;
  onNavigateSearch: (initialQuery?: string) => void;
  onNavigateAdmin: () => void;
}

export const ExplorerWorkspace: React.FC<ExplorerWorkspaceProps> = ({
  species,
  all3DSpecies,
  theme,
  onSelectSpecies,
  onNavigateSearch,
  onNavigateAdmin,
}) => {
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [rightTab, setRightTab] = useState<'inspector' | 'bioai'>('inspector');

  const [visibleSystems, setVisibleSystems] = useState<Set<AnatomicalSystemId>>(new Set());
  const [hiddenPartIds, setHiddenPartIds] = useState<Set<string>>(new Set());
  const [isolatedPartId, setIsolatedPartId] = useState<string | null>(null);
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [ghostOuter, setGhostOuter] = useState(false);
  const [explodeAmount, setExplodeAmount] = useState(0);
  const [layerStackAmount, setLayerStackAmount] = useState(0.85);
  const [humanStudyMode, setHumanStudyMode] = useState<'picture_stack' | 'system_dissection'>('picture_stack');
  const [activeDissectionSystem, setActiveDissectionSystem] = useState<AnatomicalSystemId>('skeletal');
  const [cameraPresetReq, setCameraPresetReq] = useState<{ preset: CameraPreset; seq: number } | null>(null);
  const [partOffsets, setPartOffsets] = useState<Record<string, [number, number, number]>>({});
  const [partFilter, setPartFilter] = useState('');

  // For Human Atlas / uploaded GLBs whose meshes were auto-detected at load time
  const [detectedParts, setDetectedParts] = useState<AnatomyPartMetadata[]>([]);
  const [supportsExplode, setSupportsExplode] = useState(true);
  const [activeAltEmbedUrl, setActiveAltEmbedUrl] = useState<string | null>(null);

  // Wikipedia / iNaturalist + Comparative Anatomy details for metadata_only species
  const [wikiInfo, setWikiInfo] = useState<{
    extract?: string;
    thumbnailUrl?: string;
    referenceUrl?: string;
  } | null>(null);
  const [wikiLoading, setWikiLoading] = useState(false);
  const [anatomyDetails, setAnatomyDetails] = useState<{
    overview?: string;
    dietAndEcology?: string;
    sizeAndLifespan?: string;
    skeletalAndMuscular?: string;
    circulatoryAndRespiratory?: string;
    nervousAndSensory?: string;
    specialAdaptations?: string;
    humanComparison?: string;
  } | null>(null);
  const [anatomyDetailsLoading, setAnatomyDetailsLoading] = useState(false);

  const requestCameraPreset = (preset: CameraPreset) => {
    setCameraPresetReq((prev) => ({ preset, seq: (prev?.seq || 0) + 1 }));
  };

  // Reset state when switching species
  useEffect(() => {
    const isHumanAtlas = species.modelSource === 'human_atlas';
    const rawIds = species.systems.length
      ? species.systems.map((s) => s.id)
      : (['skeletal', 'muscular', 'nervous', 'circulatory', 'respiratory', 'digestive', 'exoskeleton', 'integumentary'] as AnatomicalSystemId[]);

    // For Human Picture Stack start with all 10 internal systems visible (outer skin off so internal layers show like the reference photo)
    const sysIds = new Set<AnatomicalSystemId>(
      isHumanAtlas ? rawIds.filter((id) => id !== 'integumentary') : rawIds,
    );
    setVisibleSystems(sysIds);
    setHiddenPartIds(new Set());
    setIsolatedPartId(null);
    setSelectedPartId(species.parts[0]?.id || null);
    setGhostOuter(false);
    setExplodeAmount(0);
    setLayerStackAmount(isHumanAtlas ? 0.85 : 0);
    setHumanStudyMode('picture_stack');
    setActiveDissectionSystem('skeletal');
    setPartOffsets({});
    setPartFilter('');
    setDetectedParts(species.parts);
    setActiveAltEmbedUrl(species.alternativeModels?.[0]?.embedUrl || species.embedUrl || null);

    if (species.availability === 'metadata_only') {
      setWikiLoading(true);
      setWikiInfo(null);
      fetch(`/api/species-info?name=${encodeURIComponent(species.scientificName)}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.extract) {
            setWikiInfo(data);
          } else {
            return fetch(`/api/species-info?name=${encodeURIComponent(species.commonName)}`)
              .then((r2) => r2.json())
              .then((data2) => setWikiInfo(data2));
          }
        })
        .catch(() => setWikiInfo(null))
        .finally(() => setWikiLoading(false));

      setAnatomyDetailsLoading(true);
      setAnatomyDetails(null);
      fetch('/api/species-anatomy-details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commonName: species.commonName,
          scientificName: species.scientificName,
          className: species.className,
          order: species.order,
          family: species.family,
          habitat: species.habitat,
        }),
      })
        .then((r) => r.json())
        .then((d) => setAnatomyDetails(d))
        .catch(() => setAnatomyDetails(null))
        .finally(() => setAnatomyDetailsLoading(false));
    }
  }, [species]);

  const effectiveParts = useMemo(() => {
    if (species.modelSource === 'human_atlas' && detectedParts.length > 0) {
      return detectedParts;
    }
    return species.parts.length > 0 ? species.parts : detectedParts;
  }, [species.modelSource, species.parts, detectedParts]);

  const selectedPart = useMemo(() => {
    return effectiveParts.find((p) => p.id === selectedPartId) || null;
  }, [effectiveParts, selectedPartId]);

  const filteredParts = useMemo(() => {
    const systemScoped = effectiveParts.filter(
      (p) => visibleSystems.size === 0 || visibleSystems.has(p.system),
    );
    const pool = systemScoped.length > 0 ? systemScoped : effectiveParts;
    const q = partFilter.trim().toLowerCase();
    if (!q) {
      if (pool.length > 80) {
        const landmarkRegex = /^(cranium|mandible|sternum|clavicle|femur|humerus|tibia|heart|left ventricle|right ventricle|aorta|superior vena cava|trachea|left lung|right lung|liver|stomach|pancreas|spleen|left kidney|right kidney|thyroid|thymus|brain|cerebrum|spinal cord|pectoralis major|deltoid|biceps brachii|rectus abdominis|quadriceps|gastrocnemius)/i;
        const landmarks = pool.filter((p) => landmarkRegex.test(p.name));
        const others = pool.filter((p) => !landmarkRegex.test(p.name));
        return [...landmarks, ...others];
      }
      return pool;
    }
    return pool.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.system.toLowerCase().includes(q) ||
        (p.scientificName || '').toLowerCase().includes(q),
    );
  }, [effectiveParts, visibleSystems, partFilter]);

  const switchToPictureStackMode = () => {
    setHumanStudyMode('picture_stack');
    setIsolatedPartId(null);
    setHiddenPartIds(new Set());
    setExplodeAmount(0);
    setPartOffsets({});
    setLayerStackAmount(0.85);
    const rawIds = species.systems.map((s) => s.id).filter((id) => id !== 'integumentary');
    setVisibleSystems(new Set(rawIds));
    requestCameraPreset('iso');
  };

  const switchToSystemDissectionMode = (sysId: AnatomicalSystemId = activeDissectionSystem) => {
    setHumanStudyMode('system_dissection');
    setActiveDissectionSystem(sysId);
    setIsolatedPartId(null);
    setHiddenPartIds(new Set());
    setLayerStackAmount(0);
    setVisibleSystems(new Set([sysId]));
    setExplodeAmount(0.35);
    requestCameraPreset('front');
  };

  const toggleSystem = (sysId: AnatomicalSystemId) => {
    setIsolatedPartId(null);
    setVisibleSystems((prev) => {
      const next = new Set(prev);
      if (next.has(sysId)) next.delete(sysId);
      else next.add(sysId);
      return next;
    });
  };

  const isolateSystem = (sysId: AnatomicalSystemId) => {
    setIsolatedPartId(null);
    setActiveDissectionSystem(sysId);
    setVisibleSystems(new Set([sysId]));
    if (species.modelSource === 'human_atlas') {
      setHumanStudyMode('system_dissection');
      setLayerStackAmount(0);
    }
  };

  const showAllSystems = () => {
    setIsolatedPartId(null);
    setHiddenPartIds(new Set());
    const allIds = species.systems.length
      ? species.systems.map((s) => s.id)
      : (['skeletal', 'muscular', 'nervous', 'circulatory', 'respiratory', 'digestive', 'exoskeleton', 'integumentary'] as AnatomicalSystemId[]);
    setVisibleSystems(
      new Set(
        species.modelSource === 'human_atlas' && humanStudyMode === 'picture_stack'
          ? allIds.filter((id) => id !== 'integumentary')
          : allIds,
      ),
    );
  };

  const togglePartVisibility = (partId: string) => {
    setHiddenPartIds((prev) => {
      const next = new Set(prev);
      if (next.has(partId)) next.delete(partId);
      else next.add(partId);
      return next;
    });
  };

  const handleSelectPartFrom3D = (partId: string | null) => {
    setSelectedPartId(partId);
    if (partId) {
      setRightOpen(true);
    }
  };

  const updatePartOffset = (partId: string, axis: 0 | 1 | 2, val: number) => {
    setPartOffsets((prev) => {
      const curr: [number, number, number] = [...(prev[partId] || [0, 0, 0])];
      curr[axis] = val;
      return { ...prev, [partId]: curr };
    });
  };

  const availabilityText =
    species.availability === 'segmented_3d'
      ? 'Medical Segmented 3D Atlas'
      : species.availability === 'interactive_3d'
        ? 'Photorealistic 3D GLB'
        : species.availability === 'external_3d'
          ? 'Photorealistic / Museum 3D Specimen'
          : 'Taxonomic Record Only (No Realistic 3D Model)';

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-sky-50/30 dark:bg-[#070B14] overflow-hidden">
      {/* Top Specimen Ribbon */}
      <div className="h-12 px-4 border-b border-sky-100 dark:border-slate-800 bg-white dark:bg-[#0B1120] flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => setLeftOpen((v) => !v)}
            className="p-1.5 rounded-lg border border-sky-200 dark:border-slate-700 text-sky-700 dark:text-slate-300 hover:bg-sky-50 dark:hover:bg-slate-800 shrink-0"
            title={leftOpen ? 'Collapse Anatomy Panel' : 'Expand Anatomy Panel'}
          >
            {leftOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>

          <div className="min-w-0 flex items-baseline gap-2.5 truncate">
            <h1 className="font-display text-sm sm:text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
              {species.commonName}
            </h1>
            <span className="text-xs italic text-slate-500 dark:text-slate-400 truncate hidden sm:inline">
              {species.scientificName}
            </span>
            <span className="text-slate-300 dark:text-slate-700 hidden md:inline" aria-hidden="true">·</span>
            <span className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold hidden md:inline truncate">
              {availabilityText}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <select
            aria-label="Switch Specimen"
            value={species.id}
            onChange={(e) => {
              const found = all3DSpecies.find((s) => s.id === e.target.value);
              if (found) onSelectSpecies(found);
            }}
            className="max-w-[170px] sm:max-w-[230px] px-2.5 py-1.5 rounded-lg text-xs bg-sky-50 dark:bg-slate-800 border border-sky-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            {!all3DSpecies.some((s) => s.id === species.id) && (
              <optgroup label="Details-Only Record (No 3D Model)">
                <option value={species.id}>{species.commonName} ({species.scientificName})</option>
              </optgroup>
            )}
            <optgroup label="Verified Realistic 3D Models">
              {all3DSpecies.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.commonName} ({s.className})
                </option>
              ))}
            </optgroup>
          </select>

          <button
            type="button"
            onClick={() => onNavigateSearch('')}
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Search className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Search Any Animal</span>
          </button>

          <button
            type="button"
            onClick={() => setRightOpen((v) => !v)}
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
            title={rightOpen ? 'Collapse Inspector Panel' : 'Expand Inspector Panel'}
          >
            {rightOpen ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main 3-Zone Workspace */}
      <div className="flex-1 flex min-h-0 relative">
        {/* LEFT PANEL: Systems & Structures Tree */}
        {leftOpen && (
          <aside className="w-72 lg:w-80 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1120] flex flex-col min-h-0 z-10 absolute md:relative inset-y-0 left-0 shadow-xl md:shadow-none">
            <div className="p-3.5 border-b border-sky-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                <span className="font-display text-sm font-semibold">Anatomical Systems</span>
              </div>
              <button
                type="button"
                onClick={showAllSystems}
                className="text-[11px] font-semibold text-sky-700 dark:text-sky-400 hover:underline whitespace-nowrap"
              >
                Show All
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3.5 space-y-5">
              {/* Two-Part Human Study Switcher (Picture Stack vs Single-System Dissection) */}
              {species.modelSource === 'human_atlas' && (
                <div className="space-y-3 p-3 rounded-xl bg-sky-50/60 dark:bg-slate-900 border border-sky-100 dark:border-slate-800">
                  <div className="grid grid-cols-2 gap-1 p-0.5 rounded-lg bg-sky-100/80 dark:bg-slate-800">
                    <button
                      type="button"
                      onClick={switchToPictureStackMode}
                      className={`py-1.5 px-2 rounded-md text-[11px] font-semibold transition-colors ${
                        humanStudyMode === 'picture_stack'
                          ? 'bg-gradient-to-r from-sky-600 to-emerald-600 text-white shadow-sm'
                          : 'text-slate-600 dark:text-slate-400 hover:text-sky-800 dark:hover:text-slate-100'
                      }`}
                    >
                      1. Picture Stack
                    </button>
                    <button
                      type="button"
                      onClick={() => switchToSystemDissectionMode(activeDissectionSystem)}
                      className={`py-1.5 px-2 rounded-md text-[11px] font-semibold transition-colors ${
                        humanStudyMode === 'system_dissection'
                          ? 'bg-gradient-to-r from-sky-600 to-emerald-600 text-white shadow-sm'
                          : 'text-slate-600 dark:text-slate-400 hover:text-sky-800 dark:hover:text-slate-100'
                      }`}
                    >
                      2. Isolate &amp; Split
                    </button>
                  </div>

                  {humanStudyMode === 'picture_stack' ? (
                    <div className="space-y-2.5 text-xs">
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                        Front/Back aligns into <strong>one unified human</strong>. Left/Right/3/4 angles spread every system into parallel depth layers.
                      </p>
                      <label className="block space-y-1">
                        <div className="flex justify-between text-[11px] font-medium text-slate-700 dark:text-slate-300">
                          <span>Layer Stack Spacing</span>
                          <span className="font-mono-tabular">{Math.round(layerStackAmount * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={Math.round(layerStackAmount * 100)}
                          onChange={(e) => setLayerStackAmount(Number(e.target.value) / 100)}
                          className="w-full cursor-pointer"
                        />
                      </label>
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() => requestCameraPreset('front')}
                          className="px-2 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-sky-200 dark:border-slate-700 hover:border-sky-500 text-[11px] font-medium text-slate-700 dark:text-slate-200"
                        >
                          Front (Unified)
                        </button>
                        <button
                          type="button"
                          onClick={() => requestCameraPreset('back')}
                          className="px-2 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-sky-200 dark:border-slate-700 hover:border-sky-500 text-[11px] font-medium text-slate-700 dark:text-slate-200"
                        >
                          Back (Unified)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (layerStackAmount < 0.2) setLayerStackAmount(0.85);
                            requestCameraPreset('left');
                          }}
                          className="px-2 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-700 text-[11px] font-semibold text-emerald-800 dark:text-emerald-200"
                        >
                          Left Stack
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (layerStackAmount < 0.2) setLayerStackAmount(0.85);
                            requestCameraPreset('right');
                          }}
                          className="px-2 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-700 text-[11px] font-semibold text-emerald-800 dark:text-emerald-200"
                        >
                          Right Stack
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2.5 text-xs">
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                        Pick a single anatomical system below to isolate it, then separate its individual bones, muscles, or organs.
                      </p>
                      <label className="block space-y-1">
                        <div className="flex justify-between text-[11px] font-medium text-slate-700 dark:text-slate-300">
                          <span>Separate System Parts</span>
                          <span className="font-mono-tabular">{Math.round(explodeAmount * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={Math.round(explodeAmount * 100)}
                          onChange={(e) => setExplodeAmount(Number(e.target.value) / 100)}
                          className="w-full cursor-pointer"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setExplodeAmount(0);
                          setPartOffsets({});
                        }}
                        className="w-full py-1.5 px-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                      >
                        Reassemble System Parts
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Systems Checklist */}
              {species.systems.length > 0 ? (
                <div className="space-y-1.5">
                  {species.systems.map((sys) => {
                    const isVisible = visibleSystems.has(sys.id);
                    const isDissectActive =
                      species.modelSource === 'human_atlas' &&
                      humanStudyMode === 'system_dissection' &&
                      visibleSystems.size === 1 &&
                      isVisible;
                    return (
                      <div
                        key={sys.id}
                        className={`group flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg border transition-colors ${
                          isDissectActive
                            ? 'border-sky-500 bg-sky-50/80 dark:bg-sky-950/40'
                            : 'border-sky-100 dark:border-slate-800 bg-sky-50/40 dark:bg-slate-900/50'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            species.modelSource === 'human_atlas' && humanStudyMode === 'system_dissection'
                              ? switchToSystemDissectionMode(sys.id)
                              : toggleSystem(sys.id)
                          }
                          className="flex items-center gap-2.5 min-w-0 flex-1 text-left"
                        >
                          <span
                            className="w-2.5 h-2.5 rounded-sm shrink-0 border border-black/15"
                            style={{ backgroundColor: sys.color || SYSTEM_COLOR_MAP[sys.id] }}
                          />
                          <span
                            className={`text-xs font-medium truncate ${
                              isVisible
                                ? 'text-slate-900 dark:text-slate-100'
                                : 'text-slate-400 dark:text-slate-600 line-through'
                            }`}
                          >
                            {sys.name}
                          </span>
                        </button>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => isolateSystem(sys.id)}
                            title="Isolate & Dissect System"
                            className="px-1.5 py-0.5 rounded text-[10px] font-medium text-slate-500 hover:text-sky-700 dark:text-slate-400 dark:hover:text-sky-300 hover:bg-sky-100 dark:hover:bg-slate-800"
                          >
                            Only
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleSystem(sys.id)}
                            title={isVisible ? 'Hide System' : 'Show System'}
                            className="p-1 rounded text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
                          >
                            {isVisible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {/* Outer Skin Visibility + X-Ray Ghost Controls */}
                  {species.systems.some((s) => s.id === 'integumentary') && (
                    <div className="space-y-1.5 mt-2">
                      <button
                        type="button"
                        onClick={() => toggleSystem('integumentary')}
                        className={`w-full px-3 py-2 rounded-lg text-xs font-medium border flex items-center justify-between transition-colors ${
                          !visibleSystems.has('integumentary')
                            ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200'
                            : 'bg-white dark:bg-slate-900 border-sky-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-sky-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        <span>
                          {visibleSystems.has('integumentary')
                            ? 'Hide Outer Skin Layer'
                            : 'Show Outer Skin Layer'}
                        </span>
                        <span className="font-mono-tabular text-[11px]">
                          {visibleSystems.has('integumentary') ? 'VISIBLE' : 'HIDDEN'}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setGhostOuter((v) => !v)}
                        className={`w-full px-3 py-2 rounded-lg text-xs font-medium border flex items-center justify-between transition-colors ${
                          ghostOuter
                            ? 'bg-sky-50 dark:bg-sky-950/60 border-sky-300 dark:border-sky-700 text-sky-800 dark:text-sky-200'
                            : 'bg-white dark:bg-slate-900 border-sky-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-sky-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        <span>X-Ray Translucent Skin</span>
                        <span className="font-mono-tabular text-[11px]">{ghostOuter ? 'ON' : 'OFF'}</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  {species.availability === 'metadata_only'
                    ? 'Scientific encyclopedia profile (no 3D GLB file attached for this animal).'
                    : 'Model components detected from 3D mesh hierarchy.'}
                </p>
              )}

              {/* Individual Selectable Structures */}
              {effectiveParts.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-sky-100 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Selectable Structures ({effectiveParts.length.toLocaleString()})
                    </span>
                  </div>
                  <input
                    type="text"
                    value={partFilter}
                    onChange={(e) => setPartFilter(e.target.value)}
                    placeholder="Filter bones, muscles, nerves, organs..."
                    className="w-full px-2.5 py-1.5 rounded-lg text-xs bg-sky-50/50 dark:bg-slate-800 border border-sky-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                  {filteredParts.length > 60 && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Showing top 60 of {filteredParts.length.toLocaleString()} structures. Search above to pinpoint any structure.
                    </p>
                  )}
                  <div className="space-y-1">
                    {filteredParts.slice(0, 60).map((part) => {
                      const selected = selectedPartId === part.id;
                      const hidden = hiddenPartIds.has(part.id);
                      return (
                        <div
                          key={part.id}
                          className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                            selected
                              ? 'bg-gradient-to-r from-sky-600 to-emerald-600 text-white'
                              : 'hover:bg-sky-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedPartId(part.id);
                              setRightTab('inspector');
                              setRightOpen(true);
                            }}
                            className="flex-1 min-w-0 text-left truncate font-medium"
                          >
                            {part.name}
                          </button>
                          <button
                            type="button"
                            onClick={() => togglePartVisibility(part.id)}
                            title={hidden ? 'Show part' : 'Hide part'}
                            className={`p-1 rounded shrink-0 ${
                              selected ? 'text-white/90 hover:text-white' : 'text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                            }`}
                          >
                            {hidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </aside>
        )}

        {/* CENTER STAGE: Genuine 3D Viewport OR Honest Metadata View */}
        <main className="flex-1 min-w-0 relative bg-slate-100 dark:bg-[#070B14]">
          {species.availability === 'segmented_3d' || species.availability === 'interactive_3d' ? (
            <AnatomyViewer3D
              species={species}
              theme={theme}
              variant="workspace"
              visibleSystems={visibleSystems}
              hiddenPartIds={hiddenPartIds}
              isolatedPartId={isolatedPartId}
              selectedPartId={selectedPartId}
              ghostOuter={ghostOuter}
              explodeAmount={explodeAmount}
              onExplodeAmountChange={setExplodeAmount}
              layerStackAmount={layerStackAmount}
              onLayerStackAmountChange={setLayerStackAmount}
              cameraPresetRequest={cameraPresetReq}
              partOffsets={partOffsets}
              onResetPartOffsets={() => setPartOffsets({})}
              onSelectPart={handleSelectPartFrom3D}
              onDetectedMeshParts={(parts, canExplode) => {
                if (species.modelSource === 'human_atlas' || species.parts.length === 0) {
                  setDetectedParts(parts);
                }
                setSupportsExplode(canExplode);
              }}
            />
          ) : species.availability === 'external_3d' && (activeAltEmbedUrl || species.embedUrl) ? (
            <div className="w-full h-full flex flex-col">
              <div className="px-4 py-2 bg-white dark:bg-[#0B1120] border-b border-sky-100 dark:border-slate-800 text-xs flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                    Verified Realistic 3D Specimen
                  </span>
                  {species.creatorAttribution && (
                    <>
                      <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">·</span>
                      <span className="text-slate-600 dark:text-slate-300 truncate">
                        {species.creatorAttribution}
                      </span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-1.5 overflow-x-auto">
                  {species.alternativeModels?.map((alt) => {
                    const isActive = (activeAltEmbedUrl || species.embedUrl) === alt.embedUrl;
                    return (
                      <button
                        key={alt.id}
                        type="button"
                        onClick={() => setActiveAltEmbedUrl(alt.embedUrl)}
                        title={alt.note || alt.label}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                          isActive
                            ? 'bg-gradient-to-r from-sky-600 to-emerald-600 text-white'
                            : 'bg-sky-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-sky-100 dark:hover:bg-slate-700'
                        }`}
                      >
                        {alt.label}
                      </button>
                    );
                  })}
                  {(species.viewerPageUrl || species.modelUrl) && (
                    <a
                      href={species.viewerPageUrl || species.modelUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="px-2 py-1 font-medium text-slate-600 dark:text-slate-300 hover:text-sky-600 dark:hover:text-sky-400 flex items-center gap-1 whitespace-nowrap shrink-0"
                    >
                      Source <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
              <iframe
                key={`${activeAltEmbedUrl || species.embedUrl}-${theme}`}
                title={`${species.commonName} Realistic 3D Specimen`}
                src={
                  theme === 'light'
                    ? (activeAltEmbedUrl || species.embedUrl)?.replace('ui_theme=dark', 'ui_theme=light')
                    : activeAltEmbedUrl || species.embedUrl
                }
                className="w-full flex-1 border-0 bg-white dark:bg-[#0B1120]"
                allow="autoplay; fullscreen; xr-spatial-tracking"
                allowFullScreen
              />
            </div>
          ) : (
            /* Full Scientific Name & Biological Details Dossier for Species Without 3D GLB Models */
            <div className="w-full h-full overflow-y-auto p-6 sm:p-10">
              <div className="max-w-4xl mx-auto space-y-6">
                <div className="p-4 rounded-xl bg-sky-50 dark:bg-slate-800/70 border border-sky-200 dark:border-slate-700 flex items-start gap-3">
                  <BookOpen className="w-5 h-5 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Scientific Information Profile (No 3D GLB Model Attached)
                    </h2>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      BioExplora 3D only attaches interactive 3D canvases when a verified realistic 3D GLB/GLTF file is available. Complete taxonomy, scientific name, and comparative anatomy details for <em>{species.scientificName}</em> are presented below.
                    </p>
                  </div>
                </div>

                <div className="rounded-xl bg-white dark:bg-slate-900 border border-sky-100 dark:border-slate-800 p-6 space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="space-y-1">
                      <p className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold">
                        {species.kingdom} · {species.phylum} · {species.className}
                      </p>
                      <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">
                        {species.commonName}
                      </h2>
                      <p className="text-base italic font-medium text-slate-600 dark:text-slate-300">
                        Scientific Name: {species.scientificName}
                      </p>
                    </div>
                    {(wikiInfo?.thumbnailUrl || species.thumbnailUrl) && (
                      <img
                        src={wikiInfo?.thumbnailUrl || species.thumbnailUrl}
                        alt={species.commonName}
                        referrerPolicy="no-referrer"
                        className="w-32 h-32 object-cover rounded-xl border border-slate-200 dark:border-slate-700 shrink-0"
                      />
                    )}
                  </div>

                  {/* Full 7-Rank Taxonomic Classification */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-4 border-y border-slate-200 dark:border-slate-800 text-xs">
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 block">Kingdom</span>
                      <span className="font-medium text-slate-900 dark:text-slate-100">{species.kingdom}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 block">Phylum</span>
                      <span className="font-medium text-slate-900 dark:text-slate-100">{species.phylum}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 block">Class</span>
                      <span className="font-medium text-slate-900 dark:text-slate-100">{species.className}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 block">Order</span>
                      <span className="font-medium text-slate-900 dark:text-slate-100">{species.order}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 block">Family</span>
                      <span className="font-medium text-slate-900 dark:text-slate-100">{species.family}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 block">Genus</span>
                      <span className="font-medium italic text-slate-900 dark:text-slate-100">{species.genus}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 block">Conservation Status</span>
                      <span className="font-medium text-slate-900 dark:text-slate-100">{species.conservationStatus}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 block">Habitat &amp; Range</span>
                      <span className="font-medium text-slate-900 dark:text-slate-100">{species.habitat}</span>
                    </div>
                  </div>

                  {/* Encyclopedia Overview */}
                  <div className="space-y-3 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                    <h3 className="font-display font-semibold text-slate-900 dark:text-slate-100">
                      Species Summary &amp; Natural History
                    </h3>
                    {wikiLoading ? (
                      <p className="text-xs text-slate-500">Fetching live encyclopedia record...</p>
                    ) : (
                      <p>{wikiInfo?.extract || species.summary}</p>
                    )}
                  </div>

                  {/* Comprehensive Comparative Anatomy Breakdown */}
                  <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                    <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Full Comparative Anatomy &amp; Biological Details
                    </h3>
                    {anatomyDetailsLoading ? (
                      <p className="text-xs text-slate-500">Loading detailed system-by-system anatomical dossier...</p>
                    ) : anatomyDetails ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs leading-relaxed">
                        <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                          <span className="font-semibold text-slate-900 dark:text-slate-100 block mb-1">
                            Skeletal &amp; Muscular System
                          </span>
                          <p className="text-slate-600 dark:text-slate-300">{anatomyDetails.skeletalAndMuscular}</p>
                        </div>
                        <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                          <span className="font-semibold text-slate-900 dark:text-slate-100 block mb-1">
                            Circulatory &amp; Respiratory System
                          </span>
                          <p className="text-slate-600 dark:text-slate-300">{anatomyDetails.circulatoryAndRespiratory}</p>
                        </div>
                        <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                          <span className="font-semibold text-slate-900 dark:text-slate-100 block mb-1">
                            Nervous &amp; Sensory System
                          </span>
                          <p className="text-slate-600 dark:text-slate-300">{anatomyDetails.nervousAndSensory}</p>
                        </div>
                        <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                          <span className="font-semibold text-slate-900 dark:text-slate-100 block mb-1">
                            Diet, Size &amp; Ecology
                          </span>
                          <p className="text-slate-600 dark:text-slate-300">
                            {anatomyDetails.dietAndEcology} {anatomyDetails.sizeAndLifespan}
                          </p>
                        </div>
                        <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                          <span className="font-semibold text-slate-900 dark:text-slate-100 block mb-1">
                            Special Evolutionary Adaptations
                          </span>
                          <p className="text-slate-600 dark:text-slate-300">{anatomyDetails.specialAdaptations}</p>
                        </div>
                        <div className="p-3.5 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                          <span className="font-semibold text-emerald-900 dark:text-emerald-200 block mb-1">
                            Comparison with Human Anatomy
                          </span>
                          <p className="text-emerald-800 dark:text-emerald-300">{anatomyDetails.humanComparison}</p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-600 dark:text-slate-400 bg-sky-50/50 dark:bg-slate-800/60 p-3.5 rounded-lg border border-sky-100 dark:border-slate-800">
                        {species.anatomyNotes}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setRightTab('bioai');
                        setRightOpen(true);
                      }}
                      className="px-4 py-2 rounded-lg bg-gradient-to-r from-sky-600 to-emerald-600 hover:from-sky-700 hover:to-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>Ask BioAI (English / සිංහල / Singlish)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigateSearch(species.scientificName)}
                      className="px-4 py-2 rounded-lg border border-sky-200 dark:border-slate-700 hover:bg-sky-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-medium flex items-center gap-1.5"
                    >
                      <Box className="w-3.5 h-3.5" />
                      <span>Check GLB Repositories</span>
                    </button>
                    <button
                      type="button"
                      onClick={onNavigateAdmin}
                      className="px-4 py-2 rounded-lg border border-sky-200 dark:border-slate-700 hover:bg-sky-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-medium flex items-center gap-1.5"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Upload GLB File</span>
                    </button>
                    {(wikiInfo?.referenceUrl || species.referenceUrl) && (
                      <a
                        href={wikiInfo?.referenceUrl || species.referenceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-2 text-xs font-medium text-sky-700 dark:text-sky-400 hover:underline flex items-center gap-1"
                      >
                        Scientific Reference <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>

        {/* RIGHT PANEL: Tabbed Part Inspector & BioAI Assistant */}
        {rightOpen && (
          <aside className="w-80 lg:w-96 border-l border-sky-100 dark:border-slate-800 bg-white dark:bg-[#0B1120] flex flex-col min-h-0 z-10 absolute md:relative inset-y-0 right-0 shadow-xl md:shadow-none">
            {/* Switch Tabs */}
            <div className="p-2 border-b border-sky-100 dark:border-slate-800 flex items-center gap-1 bg-sky-50/50 dark:bg-slate-900/50">
              <button
                type="button"
                onClick={() => setRightTab('inspector')}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
                  rightTab === 'inspector'
                    ? 'bg-gradient-to-r from-sky-600 to-emerald-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-sky-800 dark:hover:text-slate-100'
                }`}
              >
                <Info className="w-3.5 h-3.5" />
                <span>Part Inspector</span>
              </button>
              <button
                type="button"
                onClick={() => setRightTab('bioai')}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
                  rightTab === 'bioai'
                    ? 'bg-gradient-to-r from-sky-600 to-emerald-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-sky-800 dark:hover:text-slate-100'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>BioAI Assistant</span>
              </button>
            </div>

            {rightTab === 'bioai' ? (
              <div className="flex-1 min-h-0">
                <BioAIPanel
                  species={species}
                  selectedPart={selectedPart}
                  activeSystems={Array.from(visibleSystems)}
                />
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-4 space-y-5">
                {selectedPart ? (
                  <>
                    <div>
                      <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 capitalize">
                        {selectedPart.system} System
                        {selectedPart.scientificName ? ` · ${selectedPart.scientificName}` : ''}
                      </p>
                      <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100 mt-1">
                        {selectedPart.name}
                      </h2>
                    </div>

                    {/* Quick Actions: Isolate / Hide / Ask BioAI */}
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setIsolatedPartId((curr) => (curr === selectedPart.id ? null : selectedPart.id))
                        }
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 border transition-colors ${
                          isolatedPartId === selectedPart.id
                            ? 'bg-sky-600 border-sky-600 text-white'
                            : 'bg-sky-50 dark:bg-slate-800 border-sky-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-sky-100 dark:hover:bg-slate-700'
                        }`}
                      >
                        <Focus className="w-3.5 h-3.5" />
                        <span>{isolatedPartId === selectedPart.id ? 'Exit Isolate' : 'Isolate Part'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => togglePartVisibility(selectedPart.id)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 bg-sky-50 dark:bg-slate-800 border border-sky-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-sky-100 dark:hover:bg-slate-700"
                      >
                        {hiddenPartIds.has(selectedPart.id) ? (
                          <>
                            <Eye className="w-3.5 h-3.5" />
                            <span>Show</span>
                          </>
                        ) : (
                          <>
                            <EyeOff className="w-3.5 h-3.5" />
                            <span>Hide</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => setRightTab('bioai')}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>Ask BioAI</span>
                      </button>
                    </div>

                    {/* Educational Details */}
                    <div className="space-y-4 text-xs leading-relaxed">
                      <div>
                        <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">
                          Biological Function
                        </h4>
                        <p className="text-slate-600 dark:text-slate-300">{selectedPart.biologicalFunction}</p>
                      </div>
                      <div>
                        <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">
                          Anatomical Structure
                        </h4>
                        <p className="text-slate-600 dark:text-slate-300">{selectedPart.structure}</p>
                      </div>
                      <div>
                        <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">
                          Location
                        </h4>
                        <p className="text-slate-600 dark:text-slate-300">{selectedPart.location}</p>
                      </div>
                      <div>
                        <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">
                          Detailed Educational Notes
                        </h4>
                        <p className="text-slate-600 dark:text-slate-300 p-3 rounded-lg bg-sky-50/50 dark:bg-slate-800/60 border border-sky-100 dark:border-slate-800">
                          {selectedPart.educationalNotes}
                        </p>
                      </div>

                      {selectedPart.relatedStructures.length > 0 && (
                        <div>
                          <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-1.5">
                            Related Structures
                          </h4>
                          <div className="flex flex-wrap gap-1.5">
                            {selectedPart.relatedStructures.map((rel) => {
                              const match = effectiveParts.find((p) =>
                                p.name.toLowerCase().includes(rel.toLowerCase().split(' ')[0]),
                              );
                              return (
                                <button
                                  key={rel}
                                  type="button"
                                  onClick={() => match && setSelectedPartId(match.id)}
                                  className="px-2.5 py-1 rounded-md bg-sky-50 dark:bg-slate-800 hover:bg-sky-100 dark:hover:bg-sky-950/50 text-slate-700 dark:text-slate-300 border border-sky-200 dark:border-slate-700 text-[11px]"
                                >
                                  {rel}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Individual Body Part Movement in Exploded Mode */}
                    {supportsExplode && (
                      <div className="pt-4 border-t border-sky-100 dark:border-slate-800 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                            <Sliders className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                            <span>Move Individual Part</span>
                          </h4>
                          <button
                            type="button"
                            onClick={() =>
                              setPartOffsets((prev) => ({ ...prev, [selectedPart.id]: [0, 0, 0] }))
                            }
                            className="text-[11px] text-sky-700 dark:text-sky-400 hover:underline flex items-center gap-1"
                          >
                            <RotateCcw className="w-3 h-3" /> Reset
                          </button>
                        </div>
                        {(['X', 'Y', 'Z'] as const).map((axis, idx) => {
                          const currentVal = (partOffsets[selectedPart.id] || [0, 0, 0])[idx];
                          return (
                            <label key={axis} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                              <span className="font-mono-tabular w-12">
                                {axis}: {currentVal.toFixed(2)}
                              </span>
                              <input
                                type="range"
                                min={-1.5}
                                max={1.5}
                                step={0.05}
                                value={currentVal}
                                onChange={(e) =>
                                  updatePartOffset(selectedPart.id, idx as 0 | 1 | 2, Number(e.target.value))
                                }
                                className="flex-1 cursor-pointer"
                              />
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </>
                ) : (
                  /* Overview when no individual part is clicked */
                  <div className="space-y-4 text-xs leading-relaxed">
                    <div>
                      <p className="text-emerald-700 dark:text-emerald-400 font-semibold">
                        {species.className} · {species.family}
                      </p>
                      <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100 mt-1">
                        {species.commonName} Overview
                      </h2>
                      <p className="italic text-slate-500 dark:text-slate-400">{species.scientificName}</p>
                    </div>
                    <p className="text-slate-600 dark:text-slate-300">{species.summary}</p>
                    <div className="p-3 rounded-lg bg-sky-50/50 dark:bg-slate-800/60 border border-sky-100 dark:border-slate-800 text-slate-700 dark:text-slate-300">
                      <p className="font-semibold text-slate-900 dark:text-slate-100 mb-1">
                        Species-Specific Anatomy
                      </p>
                      <p>{species.anatomyNotes}</p>
                    </div>
                    <p className="text-slate-500 dark:text-slate-400">
                      Click any structure directly on the 3D specimen or from the Anatomical Systems panel to inspect its biological function, location, and controls.
                    </p>
                    <button
                      type="button"
                      onClick={() => setRightTab('bioai')}
                      className="w-full py-2.5 px-4 rounded-lg bg-gradient-to-r from-sky-600 to-emerald-600 hover:from-sky-700 hover:to-emerald-700 text-white font-semibold flex items-center justify-center gap-2"
                    >
                      <MessageSquare className="w-4 h-4" />
                      <span>Ask BioAI About {species.commonName}</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
};
