import React, { useState } from 'react';
import { Dog, MapAnnotation, UserLocation } from '../types';
import { useLanguage } from '../context/LanguageContext';
import {
  calculateDistance,
  calculateBearing,
  formatDistance,
  getCompassDirection,
  calculateWalkTimeMinutes,
} from '../utils/geoUtils';
import { Ruler, Compass, Footprints, AlertTriangle, Navigation } from 'lucide-react';

interface RulerPanelProps {
  userLocation: UserLocation | null;
  dogs: Dog[];
  annotations: MapAnnotation[];
  activeRulerPoint: { lat: number; lng: number; title: string } | null;
  setActiveRulerPoint: (pt: { lat: number; lng: number; title: string } | null) => void;
  isDarkMode: boolean;
}

export const RulerPanel: React.FC<RulerPanelProps> = ({
  userLocation,
  dogs,
  annotations,
  activeRulerPoint,
  setActiveRulerPoint,
  isDarkMode,
}) => {
  const { t, language } = useLanguage();
  const [selectedTargetKey, setSelectedTargetKey] = useState<string>(() => dogs[0]?.id || annotations[0]?.id || '');

  // Compute metrics if target selected & user GPS available
  let targetItem: { lat: number; lng: number; title: string } | null = null;

  // Resolve target using selected key, or fallback to first available dog/annotation
  const resolvedKey =
    selectedTargetKey && (dogs.some((d) => d.id === selectedTargetKey) || annotations.some((a) => a.id === selectedTargetKey))
      ? selectedTargetKey
      : dogs[0]?.id || annotations[0]?.id || '';

  if (resolvedKey.startsWith('dog-') || dogs.some((d) => d.id === resolvedKey)) {
    const d = dogs.find((dog) => dog.id === resolvedKey);
    if (d) targetItem = { lat: d.lat, lng: d.lng, title: `${language === 'fi' ? 'Koira' : 'Dog'}: ${d.name}` };
  } else if (resolvedKey.startsWith('ann-') || annotations.some((a) => a.id === resolvedKey)) {
    const a = annotations.find((ann) => ann.id === resolvedKey);
    if (a) targetItem = { lat: a.lat, lng: a.lng, title: a.title };
  }

  const distanceMeters =
    userLocation && targetItem
      ? calculateDistance(userLocation.lat, userLocation.lng, targetItem.lat, targetItem.lng)
      : null;

  const bearingAngle =
    userLocation && targetItem
      ? calculateBearing(userLocation.lat, userLocation.lng, targetItem.lat, targetItem.lng)
      : null;

  const compassDir = bearingAngle !== null ? getCompassDirection(bearingAngle) : '---';
  const walkMinutes = distanceMeters !== null ? calculateWalkTimeMinutes(distanceMeters) : 0;

  return (
    <div
      className={`p-4 h-full overflow-y-auto ${
        isDarkMode ? 'bg-stone-900 text-stone-100' : 'bg-stone-50 text-stone-900'
      }`}
    >
      {/* Header */}
      <div className="pb-4 border-b border-stone-800">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-lg bg-purple-600/20 border border-purple-500/40 text-purple-400 flex items-center justify-center font-bold">
            📏
          </div>
          <h2 className="text-xl font-bold font-sans tracking-wide">
            {language === 'fi' ? 'ETÄISYYS- & KOMPASSI-MITTARI' : 'DISTANCE & COMPASS RULER'}
          </h2>
        </div>
        <p className="text-xs text-stone-400 mt-0.5">
          {language === 'fi'
            ? 'Laske etäisyys, kompassisuunta ja maastokävelyaika koiriin ja passeihin'
            : 'Calculate distance, bearing, and estimated walking time to dogs and stands'}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        {/* Target Picker */}
        <div
          className={`p-5 rounded-2xl border ${
            isDarkMode ? 'bg-stone-800/80 border-stone-700' : 'bg-white border-stone-200'
          } shadow-lg space-y-4`}
        >
          <h3 className="font-bold text-sm uppercase text-stone-400">Valitse kohde:</h3>

          <select
            value={selectedTargetKey}
            onChange={(e) => {
              setSelectedTargetKey(e.target.value);
            }}
            className="w-full p-3 rounded-xl bg-stone-900 border border-stone-700 text-amber-400 font-bold text-sm focus:outline-none"
          >
            <optgroup label="🐕 Koirat">
              {dogs.map((d) => (
                <option key={d.id} value={d.id}>
                  Koira: {d.name} ({d.breed})
                </option>
              ))}
            </optgroup>
            <optgroup label="📍 Passit & Havainnot">
              {annotations.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title}
                </option>
              ))}
            </optgroup>
          </select>

          {/* Toggle Active Line on Map */}
          {targetItem && (
            <button
              onClick={() => {
                if (activeRulerPoint?.title === targetItem?.title) {
                  setActiveRulerPoint(null);
                } else {
                  setActiveRulerPoint(targetItem);
                }
              }}
              className={`w-full py-3 rounded-xl font-bold text-xs transition flex items-center justify-center space-x-2 shadow-md ${
                activeRulerPoint?.title === targetItem.title
                  ? 'bg-purple-600 text-white'
                  : 'bg-stone-700 hover:bg-stone-600 text-purple-300'
              }`}
            >
              <Navigation className="w-4 h-4" />
              <span>
                {activeRulerPoint?.title === targetItem.title
                  ? 'Piilotettu mittauslinja kartalta'
                  : 'Piirrä mittauslinja kartalle'}
              </span>
            </button>
          )}
        </div>

        {/* Calculation Results Card */}
        <div
          className={`p-5 rounded-2xl border ${
            isDarkMode ? 'bg-stone-800/80 border-stone-700' : 'bg-white border-stone-200'
          } shadow-lg space-y-4`}
        >
          <h3 className="font-bold text-sm uppercase text-stone-400">Mittaustulokset:</h3>

          <div className="grid grid-cols-2 gap-3">
            {/* Distance */}
            <div className="p-3.5 rounded-xl bg-stone-900/60 border border-stone-700/60">
              <span className="text-[10px] font-bold text-stone-400 uppercase">Etäisyys</span>
              <div className="text-2xl font-black text-amber-400 mt-1">
                {distanceMeters !== null ? formatDistance(distanceMeters) : 'Sijainti puuttuu'}
              </div>
            </div>

            {/* Bearing Angle */}
            <div className="p-3.5 rounded-xl bg-stone-900/60 border border-stone-700/60">
              <span className="text-[10px] font-bold text-stone-400 uppercase">Kompassisuunta</span>
              <div className="text-2xl font-black text-purple-400 mt-1">
                {bearingAngle !== null ? `${bearingAngle}°` : '---'}
              </div>
              <div className="text-xs text-stone-400 font-semibold">{compassDir}</div>
            </div>

            {/* Estimated Walking Time */}
            <div className="p-3.5 rounded-xl bg-stone-900/60 border border-stone-700/60 col-span-2 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-stone-400 uppercase">
                  Arvioitu maastokävelyaika (~4 km/h)
                </span>
                <div className="text-xl font-bold text-emerald-400 mt-0.5">
                  ~ {walkMinutes} minuuttia
                </div>
              </div>
              <Footprints className="w-8 h-8 text-emerald-500 opacity-60" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
