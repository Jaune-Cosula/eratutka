import React from 'react';
import { TeamMember, UserLocation } from '../../types';
import { calculateDistance, calculateBearing, formatDistance, getCompassDirection } from '../../utils/geoUtils';
import { Users, ExternalLink, Phone, Battery, Compass, Trash2 } from 'lucide-react';

interface HunterRadarViewProps {
  team: TeamMember[];
  selectedHunterId: string | null;
  setSelectedHunterId?: (id: string | null) => void;
  userLocation: UserLocation | null;
  onFocusOnMap?: (lat: number, lng: number) => void;
  onDeleteHunter?: (hunterId: string) => void;
  isJahtimestari?: boolean;
}

export const HunterRadarView: React.FC<HunterRadarViewProps> = ({
  team,
  selectedHunterId,
  setSelectedHunterId,
  userLocation,
  onFocusOnMap,
  onDeleteHunter,
  isJahtimestari = false,
}) => {
  const selectedHunter = team.find((h) => h.id === selectedHunterId) || (team.length > 0 ? team[0] : null);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left Hunter List */}
      <div className="lg:col-span-1 space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-sky-400 px-1 flex items-center space-x-1">
          <Users className="w-3.5 h-3.5" />
          <span>Valitse seurattava metsästäjä ({team.length})</span>
        </h3>

        {team.length === 0 ? (
          <div className="p-6 rounded-2xl border border-stone-800 bg-stone-800/40 text-stone-400 text-center">
            Ei muita metsästäjiä jahdissa.
          </div>
        ) : (
          team.map((hunter) => {
            const isSelected = selectedHunter?.id === hunter.id;
            const dist = userLocation
              ? calculateDistance(userLocation.lat, userLocation.lng, hunter.lat, hunter.lng)
              : null;
            const bearing = userLocation
              ? calculateBearing(userLocation.lat, userLocation.lng, hunter.lat, hunter.lng)
              : null;

            return (
              <div
                key={hunter.id}
                onClick={() => setSelectedHunterId && setSelectedHunterId(hunter.id)}
                className={`p-3.5 rounded-2xl border transition-all cursor-pointer relative ${
                  isSelected
                    ? 'bg-sky-950/70 border-sky-500 ring-2 ring-sky-500/30 shadow-xl'
                    : 'bg-stone-800/40 border-stone-800 hover:bg-stone-800/80'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-xl bg-sky-600 text-white font-bold flex items-center justify-center text-lg shadow-md border border-white">
                      🎯
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-stone-100">{hunter.name}</h4>
                      <span className="text-[11px] font-bold text-sky-400">
                        {hunter.role === 'koiramies'
                          ? '🐕 Koiramies'
                          : hunter.role === 'päällikkö'
                          ? '👑 Jahtipäällikkö'
                          : '🎯 Passimies'}
                      </span>
                    </div>
                  </div>

                  <span className="px-2 py-0.5 rounded-full bg-stone-900 border border-stone-700 text-[10px] font-bold text-amber-400">
                    {hunter.status === 'passissa'
                      ? '🎯 Passissa'
                      : hunter.status === 'liikkeella'
                      ? '🚶 Liikkeellä'
                      : '☕ Tauolla'}
                  </span>
                </div>

                <div className="mt-2.5 pt-2 border-t border-stone-800 flex items-center justify-between text-xs font-mono text-stone-300">
                  <span className="text-amber-300 font-bold">
                    📏 {dist !== null ? formatDistance(dist) : '---'} {bearing !== null ? `(${getCompassDirection(bearing)})` : ''}
                  </span>
                  <span className="text-emerald-400 text-[11px] font-sans">
                    🔋 {hunter.battery || 100}%
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Right Hunter Detailed Telemetry Radar */}
      <div className="lg:col-span-2">
        {!selectedHunter ? (
          <div className="p-12 rounded-2xl border border-dashed border-stone-800 text-stone-500 text-center">
            Valitse metsästäjä seurantaan.
          </div>
        ) : (
          <div className="p-5 rounded-2xl bg-stone-800/90 border border-sky-500/40 shadow-2xl space-y-5">
            {/* Hunter Header */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-stone-700">
              <div className="flex items-center space-x-3">
                <div className="w-14 h-14 rounded-2xl bg-sky-600 text-white flex items-center justify-center text-3xl font-bold shadow-lg border-2 border-white">
                  🎯
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="text-2xl font-black text-white">{selectedHunter.name}</h3>
                    <span className="px-2.5 py-0.5 rounded-full bg-sky-950 text-sky-300 border border-sky-600/50 text-xs font-bold">
                      {selectedHunter.role}
                    </span>
                  </div>
                  <p className="text-xs font-mono text-stone-400 mt-1">
                    Tila: <strong className="text-amber-400">{selectedHunter.status}</strong> • Passipaikka: {selectedHunter.standName || 'Ei asetettu'}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {onFocusOnMap && (
                  <button
                    onClick={() => {
                      onFocusOnMap(selectedHunter.lat, selectedHunter.lng);
                    }}
                    className="px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs transition flex items-center space-x-1.5 shadow cursor-pointer"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>Näytä kartalla</span>
                  </button>
                )}

                {selectedHunter.phone && (
                  <a
                    href={`tel:${selectedHunter.phone}`}
                    className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition flex items-center space-x-1 shadow"
                  >
                    <Phone className="w-4 h-4" />
                    <span>Soita ({selectedHunter.phone})</span>
                  </a>
                )}

                {(isJahtimestari || onDeleteHunter) && onDeleteHunter && (
                  <button
                    onClick={() => {
                      if (window.confirm(`Haluatko varmasti poistaa metsästäjän "${selectedHunter.name}" jahdista?`)) {
                        onDeleteHunter(selectedHunter.id);
                      }
                    }}
                    className="px-3 py-2 rounded-xl bg-red-950/70 hover:bg-red-900 text-red-300 border border-red-700/60 text-xs font-bold transition flex items-center space-x-1 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4 text-red-400" />
                    <span>Poista jäsen</span>
                  </button>
                )}
              </div>
            </div>

            {/* Hunter Telemetry Details */}
            {userLocation && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded-xl bg-stone-900 border border-stone-800">
                  <div className="text-[10px] uppercase font-bold text-stone-400 mb-1">Etäisyys sinusta</div>
                  <div className="text-xl font-bold text-amber-400 font-mono">
                    {formatDistance(
                      calculateDistance(userLocation.lat, userLocation.lng, selectedHunter.lat, selectedHunter.lng)
                    )}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-stone-900 border border-stone-800">
                  <div className="text-[10px] uppercase font-bold text-stone-400 mb-1">Suuntima & Kompassi</div>
                  <div className="text-xl font-bold text-sky-400 font-mono flex items-center space-x-1">
                    <Compass className="w-5 h-5 text-sky-400" />
                    <span>
                      {calculateBearing(userLocation.lat, userLocation.lng, selectedHunter.lat, selectedHunter.lng)}° ({getCompassDirection(calculateBearing(userLocation.lat, userLocation.lng, selectedHunter.lat, selectedHunter.lng))})
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-stone-900 border border-stone-800">
                  <div className="text-[10px] uppercase font-bold text-stone-400 mb-1">Puhelimen akku</div>
                  <div className="text-xl font-bold text-emerald-400 font-mono flex items-center justify-center space-x-1">
                    <Battery className="w-5 h-5 text-emerald-400" />
                    <span>{selectedHunter.battery || 100}%</span>
                  </div>
                </div>
              </div>
            )}

            <div className="p-4 rounded-xl bg-sky-500/10 border border-sky-500/30 text-xs text-sky-200 leading-relaxed">
              💡 <strong>Ihmisen seuranta päällä:</strong> Kartta ja suuntakompassi lukittuvat seurattavaan metsästäjään (<strong>{selectedHunter.name}</strong>). Voit milloin tahansa vaihtaa takaisin koiratutkaan yläpalkin painikkeella.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
