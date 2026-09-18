import React, { useState, useEffect } from 'react';
import { MapAnnotation, MarkerCategory } from '../types';
import { MapPin, X, PlusCircle, Crosshair, MousePointerClick } from 'lucide-react';

interface AddAnnotationModalProps {
  onAddAnnotation: (annotation: MapAnnotation) => void;
  onClose: () => void;
  isDarkMode: boolean;
  defaultLat: number;
  defaultLng: number;
  userLat?: number;
  userLng?: number;
  onPickFromMap?: () => void;
}

export const AddAnnotationModal: React.FC<AddAnnotationModalProps> = ({
  onAddAnnotation,
  onClose,
  isDarkMode,
  defaultLat,
  defaultLng,
  userLat,
  userLng,
  onPickFromMap,
}) => {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<MarkerCategory>('passipaikka');
  const [subType, setSubType] = useState<'hirvi' | 'karhu' | 'susi' | 'teeri' | 'passi' | 'nuotio' | 'laavu' | 'geofence' | 'turva_alue'>('passi');
  const [radiusMeters, setRadiusMeters] = useState<number>(500);
  const [alertTrigger, setAlertTrigger] = useState<'exit' | 'enter' | 'both'>('exit');
  const [description, setDescription] = useState('');
  const [lat, setLat] = useState(defaultLat.toFixed(5));
  const [lng, setLng] = useState(defaultLng.toFixed(5));

  // Sync state if defaultLat/defaultLng props change (e.g., after picking from map)
  useEffect(() => {
    setLat(defaultLat.toFixed(5));
    setLng(defaultLng.toFixed(5));
  }, [defaultLat, defaultLng]);

  const handleUseGpsLocation = () => {
    if (userLat !== undefined && userLng !== undefined) {
      setLat(userLat.toFixed(5));
      setLng(userLng.toFixed(5));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const newAnnotation: MapAnnotation = {
      id: `ann-${Date.now()}`,
      title: title.trim(),
      category: subType === 'geofence' || subType === 'turva_alue' ? 'raja' : category,
      subType,
      lat: parseFloat(lat) || defaultLat,
      lng: parseFloat(lng) || defaultLng,
      description: description.trim(),
      createdBy: 'Minä (Käyttäjä)',
      createdAt: Date.now(),
      radiusMeters: subType === 'geofence' || subType === 'turva_alue' ? radiusMeters : undefined,
      alertTrigger: subType === 'geofence' || subType === 'turva_alue' ? alertTrigger : undefined,
      assignedDogId: 'all',
      isEnabled: true,
    };

    onAddAnnotation(newAnnotation);
    onClose();
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[3000] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md overflow-y-auto"
    >
      <div
        className={`w-full max-w-md max-h-[88vh] flex flex-col rounded-3xl border ${
          isDarkMode ? 'bg-stone-900 border-stone-800 text-stone-100' : 'bg-white border-stone-200 text-stone-900'
        } shadow-2xl relative my-auto overflow-hidden animate-fadeIn`}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3.5 right-3.5 sm:top-4 sm:right-4 p-2 rounded-full bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 shadow-md transition z-20 flex items-center justify-center cursor-pointer active:scale-95"
          title="Sulje ilman tallennusta"
          aria-label="Sulje ikkuna"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-5 sm:p-6 overflow-y-auto flex-1">
          <div className="flex items-center space-x-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center font-bold shrink-0">
              📍
            </div>
            <div>
              <h3 className="text-xl font-bold">Uusi karttamerkintä</h3>
              <p className="text-xs text-stone-400">Lisää passi, havainto tai paikkamerkintä kartalle</p>
            </div>
          </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase text-stone-400 mb-1">
              Otsikko / Nimi *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="esim. Passi 5 (Aukko), Tuore hirvenjälki"
              className="w-full p-3 rounded-xl bg-stone-800 border border-stone-700 text-white text-sm focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold uppercase text-stone-400 mb-1">Kategoria</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as MarkerCategory)}
                className="w-full p-3 rounded-xl bg-stone-800 border border-stone-700 text-white text-xs focus:outline-none focus:border-emerald-500"
              >
                <option value="passipaikka">🎯 Passipaikka</option>
                <option value="havainto">🫎 Havainto / Jälki</option>
                <option value="raja">🗺️ Alue / Geofence</option>
                <option value="turvallisuus">🛡️ Turvallisuus</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-stone-400 mb-1">Tyyppi / Kuvake</label>
              <select
                value={subType}
                onChange={(e) => {
                  const val = e.target.value as any;
                  setSubType(val);
                  if (val === 'geofence' || val === 'turva_alue') {
                    setCategory('raja');
                  }
                }}
                className="w-full p-3 rounded-xl bg-stone-800 border border-stone-700 text-amber-300 font-bold text-xs focus:outline-none focus:border-emerald-500"
              >
                <option value="passi">🎯 Passipaikka</option>
                <option value="geofence">🛡️ Turva-alue (Geofence-hälytys)</option>
                <option value="hirvi">🫎 Hirvihavainto</option>
                <option value="karhu">🐻 Karhunjälki</option>
                <option value="nuotio">🔥 Nuotio / Laavu</option>
              </select>
            </div>
          </div>

          {/* Geofence Extra Settings */}
          {(subType === 'geofence' || subType === 'turva_alue') && (
            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/40 space-y-3 animate-fadeIn">
              <div className="flex items-center space-x-2 text-amber-300 font-extrabold text-xs">
                <span>🛡️ Geofence-turva-alueen hälytysasetukset</span>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-stone-300 mb-1">
                  Alueen säde: <span className="text-amber-400 font-mono font-bold">{radiusMeters} m</span> ({ (radiusMeters / 1000).toFixed(1) } km)
                </label>
                <input
                  type="range"
                  min="100"
                  max="5000"
                  step="100"
                  value={radiusMeters}
                  onChange={(e) => setRadiusMeters(parseInt(e.target.value, 10))}
                  className="w-full accent-amber-500 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-stone-400 mt-0.5 font-mono">
                  <span>100 m</span>
                  <span>1 km</span>
                  <span>2.5 km</span>
                  <span>5 km</span>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-stone-300 mb-1">
                  Hälytyksen ehto:
                </label>
                <select
                  value={alertTrigger}
                  onChange={(e) => setAlertTrigger(e.target.value as any)}
                  className="w-full p-2.5 rounded-xl bg-stone-900 border border-stone-700 text-stone-200 text-xs font-semibold focus:outline-none focus:border-amber-500"
                >
                  <option value="exit">⚠️ Hälytä kun koira POISTUU alueelta (Turva-alue)</option>
                  <option value="enter">⛔ Hälytä kun koira SAAPUI alueelle (Kieltoalue / Tie / Asutus)</option>
                  <option value="both">🔔 Hälytä molemmista (Rajanylitys)</option>
                </select>
              </div>

              <p className="text-[11px] text-stone-400 leading-tight">
                💡 Kun koiran GPS-sijainti päivittyy ja ylittää asetetun säteen, Erätutka antaa välittömästi äänihälytyksen ja ruutuilmoituksen.
              </p>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold uppercase text-stone-400 mb-1">
              Lisätiedot / Muistiinpanot
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="esim. Tuuli lounaasta, tuore syönnös, laavulla puita..."
              className="w-full p-3 rounded-xl bg-stone-800 border border-stone-700 text-white text-xs focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Sijainti / Koordinaatit & Map Picker Buttons */}
          <div className="bg-stone-950/60 p-3 rounded-2xl border border-stone-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="block text-[11px] font-bold uppercase text-amber-400">Sijaintikoordinaatit</label>
              <div className="flex items-center space-x-1.5">
                {onPickFromMap && (
                  <button
                    type="button"
                    onClick={onPickFromMap}
                    className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold transition active:scale-95 cursor-pointer"
                    title="Klikkaa kartalta paikka"
                  >
                    <MousePointerClick className="w-3.5 h-3.5" />
                    <span>Osoita kartalta</span>
                  </button>
                )}

                {userLat !== undefined && userLng !== undefined && (
                  <button
                    type="button"
                    onClick={handleUseGpsLocation}
                    className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-bold transition active:scale-95 cursor-pointer"
                    title="Aseta koordinaatit omaan GPS-sijaintiin"
                  >
                    <Crosshair className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Oma GPS</span>
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold uppercase text-stone-400 mb-1">Leveysaste (Lat)</label>
                <input
                  type="text"
                  value={lat}
                  onChange={(e) => setLat(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-stone-800 border border-stone-700 font-mono text-xs text-stone-200 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-stone-400 mb-1">Pituusaste (Lng)</label>
                <input
                  type="text"
                  value={lng}
                  onChange={(e) => setLng(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-stone-800 border border-stone-700 font-mono text-xs text-stone-200 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* Action Buttons: Cancel and Save */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="w-full py-3 rounded-2xl bg-stone-800 hover:bg-stone-700 text-stone-200 font-bold text-sm transition flex items-center justify-center border border-stone-700 shadow cursor-pointer active:scale-95"
            >
              <span>Peruuta</span>
            </button>

            <button
              type="submit"
              className="w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm transition flex items-center justify-center space-x-1.5 shadow-lg cursor-pointer active:scale-95"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Tallenna</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
);
};

