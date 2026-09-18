import React, { useState, useRef } from 'react';
import { MapAnnotation, Dog } from '../types';
import { parseMapDataFile, ParsedMapData } from '../utils/geoUtils';
import {
  Upload,
  X,
  FileCheck,
  MapPin,
  Compass,
  Layers,
  AlertCircle,
  CheckCircle2,
  FileText,
  User,
  Shield,
  Flame,
  Target,
  ArrowRight
} from 'lucide-react';

/**
 * Imported files are arbitrary user data: coordinates can arrive as strings or be
 * missing entirely. Rendering them must not throw, or one bad row takes down the whole
 * preview dialog.
 */
function formatPreviewCoord(value: unknown): string {
  const num = typeof value === 'number' ? value : Number(value);
  return isFinite(num) ? num.toFixed(5) : '—';
}

interface ImportMapDataModalProps {
  onClose: () => void;
  onImport: (annotations: MapAnnotation[], dogs: Dog[], sourceLabel: string) => void;
  isDarkMode: boolean;
  currentUserName?: string;
}

export const ImportMapDataModal: React.FC<ImportMapDataModalProps> = ({
  onClose,
  onImport,
  isDarkMode,
  currentUserName,
}) => {
  const [sourceLabel, setSourceLabel] = useState<string>(
    currentUserName ? `Toimittaja: ${currentUserName}` : 'Kaverin toimittama'
  );
  const [parsedData, setParsedData] = useState<ParsedMapData | null>(null);
  const [selectedAnnoIds, setSelectedAnnoIds] = useState<Set<string>>(new Set());
  const [selectedDogIds, setSelectedDogIds] = useState<Set<string>>(new Set());
  const [isDragging, setIsDragging] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeInputTab, setActiveInputTab] = useState<'file' | 'text'>('file');
  const [rawText, setRawText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleProcessFile = (file: File) => {
    setErrorMsg(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        if (!content) {
          setErrorMsg('Tiedosto on tyhjä.');
          return;
        }
        const data = parseMapDataFile(content, file.name, sourceLabel);
        if (data.annotations.length === 0 && data.dogs.length === 0) {
          setErrorMsg('Tiedostosta ei löytynyt tunnistettavia karttamerkintöjä, reittipisteitä tai reittejä. Tuetut muodot: GPX, GeoJSON, KML, JSON.');
          return;
        }
        setParsedData(data);
        setSelectedAnnoIds(new Set(data.annotations.map((a) => a.id)));
        setSelectedDogIds(new Set(data.dogs.map((d) => d.id)));
      } catch (err) {
        console.error('File parsing error:', err);
        setErrorMsg('Tiedoston käsittely epäonnistui. Tarkista tiedostomuoto.');
      }
    };
    reader.onerror = () => {
      setErrorMsg('Tiedoston lukeminen epäonnistui.');
    };
    reader.readAsText(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleProcessFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleProcessFile(file);
    }
  };

  const handleProcessRawText = () => {
    setErrorMsg(null);
    if (!rawText.trim()) {
      setErrorMsg('Syötä GPX-, GeoJSON- tai KML-teksti.');
      return;
    }
    try {
      const data = parseMapDataFile(rawText, 'Liitetty_karttadata.gpx', sourceLabel);
      if (data.annotations.length === 0 && data.dogs.length === 0) {
        setErrorMsg('Tekstistä ei löytynyt tunnistettavia reittipisteitä tai merkintöjä.');
        return;
      }
      setParsedData(data);
      setSelectedAnnoIds(new Set(data.annotations.map((a) => a.id)));
      setSelectedDogIds(new Set(data.dogs.map((d) => d.id)));
    } catch (err) {
      setErrorMsg('Tekstin jäsentäminen epäonnistui.');
    }
  };

  const toggleAnnoSelection = (id: string) => {
    setSelectedAnnoIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleDogSelection = (id: string) => {
    setSelectedDogIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (!parsedData) return;
    const totalCount = parsedData.annotations.length + parsedData.dogs.length;
    const currentSelected = selectedAnnoIds.size + selectedDogIds.size;
    if (currentSelected === totalCount) {
      setSelectedAnnoIds(new Set());
      setSelectedDogIds(new Set());
    } else {
      setSelectedAnnoIds(new Set(parsedData.annotations.map((a) => a.id)));
      setSelectedDogIds(new Set(parsedData.dogs.map((d) => d.id)));
    }
  };

  const handleConfirmImport = () => {
    if (!parsedData) return;
    const filteredAnnotations = parsedData.annotations
      .filter((a) => selectedAnnoIds.has(a.id))
      .map((a) => ({
        ...a,
        createdBy: sourceLabel.trim() || a.createdBy || 'Tuotu tiedostosta',
      }));

    const filteredDogs = parsedData.dogs
      .filter((d) => selectedDogIds.has(d.id))
      .map((d) => ({
        ...d,
        addedBy: sourceLabel.trim() || d.addedBy || 'Tuotu tiedostosta',
      }));

    onImport(filteredAnnotations, filteredDogs, sourceLabel);
    onClose();
  };

  const totalSelected = selectedAnnoIds.size + selectedDogIds.size;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[3000] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in overflow-y-auto"
    >
      <div
        className={`w-full max-w-xl max-h-[88vh] flex flex-col rounded-3xl border shadow-2xl overflow-hidden transition-all my-auto ${
          isDarkMode ? 'bg-stone-900 border-stone-800 text-stone-100' : 'bg-white border-stone-200 text-stone-900'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-stone-800 bg-stone-950/40 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base tracking-wide flex items-center space-x-2">
                <span>TUO KARTTATIEDOT</span>
                <span className="text-[10px] uppercase px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono font-bold">
                  GPX / GeoJSON / KML
                </span>
              </h3>
              <p className="text-xs text-stone-400">
                Lataa kaverin tai seuran toimittamat passit, havainnot ja reitit
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2.5 rounded-2xl bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white border border-stone-700/80 shadow-md transition cursor-pointer active:scale-95 shrink-0"
            title="Sulje ikkuna"
            aria-label="Sulje ikkuna"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
          {/* Source/Provider tag input */}
          <div>
            <label className="block text-xs font-bold uppercase text-amber-400 mb-1.5 flex items-center space-x-1.5">
              <User className="w-3.5 h-3.5" />
              <span>Tietojen toimittaja / Kuvaus</span>
            </label>
            <input
              type="text"
              value={sourceLabel}
              onChange={(e) => setSourceLabel(e.target.value)}
              placeholder="esim. Matti V. / Hirviporukan passit 2026"
              className={`w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none focus:border-amber-500 transition ${
                isDarkMode ? 'bg-stone-950 border-stone-800 text-stone-100' : 'bg-stone-50 border-stone-300 text-stone-900'
              }`}
            />
            <p className="text-[11px] text-stone-400 mt-1">
              Tämä teksti tallentuu kohteiden lisätietoihin ("Lisännyt / Toimittaja").
            </p>
          </div>

          {!parsedData ? (
            <>
              {/* Tab Selector */}
              <div className="flex space-x-2 border-b border-stone-800 pb-2">
                <button
                  type="button"
                  onClick={() => setActiveInputTab('file')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                    activeInputTab === 'file'
                      ? 'bg-amber-500 text-stone-950'
                      : 'bg-stone-800/60 text-stone-400 hover:text-stone-200'
                  }`}
                >
                  📁 Valitse tiedosto (.gpx, .geojson, .kml, .json)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveInputTab('text')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                    activeInputTab === 'text'
                      ? 'bg-amber-500 text-stone-950'
                      : 'bg-stone-800/60 text-stone-400 hover:text-stone-200'
                  }`}
                >
                  📝 Liitä teksti / koodi
                </button>
              </div>

              {activeInputTab === 'file' ? (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`p-8 border-2 border-dashed rounded-2xl text-center cursor-pointer transition flex flex-col items-center justify-center space-y-3 ${
                    isDragging
                      ? 'border-amber-400 bg-amber-500/10'
                      : isDarkMode
                      ? 'border-stone-700 hover:border-amber-500/60 bg-stone-950/60 hover:bg-stone-950'
                      : 'border-stone-300 hover:border-amber-500/60 bg-stone-50 hover:bg-amber-50/50'
                  }`}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept=".gpx,.geojson,.kml,.json,application/gpx+xml,application/json,application/vnd.google-earth.kml+xml"
                    className="hidden"
                  />
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center shadow-inner">
                    <Upload className="w-6 h-6 animate-pulse" />
                  </div>
                  <div>
                    <p className="font-bold text-sm text-stone-200">
                      Vedä ja pudota tiedosto tähän tai <span className="text-amber-400 underline">valitse laitteelta</span>
                    </p>
                    <p className="text-xs text-stone-400 mt-1">
                      Tukee standardeja <strong>GPX</strong>, <strong>GeoJSON</strong>, <strong>KML</strong> ja <strong>JSON</strong> -karttatiedostoja
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 justify-center pt-2">
                    <span className="text-[10px] px-2 py-0.5 rounded bg-stone-800 text-stone-300 border border-stone-700 font-mono">🌲 Oma riista (Seura-alueet & passit)</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-stone-800 text-stone-300 border border-stone-700 font-mono">📍 .GPX (Tracker, Garmin, Ultracom)</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-stone-800 text-stone-300 border border-stone-700 font-mono">🗺️ .GeoJSON (ETRS-TM35FIN & WGS84)</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-stone-800 text-stone-300 border border-stone-700 font-mono">🌐 .KML (Google Earth, Paikkatieto)</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <textarea
                    rows={6}
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                    placeholder="Liitä tähän Oma riistan GeoJSON / JSON -teksti, GPX XML tai KML (esim. { 'type': 'FeatureCollection', ... })..."
                    className={`w-full p-3 rounded-xl border text-xs font-mono focus:outline-none focus:border-amber-500 transition ${
                      isDarkMode ? 'bg-stone-950 border-stone-800 text-stone-200' : 'bg-stone-50 border-stone-300 text-stone-900'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={handleProcessRawText}
                    className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs rounded-xl shadow transition"
                  >
                    Jäsennä liitetty karttadata (Oma riista / GeoJSON / GPX)
                  </button>
                </div>
              )}

              {errorMsg && (
                <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-400" />
                  <span>{errorMsg}</span>
                </div>
              )}
            </>
          ) : (
            /* Data preview and selection view */
            <div className="space-y-4">
              {/* File Info Card */}
              <div className="p-4 rounded-xl bg-stone-950 border border-stone-800 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center">
                    <FileCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-sm text-stone-100">{parsedData.fileName}</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        {parsedData.fileFormat}
                      </span>
                    </div>
                    <p className="text-xs text-stone-400 mt-0.5">
                      Löytyi: <strong>{parsedData.summary.waypointsCount}</strong> reittipistettä / passia
                      {parsedData.summary.tracksCount > 0 && `, ${parsedData.summary.tracksCount} reittiä / jälkeä`}
                      {parsedData.summary.areasCount > 0 && `, ${parsedData.summary.areasCount} aluetta`}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setParsedData(null);
                    setErrorMsg(null);
                  }}
                  className="text-xs text-amber-400 hover:text-amber-300 underline font-medium"
                >
                  Vaihda tiedosto
                </button>
              </div>

              {/* Selection Controls */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs font-bold text-stone-300">
                  Valittu tuotavaksi: <strong className="text-amber-400">{totalSelected}</strong> kpl
                </span>
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  className="text-xs text-stone-400 hover:text-stone-200 underline"
                >
                  {totalSelected === parsedData.annotations.length + parsedData.dogs.length
                    ? 'Poista kaikkien valinta'
                    : 'Valitse kaikki'}
                </button>
              </div>

              {/* Items List */}
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {parsedData.annotations.map((anno) => {
                  const isChecked = selectedAnnoIds.has(anno.id);
                  let icon = '📍';
                  if (anno.subType === 'passi') icon = '🎯';
                  else if (anno.subType === 'hirvi') icon = '🫎';
                  else if (anno.subType === 'karhu') icon = '🐻';
                  else if (anno.subType === 'nuotio' || anno.subType === 'laavu') icon = '🔥';
                  else if (anno.subType === 'geofence') icon = '🛡️';

                  return (
                    <div
                      key={anno.id}
                      onClick={() => toggleAnnoSelection(anno.id)}
                      className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition ${
                        isChecked
                          ? 'bg-amber-500/10 border-amber-500/50 text-stone-100'
                          : 'bg-stone-950/40 border-stone-800 text-stone-400 opacity-60'
                      }`}
                    >
                      <div className="flex items-center space-x-2.5 min-w-0">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}}
                          className="w-4 h-4 rounded text-amber-500 focus:ring-0 cursor-pointer"
                        />
                        <span className="text-sm">{icon}</span>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-stone-200 truncate">{anno.title}</p>
                          <p className="text-[10px] text-stone-400 font-mono truncate">
                            {formatPreviewCoord(anno.lat)}°, {formatPreviewCoord(anno.lng)}° {anno.description ? `• ${anno.description}` : ''}
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-stone-800 text-stone-300 font-medium">
                        {anno.category}
                      </span>
                    </div>
                  );
                })}

                {parsedData.dogs.map((dog) => {
                  const isChecked = selectedDogIds.has(dog.id);
                  return (
                    <div
                      key={dog.id}
                      onClick={() => toggleDogSelection(dog.id)}
                      className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition ${
                        isChecked
                          ? 'bg-amber-500/10 border-amber-500/50 text-stone-100'
                          : 'bg-stone-950/40 border-stone-800 text-stone-400 opacity-60'
                      }`}
                    >
                      <div className="flex items-center space-x-2.5 min-w-0">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}}
                          className="w-4 h-4 rounded text-amber-500 focus:ring-0 cursor-pointer"
                        />
                        <span className="text-sm">🐕</span>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-stone-200 truncate">{dog.name} (Reitti/Jälki)</p>
                          <p className="text-[10px] text-stone-400 font-mono truncate">
                            {dog.trackHistory?.length ?? 0} GPS-pistettä
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-medium">
                        Koiran jälki
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-stone-800 bg-stone-950/60 flex items-center justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-stone-400 hover:text-white transition"
          >
            Sulje
          </button>

          {parsedData && (
            <button
              type="button"
              disabled={totalSelected === 0}
              onClick={handleConfirmImport}
              className={`flex items-center space-x-2 px-5 py-2.5 rounded-xl text-xs font-bold shadow-lg transition ${
                totalSelected > 0
                  ? 'bg-amber-500 hover:bg-amber-400 text-stone-950'
                  : 'bg-stone-800 text-stone-500 cursor-not-allowed'
              }`}
            >
              <span>Tuo {totalSelected} kohdetta kartalle</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
