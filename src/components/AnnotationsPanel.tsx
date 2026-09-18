import React, { useState } from 'react';
import { MapAnnotation, MarkerCategory } from '../types';
import { calculateDistance, formatDistance } from '../utils/geoUtils';
import { useLanguage } from '../context/LanguageContext';
import {
  MapPin,
  PlusCircle,
  Search,
  Trash2,
  Filter,
  ExternalLink,
  Flame,
  Target,
  FileText,
  Upload,
  Download,
} from 'lucide-react';

interface AnnotationsPanelProps {
  annotations: MapAnnotation[];
  onAddAnnotation: () => void;
  onDeleteAnnotation: (id: string) => void;
  onFocusOnMap: (lat: number, lng: number) => void;
  isDarkMode: boolean;
  onImportMapData?: () => void;
  onExportGpx?: () => void;
}

export const AnnotationsPanel: React.FC<AnnotationsPanelProps> = ({
  annotations,
  onAddAnnotation,
  onDeleteAnnotation,
  onFocusOnMap,
  isDarkMode,
  onImportMapData,
  onExportGpx,
}) => {
  const { t, language } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<MarkerCategory | 'all'>('all');

  const filtered = annotations.filter((ann) => {
    const matchesCat = selectedCategory === 'all' || ann.category === selectedCategory;
    const matchesSearch =
      ann.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (ann.description || '').toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  return (
    <div
      className={`p-4 h-full overflow-y-auto ${
        isDarkMode ? 'bg-stone-900 text-stone-100' : 'bg-stone-50 text-stone-900'
      }`}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-stone-800">
        <div>
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-600/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center font-bold">
              📍
            </div>
            <h2 className="text-xl font-bold font-sans tracking-wide">
              {language === 'fi' ? 'MAASTO- & KARTTAMERKINNÄT' : 'MAP MARKERS & GEOFENCES'}
            </h2>
          </div>
          <p className="text-xs text-stone-400 mt-0.5">
            {language === 'fi'
              ? 'Passipaikat, riistahavainnot, jäljet ja tukikohdat kartalla'
              : 'Hunting stands, sightings, tracks, and geofence areas on map'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onImportMapData && (
            <button
              onClick={onImportMapData}
              title="Tuo karttatiedot tiedostosta (GPX, GeoJSON, KML, JSON)"
              className="flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 shadow transition cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              <span>Tuo karttatiedot</span>
            </button>
          )}

          {onExportGpx && (
            <button
              onClick={onExportGpx}
              title="Lataa karttatiedot & reitit GPX-tiedostona"
              className="flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-stone-800 hover:bg-stone-700 text-sky-300 border border-stone-700 shadow transition cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Lataa GPX</span>
            </button>
          )}

          <button
            onClick={onAddAnnotation}
            className="flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md transition cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>+ {t.addMarker}</span>
          </button>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 my-4">
        {/* Search Input */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-stone-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Etsi passia tai havaintoa..."
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-stone-800 border border-stone-700 text-xs text-white focus:outline-none focus:border-amber-500"
          />
        </div>

        {/* Category Pills */}
        <div className="flex items-center space-x-1 overflow-x-auto">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              selectedCategory === 'all'
                ? 'bg-amber-500 text-stone-950 font-bold'
                : 'bg-stone-800 text-stone-300 hover:bg-stone-700'
            }`}
          >
            Kaikki ({annotations.length})
          </button>
          <button
            onClick={() => setSelectedCategory('passipaikka')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              selectedCategory === 'passipaikka'
                ? 'bg-amber-500 text-stone-950 font-bold'
                : 'bg-stone-800 text-stone-300 hover:bg-stone-700'
            }`}
          >
            🎯 Passipaikat
          </button>
          <button
            onClick={() => setSelectedCategory('raja')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              selectedCategory === 'raja'
                ? 'bg-amber-500 text-stone-950 font-bold'
                : 'bg-stone-800 text-stone-300 hover:bg-stone-700'
            }`}
          >
            🛡️ Geofence-alueet
          </button>
          <button
            onClick={() => setSelectedCategory('havainto')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              selectedCategory === 'havainto'
                ? 'bg-amber-500 text-stone-950 font-bold'
                : 'bg-stone-800 text-stone-300 hover:bg-stone-700'
            }`}
          >
            🫎 Havainnot
          </button>
        </div>
      </div>

      {/* Grid of Annotation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((ann) => (
          <div
            key={ann.id}
            className={`p-4 rounded-2xl border transition-all ${
              isDarkMode ? 'bg-stone-800/70 border-stone-700' : 'bg-white border-stone-200'
            } shadow-md hover:shadow-xl flex flex-col justify-between`}
          >
            <div>
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-2.5">
                  <span className="text-xl">
                    {ann.subType === 'geofence' || ann.subType === 'turva_alue'
                      ? '🛡️'
                      : ann.subType === 'hirvi'
                      ? '🫎'
                      : ann.subType === 'karhu'
                      ? '🐻'
                      : ann.subType === 'nuotio'
                      ? '🔥'
                      : '🎯'}
                  </span>
                  <div>
                    <h4 className="font-bold text-base">{ann.title}</h4>
                    <div className="flex items-center space-x-1 mt-0.5">
                      <span className="text-[10px] uppercase font-bold text-amber-400 font-mono">
                        {ann.subType === 'geofence' || ann.subType === 'turva_alue' ? 'GEOFENCE-ALUE' : ann.category}
                      </span>
                      {ann.radiusMeters && (
                        <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/20 px-1.5 py-0.2 rounded border border-emerald-500/30">
                          Säde {ann.radiusMeters} m
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => onDeleteAnnotation(ann.id)}
                  className="text-stone-500 hover:text-red-400 transition p-1"
                  title="Poista merkintä"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {ann.description && (
                <p className="text-xs text-stone-300 mt-2.5 line-clamp-3 bg-stone-900/40 p-2.5 rounded-xl border border-stone-700/40">
                  {ann.description}
                </p>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-stone-700/40 flex items-center justify-between text-xs font-mono text-stone-400">
              <div>
                <span>
                  {ann.lat.toFixed(4)}°, {ann.lng.toFixed(4)}°
                </span>
              </div>

              <button
                onClick={() => onFocusOnMap(ann.lat, ann.lng)}
                className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 hover:bg-amber-500/40 transition font-bold text-xs flex items-center space-x-1"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Näytä kartalla</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
