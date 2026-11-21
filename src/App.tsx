import React, { useState, useEffect, useCallback } from 'react';
import { Moon, Sun, Menu, X } from 'lucide-react';
import { CURATED_SPECIES_DATABASE } from './data/speciesDatabase';
import { SpeciesRecord, TaxonomicGroup } from './types/anatomy';
import { HomePage } from './components/HomePage';
import { ExplorerWorkspace } from './components/ExplorerWorkspace';
import { SpeciesSearchPage } from './components/SpeciesSearchPage';
import { LearningCenterPage } from './components/LearningCenterPage';
import { AdminLibraryPage } from './components/AdminLibraryPage';
import { BrandLogo } from './components/BrandLogo';

type ActiveRoute = 'home' | 'explorer' | 'search' | 'learning' | 'manage';

export default function App() {
  const [route, setRoute] = useState<ActiveRoute>('home');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem('bioexplora-theme');
      if (saved === 'light' || saved === 'dark') return saved;
    } catch {
      // ignore storage failure
    }
    return 'light';
  });

  const [featuredSpecies, setFeaturedSpecies] = useState<SpeciesRecord[]>(
    CURATED_SPECIES_DATABASE,
  );
  const [totalIndexedCount, setTotalIndexedCount] = useState<number>(
    CURATED_SPECIES_DATABASE.length + 220,
  );
  const [activeSpecies, setActiveSpecies] = useState<SpeciesRecord>(
    CURATED_SPECIES_DATABASE[0],
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [searchGroup, setSearchGroup] = useState<TaxonomicGroup | 'all'>('all');

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem('bioexplora-theme', theme);
    } catch {
      // ignore
    }
  }, [theme]);

  const loadLibrary = useCallback(async () => {
    try {
      const resp = await fetch('/api/species');
      if (!resp.ok) return;
      const data = (await resp.json()) as {
        featured: SpeciesRecord[];
        totalIndexedCount: number;
      };
      if (Array.isArray(data.featured) && data.featured.length > 0) {
        setFeaturedSpecies(data.featured);
        setTotalIndexedCount(data.totalIndexedCount || data.featured.length);
      }
    } catch {
      // Fall back gracefully to bundled curated list
    }
  }, []);

  useEffect(() => {
    loadLibrary();
  }, [loadLibrary]);

  const openInExplorer = (species: SpeciesRecord) => {
    setActiveSpecies(species);
    setRoute('explorer');
    setMobileNavOpen(false);
    window.scrollTo({ top: 0 });
  };

  const navigateSearch = (query = '', group: TaxonomicGroup | 'all' = 'all') => {
    setSearchQuery(query);
    setSearchGroup(group);
    setRoute('search');
    setMobileNavOpen(false);
    window.scrollTo({ top: 0 });
  };

  const customSpecies = featuredSpecies.filter((s) => s.isCustom);

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-[#070B14] text-slate-900 dark:text-slate-100">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-40 h-16 border-b border-sky-100 dark:border-slate-800 bg-white/95 dark:bg-[#0B1120]/95 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-6">
          {/* Zone 1: Logo + Brand Wordmark */}
          <button
            type="button"
            onClick={() => {
              setRoute('home');
              setMobileNavOpen(false);
            }}
            className="flex items-center whitespace-nowrap shrink-0 focus:outline-none"
          >
            <BrandLogo />
          </button>

          {/* Zone 2: Clean Single-Line Navigation Links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
            {(
              [
                ['home', 'Home'],
                ['explorer', '3D Explorer'],
                ['search', 'Species Search'],
                ['learning', 'Learning Center'],
                ['manage', 'Manage Library'],
              ] as Array<[ActiveRoute, string]>
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setRoute(id);
                  window.scrollTo({ top: 0 });
                }}
                className={`whitespace-nowrap shrink-0 py-1 transition-colors border-b-2 ${
                  route === id
                    ? 'border-sky-600 dark:border-emerald-400 text-sky-700 dark:text-white font-semibold'
                    : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-sky-700 dark:hover:text-slate-100'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>

          {/* Zone 3: Theme Toggle + Primary Action */}
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
              aria-label={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              title={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
              className="p-2 rounded-lg border border-sky-200 dark:border-slate-700 text-sky-700 dark:text-slate-300 hover:bg-sky-50 dark:hover:bg-slate-800 transition-colors"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={() => openInExplorer(activeSpecies)}
              className="hidden sm:inline-flex px-4 py-2 rounded-lg bg-gradient-to-r from-sky-600 to-emerald-600 hover:from-sky-700 hover:to-emerald-700 text-white text-xs font-semibold whitespace-nowrap shrink-0 transition-all shadow-sm"
            >
              Open 3D Viewer
            </button>

            <button
              type="button"
              onClick={() => setMobileNavOpen((v) => !v)}
              aria-label="Toggle Menu"
              className="md:hidden p-2 rounded-lg border border-sky-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
            >
              {mobileNavOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Mobile Drawer Navigation */}
        {mobileNavOpen && (
          <div className="md:hidden border-b border-sky-100 dark:border-slate-800 bg-white dark:bg-[#0B1120] px-4 py-3 flex flex-col gap-1.5 shadow-lg">
            {(
              [
                ['home', 'Home'],
                ['explorer', '3D Explorer'],
                ['search', 'Species Search'],
                ['learning', 'Learning Center'],
                ['manage', 'Manage Library'],
              ] as Array<[ActiveRoute, string]>
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setRoute(id);
                  setMobileNavOpen(false);
                }}
                className={`text-left px-3 py-2.5 rounded-lg text-sm font-medium ${
                  route === id
                    ? 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300'
                    : 'text-slate-700 dark:text-slate-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* Main Content View */}
      <div className="flex-1">
        {route === 'home' && (
          <HomePage
            featuredSpecies={featuredSpecies}
            totalIndexedCount={totalIndexedCount}
            theme={theme}
            onStartExploring={openInExplorer}
            onExploreKingdom={(grp) => navigateSearch('', grp || 'all')}
            onSearchSubmit={(q) => navigateSearch(q, 'all')}
            onOpenLearningCenter={() => setRoute('learning')}
          />
        )}

        {route === 'explorer' && (
          <ExplorerWorkspace
            species={activeSpecies}
            all3DSpecies={featuredSpecies}
            theme={theme}
            onSelectSpecies={setActiveSpecies}
            onNavigateSearch={(q) => navigateSearch(q || '', 'all')}
            onNavigateAdmin={() => setRoute('manage')}
          />
        )}

        {route === 'search' && (
          <SpeciesSearchPage
            initialQuery={searchQuery}
            initialGroup={searchGroup}
            onOpenInExplorer={openInExplorer}
          />
        )}

        {route === 'learning' && (
          <LearningCenterPage
            speciesList={featuredSpecies}
            onOpenInExplorer={openInExplorer}
          />
        )}

        {route === 'manage' && (
          <AdminLibraryPage
            customSpecies={customSpecies}
            onRefreshLibrary={loadLibrary}
            onOpenInExplorer={openInExplorer}
          />
        )}
      </div>
    </div>
  );
}
