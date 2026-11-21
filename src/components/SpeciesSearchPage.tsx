import React, { useState, useEffect } from 'react';
import {
  Search,
  Box,
  BookOpen,
  Layers,
  Globe,
  ExternalLink,
  AlertCircle,
  ArrowRight,
  ImageOff,
} from 'lucide-react';
import {
  ExternalModelResult,
  SearchResponse,
  SpeciesRecord,
  TAXONOMIC_GROUPS,
  TaxonomicGroup,
} from '../types/anatomy';

interface SpeciesSearchPageProps {
  initialQuery?: string;
  initialGroup?: TaxonomicGroup | 'all';
  onOpenInExplorer: (species: SpeciesRecord) => void;
}

export const SpeciesSearchPage: React.FC<SpeciesSearchPageProps> = ({
  initialQuery = '',
  initialGroup = 'all',
  onOpenInExplorer,
}) => {
  const [query, setQuery] = useState(initialQuery);
  const [selectedGroup, setSelectedGroup] = useState<TaxonomicGroup | 'all'>(initialGroup);
  const [availabilityFilter, setAvailabilityFilter] = useState<'all' | 'segmented' | 'models' | 'metadata'>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SearchResponse | null>(null);

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    setSelectedGroup(initialGroup);
  }, [initialGroup]);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          q: query.trim(),
          group: selectedGroup,
          availability: availabilityFilter,
          external: 'true',
        });
        const resp = await fetch(`/api/search?${params.toString()}`);
        if (!resp.ok) throw new Error('Search service unavailable.');
        const data = (await resp.json()) as SearchResponse;
        if (active) setResults(data);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Search failed.');
      } finally {
        if (active) setLoading(false);
      }
    }, 280);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, selectedGroup, availabilityFilter]);

  const handleOpenExternalModel = (ext: ExternalModelResult) => {
    const extRecord: SpeciesRecord = {
      id: ext.id,
      commonName: ext.title,
      scientificName: query.trim() || ext.author,
      group: selectedGroup === 'all' ? 'mammals' : selectedGroup,
      kingdom: 'Animalia',
      phylum: 'External 3D Asset',
      className: 'External Repository Model',
      order: 'Sketchfab Verified Realistic',
      family: ext.author,
      genus: ext.license,
      conservationStatus: 'External 3D Model',
      habitat: 'Connected 3D Repository',
      summary: ext.description || `External interactive 3D model by ${ext.author} (${ext.license}).`,
      anatomyNotes: 'Loaded from verified external 3D repository. Use 360° orbit and zoom inside the viewer.',
      availability: ext.glbUrl ? 'interactive_3d' : 'external_3d',
      modelSource: ext.glbUrl ? 'external_glb' : 'sketchfab_embed',
      modelUrl: ext.glbUrl || ext.viewerPageUrl,
      viewerPageUrl: ext.viewerPageUrl,
      embedUrl: ext.embedUrl,
      thumbnailUrl: ext.previewUrl,
      creatorAttribution: ext.author,
      vertexCount: ext.vertexCount,
      systems: [],
      parts: [],
    };
    onOpenInExplorer(extRecord);
  };

  const curated3DMatches = results
    ? results.internalMatches.filter((s) => s.availability !== 'metadata_only')
    : [];
  const directoryRecords = results
    ? [
        ...results.internalMatches.filter((s) => s.availability === 'metadata_only'),
        ...results.catalogMatches,
        ...results.gbifMatches,
      ]
    : [];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Search Header */}
      <div className="space-y-4">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400 mb-1">
            Realism Filter: Medical &amp; Photorealistic Specimens Only · Rejects cartoon, anime &amp; low-poly
          </p>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
            Global Species &amp; 3D Anatomy Search
          </h1>
          <p className="mt-2 text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
            Search across medical human layers, museum-scanned animal specimens, our global taxonomic catalog, live GBIF Animalia records, and realism-filtered 3D repositories.
          </p>
        </div>

        {/* Search Bar + Filter Controls */}
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-sky-600 dark:text-sky-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search ANY animal in the world (e.g. Snow Leopard, Kingfisher, Panthera tigris, Octopus, Heart)..."
              className="w-full pl-10 pr-4 py-3 rounded-xl bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-800 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>

          <select
            aria-label="Filter by Taxonomic Group"
            value={selectedGroup}
            onChange={(e) => setSelectedGroup(e.target.value as TaxonomicGroup | 'all')}
            className="px-3.5 py-3 rounded-xl bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-800 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            <option value="all">All Animal Groups &amp; Human</option>
            {TAXONOMIC_GROUPS.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1 p-1 bg-sky-50 dark:bg-slate-800/80 rounded-xl border border-sky-200 dark:border-slate-800 shrink-0 overflow-x-auto">
            {(
              [
                ['all', 'All Results'],
                ['models', 'With 3D Models'],
                ['metadata', 'Details Only (No 3D)'],
                ['segmented', 'Segmented 3D'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setAvailabilityFilter(id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                  availabilityFilter === id
                    ? 'bg-gradient-to-r from-sky-600 to-emerald-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-sky-700 dark:hover:text-slate-100'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-sm text-rose-700 dark:text-rose-200 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading && !results && (
        <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
          Searching internal species library, GBIF taxonomy, and 3D repositories...
        </div>
      )}

      {results && (
        <div className="space-y-10">
          {/* 1. Verified Realistic & Medical 3D Specimens (hidden when filtering Details-Only) */}
          {availabilityFilter !== 'metadata' && (
            <section className="space-y-4">
              <div className="flex items-baseline justify-between border-b border-sky-100 dark:border-slate-800 pb-2">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                  <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
                    Specimens With Verified 3D Models ({curated3DMatches.length})
                  </h2>
                </div>
                <span className="text-xs font-mono-tabular text-slate-500 dark:text-slate-400">
                  GLB/GLTF · Medical Atlas &amp; Museum 3D
                </span>
              </div>

              {curated3DMatches.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400 py-3">
                  No verified realistic 3D GLB specimens matched &ldquo;{query}&rdquo; in our curated database. Check external GLB/3D results or full scientific species details below.
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {curated3DMatches.map((s) => (
                    <div
                      key={s.id}
                      className="group rounded-xl bg-white dark:bg-slate-900 border border-sky-100 dark:border-slate-800 p-5 flex flex-col justify-between gap-4 hover:border-sky-400 transition-colors shadow-xs"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                            {s.availability === 'segmented_3d'
                              ? 'Medical 11-System Atlas'
                              : s.availability === 'interactive_3d'
                                ? 'Photorealistic 3D GLB'
                                : 'Museum / Realistic 3D'}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{s.className}</span>
                          {s.vertexCount && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono-tabular">
                                {Math.round(s.vertexCount / 1000).toLocaleString()}K verts
                              </span>
                            </>
                          )}
                        </div>
                        <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
                          {s.commonName}
                        </h3>
                        <p className="text-xs italic text-sky-700 dark:text-sky-400">
                          {s.scientificName} · Family {s.family}
                        </p>
                        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-3">
                          {s.summary}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => onOpenInExplorer(s)}
                        className="w-full py-2.5 px-4 rounded-lg bg-gradient-to-r from-sky-600 to-emerald-600 hover:from-sky-700 hover:to-emerald-700 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-all"
                      >
                        <Box className="w-3.5 h-3.5" />
                        <span>Open in 3D Viewer</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* 2. Connected External 3D Repositories (Realism-Filtered Sketchfab Search API) */}
          {query.trim().length >= 2 && availabilityFilter !== 'metadata' && availabilityFilter !== 'segmented' && (
            <section className="space-y-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                  <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
                    Realism-Filtered External 3D Repositories ({results.externalModels.length})
                  </h2>
                </div>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {results.rejectedStylizedCount
                    ? `Filtered out ${results.rejectedStylizedCount} cartoon / low-poly / non-biological models`
                    : 'Live Sketchfab Realism-Verified Catalog'}
                </span>
              </div>

              {results.externalModels.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400 py-3">
                  No suitable realistic external 3D models matched &ldquo;{query}&rdquo;. Animals without 3D models are kept cleanly in the Scientific Details section below.
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {results.externalModels.map((ext) => (
                    <div
                      key={ext.id}
                      className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col justify-between"
                    >
                      <div>
                        <div className="aspect-video bg-slate-100 dark:bg-slate-800 relative overflow-hidden">
                          {ext.previewUrl ? (
                            <img
                              src={ext.previewUrl}
                              alt={ext.title}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-400">
                              <ImageOff className="w-6 h-6" />
                            </div>
                          )}
                        </div>
                        <div className="p-4 space-y-1.5">
                          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                            <span className="text-sky-700 dark:text-sky-400 font-medium">External 3D Model</span>
                            <span aria-hidden="true">·</span>
                            <span className="truncate">{ext.author}</span>
                          </div>
                          <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100 line-clamp-1">
                            {ext.title}
                          </h3>
                          <p className="text-xs text-slate-500 dark:text-slate-400 font-mono-tabular">
                            {ext.vertexCount ? `${ext.vertexCount.toLocaleString()} vertices · ` : ''}
                            {ext.license}
                          </p>
                        </div>
                      </div>
                      <div className="px-4 pb-4 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenExternalModel(ext)}
                          className="flex-1 py-2 px-3 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:opacity-90 text-xs font-medium"
                        >
                          Load 3D Preview
                        </button>
                        {ext.viewerPageUrl && (
                          <a
                            href={ext.viewerPageUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                            title="Open on Sketchfab"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* 3. Global Animal Encyclopedia — Scientific Details Only (No 3D Model) */}
          {availabilityFilter !== 'models' && availabilityFilter !== 'segmented' && (
            <section className="space-y-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
                    Information &amp; Scientific Profiles Only — No 3D Model ({directoryRecords.length})
                  </h2>
                </div>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Global species directory · Scientific names, taxonomy &amp; full biological details (iNaturalist + GBIF)
                </span>
              </div>

              {directoryRecords.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400 py-3">
                  Type any animal name or scientific name above to search global species records.
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {directoryRecords.slice(0, 48).map((sp) => (
                    <div
                      key={sp.id}
                      className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 flex flex-col justify-between gap-3"
                    >
                      <div className="flex gap-3">
                        {sp.thumbnailUrl && (
                          <img
                            src={sp.thumbnailUrl}
                            alt={sp.commonName}
                            referrerPolicy="no-referrer"
                            className="w-16 h-16 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                          />
                        )}
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                            <span>{sp.className}</span>
                            <span aria-hidden="true">·</span>
                            <span>{sp.family}</span>
                            <span aria-hidden="true">·</span>
                            <span className="text-amber-700 dark:text-amber-400 font-medium">Details Only</span>
                          </div>
                          <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
                            {sp.commonName}
                          </h3>
                          <p className="text-xs italic font-medium text-sky-700 dark:text-sky-400 truncate">
                            {sp.scientificName}
                          </p>
                        </div>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed">
                        {sp.summary}
                      </p>
                      <button
                        type="button"
                        onClick={() => onOpenInExplorer(sp)}
                        className="w-full py-2 px-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 flex items-center justify-center gap-1.5"
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>Open Full Scientific Details</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
};
