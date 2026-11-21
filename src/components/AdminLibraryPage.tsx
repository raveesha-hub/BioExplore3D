import React, { useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import {
  Plus,
  Trash2,
  Upload,
  Box,
  Edit3,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
} from 'lucide-react';
import {
  AnatomicalSystemId,
  AnatomyPartMetadata,
  SpeciesRecord,
  SYSTEM_COLOR_MAP,
  TAXONOMIC_GROUPS,
  TaxonomicGroup,
} from '../types/anatomy';

interface AdminLibraryPageProps {
  customSpecies: SpeciesRecord[];
  onRefreshLibrary: () => Promise<void>;
  onOpenInExplorer: (species: SpeciesRecord) => void;
}

const SYSTEM_OPTIONS: AnatomicalSystemId[] = [
  'skeletal',
  'muscular',
  'nervous',
  'circulatory',
  'respiratory',
  'digestive',
  'urinary',
  'reproductive',
  'endocrine',
  'lymphatic',
  'integumentary',
  'exoskeleton',
];

export const AdminLibraryPage: React.FC<AdminLibraryPageProps> = ({
  customSpecies,
  onRefreshLibrary,
  onOpenInExplorer,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [commonName, setCommonName] = useState('');
  const [scientificName, setScientificName] = useState('');
  const [group, setGroup] = useState<TaxonomicGroup>('mammals');
  const [className, setClassName] = useState('Mammalia');
  const [order, setOrder] = useState('');
  const [family, setFamily] = useState('');
  const [conservationStatus, setConservationStatus] = useState('Least Concern');
  const [habitat, setHabitat] = useState('');
  const [summary, setSummary] = useState('');
  const [anatomyNotes, setAnatomyNotes] = useState('');
  const [modelUrl, setModelUrl] = useState('');
  const [embedUrl, setEmbedUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parts, setParts] = useState<AnatomyPartMetadata[]>([]);
  const [scanningGlb, setScanningGlb] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const resetForm = () => {
    setEditingId(null);
    setCommonName('');
    setScientificName('');
    setGroup('mammals');
    setClassName('Mammalia');
    setOrder('');
    setFamily('');
    setConservationStatus('Least Concern');
    setHabitat('');
    setSummary('');
    setAnatomyNotes('');
    setModelUrl('');
    setEmbedUrl('');
    setSelectedFile(null);
    setParts([]);
  };

  // Inspect selected .glb/.gltf file locally with Three.js to extract real mesh node names!
  const handleFileChange = async (file: File | null) => {
    setSelectedFile(file);
    if (!file) return;
    setScanningGlb(true);
    setStatusMsg(null);

    try {
      const buffer = await file.arrayBuffer();
      const draco = new DRACOLoader();
      draco.setDecoderPath('/draco/');
      const loader = new GLTFLoader();
      loader.setDRACOLoader(draco);

      loader.parse(
        buffer,
        '',
        (gltf) => {
          const foundMeshes: AnatomyPartMetadata[] = [];
          let idx = 0;
          gltf.scene.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              idx += 1;
              const meshName = child.name || `mesh_part_${idx}`;
              const box = new THREE.Box3().setFromObject(child);
              const c = new THREE.Vector3();
              box.getCenter(c);
              const dir = c.normalize().multiplyScalar(0.65);
              foundMeshes.push({
                id: `part-${idx}-${Date.now()}`,
                meshName,
                name: meshName.replace(/[_-]+/g, ' '),
                system: 'skeletal',
                biologicalFunction: 'Describe the physiological function of this anatomical structure.',
                structure: 'Describe tissue or skeletal morphology.',
                location: 'Specify anatomical region.',
                relatedStructures: [],
                educationalNotes: 'Extracted automatically from uploaded GLB mesh hierarchy.',
                explodeVector: [Number(dir.x.toFixed(2)), Number(dir.y.toFixed(2)) || 0.4, Number(dir.z.toFixed(2))],
              });
            }
          });
          if (foundMeshes.length > 0) {
            setParts(foundMeshes);
            setStatusMsg({
              type: 'success',
              text: `Detected ${foundMeshes.length} mesh node(s) in ${file.name}. Review or customize metadata below before saving.`,
            });
          } else {
            setStatusMsg({
              type: 'error',
              text: 'Loaded GLB file, but no Mesh nodes were found inside.',
            });
          }
          draco.dispose();
          setScanningGlb(false);
        },
        () => {
          draco.dispose();
          setScanningGlb(false);
          setStatusMsg({
            type: 'error',
            text: 'Could not parse GLB/GLTF locally. You can still upload it to the server.',
          });
        },
      );
    } catch {
      setScanningGlb(false);
    }
  };

  const addEmptyPart = () => {
    setParts((prev) => [
      ...prev,
      {
        id: `part-${Date.now()}-${prev.length + 1}`,
        meshName: `part_${prev.length + 1}`,
        name: '',
        system: 'skeletal',
        biologicalFunction: '',
        structure: '',
        location: '',
        relatedStructures: [],
        educationalNotes: '',
        explodeVector: [0, 0.5, 0],
      },
    ]);
  };

  const updatePartField = (idx: number, field: keyof AnatomyPartMetadata, value: string) => {
    setParts((prev) =>
      prev.map((p, i) => (i === idx ? { ...p, [field]: value } : p)),
    );
  };

  const removePart = (idx: number) => {
    setParts((prev) => prev.filter((_, i) => i !== idx));
  };

  const startEdit = (sp: SpeciesRecord) => {
    setEditingId(sp.id);
    setCommonName(sp.commonName);
    setScientificName(sp.scientificName);
    setGroup(sp.group);
    setClassName(sp.className);
    setOrder(sp.order);
    setFamily(sp.family);
    setConservationStatus(sp.conservationStatus);
    setHabitat(sp.habitat);
    setSummary(sp.summary);
    setAnatomyNotes(sp.anatomyNotes);
    setModelUrl(sp.modelUrl || '');
    setEmbedUrl(sp.embedUrl || '');
    setParts(sp.parts || []);
    setSelectedFile(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commonName.trim() || !scientificName.trim()) {
      setStatusMsg({ type: 'error', text: 'Common Name and Scientific Name are required.' });
      return;
    }

    setSubmitting(true);
    setStatusMsg(null);

    try {
      const usedSystems = Array.from(new Set(parts.map((p) => p.system)));
      const systemsPayload = usedSystems.map((sysId) => ({
        id: sysId,
        name: `${sysId.charAt(0).toUpperCase() + sysId.slice(1)} System`,
        color: SYSTEM_COLOR_MAP[sysId],
        description: `${sysId} components for ${commonName}.`,
        speciesSpecificNote: anatomyNotes || `${commonName} ${sysId} system.`,
      }));

      const metadata = {
        commonName: commonName.trim(),
        scientificName: scientificName.trim(),
        group,
        className: className.trim() || 'Mammalia',
        order: order.trim() || 'Unspecified',
        family: family.trim() || 'Unspecified',
        conservationStatus,
        habitat: habitat.trim() || 'Global',
        summary: summary.trim() || `${commonName} (${scientificName}) anatomical specimen.`,
        anatomyNotes: anatomyNotes.trim() || 'Added via Dynamic 3D Library Management.',
        modelUrl: modelUrl.trim() || undefined,
        embedUrl: embedUrl.trim() || undefined,
        systems: systemsPayload,
        parts: parts.filter((p) => p.name.trim() || p.meshName.trim()),
      };

      const formData = new FormData();
      formData.append('metadata', JSON.stringify(metadata));
      if (selectedFile) {
        formData.append('modelFile', selectedFile);
      }

      const url = editingId ? `/api/admin/species/${editingId}` : '/api/admin/species';
      const method = editingId ? 'PUT' : 'POST';

      const resp = await fetch(url, { method, body: formData });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || 'Failed to save species.');
      }

      await onRefreshLibrary();
      setStatusMsg({
        type: 'success',
        text: editingId
          ? `Updated ${data.commonName} in the searchable 3D library.`
          : `Added ${data.commonName} (${data.scientificName}) — now live in Search and 3D Explorer!`,
      });
      resetForm();
    } catch (err) {
      setStatusMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Save failed.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    try {
      const resp = await fetch(`/api/admin/species/${id}`, { method: 'DELETE' });
      if (!resp.ok) throw new Error('Failed to remove model.');
      await onRefreshLibrary();
      setStatusMsg({ type: 'success', text: `Removed "${name}" from the dynamic library.` });
    } catch (err) {
      setStatusMsg({ type: 'error', text: err instanceof Error ? err.message : 'Delete failed.' });
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">
      <div className="max-w-3xl space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
          Expandable Platform Architecture
        </p>
        <h1 className="font-display text-3xl font-bold text-slate-900 dark:text-slate-100">
          Dynamic 3D Library Management
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
          Add new species, upload GLB/GLTF 3D files, inspect mesh nodes, attach anatomical part metadata, and update or remove records. New models automatically become searchable without code changes.
        </p>
      </div>

      {statusMsg && (
        <div
          className={`p-4 rounded-xl border text-xs flex items-center gap-2.5 ${
            statusMsg.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
              : 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
          }`}
        >
          {statusMsg.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{statusMsg.text}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Form Column */}
        <form
          onSubmit={handleSubmit}
          className="lg:col-span-7 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-6"
        >
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
            <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
              {editingId ? 'Edit Custom Species & Model' : 'Add Species & 3D Asset'}
            </h2>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
              >
                Cancel Edit
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="space-y-1 text-xs">
              <span className="font-medium text-slate-700 dark:text-slate-300">Common Name *</span>
              <input
                type="text"
                required
                value={commonName}
                onChange={(e) => setCommonName(e.target.value)}
                placeholder="e.g., Snow Leopard"
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="font-medium text-slate-700 dark:text-slate-300">Scientific Name *</span>
              <input
                type="text"
                required
                value={scientificName}
                onChange={(e) => setScientificName(e.target.value)}
                placeholder="e.g., Panthera uncia"
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="font-medium text-slate-700 dark:text-slate-300">Animal Group</span>
              <select
                value={group}
                onChange={(e) => setGroup(e.target.value as TaxonomicGroup)}
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
              >
                {TAXONOMIC_GROUPS.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs">
              <span className="font-medium text-slate-700 dark:text-slate-300">Taxonomic Class</span>
              <input
                type="text"
                value={className}
                onChange={(e) => setClassName(e.target.value)}
                placeholder="e.g., Mammalia"
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="font-medium text-slate-700 dark:text-slate-300">Order</span>
              <input
                type="text"
                value={order}
                onChange={(e) => setOrder(e.target.value)}
                placeholder="e.g., Carnivora"
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="font-medium text-slate-700 dark:text-slate-300">Family</span>
              <input
                type="text"
                value={family}
                onChange={(e) => setFamily(e.target.value)}
                placeholder="e.g., Felidae"
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="font-medium text-slate-700 dark:text-slate-300">Conservation Status</span>
              <input
                type="text"
                value={conservationStatus}
                onChange={(e) => setConservationStatus(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="font-medium text-slate-700 dark:text-slate-300">Habitat</span>
              <input
                type="text"
                value={habitat}
                onChange={(e) => setHabitat(e.target.value)}
                placeholder="e.g., Central Asian Mountains"
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
              />
            </label>
          </div>

          <div className="space-y-3">
            <label className="block space-y-1 text-xs">
              <span className="font-medium text-slate-700 dark:text-slate-300">Biological Summary</span>
              <textarea
                rows={2}
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="Overview of biology, ecology, and morphology..."
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
              />
            </label>
            <label className="block space-y-1 text-xs">
              <span className="font-medium text-slate-700 dark:text-slate-300">Species-Specific Anatomy Notes</span>
              <textarea
                rows={2}
                value={anatomyNotes}
                onChange={(e) => setAnatomyNotes(e.target.value)}
                placeholder="Unique skeletal, respiratory, or visceral adaptations..."
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
              />
            </label>
          </div>

          {/* 3D Model Upload or URL */}
          <div className="p-4 rounded-xl bg-sky-50/60 dark:bg-slate-800/50 border border-sky-100 dark:border-slate-800 space-y-3">
            <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Upload className="w-4 h-4 text-sky-600 dark:text-sky-400" />
              <span>3D Asset (.glb / .gltf File Upload or Direct URL)</span>
            </h3>
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
              <input
                type="file"
                accept=".glb,.gltf"
                onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
                className="text-xs text-slate-600 dark:text-slate-300 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-sky-600 file:text-white hover:file:bg-sky-700 cursor-pointer"
              />
              {scanningGlb && (
                <span className="text-xs text-sky-600 dark:text-sky-400">
                  Scanning GLB mesh nodes...
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <label className="space-y-1 text-xs">
                <span className="text-slate-600 dark:text-slate-400">Or Direct GLB/GLTF URL</span>
                <input
                  type="url"
                  value={modelUrl}
                  onChange={(e) => setModelUrl(e.target.value)}
                  placeholder="https://.../specimen.glb"
                  className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                />
              </label>
              <label className="space-y-1 text-xs">
                <span className="text-slate-600 dark:text-slate-400">Or Sketchfab Embed URL</span>
                <input
                  type="url"
                  value={embedUrl}
                  onChange={(e) => setEmbedUrl(e.target.value)}
                  placeholder="https://sketchfab.com/models/.../embed"
                  className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                />
              </label>
            </div>
          </div>

          {/* Body-Part Metadata Editor */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                Segmented Body-Part Metadata ({parts.length})
              </h3>
              <button
                type="button"
                onClick={addEmptyPart}
                className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-medium flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Part</span>
              </button>
            </div>

            {parts.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Upload a multi-mesh GLB file to auto-detect mesh nodes, or click &ldquo;Add Part&rdquo; to manually annotate anatomical parts.
              </p>
            ) : (
              <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                {parts.map((part, idx) => (
                  <div
                    key={part.id}
                    className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono-tabular text-[11px] text-slate-500">
                        Mesh Node #{idx + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => removePart(idx)}
                        className="text-rose-600 hover:text-rose-700 p-1"
                        title="Remove Part"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <input
                        type="text"
                        value={part.meshName}
                        onChange={(e) => updatePartField(idx, 'meshName', e.target.value)}
                        placeholder="GLB Mesh Name"
                        className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                      />
                      <input
                        type="text"
                        value={part.name}
                        onChange={(e) => updatePartField(idx, 'name', e.target.value)}
                        placeholder="Display Name (e.g. Heart)"
                        className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                      />
                      <select
                        value={part.system}
                        onChange={(e) => updatePartField(idx, 'system', e.target.value)}
                        className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                      >
                        {SYSTEM_OPTIONS.map((sys) => (
                          <option key={sys} value={sys}>
                            {sys}
                          </option>
                        ))}
                      </select>
                    </div>
                    <input
                      type="text"
                      value={part.biologicalFunction}
                      onChange={(e) => updatePartField(idx, 'biologicalFunction', e.target.value)}
                      placeholder="Biological function..."
                      className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-sky-600 to-emerald-600 hover:from-sky-700 hover:to-emerald-700 disabled:opacity-50 text-white text-sm font-semibold transition-all shadow-sm"
          >
            {submitting
              ? 'Saving to Library...'
              : editingId
                ? 'Update Species & Model'
                : 'Publish Species to BioExplora 3D'}
          </button>
        </form>

        {/* Custom Uploaded Species List */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
              Admin-Added Models ({customSpecies.length})
            </h2>
          </div>

          {customSpecies.length === 0 ? (
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-sky-100 dark:border-slate-800 p-6 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              No custom species or GLB files have been uploaded yet. Use the form on the left to add new animal species, upload `.glb`/`.gltf` models, or register external 3D assets—they will immediately appear in search and the 3D Explorer.
            </div>
          ) : (
            <div className="space-y-3">
              {customSpecies.map((sp) => (
                <div
                  key={sp.id}
                  className="rounded-xl bg-white dark:bg-slate-900 border border-sky-100 dark:border-slate-800 p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold">
                        {sp.group} · {sp.modelSource}
                      </p>
                      <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                        {sp.commonName}
                      </h3>
                      <p className="text-xs italic text-slate-500 dark:text-slate-400">
                        {sp.scientificName}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => startEdit(sp)}
                        className="p-1.5 rounded-lg hover:bg-sky-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
                        title="Edit Model Info"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(sp.id, sp.commonName)}
                        className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/60 text-rose-600"
                        title="Remove Model"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenInExplorer(sp)}
                    className="w-full py-2 px-3 rounded-lg bg-sky-50 dark:bg-slate-800 hover:bg-gradient-to-r hover:from-sky-600 hover:to-emerald-600 hover:text-white text-sky-800 dark:text-slate-100 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all"
                  >
                    <Box className="w-3.5 h-3.5" />
                    <span>Launch in 3D Explorer</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
