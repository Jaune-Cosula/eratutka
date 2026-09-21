import React, { useMemo } from 'react';
import { Dog, UserLocation } from '../../types';
import { calculateDistance, calculateBearing, formatDistance } from '../../utils/geoUtils';
import { Compass, Battery, Clock, User, Trash2 } from 'lucide-react';
import { formatTimeAgo } from '../DogRadarPanel';

interface RadarCollarCardListProps {
  dogs: Dog[];
  selectedDogId: string | null;
  setSelectedDogId: (id: string | null) => void;
  userLocation: UserLocation | null;
  isDarkMode: boolean;
  onAddDog: () => void;
  onDeleteDog?: (dogId: string) => void;
  /** Dogs this hunter has hidden from their own map. Personal and per hunt. */
  hiddenDogIds?: string[];
  onToggleDogVisibility?: (dogId: string) => void;
}

export const RadarCollarCardList: React.FC<RadarCollarCardListProps> = ({
  dogs,
  selectedDogId,
  setSelectedDogId,
  userLocation,
  isDarkMode,
  onAddDog,
  onDeleteDog,
  hiddenDogIds = [],
  onToggleDogVisibility,
}) => {
  const sortedDogs = useMemo(() => {
    if (!selectedDogId) return dogs;
    return [...dogs].sort((a, b) => {
      if (a.id === selectedDogId) return -1;
      if (b.id === selectedDogId) return 1;
      return 0;
    });
  }, [dogs, selectedDogId]);

  return (
    <div className="lg:col-span-1 space-y-3">
      <h3 className="text-xs font-bold uppercase tracking-wider text-stone-400 px-1">
        Kytketyt pannat ({dogs.length})
        {hiddenDogIds.length > 0 && (
          <span className="normal-case font-semibold text-stone-500">
            {' '}• {hiddenDogIds.length} piilotettu
          </span>
        )}
      </h3>

      {dogs.length === 0 ? (
        <div
          className={`p-6 rounded-2xl border text-center space-y-3 ${
            isDarkMode ? 'bg-stone-800/40 border-stone-800 text-stone-400' : 'bg-stone-100 border-stone-200 text-stone-600'
          }`}
        >
          <div className="w-12 h-12 rounded-full bg-amber-500/10 text-amber-400 mx-auto flex items-center justify-center text-2xl font-bold">
            📡
          </div>
          <div>
            <p className="font-bold text-sm text-stone-200">Ei pantoja kytkettynä</p>
            <p className="text-xs text-stone-400 mt-1">
              Kytke koiran GPS-panta painamalla ”+ Kytke GPS-panta” ja syötä pannan ID tai IMEI.
            </p>
          </div>
          <button
            onClick={onAddDog}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs rounded-xl shadow transition cursor-pointer"
          >
            + Kytke GPS-panta
          </button>
        </div>
      ) : (
        sortedDogs.map((dog) => {
          const isSelected = selectedDogId === dog.id;
          const dist = userLocation
            ? calculateDistance(userLocation.lat, userLocation.lng, dog.lat, dog.lng)
            : null;
          const bearing = userLocation
            ? calculateBearing(userLocation.lat, userLocation.lng, dog.lat, dog.lng)
            : null;

          const isCat = Boolean(
            dog.breed?.toLowerCase().includes('kissa') ||
            dog.name?.toLowerCase().includes('kissa') ||
            dog.trackerModel?.toLowerCase().includes('kissa') ||
            dog.trackerModel?.toLowerCase().includes('tractive') ||
            dog.collarId?.toLowerCase().includes('cat') ||
            dog.notes?.toLowerCase().includes('kissa')
          );

          const isHidden = hiddenDogIds.includes(dog.id);

          return (
            <div
              key={dog.id}
              onClick={() => setSelectedDogId(dog.id)}
              className={`p-3.5 rounded-2xl border transition-all cursor-pointer relative overflow-hidden ${
                isHidden ? 'opacity-60' : ''
              } ${
                isSelected
                  ? isDarkMode
                    ? 'bg-stone-800 border-amber-500/80 ring-2 ring-amber-500/30 shadow-xl'
                    : 'bg-amber-50 border-amber-500 ring-2 ring-amber-500/20 shadow-lg'
                  : isDarkMode
                  ? 'bg-stone-800/40 border-stone-800 hover:bg-stone-800/70'
                  : 'bg-white border-stone-200 hover:bg-stone-100'
              }`}
            >
              {/* Dog Header */}
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-lg shadow-md border shrink-0"
                    style={{ backgroundColor: dog.color }}
                  >
                    {isCat ? '🐱' : '🐕'}
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <h4 className="font-extrabold text-base">{dog.name}</h4>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-stone-700/50 text-amber-300 border border-stone-600/50">
                        {dog.trackerModel || dog.collarId}
                      </span>
                    </div>
                    <p className="text-xs text-stone-400">
                      {dog.breed} {dog.imei ? `• IMEI: ${dog.imei.slice(-6)}` : ''}
                    </p>
                    {dog.addedBy && (
                      <p className="text-[11px] text-amber-400 font-medium flex items-center space-x-1 mt-0.5">
                        <User className="w-3 h-3 text-amber-400" />
                        <span>Lisännyt: <strong>{dog.addedBy}</strong></span>
                      </p>
                    )}
                  </div>
                </div>

                {/* Status Pill & Actions */}
                <div className="flex items-start space-x-2">
                  <div className="flex flex-col items-end space-y-1">
                    <div>
                      {dog.status === 'haukkuu' && (
                        <span className="px-2.5 py-1 rounded-full bg-red-600 text-white font-black text-xs animate-pulse shadow-md flex items-center space-x-1">
                          <span>🔊 {dog.barkRate} HKM</span>
                          {dog.speed >= 1.5 ? (
                            <span className="text-[9px] bg-amber-400 text-stone-950 font-black px-1.5 py-0.5 rounded shadow whitespace-nowrap">
                              🏃 AJO ({dog.speed} km/h)
                            </span>
                          ) : dog.barkHoldRemainingFixes && dog.barkHoldRemainingFixes > 0 ? (
                            <span className="text-[10px] text-amber-200 bg-red-800/80 px-1 rounded">
                              Pito {dog.barkHoldRemainingFixes}/3
                            </span>
                          ) : (
                            <span className="text-[10px] text-amber-200">({dog.speed} km/h)</span>
                          )}
                        </span>
                      )}
                      {dog.status === 'seisoo' && (
                        <span className="px-2.5 py-1 rounded-full bg-amber-500 text-stone-950 font-black text-xs shadow-md">
                          🛑 SEISOO (0 km/h)
                        </span>
                      )}
                      {(dog.status === 'juoksee' || dog.status === 'liikkeessä') && (
                        <span className="px-2 py-1 rounded-full bg-sky-600/30 text-sky-400 font-bold text-xs border border-sky-500/40">
                          🏃 {dog.speed} km/h
                        </span>
                      )}
                      {dog.status === 'paikallaan' && (
                        <span className="px-2 py-1 rounded-full bg-stone-700 text-stone-300 font-medium text-xs">
                          ⏸️ 0 km/h
                        </span>
                      )}
                    </div>
                    {dist !== null && (
                      <span className="text-[11px] font-mono font-bold text-amber-400 flex items-center space-x-1">
                        <span>📍 {formatDistance(dist)}</span>
                        {bearing !== null && <span className="text-[10px] text-stone-400">({bearing}°)</span>}
                      </span>
                    )}
                  </div>

                  {onDeleteDog && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm(`Haluatko varmasti poistaa pannan/seurantakohteen "${dog.name}"?`)) {
                          onDeleteDog(dog.id);
                        }
                      }}
                      className="p-1.5 rounded-lg text-stone-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title="Poista laite"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Telemetry quick strip */}
              <div className="mt-3 pt-2 border-t border-stone-700/40 flex flex-col space-y-1.5 text-xs font-mono text-stone-300">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1 text-amber-300 font-bold">
                    <Compass className="w-3.5 h-3.5 text-amber-400" />
                    <span>
                      📍 {dist !== null ? formatDistance(dist) : '---'}
                      {bearing !== null ? ` (${bearing}°)` : ''}
                    </span>
                  </div>

                  <div className="flex items-center space-x-1 text-sky-300 font-bold">
                    <span>🏃 {dog.speed} km/h</span>
                  </div>

                  <div className="flex items-center space-x-2">
                    <span className="flex items-center space-x-1">
                      <Battery className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{dog.battery}%</span>
                    </span>
                  </div>
                </div>

                {/* Last updated timestamp */}
                <div className="flex items-center justify-between text-[11px] pt-1 border-t border-stone-800/60 font-sans">
                  <span className="flex items-center space-x-1 text-emerald-400">
                    <Clock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>Paikkatieto: <strong className="text-emerald-300 font-bold">{formatTimeAgo(dog.lastUpdated)}</strong></span>
                  </span>
                </div>

                {/* Visibility toggle. Purely personal and per hunt: it only controls what is
                    drawn on this hunter's own map, never what the rest of the party sees, and
                    the collar keeps being polled and its track recorded while hidden. */}
                {onToggleDogVisibility && (
                  <label
                    onClick={(e) => e.stopPropagation()}
                    className="mt-2 pt-2 border-t border-stone-700/40 flex items-center space-x-2 text-xs font-bold cursor-pointer select-none"
                  >
                    <input
                      type="checkbox"
                      checked={!isHidden}
                      onChange={() => onToggleDogVisibility(dog.id)}
                      className="w-4 h-4 rounded accent-amber-500 cursor-pointer shrink-0"
                    />
                    <span className={isHidden ? 'text-stone-500' : 'text-emerald-400'}>
                      {isHidden ? 'Piilotettu kartalta' : 'Näytä kartalla'}
                    </span>
                  </label>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
};
