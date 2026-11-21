import express from 'express';
import path from 'path';
import fs from 'fs';
import os from 'os';
import multer from 'multer';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';
import { CURATED_SPECIES_DATABASE } from './src/data/speciesDatabase.ts';
import { GLOBAL_SPECIES_CATALOG } from './src/data/globalCatalog.ts';
import type {
  ExternalModelResult,
  SpeciesRecord,
  TaxonomicGroup,
} from './src/types/anatomy.ts';

dotenv.config();

const PORT = Number(process.env.PORT) || 3000;

function resolveWritableRoot(): string {
  const localData = path.resolve(process.cwd(), 'data');
  try {
    fs.mkdirSync(localData, { recursive: true });
    fs.accessSync(localData, fs.constants.W_OK);
    return process.cwd();
  } catch {
    return path.join(os.tmpdir(), 'bioexplora-3d');
  }
}

const WRITABLE_ROOT = resolveWritableRoot();
const DATA_DIR = path.resolve(WRITABLE_ROOT, 'data');
const UPLOADS_DIR = path.resolve(WRITABLE_ROOT, 'uploads/models');
const CUSTOM_SPECIES_FILE = path.join(DATA_DIR, 'custom-species.json');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

if (!fs.existsSync(CUSTOM_SPECIES_FILE)) {
  fs.writeFileSync(CUSTOM_SPECIES_FILE, JSON.stringify([], null, 2), 'utf-8');
}

