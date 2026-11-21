import React from 'react';
import { ArrowRight, BookOpen, Compass, Layers } from 'lucide-react';
import { SpeciesRecord } from '../types/anatomy';

interface LearningCenterPageProps {
  speciesList: SpeciesRecord[];
  onOpenInExplorer: (species: SpeciesRecord) => void;
}

interface ComparativeModule {
  id: string;
  kicker: string;
  title: string;
  summary: string;
  imageUrl: string;
  speciesComparisons: Array<{ label: string; speciesId: string; highlight: string }>;
}

const MODULES: ComparativeModule[] = [
  {
    id: 'circulatory-evolution',
    kicker: 'Comparative Cardiovascular Physiology',
    title: 'From 2-Chambered Fish to 4-Chambered Mammals & 3-Heart Cephalopods',
    summary:
      'Trace how vertebrate and invertebrate hearts evolved to match metabolic demand, atmospheric transition, and underwater pressure.',
    imageUrl: '/src/assets/images/human_anatomy_plate_1795169337832.jpg',
    speciesComparisons: [
      { label: 'Great White Shark', speciesId: 'carcharodon-carcharias', highlight: '2-chambered single-circuit heart pumping directly to gill arches.' },
      { label: 'Common Frog', speciesId: 'rana-temporaria', highlight: '3-chambered pulmocutaneous heart with spiral valve sorting.' },
      { label: 'Human', speciesId: 'homo-sapiens', highlight: '4-chambered double-circuit pump separating oxygenated & venous blood.' },
      { label: 'Common Cuttlefish', speciesId: 'sepia-officinalis', highlight: '3 hearts (1 systemic + 2 branchial) circulating copper-blue hemocyanin.' },
    ],
  },
  {
    id: 'respiratory-mechanisms',
    kicker: 'Gas Exchange Across Kingdoms',
    title: 'Alveoli, 9 Avian Air Sacs, Branchial Gills & Insect Tracheae',
    summary:
      'Compare how animals solve oxygen transport across air, ocean depths, and high-altitude flight without sharing identical lung structures.',
    imageUrl: '/src/assets/images/avian_anatomy_plate_1795169337840.jpg',
    speciesComparisons: [
      { label: 'Golden Eagle', speciesId: 'aquila-chrysaetos', highlight: 'Unidirectional airflow through rigid lungs powered by 9 air sacs.' },
      { label: 'Monarch Butterfly', speciesId: 'danaus-plexippus', highlight: 'Direct atmospheric O₂ delivery via spiracles and branching tracheae (no lungs).' },
      { label: 'African Bush Elephant', speciesId: 'loxodonta-africana', highlight: 'Pleural-free lungs fused to thoracic wall to survive snorkel suction.' },
    ],
  },
  {
    id: 'carnivore-biomechanics',
    kicker: 'Skeletal & Digestive Specialization',
    title: 'Quadruped Carnivore Propulsion & Hypercarnivore Visceral Layout',
    summary:
      'Examine floating clavicles, carnassial shearing jaws, and short acidic digestive tracts engineered for burst predation.',
    imageUrl: '/src/assets/images/lion_anatomy_plate_1795169336988.jpg',
    speciesComparisons: [
      { label: 'African Lion', speciesId: 'panthera-leo', highlight: 'Floating clavicles lengthen stride; GI tract is only ~4x body length.' },
      { label: 'Domestic Dog', speciesId: 'canis-lupus-familiaris', highlight: 'Enlarged olfactory turbinates and non-retractable traction claws.' },
      { label: 'American Alligator', speciesId: 'alligator-mississippiensis', highlight: 'Foramen of Panizza heart shunt diverts CO₂ to maximize stomach acid for digesting bone.' },
    ],
  },
  {
    id: 'marine-adaptations',
    kicker: 'Hydrodynamic & Abyssal Anatomy',
    title: 'Cartilage, Oil Livers, Baleen Jaws & Chambered Cuttlebones',
    summary:
      'Contrast marine vertebrates and cephalopods solving buoyancy, deep diving, and pelagic hydrodynamics.',
    imageUrl: '/src/assets/images/marine_anatomy_plate_1795169337714.jpg',
    speciesComparisons: [
      { label: 'Great White Shark', speciesId: 'carcharodon-carcharias', highlight: 'Giant squalene oil liver provides buoyancy without a swim bladder.' },
      { label: 'Blue Whale', speciesId: 'balaenoptera-musculus', highlight: 'Telescoped baleen skull, pentadactyl flippers, and vestigial pelvic bones.' },
      { label: 'Common Cuttlefish', speciesId: 'sepia-officinalis', highlight: 'Chambered aragonite cuttlebone regulates ocean buoyancy alongside 3 blue-blood hearts.' },
    ],
  },
];

