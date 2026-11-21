import React, { useState, useMemo } from 'react';
import {
  ArrowRight,
  Box,
  BookOpen,
  Compass,
  Languages,
  Layers,
  Search,
} from 'lucide-react';
import {
  AnatomicalSystemId,
  SpeciesRecord,
  TAXONOMIC_GROUPS,
  TaxonomicGroup,
} from '../types/anatomy';
import { AnatomyViewer3D } from './AnatomyViewer3D';
import { BrandLogo } from './BrandLogo';

interface HomePageProps {
  featuredSpecies: SpeciesRecord[];
  totalIndexedCount: number;
  theme: 'light' | 'dark';
  onStartExploring: (species: SpeciesRecord) => void;
  onExploreKingdom: (group?: TaxonomicGroup) => void;
  onSearchSubmit: (query: string) => void;
  onOpenLearningCenter: () => void;
}

const HERO_SPECIMEN_IDS = [
  'panthera-leo',
  'aquila-chrysaetos',
  'homo-sapiens',
  'carcharodon-carcharias',
];

const FEATURED_3D_SPECIMEN_IDS = [
  'panthera-leo',
  'aquila-chrysaetos',
  'homo-sapiens',
  'carcharodon-carcharias',
];

export const HomePage: React.FC<HomePageProps> = ({
  featuredSpecies,
  totalIndexedCount,
  theme,
  onStartExploring,
  onExploreKingdom,
  onSearchSubmit,
  onOpenLearningCenter,
}) => {
  const [heroSpeciesId, setHeroSpeciesId] = useState('panthera-leo');
  const [heroExplode, setHeroExplode] = useState(0);
  const [heroLayerStack, setHeroLayerStack] = useState(0);
  const [heroShowSkin, setHeroShowSkin] = useState(true);
  const [heroSelectedPart, setHeroSelectedPart] = useState<string | null>(null);
  const [quickSearch, setQuickSearch] = useState('');
  const [heroDetectedParts, setHeroDetectedParts] = useState<
    Array<{ id: string; name: string; biologicalFunction: string }>
  >([]);
  const [brokenThumbs, setBrokenThumbs] = useState<Record<string, boolean>>({});

  const heroSpecimens = useMemo(() => {
    const list = HERO_SPECIMEN_IDS.map((id) =>
      featuredSpecies.find(
        (s) => s.id === id && s.availability !== 'metadata_only',
      ),
    ).filter(Boolean) as SpeciesRecord[];
    return list.length > 0
      ? list
      : featuredSpecies.filter((s) => s.availability !== 'metadata_only').slice(0, 4);
  }, [featuredSpecies]);

  const activeHeroSpecies =
    heroSpecimens.find((s) => s.id === heroSpeciesId) || heroSpecimens[0];

  const heroVisibleSystems = useMemo(() => {
    if (!activeHeroSpecies) return new Set<AnatomicalSystemId>();
    const ids = activeHeroSpecies.systems.map((s) => s.id);
    return new Set<AnatomicalSystemId>(
      heroShowSkin ? ids : ids.filter((id) => id !== 'integumentary'),
    );
  }, [activeHeroSpecies, heroShowSkin]);

  const humanSpecies =
    featuredSpecies.find((s) => s.id === 'homo-sapiens') || featuredSpecies[0];

  const featuredSpecimens = useMemo(() => {
    return FEATURED_3D_SPECIMEN_IDS.map((id) =>
      featuredSpecies.find(
        (s) =>
          s.id === id &&
          s.availability !== 'metadata_only' &&
          Boolean(s.thumbnailUrl),
      ),
    ).filter(Boolean) as SpeciesRecord[];
  }, [featuredSpecies]);

  const activeHeroPartMeta =
    heroDetectedParts.find((p) => p.id === heroSelectedPart) ||
    activeHeroSpecies?.parts.find((p) => p.id === heroSelectedPart);

  const themedEmbedUrl = (rawUrl?: string) => {
    if (!rawUrl) return undefined;
    if (theme === 'light') {
      return rawUrl.replace('ui_theme=dark', 'ui_theme=light');
    }
    return rawUrl;
  };

  return (
    <div className="bg-white dark:bg-[#070B14] text-slate-900 dark:text-slate-100">
      {/* HERO SECTION — WHITE / OCEAN BLUE / EMERALD GREEN */}
      <section className="relative overflow-hidden border-b border-sky-100 dark:border-slate-800/80 bg-gradient-to-b from-sky-50/70 via-white to-emerald-50/35 dark:from-[#0B1222] dark:via-[#070B14] dark:to-[#070B14]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-14 lg:py-14">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-stretch">
            {/* Left Editorial Narrative & Search */}
            <div className="lg:col-span-6 flex flex-col justify-center space-y-6">
              <div className="space-y-4">
                <p className="text-xs font-semibold tracking-wide uppercase text-emerald-700 dark:text-emerald-400">
                  Comparative 3D Anatomy &amp; Global Taxonomy · {totalIndexedCount}+ Species
                </p>
                <h1
                  className="font-display font-bold tracking-tight text-slate-900 dark:text-slate-50 leading-[1.06]"
                  style={{ fontSize: 'clamp(2.35rem, 4.1vw, 3.75rem)', textWrap: 'balance' }}
                >
                  Explore Life in{' '}
                  <span className="bg-gradient-to-r from-sky-600 via-blue-600 to-emerald-600 dark:from-sky-400 dark:to-emerald-400 bg-clip-text text-transparent">
                    True 3D Detail.
                  </span>
                </h1>
                <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl">
                  Inspect realistic 11-system human anatomy, dissect individual organs, explore photorealistic wildlife models, and study global species with trilingual BioAI.
                </p>
              </div>

              {/* Primary & Secondary Actions */}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => activeHeroSpecies && onStartExploring(activeHeroSpecies)}
                  className="px-6 py-3 rounded-xl bg-gradient-to-r from-sky-600 to-emerald-600 hover:from-sky-700 hover:to-emerald-700 text-white text-sm font-semibold flex items-center gap-2 transition-all shadow-sm whitespace-nowrap shrink-0"
                >
                  <span>Start Exploring 3D</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onExploreKingdom()}
                  className="px-5 py-3 rounded-xl border border-sky-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-sky-50 dark:hover:bg-slate-800 text-sky-800 dark:text-slate-100 text-sm font-semibold transition-colors whitespace-nowrap shrink-0"
                >
                  Explore Animal Kingdom
                </button>
              </div>

              {/* Universal Search Box */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  onSearchSubmit(quickSearch);
                }}
                className="pt-1"
              >
                <div className="flex items-center gap-2 p-1.5 rounded-xl bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-700 shadow-sm focus-within:ring-2 focus-within:ring-sky-500">
                  <Search className="w-4 h-4 text-sky-600 dark:text-sky-400 ml-2.5 shrink-0" />
                  <input
                    type="text"
                    value={quickSearch}
                    onChange={(e) => setQuickSearch(e.target.value)}
                    placeholder="Search any animal, scientific name, family, or organ..."
                    className="flex-1 min-w-0 py-2 px-1 text-sm bg-transparent text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold whitespace-nowrap shrink-0 transition-colors"
                  >
                    Search
                  </button>
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-medium text-slate-700 dark:text-slate-300">Try:</span>
                  {['Panthera leo', 'Great White Shark', 'Octopus', 'Golden Eagle', 'Honeybee'].map(
                    (sample) => (
                      <button
                        key={sample}
                        type="button"
                        onClick={() => onSearchSubmit(sample)}
                        className="text-sky-700 dark:text-sky-400 hover:text-emerald-700 dark:hover:text-emerald-300 underline underline-offset-2"
                      >
                        {sample}
                      </button>
                    ),
                  )}
                </div>
              </form>

              {/* Quantitative Scientific Strip */}
              <div className="grid grid-cols-3 gap-4 pt-3 border-t border-sky-100 dark:border-slate-800/80">
                <div>
                  <p className="font-display text-xl sm:text-2xl font-bold font-mono-tabular text-sky-700 dark:text-sky-400">
                    11
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">Human Systems</p>
                </div>
                <div>
                  <p className="font-display text-xl sm:text-2xl font-bold font-mono-tabular text-emerald-700 dark:text-emerald-400">
                    3,400+
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">3D Body Parts</p>
                </div>
                <div>
                  <p className="font-display text-xl sm:text-2xl font-bold text-blue-700 dark:text-sky-300">
                    3 Modes
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">EN · සිංහල · Singlish</p>
                </div>
              </div>
            </div>

            {/* Right Interactive Live 3D Specimen Viewport */}
            <div className="lg:col-span-6 flex flex-col">
              <div className="rounded-2xl border border-sky-200/90 dark:border-slate-800 bg-white dark:bg-[#0B1120] shadow-sm overflow-hidden flex flex-col h-[430px] sm:h-[500px] lg:h-full lg:min-h-[520px]">
                {/* Specimen Selector Top Bar */}
                <div className="px-4 py-2.5 border-b border-sky-100 dark:border-slate-800 bg-sky-50/60 dark:bg-slate-900 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1 p-0.5 bg-white dark:bg-slate-800 border border-sky-100 dark:border-slate-700 rounded-lg overflow-x-auto">
                    {heroSpecimens.map((sp) => (
                      <button
                        key={sp.id}
                        type="button"
                        onClick={() => {
                          setHeroSpeciesId(sp.id);
                          setHeroSelectedPart(null);
                          setHeroExplode(0);
                          setHeroLayerStack(0);
                          setHeroShowSkin(true);
                          setHeroDetectedParts([]);
                        }}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                          activeHeroSpecies?.id === sp.id
                            ? 'bg-gradient-to-r from-sky-600 to-emerald-600 text-white shadow-sm'
                            : 'text-slate-600 dark:text-slate-400 hover:text-sky-700 dark:hover:text-slate-100'
                        }`}
                      >
                        {sp.commonName}
                      </button>
                    ))}
                  </div>
                  {activeHeroSpecies?.id === 'homo-sapiens' ? (
                    <button
                      type="button"
                      onClick={() => setHeroShowSkin((v) => !v)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap shrink-0 border transition-colors ${
                        !heroShowSkin
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : 'bg-white dark:bg-slate-800 border-sky-200 dark:border-slate-700 text-sky-800 dark:text-slate-200 hover:bg-sky-50 dark:hover:bg-slate-700'
                      }`}
                    >
                      {heroShowSkin ? 'Hide Outer Skin' : 'Show Outer Skin'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => activeHeroSpecies && onStartExploring(activeHeroSpecies)}
                      className="text-[11px] font-semibold text-sky-700 dark:text-sky-400 hover:text-emerald-700 dark:hover:text-emerald-300 flex items-center gap-1 whitespace-nowrap shrink-0"
                    >
                      <span>Open Full Controls</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Live 3D Render Area */}
                <div className="flex-1 relative min-h-0">
                  {activeHeroSpecies &&
                  (activeHeroSpecies.availability === 'segmented_3d' ||
                    activeHeroSpecies.availability === 'interactive_3d') ? (
                    <AnatomyViewer3D
                      species={activeHeroSpecies}
                      theme={theme}
                      variant="hero"
                      visibleSystems={heroVisibleSystems}
                      hiddenPartIds={new Set()}
                      isolatedPartId={null}
                      selectedPartId={heroSelectedPart}
                      ghostOuter={false}
                      explodeAmount={heroExplode}
                      onExplodeAmountChange={setHeroExplode}
                      layerStackAmount={heroLayerStack}
                      onLayerStackAmountChange={setHeroLayerStack}
                      partOffsets={{}}
                      onResetPartOffsets={() => {}}
                      onSelectPart={setHeroSelectedPart}
                      onDetectedMeshParts={(parts) => setHeroDetectedParts(parts)}
                    />
                  ) : activeHeroSpecies?.embedUrl ? (
                    <iframe
                      key={`${activeHeroSpecies.id}-${theme}`}
                      title={`${activeHeroSpecies.commonName} Realistic 3D Specimen`}
                      src={themedEmbedUrl(activeHeroSpecies.embedUrl)}
                      className="w-full h-full border-0 bg-slate-50 dark:bg-[#0B1120]"
                      allow="autoplay; fullscreen; xr-spatial-tracking"
                      allowFullScreen
                    />
                  ) : null}

                  {activeHeroPartMeta && (
                    <div className="absolute top-3 right-3 z-10 max-w-[235px] p-3 rounded-xl bg-white/95 dark:bg-slate-900/95 border border-sky-200 dark:border-slate-700 shadow-md text-xs">
                      <p className="font-semibold text-sky-800 dark:text-sky-300">
                        {activeHeroPartMeta.name}
                      </p>
                      <p className="text-slate-600 dark:text-slate-300 mt-1 line-clamp-2">
                        {activeHeroPartMeta.biologicalFunction}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* HUMAN ANATOMY 11-SYSTEM SHOWCASE */}
      <section className="bg-white dark:bg-[#0B1120] border-b border-sky-100 dark:border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
            <div className="lg:col-span-5 rounded-2xl overflow-hidden border border-sky-100 dark:border-slate-800 bg-slate-900 relative min-h-[300px]">
              <img
                src="/src/assets/images/human_anatomy_plate_1795169337832.jpg"
                alt="Human Thoracic and Cardiovascular Anatomy Plate"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/20 to-transparent" />
              <div className="absolute bottom-5 left-5 right-5 text-white">
                <p className="text-xs font-semibold text-emerald-300">
                  Homo sapiens · Z-Anatomy 3D Atlas
                </p>
                <h2 className="font-display text-2xl font-bold mt-1">
                  11 Integrated Human Systems
                </h2>
              </div>
            </div>

            <div className="lg:col-span-7 flex flex-col justify-between space-y-6">
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-400">
                  Two Interactive Human Study Modes
                </p>
                <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">
                  Unified Body, Picture Stack Layers &amp; Part-by-Part Dissection
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  View front or back as one aligned human body, rotate to left or right angles to fan out all physiological layers along depth, or isolate any single system to separate individual bones, muscles, nerves, and organs.
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                {humanSpecies?.systems.map((sys) => (
                  <div
                    key={sys.id}
                    className="px-3 py-2.5 rounded-lg bg-sky-50/50 dark:bg-slate-900 border border-sky-100 dark:border-slate-800 flex items-center gap-2"
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-sm shrink-0"
                      style={{ backgroundColor: sys.color }}
                    />
                    <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                      {sys.name}
                    </span>
                  </div>
                ))}
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => humanSpecies && onStartExploring(humanSpecies)}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-sky-600 to-emerald-600 hover:from-sky-700 hover:to-emerald-700 text-white text-sm font-semibold inline-flex items-center gap-2 transition-all shadow-sm whitespace-nowrap shrink-0"
                >
                  <Layers className="w-4 h-4" />
                  <span>Open Full Human 3D Atlas</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* VERIFIED REALISTIC 3D SPECIMENS */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
              Verified Medical &amp; Photorealistic 3D Assets
            </p>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">
              Featured Realistic 3D Specimens
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Explore our flagship 3D specimens—African Lion, Golden Eagle, Human, and Great White Shark—with authentic species-level biology.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onExploreKingdom()}
            className="text-sm font-semibold text-sky-700 dark:text-sky-400 hover:text-emerald-700 dark:hover:text-emerald-300 flex items-center gap-1 whitespace-nowrap shrink-0"
          >
            <span>Browse Full Library</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {featuredSpecimens.map((sp) => (
            <div
              key={sp.id}
              className="group rounded-2xl bg-white dark:bg-slate-900 border border-sky-100 dark:border-slate-800 hover:border-sky-400 dark:hover:border-sky-600 overflow-hidden flex flex-col justify-between transition-colors shadow-xs"
            >
              <div>
                <div className="aspect-[16/10] bg-sky-50 dark:bg-slate-800 overflow-hidden">
                  {sp.thumbnailUrl && !brokenThumbs[sp.id] ? (
                    <img
                      src={sp.thumbnailUrl}
                      alt={`${sp.commonName} realistic 3D preview`}
                      referrerPolicy="no-referrer"
                      onError={() =>
                        setBrokenThumbs((prev) => ({ ...prev, [sp.id]: true }))
                      }
                      className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-sky-700 dark:text-sky-300">
                      <Box className="w-8 h-8" />
                      <span className="text-xs font-medium">{sp.commonName} 3D</span>
                    </div>
                  )}
                </div>
                <div className="p-5 space-y-2">
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                      Interactive 3D Specimen
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{sp.className}</span>
                    {sp.vertexCount && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono-tabular">
                          {Math.round(sp.vertexCount / 1000).toLocaleString()}K verts
                        </span>
                      </>
                    )}
                  </div>
                  <h3 className="font-display text-xl font-semibold text-slate-900 dark:text-slate-100">
                    {sp.commonName}
                  </h3>
                  <p className="text-xs italic font-medium text-sky-700 dark:text-sky-400">
                    {sp.scientificName}
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-3">
                    {sp.anatomyNotes}
                  </p>
                </div>
              </div>
              <div className="px-5 pb-5">
                <button
                  type="button"
                  onClick={() => onStartExploring(sp)}
                  className="w-full py-2.5 px-4 rounded-xl bg-sky-50 dark:bg-slate-800 hover:bg-gradient-to-r hover:from-sky-600 hover:to-emerald-600 hover:text-white text-sky-800 dark:text-slate-100 border border-sky-200/80 dark:border-slate-700 hover:border-transparent text-xs font-semibold flex items-center justify-center gap-2 transition-all whitespace-nowrap shrink-0"
                >
                  <Box className="w-3.5 h-3.5" />
                  <span>Inspect in 3D</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* TWELVE MAJOR BIOLOGICAL GROUPS */}
      <section className="border-t border-sky-100 dark:border-slate-800/80 bg-sky-50/45 dark:bg-[#0B1120]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 space-y-8">
          <div className="max-w-2xl space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-400">
              Universal Animalia Directory
            </p>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">
              Twelve Major Biological Groups
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Filter by taxonomic group to browse verified 3D specimens alongside global scientific profiles for any animal on Earth.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {TAXONOMIC_GROUPS.map((grp) => (
              <button
                key={grp.id}
                type="button"
                onClick={() => onExploreKingdom(grp.id)}
                className="text-left p-4 rounded-xl bg-white dark:bg-slate-900/80 border border-sky-100 dark:border-slate-800 hover:border-emerald-500/70 dark:hover:border-emerald-500/60 transition-colors space-y-1.5"
              >
                <p className="text-[11px] font-mono-tabular font-semibold text-emerald-700 dark:text-emerald-400">
                  {grp.scientificLabel}
                </p>
                <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                  {grp.label}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed line-clamp-2">
                  {grp.description}
                </p>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* TRILINGUAL BIOAI & LEARNING CENTER */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="p-7 rounded-2xl bg-gradient-to-br from-sky-50/70 to-white dark:from-slate-900 dark:to-slate-900 border border-sky-200/80 dark:border-slate-800 space-y-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-sky-700 dark:text-sky-400">
              <Languages className="w-4 h-4" />
              <span>Trilingual Biology Intelligence</span>
            </div>
            <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-100">
              BioAI Assistant in English, සිංහල &amp; Singlish
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Ask about any animal in English, Sinhala, or Singlish—BioAI explains scientific names, organ systems, and clicked 3D body parts clearly in your chosen language.
            </p>
            <button
              type="button"
              onClick={() => activeHeroSpecies && onStartExploring(activeHeroSpecies)}
              className="px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold inline-flex items-center gap-2 whitespace-nowrap shrink-0 transition-colors"
            >
              <span>Try BioAI in 3D Explorer</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="p-7 rounded-2xl bg-gradient-to-br from-emerald-50/70 to-white dark:from-slate-900 dark:to-slate-900 border border-emerald-200/80 dark:border-slate-800 space-y-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              <BookOpen className="w-4 h-4" />
              <span>Comparative Curriculum</span>
            </div>
            <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-100">
              Interactive Learning Center
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Compare evolutionary heart chambers, avian air sacs, cartilage buoyancy, and cephalopod biology side by side with one-click 3D exploration.
            </p>
            <button
              type="button"
              onClick={onOpenLearningCenter}
              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-2 whitespace-nowrap shrink-0 transition-colors"
            >
              <Compass className="w-3.5 h-3.5" />
              <span>Open Learning Center</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </section>

      {/* BRANDED SCIENTIFIC FOOTER */}
      <footer className="border-t border-sky-100 dark:border-slate-800 bg-sky-50/40 dark:bg-[#0B1120]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-3">
            <BrandLogo size="sm" />
            <span aria-hidden="true">·</span>
            <span>Explore Life in True 3D Detail</span>
          </div>
          <div className="flex flex-wrap items-center gap-5">
            <button
              type="button"
              onClick={() => onExploreKingdom()}
              className="hover:text-sky-700 dark:hover:text-slate-100 font-medium"
            >
              Species Search
            </button>
            <button
              type="button"
              onClick={onOpenLearningCenter}
              className="hover:text-emerald-700 dark:hover:text-slate-100 font-medium"
            >
              Learning Center
            </button>
            <span>Three.js · GLB/GLTF · GBIF · BioAI</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