function readCustomSpecies(): SpeciesRecord[] {
  try {
    const raw = fs.readFileSync(CUSTOM_SPECIES_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCustomSpecies(records: SpeciesRecord[]): void {
  fs.writeFileSync(CUSTOM_SPECIES_FILE, JSON.stringify(records, null, 2), 'utf-8');
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.glb';
    const base = path
      .basename(file.originalname, ext)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 48);
    cb(null, `${base || 'model'}-${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 80 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.glb' || ext === '.gltf') {
      cb(null, true);
    } else {
      cb(new Error('Only .glb and .gltf 3D model files are supported.'));
    }
  },
});

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function generateContentWithRetry(
  ai: GoogleGenAI,
  params: Parameters<GoogleGenAI['models']['generateContent']>[0],
) {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await ai.models.generateContent(params);
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isTransient = /503|429|unavailable|high demand|overloaded|timeout/i.test(msg);
      if (!isTransient || attempt === 2) break;
      await new Promise((r) => setTimeout(r, 750 * (attempt + 1)));
    }
  }
  throw lastErr;
}

function mapClassToGroup(className?: string, phylum?: string): TaxonomicGroup {
  const c = (className || '').toLowerCase();
  const p = (phylum || '').toLowerCase();
  if (c.includes('mammalia')) return 'mammals';
  if (c.includes('aves')) return 'birds';
  if (c.includes('reptilia') || c.includes('squamata') || c.includes('testudines') || c.includes('crocodilia')) return 'reptiles';
  if (c.includes('amphibia')) return 'amphibians';
  if (c.includes('chondrichthyes') || c.includes('actinopterygii') || c.includes('elasmobranch') || c.includes('sarcopterygii')) return 'fish';
  if (c.includes('insecta')) return 'insects';
  if (c.includes('arachnida') || c.includes('merostomata')) return 'arachnids';
  if (c.includes('malacostraca') || c.includes('crustacea') || c.includes('branchiopoda')) return 'crustaceans';
  if (p.includes('mollusca') || c.includes('cephalopoda') || c.includes('gastropoda') || c.includes('bivalvia')) return 'mollusks';
  return 'invertebrates';
}

function matchesSpeciesQuery(species: SpeciesRecord, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  if (species.commonName.toLowerCase().includes(needle)) return true;
  if (species.scientificName.toLowerCase().includes(needle)) return true;
  if (species.family.toLowerCase().includes(needle)) return true;
  if (species.order.toLowerCase().includes(needle)) return true;
  if (species.className.toLowerCase().includes(needle)) return true;
  if (species.group.toLowerCase().includes(needle)) return true;
  if (species.aliases?.some((a) => a.toLowerCase().includes(needle))) return true;
  if (species.parts?.some((p) => p.name.toLowerCase().includes(needle) || p.system.toLowerCase().includes(needle))) {
    return true;
  }
  return false;
}

interface InatAncestor {
  rank?: string;
  name?: string;
}

interface InatTaxon {
  id: number;
  name?: string; // scientific name
  preferred_common_name?: string;
  wikipedia_url?: string;
  wikipedia_summary?: string;
  conservation_status?: { status_name?: string; status?: string };
  default_photo?: { medium_url?: string; url?: string };
  ancestors?: InatAncestor[];
  iconic_taxon_name?: string;
}

async function searchInaturalistSpecies(query: string): Promise<SpeciesRecord[]> {
  if (!query || query.trim().length < 2) return [];
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3800);
    // taxon_id=1 restricts to Animalia
    const url = `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(
      query.trim(),
    )}&taxon_id=1&rank=species&per_page=14`;
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'BioExplora3D/1.0' },
    });
    clearTimeout(timer);
    if (!resp.ok) return [];
    const data = (await resp.json()) as { results?: InatTaxon[] };
    const out: SpeciesRecord[] = [];
    const seen = new Set<string>();

    for (const taxon of data.results || []) {
      const sci = (taxon.name || '').trim();
      if (!sci || seen.has(sci.toLowerCase())) continue;
      seen.add(sci.toLowerCase());

      const findRank = (r: string) =>
        taxon.ancestors?.find((a) => a.rank?.toLowerCase() === r)?.name;

      const phylum = findRank('phylum') || 'Animalia';
      const className = findRank('class') || taxon.iconic_taxon_name || 'Unknown Class';
      const order = findRank('order') || 'Unknown Order';
      const family = findRank('family') || 'Unknown Family';
      const genus = findRank('genus') || sci.split(' ')[0] || 'Unknown';
      const commonName = taxon.preferred_common_name
        ? taxon.preferred_common_name.replace(/\b\w/g, (c) => c.toUpperCase())
        : sci;
      const group = mapClassToGroup(className, phylum);
      const rawSummary = (taxon.wikipedia_summary || '').replace(/<[^>]+>/g, '').trim();

      out.push({
        id: `inat-${taxon.id}`,
        commonName,
        scientificName: sci,
        group,
        kingdom: 'Animalia',
        phylum,
        className,
        order,
        family,
        genus,
        conservationStatus:
          taxon.conservation_status?.status_name || 'Indexed in iNaturalist / IUCN',
        habitat: `Class ${className} · Family ${family}`,
        summary:
          rawSummary ||
          `${commonName} (${sci}) is a documented animal species belonging to family ${family}, order ${order}, class ${className}.`,
        anatomyNotes: `Global scientific species profile (${sci}). No verified realistic 3D GLB file is attached for this species, so full taxonomic, ecological, and comparative anatomical details are provided cleanly without artificial 3D.`,
        availability: 'metadata_only',
        modelSource: 'none',
        thumbnailUrl: taxon.default_photo?.medium_url || taxon.default_photo?.url,
        referenceUrl: taxon.wikipedia_url || `https://www.inaturalist.org/taxa/${taxon.id}`,
        systems: [],
        parts: [],
      });
    }
    return out;
  } catch {
    return [];
  }
}

async function searchGbifSpecies(query: string): Promise<SpeciesRecord[]> {
  if (!query || query.trim().length < 2) return [];
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    const url = `https://api.gbif.org/v1/species/search?q=${encodeURIComponent(query)}&highertaxonKey=1&rank=SPECIES&status=ACCEPTED&limit=14`;
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!resp.ok) return [];
    const data = (await resp.json()) as {
      results?: Array<{
        key?: number;
        scientificName?: string;
        canonicalName?: string;
        vernacularNames?: Array<{ vernacularName?: string; language?: string }>;
        phylum?: string;
        class?: string;
        order?: string;
        family?: string;
        genus?: string;
        habitats?: string[];
      }>;
    };
    const seen = new Set<string>();
    const results: SpeciesRecord[] = [];
    for (const item of data.results || []) {
      const sci = item.canonicalName || item.scientificName || '';
      if (!sci || seen.has(sci.toLowerCase())) continue;
      seen.add(sci.toLowerCase());
      const engVernacular =
        item.vernacularNames?.find((v) => v.language === 'eng')?.vernacularName ||
        item.vernacularNames?.[0]?.vernacularName ||
        sci;
      const group = mapClassToGroup(item.class, item.phylum);
      results.push({
        id: `gbif-${item.key || sci.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        commonName: engVernacular,
        scientificName: sci,
        group,
        kingdom: 'Animalia',
        phylum: item.phylum || 'Animalia',
        className: item.class || 'Unknown Class',
        order: item.order || 'Unknown Order',
        family: item.family || 'Unknown Family',
        genus: item.genus || sci.split(' ')[0] || 'Unknown',
        conservationStatus: 'Indexed in GBIF',
        habitat: item.habitats?.length ? item.habitats.join(', ') : `Class ${item.class || 'Animalia'} · Global Range`,
        summary: `${engVernacular} (${sci}) is an accepted animal species indexed in the Global Biodiversity Information Facility (GBIF) under family ${item.family || 'N/A'}, order ${item.order || 'N/A'}, class ${item.class || 'N/A'}.`,
        anatomyNotes: `Global scientific profile sourced live from GBIF (${sci}). No verified realistic 3D GLB model is available for this species; scientific details and BioAI comparative anatomy notes are provided below.`,
        availability: 'metadata_only',
        modelSource: 'none',
        referenceUrl: item.key ? `https://www.gbif.org/species/${item.key}` : undefined,
        systems: [],
        parts: [],
      });
    }
    return results;
  } catch {
    return [];
  }
}