export const LearningCenterPage: React.FC<LearningCenterPageProps> = ({
  speciesList,
  onOpenInExplorer,
}) => {
  const findSpecies = (id: string) =>
    speciesList.find((s) => s.id === id) || speciesList[0];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">
      <div className="max-w-3xl space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
          Comparative Anatomy Curriculum
        </p>
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
          <span className="text-sky-600 dark:text-sky-400">Bio</span>
          <span className="text-emerald-600 dark:text-emerald-400">Explora</span>{' '}
          Learning Center
        </h1>
        <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
          Explore guided comparative biology modules linking species-specific 3D dissections with evolutionary anatomy. Launch any specimen directly into the interactive 3D Explorer or study alongside BioAI in English, සිංහල, or Singlish.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {MODULES.map((mod) => (
          <article
            key={mod.id}
            className="rounded-2xl bg-white dark:bg-slate-900 border border-sky-100 dark:border-slate-800 overflow-hidden flex flex-col shadow-xs"
          >
            <div className="aspect-[16/9] bg-slate-900 relative overflow-hidden">
              <img
                src={mod.imageUrl}
                alt={mod.title}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
              <div className="absolute bottom-4 left-5 right-5 text-white">
                <p className="text-xs font-medium text-emerald-300">{mod.kicker}</p>
                <h2 className="font-display text-lg sm:text-xl font-semibold mt-0.5 leading-snug">
                  {mod.title}
                </h2>
              </div>
            </div>

            <div className="p-6 space-y-5 flex-1 flex flex-col justify-between">
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                {mod.summary}
              </p>

              <div className="space-y-2.5">
                {mod.speciesComparisons.map((item) => {
                  const sp = findSpecies(item.speciesId);
                  return (
                    <div
                      key={item.speciesId}
                      className="p-3 rounded-xl bg-sky-50/50 dark:bg-slate-800/60 border border-sky-100 dark:border-slate-800 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                          {item.label}
                        </p>
                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                          {item.highlight}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => sp && onOpenInExplorer(sp)}
                        className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-sky-600 to-emerald-600 hover:from-sky-700 hover:to-emerald-700 text-white text-xs font-semibold flex items-center gap-1 whitespace-nowrap shrink-0 transition-all"
                      >
                        <span>3D View</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </article>
        ))}
      </div>

      {/* Study Workflows Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-sky-100 dark:border-slate-800 space-y-2">
          <Layers className="w-5 h-5 text-sky-600 dark:text-sky-400" />
          <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
            Layer Isolation &amp; Exploded Dissection
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Toggle individual systems, enable X-Ray outer envelopes, and separate internal organs in 3D space without occlusion.
          </p>
        </div>
        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-emerald-100 dark:border-slate-800 space-y-2">
          <BookOpen className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
            Trilingual BioAI (EN · සිංහල · Singlish)
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Click any structure in the 3D scene and ask BioAI in English, Sinhala, or Singlish how it functions or differs across species.
          </p>
        </div>
        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-sky-100 dark:border-slate-800 space-y-2">
          <Compass className="w-5 h-5 text-sky-600 dark:text-sky-400" />
          <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
            Species-Authentic Systems
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Avian air sacs, shark spiral valves, insect tracheal tubes, and octopus branchial hearts are modeled uniquely per class.
          </p>
        </div>
      </div>
    </div>
  );
};