const REJECTED_STYLIZED_PATTERN =
  /\b(cartoon|low[- ]?poly|lowpoly|stylized|chibi|anime|voxel|pixel|minecraft|roblox|fortnite|toy|plush|lego|mascot|fursona|furry|robot|mech|mecha|cyber|sci[- ]?fi|fantasy|pokemon|monst[eo]r|cute|kawaii|meme|mandalorian|star\s*wars|jeep|sedan|suv|truck|car|vehicle|rifle|pistol|weapon|sword|lays|chip\s*bag|statue\s*figurine|bobblehead|funko)\b/i;

const TRUSTED_SCIENTIFIC_CREATORS = new Set([
  'smithsonian',
  'uod_museums',
  'risdnaturelab',
  'nhm_imaging',
  'digitallife3d',
  'witmerlab',
  'floridamuseum',
  'aucklandmuseum',
  'virginiatechunivlibraries',
  'mammalresearchinstitutepas',
  'openededinburgh',
  'wirtualnemuzeamalopolski',
]);

async function searchSketchfabModels(
  query: string,
): Promise<{ models: ExternalModelResult[]; rejectedStylizedCount: number }> {
  if (!query || query.trim().length < 2) {
    return { models: [], rejectedStylizedCount: 0 };
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    const cleanQ = query.trim();
    const isMedicalHuman = /\b(human|anatomy|organ|heart|brain|skull|skeleton|muscle|kidney|lung|liver|spine|pelvis|femur)\b/i.test(
      cleanQ,
    );
    const categoryParam = isMedicalHuman ? '' : '&categories=animals-pets';
    const url = `https://api.sketchfab.com/v3/search?type=models&q=${encodeURIComponent(
      cleanQ,
    )}${categoryParam}&count=24&sort_by=-likeCount`;

    const headers: Record<string, string> = { Accept: 'application/json' };
    if (process.env.SKETCHFAB_API_TOKEN) {
      headers.Authorization = `Token ${process.env.SKETCHFAB_API_TOKEN}`;
    }
    const resp = await fetch(url, { signal: controller.signal, headers });
    clearTimeout(timer);
    if (!resp.ok) return { models: [], rejectedStylizedCount: 0 };

    const data = (await resp.json()) as {
      results?: Array<{
        uid: string;
        name: string;
        description?: string;
        viewerUrl?: string;
        embedUrl?: string;
        isDownloadable?: boolean;
        vertexCount?: number;
        faceCount?: number;
        tags?: Array<{ name?: string; slug?: string }>;
        license?: { label?: string };
        user?: { displayName?: string; username?: string };
        thumbnails?: { images?: Array<{ url: string; width: number }> };
      }>;
    };

    const queryTokens = cleanQ
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length >= 2);

    const models: ExternalModelResult[] = [];
    let rejectedStylizedCount = 0;

    for (const m of data.results || []) {
      const tagNames = (m.tags || []).map((t) => t.name || t.slug || '').filter(Boolean);
      const haystack = `${m.name} ${m.description || ''} ${tagNames.join(' ')}`.toLowerCase();
      const username = (m.user?.username || '').toLowerCase();
      const isTrustedMuseum = TRUSTED_SCIENTIFIC_CREATORS.has(username);

      if (REJECTED_STYLIZED_PATTERN.test(haystack)) {
        rejectedStylizedCount += 1;
        continue;
      }

      if (!isTrustedMuseum && typeof m.vertexCount === 'number' && m.vertexCount < 12000) {
        rejectedStylizedCount += 1;
        continue;
      }

      const matchesSubject =
        queryTokens.length === 0 || queryTokens.some((tok) => haystack.includes(tok));
      if (!matchesSubject) {
        continue;
      }

      const thumb =
        m.thumbnails?.images?.sort((a, b) => b.width - a.width).find((img) => img.width <= 720)?.url ||
        m.thumbnails?.images?.[0]?.url;

      if (!thumb) {
        rejectedStylizedCount += 1;
        continue;
      }

      models.push({
        id: `sketchfab-${m.uid}`,
        title: m.name,
        source: 'sketchfab',
        previewUrl: thumb,
        embedUrl: m.embedUrl || `https://sketchfab.com/models/${m.uid}/embed?autostart=1&ui_theme=dark`,
        viewerPageUrl: m.viewerUrl || `https://sketchfab.com/3d-models/${m.uid}`,
        author: m.user?.displayName || m.user?.username || 'Sketchfab Creator',
        license: m.license?.label || 'Standard Sketchfab License',
        vertexCount: m.vertexCount,
        faceCount: m.faceCount,
        isDownloadable: Boolean(m.isDownloadable),
        verifiedRealistic: true,
        tags: tagNames.slice(0, 5),
        description: (m.description || '').slice(0, 220),
      });
    }

    return { models: models.slice(0, 12), rejectedStylizedCount };
  } catch {
    return { models: [], rejectedStylizedCount: 0 };
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '20mb' }));
  // Serve static 3D models and Draco decoders with long browser caching for instant repeat loads
  app.use(
    '/models',
    express.static(path.resolve(process.cwd(), 'public/models'), {
      maxAge: '1d',
      immutable: false,
    }),
  );
  app.use(
    '/draco',
    express.static(path.resolve(process.cwd(), 'public/draco'), {
      maxAge: '7d',
      immutable: true,
    }),
  );
  app.use('/uploads/models', express.static(UPLOADS_DIR, { maxAge: '1d' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'bioexplora-3d' });
  });

  app.get('/api/species', (_req, res) => {
    const custom = readCustomSpecies();
    const all3D = [...custom, ...CURATED_SPECIES_DATABASE];
    res.json({
      featured: all3D,
      catalog: GLOBAL_SPECIES_CATALOG,
      totalIndexedCount: all3D.length + GLOBAL_SPECIES_CATALOG.length,
    });
  });

  app.get('/api/species/:id', (req, res) => {
    const custom = readCustomSpecies();
    const all = [...custom, ...CURATED_SPECIES_DATABASE, ...GLOBAL_SPECIES_CATALOG];
    const found = all.find((s) => s.id === req.params.id);
    if (!found) {
      res.status(404).json({ error: 'Species not found in library.' });
      return;
    }
    res.json(found);
  });

  app.get('/api/species-info', async (req, res) => {
    const name = String(req.query.name || '').trim();
    if (!name) {
      res.status(400).json({ error: 'Missing name parameter.' });
      return;
    }
    try {
      const fetchWikiSummary = async (title: string) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3500);
        const wikiResp = await fetch(
          `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
            title.replace(/\s+/g, '_'),
          )}`,
          { signal: controller.signal },
        );
        clearTimeout(timer);
        if (!wikiResp.ok) return null;
        return (await wikiResp.json()) as {
          title?: string;
          extract?: string;
          description?: string;
          thumbnail?: { source?: string };
          content_urls?: { desktop?: { page?: string } };
        };
      };

      let wiki = await fetchWikiSummary(name);
      if (!wiki || !wiki.extract) {
        const searchResp = await fetch(
          `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
            name,
          )}&format=json&srlimit=1`,
        );
        if (searchResp.ok) {
          const sData = (await searchResp.json()) as {
            query?: { search?: Array<{ title?: string }> };
          };
          const topTitle = sData.query?.search?.[0]?.title;
          if (topTitle) {
            wiki = await fetchWikiSummary(topTitle);
          }
        }
      }

      if (wiki && wiki.extract) {
        res.json({
          title: wiki.title,
          description: wiki.description,
          extract: wiki.extract,
          thumbnailUrl: wiki.thumbnail?.source,
          referenceUrl: wiki.content_urls?.desktop?.page,
        });
        return;
      }

      // Fallback enrichment from iNaturalist
      const inatHits = await searchInaturalistSpecies(name);
      if (inatHits.length > 0) {
        const top = inatHits[0];
        res.json({
          title: `${top.commonName} (${top.scientificName})`,
          description: `${top.className} · ${top.family}`,
          extract: top.summary,
          thumbnailUrl: top.thumbnailUrl,
          referenceUrl: top.referenceUrl,
        });
        return;
      }

      res.json({ extract: null });
    } catch {
      res.json({ extract: null });
    }
  });

  app.post('/api/species-anatomy-details', async (req, res) => {
    const {
      commonName,
      scientificName,
      className = 'Animalia',
      order = 'Unspecified',
      family = 'Unspecified',
      habitat = 'Natural Habitat',
    } = req.body as Partial<SpeciesRecord>;

    if (!commonName && !scientificName) {
      res.status(400).json({ error: 'commonName or scientificName is required.' });
      return;
    }

    const ai = getGeminiClient();
    if (!ai) {
      res.json({
        overview: `${commonName || scientificName} (${scientificName || commonName}) belongs to class ${className}, order ${order}, family ${family}.`,
        dietAndEcology: `Natural ecology shaped by ${habitat}.`,
        sizeAndLifespan: 'Body size and lifespan vary by subspecies and ecological niche.',
        skeletalAndMuscular: `Exhibits core ${className} musculoskeletal body plan adapted for locomotion and feeding.`,
        circulatoryAndRespiratory: `Gas exchange and vascular circulation match ${className} metabolic physiology.`,
        nervousAndSensory: 'Specialized cephalic sensory organs and central nervous coordination for foraging and predator avoidance.',
        specialAdaptations: `Distinctive evolutionary traits within family ${family}.`,
        humanComparison: `Compared with Homo sapiens, ${commonName || scientificName} displays specialized morphological adaptations for its habitat.`,
      });
      return;
    }

    try {
      const prompt = `Provide a concise, scientifically accurate anatomical & biological dossier for the animal:
Common Name: ${commonName || scientificName}
Scientific Name: ${scientificName || commonName}
Class: ${className}
Order: ${order}
Family: ${family}
Habitat: ${habitat}

Keep each field factual, specific to this real species, and 1–3 clear sentences.`;

      const response = await generateContentWithRetry(ai, {
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              overview: { type: Type.STRING },
              dietAndEcology: { type: Type.STRING },
              sizeAndLifespan: { type: Type.STRING },
              skeletalAndMuscular: { type: Type.STRING },
              circulatoryAndRespiratory: { type: Type.STRING },
              nervousAndSensory: { type: Type.STRING },
              specialAdaptations: { type: Type.STRING },
              humanComparison: { type: Type.STRING },
            },
            required: [
              'overview',
              'dietAndEcology',
              'sizeAndLifespan',
              'skeletalAndMuscular',
              'circulatoryAndRespiratory',
              'nervousAndSensory',
              'specialAdaptations',
              'humanComparison',
            ],
          },
        },
      });
      res.json(JSON.parse((response.text || '{}').trim()));
    } catch {
      res.json({
        overview: `${commonName || scientificName} (${scientificName || commonName}) is a member of class ${className}, family ${family}.`,
        dietAndEcology: `Thrives across ${habitat}.`,
        sizeAndLifespan: 'Morphometric size and longevity follow typical family parameters.',
        skeletalAndMuscular: `Displays ${className} structural biomechanics.`,
        circulatoryAndRespiratory: `Uses ${className}-typical respiratory and circulatory organs.`,
        nervousAndSensory: 'Equipped with specialized sensory receptors suited to its niche.',
        specialAdaptations: `Signature ecological adaptations of ${scientificName || commonName}.`,
        humanComparison: 'Shares conserved bilaterian organ-system homologies while diverging in locomotion and respiration.',
      });
    }
  });

  app.get('/api/search', async (req, res) => {
    const q = String(req.query.q || '').trim();
    const group = String(req.query.group || 'all');
    const availability = String(req.query.availability || 'all');
    const includeExternal = req.query.external !== 'false';

    const custom = readCustomSpecies();
    const internalPool = [...custom, ...CURATED_SPECIES_DATABASE];

    const filterFn = (s: SpeciesRecord) => {
      if (group !== 'all' && s.group !== group) return false;
      if (availability === 'segmented' && s.availability !== 'segmented_3d') return false;
      if (availability === 'models' && s.availability === 'metadata_only') return false;
      if (availability === 'metadata' && s.availability !== 'metadata_only') return false;
      return matchesSpeciesQuery(s, q);
    };

    const internalMatches = internalPool.filter(filterFn);
    const catalogMatches = GLOBAL_SPECIES_CATALOG.filter(filterFn);

    const existingSci = new Set(
      [...internalMatches, ...catalogMatches].map((s) => s.scientificName.toLowerCase()),
    );

    let gbifMatches: SpeciesRecord[] = [];
    let externalModels: ExternalModelResult[] = [];
    let rejectedStylizedCount = 0;

    if (q.length >= 2) {
      const shouldFetchGlobalDetails =
        availability !== 'segmented' && availability !== 'models';
      const shouldFetchExternal3D =
        includeExternal && availability !== 'metadata';

      const [inatRaw, gbifRaw, sketchfabRes] = await Promise.all([
        shouldFetchGlobalDetails ? searchInaturalistSpecies(q) : Promise.resolve([]),
        shouldFetchGlobalDetails ? searchGbifSpecies(q) : Promise.resolve([]),
        shouldFetchExternal3D
          ? searchSketchfabModels(q)
          : Promise.resolve({ models: [], rejectedStylizedCount: 0 }),
      ]);

      // Merge iNaturalist (rich photos + IUCN + common names + Wikipedia) first, then fill with GBIF
      const mergedGlobal: SpeciesRecord[] = [];
      const seenSci = new Set(existingSci);
      for (const item of [...inatRaw, ...gbifRaw]) {
        const key = item.scientificName.toLowerCase();
        if (seenSci.has(key)) continue;
        if (group !== 'all' && item.group !== group) continue;
        seenSci.add(key);
        mergedGlobal.push(item);
      }

      gbifMatches = mergedGlobal;
      externalModels = sketchfabRes.models;
      rejectedStylizedCount = sketchfabRes.rejectedStylizedCount;
    }

    res.json({
      query: q,
      internalMatches,
      catalogMatches,
      gbifMatches,
      externalModels,
      rejectedStylizedCount,
      totalInternalCount: internalPool.length,
      totalCatalogCount: GLOBAL_SPECIES_CATALOG.length,
    });
  });

  // Dynamic 3D Library Management CRUD
  app.post('/api/admin/species', upload.single('modelFile'), (req, res) => {
    try {
      const payload = req.body.metadata ? JSON.parse(req.body.metadata) : req.body;
      if (!payload.commonName || !payload.scientificName || !payload.group) {
        res.status(400).json({ error: 'commonName, scientificName, and group are required.' });
        return;
      }

      const uploadedUrl = req.file ? `/uploads/models/${req.file.filename}` : undefined;
      const modelUrl = uploadedUrl || payload.modelUrl || undefined;
      const parts = Array.isArray(payload.parts) ? payload.parts : [];
      const systems = Array.isArray(payload.systems) ? payload.systems : [];

      let availability: SpeciesRecord['availability'] = 'metadata_only';
      let modelSource: SpeciesRecord['modelSource'] = 'none';

      if (uploadedUrl || (modelUrl && (modelUrl.endsWith('.glb') || modelUrl.endsWith('.gltf') || modelUrl.startsWith('/uploads/')))) {
        modelSource = uploadedUrl ? 'uploaded_glb' : 'external_glb';
        availability = parts.length >= 2 ? 'segmented_3d' : 'interactive_3d';
      } else if (payload.embedUrl) {
        modelSource = 'sketchfab_embed';
        availability = 'external_3d';
      }

      const newRecord: SpeciesRecord = {
        id: `custom-${payload.scientificName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`,
        commonName: String(payload.commonName).trim(),
        scientificName: String(payload.scientificName).trim(),
        aliases: Array.isArray(payload.aliases) ? payload.aliases : [],
        group: payload.group,
        kingdom: payload.kingdom || 'Animalia',
        phylum: payload.phylum || 'Chordata',
        className: payload.className || 'Mammalia',
        order: payload.order || 'Unspecified',
        family: payload.family || 'Unspecified',
        genus: payload.genus || String(payload.scientificName).split(' ')[0] || 'Unspecified',
        conservationStatus: payload.conservationStatus || 'Least Concern',
        habitat: payload.habitat || 'Global',
        summary: payload.summary || `${payload.commonName} (${payload.scientificName}) added via Library Manager.`,
        anatomyNotes: payload.anatomyNotes || 'Custom anatomical specimen record.',
        availability,
        modelSource,
        modelUrl,
        embedUrl: payload.embedUrl || undefined,
        systems,
        parts,
        isCustom: true,
        createdAt: new Date().toISOString(),
      };

      const existing = readCustomSpecies();
      existing.unshift(newRecord);
      writeCustomSpecies(existing);
      res.status(201).json(newRecord);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to create species record.',
      });
    }
  });

  app.put('/api/admin/species/:id', upload.single('modelFile'), (req, res) => {
    try {
      const payload = req.body.metadata ? JSON.parse(req.body.metadata) : req.body;
      const existing = readCustomSpecies();
      const idx = existing.findIndex((s) => s.id === req.params.id);
      if (idx === -1) {
        res.status(404).json({ error: 'Custom species record not found.' });
        return;
      }

      const current = existing[idx];
      const uploadedUrl = req.file ? `/uploads/models/${req.file.filename}` : undefined;
      const modelUrl = uploadedUrl || payload.modelUrl || current.modelUrl;
      const parts = Array.isArray(payload.parts) ? payload.parts : current.parts;
      const systems = Array.isArray(payload.systems) ? payload.systems : current.systems;

      let availability = current.availability;
      let modelSource = current.modelSource;
      if (uploadedUrl) {
        modelSource = 'uploaded_glb';
        availability = parts.length >= 2 ? 'segmented_3d' : 'interactive_3d';
      } else if (modelUrl) {
        availability = parts.length >= 2 ? 'segmented_3d' : 'interactive_3d';
      }

      const updated: SpeciesRecord = {
        ...current,
        ...payload,
        modelUrl,
        parts,
        systems,
        availability,
        modelSource,
      };
      existing[idx] = updated;
      writeCustomSpecies(existing);
      res.json(updated);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to update species record.',
      });
    }
  });

  app.delete('/api/admin/species/:id', (req, res) => {
    const existing = readCustomSpecies();
    const target = existing.find((s) => s.id === req.params.id);
    if (!target) {
      res.status(404).json({ error: 'Custom species not found (built-in curated records cannot be deleted).' });
      return;
    }
    if (target.modelUrl?.startsWith('/uploads/models/')) {
      const filePath = path.join(UPLOADS_DIR, path.basename(target.modelUrl));
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch {
          // ignore cleanup failure
        }
      }
    }
    writeCustomSpecies(existing.filter((s) => s.id !== req.params.id));
    res.json({ deleted: req.params.id });
  });

  // BioAI Trilingual (English, Sinhala & Singlish) Educational Assistant
  app.post('/api/bioai/chat', async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error:
          'BioAI requires GEMINI_API_KEY configured in AI Studio Settings > Secrets.',
      });
      return;
    }

    const {
      message,
      language = 'en',
      species,
      selectedPart,
      activeSystems = [],
      history = [],
    } = req.body as {
      message: string;
      language?: 'en' | 'si' | 'singlish';
      species?: Partial<SpeciesRecord>;
      selectedPart?: {
        name?: string;
        scientificName?: string;
        system?: string;
        biologicalFunction?: string;
        structure?: string;
        location?: string;
      };
      activeSystems?: string[];
      history?: Array<{ role: 'user' | 'assistant'; content: string }>;
    };

    if (!message || !message.trim()) {
      res.status(400).json({ error: 'Message cannot be empty.' });
      return;
    }

    const hasSinhalaChars = /[\u0D80-\u0DFF]/.test(message);
    const hasSinglishKeywords =
      /\b(mokakda|kohomada|gana|kiynn|kiyanna|kiyala|paddathi|paddathiya|sathek|sathage|sathunge|hadawatha|penahalu|asthi|minissu|minissunge|weda|kotas|kottasa|wisthara|thiyenne|nadda|puluwan|pluwn|wage|saralawa|monawada|denna|balanna|pennanna|athara|wenasa|eka|ehema|meka|karanne|wenne|hinda|thiyenawa|inna|loke)\b/i.test(
        message,
      );

    let resolvedCode: 'en' | 'si' | 'singlish' = language;
    if (hasSinhalaChars) {
      resolvedCode = 'si';
    } else if (hasSinglishKeywords) {
      resolvedCode = 'singlish';
    }

    const targetLang =
      resolvedCode === 'si'
        ? 'Sinhala (සිංහල)'
        : resolvedCode === 'singlish'
          ? 'Singlish (Natural Romanized Sinhala)'
          : 'English';

    const contextBlock = [
      `Active Specimen: ${species?.commonName || 'None selected'} (${species?.scientificName || 'N/A'})`,
      `Taxonomic Class/Group: ${species?.className || 'N/A'} / ${species?.group || 'N/A'}`,
      `Model Availability: ${species?.availability || 'N/A'} (${species?.modelSource || 'N/A'})`,
      `Species Anatomy Summary: ${species?.anatomyNotes || 'General biological exploration'}`,
      `Currently Visible Anatomical Systems: ${activeSystems.length ? activeSystems.join(', ') : 'All available'}`,
      selectedPart
        ? `Currently Selected 3D Body Part: ${selectedPart.name} (${selectedPart.scientificName || 'N/A'}) | System: ${selectedPart.system} | Location: ${selectedPart.location} | Function: ${selectedPart.biologicalFunction} | Structure: ${selectedPart.structure}`
        : 'Currently Selected 3D Body Part: None (full specimen overview)',
    ].join('\n');

    const conversationSummary = (history || [])
      .slice(-8)
      .map((h) => `${h.role === 'user' ? 'Student' : 'BioAI'}: ${h.content}`)
      .join('\n');

    const systemInstruction = `You are BioAI, the comparative biology and medical 3D anatomy tutor inside BioExplora 3D.
Respond clearly, scientifically accurately, and educationally in ${targetLang}.
Language Rules:
- If responding in Sinhala (සිංහල), use natural academic Sinhala with key Latin/English anatomical terms in parentheses (e.g., හෘදය (Heart)).
- If responding in Singlish (Romanized Sinhala), understand Romanized Sinhala slang/spelling (e.g., "meka", "kiynn", "kohomada", "sathek", "paddathi", "asthi", "hadawatha") and write a friendly, clear, easy-to-read Singlish explanation (e.g., "Me sathage hadawatha (Heart) kottas 4kin samanwithai...") while including scientific names and key English/Sinhala terms in parentheses for clarity.
- Always ground your answer in the user's currently displayed species (including scientific name), visible anatomical systems, and selected 3D structure.
- If the student asks about ANY animal in the world (even one without a 3D model), always provide its exact scientific name, taxonomic family/class, and full biological/anatomical details.
- Keep answers concise, well-structured (2–4 short paragraphs or clear bullet points), and never fabricate 3D model availability.
- Provide 3 short, relevant follow-up questions in the SAME language (${targetLang}).`;

    const prompt = `CONTEXT:\n${contextBlock}\n\nRECENT CONVERSATION:\n${conversationSummary || 'None'}\n\nSTUDENT QUESTION:\n${message}`;

    try {
      const response = await generateContentWithRetry(ai, {
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              reply: {
                type: Type.STRING,
                description: 'Detailed, accurate educational biology response in the requested language.',
              },
              suggestedQuestions: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Three concise, context-relevant follow-up questions in the same language.',
              },
            },
            required: ['reply', 'suggestedQuestions'],
          },
        },
      });

      const parsed = JSON.parse((response.text || '{}').trim()) as {
        reply?: string;
        suggestedQuestions?: string[];
      };

      res.json({
        reply: parsed.reply || 'Unable to generate a response for that query.',
        suggestedQuestions: Array.isArray(parsed.suggestedQuestions)
          ? parsed.suggestedQuestions.slice(0, 3)
          : [],
        language: resolvedCode,
      });
    } catch (err) {
      console.error('BioAI error:', err);
      res.status(500).json({
        error:
          err instanceof Error
            ? `BioAI request failed: ${err.message}`
            : 'BioAI failed to process the request.',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`BioExplora 3D server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
