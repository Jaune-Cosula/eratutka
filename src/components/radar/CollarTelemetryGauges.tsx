import React from 'react';
import { Dog, UserLocation } from '../../types';
import { useLanguage } from '../../context/LanguageContext';
import { calculateDistance, calculateBearing, formatDistance, getCompassDirection, calculateDogTotalDistance } from '../../utils/geoUtils';
import { RotateCcw, Battery, Signal } from 'lucide-react';

interface CollarTelemetryGaugesProps {
  dog: Dog;
  userLocation: UserLocation | null;
  onUpdateDogTelemetry?: (dogId: string, updates: Partial<Dog>) => void;
}

export const CollarTelemetryGauges: React.FC<CollarTelemetryGaugesProps> = ({
  dog,
  userLocation,
  onUpdateDogTelemetry,
}) => {
  const { t } = useLanguage();

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 mt-4">
      {/* Gauge 1: Bark Rate */}
      <div className="p-3 rounded-xl bg-stone-900/60 border border-stone-700/60 text-center relative overflow-hidden">
        <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wider flex items-center justify-center space-x-1">
          <span>{t.barkRate}</span>
          {dog.barkHoldRemainingFixes && dog.barkHoldRemainingFixes > 0 ? (
            <span className="text-[9px] text-amber-400 font-semibold bg-amber-950/80 px-1.5 py-0.2 rounded border border-amber-500/40">
              Tauko {dog.barkHoldRemainingFixes}/3
            </span>
          ) : null}
        </div>
        <div className="text-2xl font-black text-red-500 mt-1 flex items-center justify-center space-x-1">
          <span>{dog.barkRate}</span>
          <span className="text-xs text-stone-400 font-normal">hkm/m</span>
        </div>
        <div className="w-full bg-stone-800 rounded-full h-1.5 mt-2 overflow-hidden">
          <div
            className="bg-red-500 h-1.5 rounded-full transition-all duration-300"
            style={{ width: `${Math.min(100, (dog.barkRate / 110) * 100)}%` }}
          ></div>
        </div>
        {dog.barkHoldRemainingFixes && dog.barkHoldRemainingFixes > 0 ? (
          <div className="text-[10px] text-amber-300 font-mono mt-1">
            ⏱️ Tauon pito ({dog.barkHoldRemainingFixes}/3 pk)
          </div>
        ) : null}
      </div>

      {/* Gauge 2: Speed */}
      <div className="p-3 rounded-xl bg-stone-900/60 border border-stone-700/60 text-center">
        <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">
          {t.speed}
        </div>
        <div className="text-2xl font-black text-sky-400 mt-1 flex items-center justify-center space-x-1">
          <span>{dog.speed}</span>
          <span className="text-xs text-stone-400 font-normal">km/h</span>
        </div>
        <div className="w-full bg-stone-800 rounded-full h-1.5 mt-2 overflow-hidden">
          <div
            className="bg-sky-400 h-1.5 rounded-full transition-all duration-300"
            style={{ width: `${Math.min(100, (dog.speed / 30) * 100)}%` }}
          ></div>
        </div>
      </div>

      {/* Gauge 3: Odometer / Total Distance & Reset Button */}
      <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/40 text-center flex flex-col justify-between">
        <div>
          <div className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">
            {t.totalDistance}
          </div>
          <div className="text-xl font-black text-amber-300 mt-1">
            {formatDistance(calculateDogTotalDistance(dog))}
          </div>
          <div className="text-[9px] text-stone-400 font-mono mt-0.5">
            (12 h aktiivinen jälki)
          </div>
        </div>
        {onUpdateDogTelemetry && (
          <button
            onClick={() =>
              onUpdateDogTelemetry(dog.id, {
                odometerResetTimestamp: Date.now(),
              })
            }
            className="mt-2 py-1 px-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/40 text-amber-300 border border-amber-500/50 text-[10px] font-bold transition flex items-center justify-center space-x-1 cursor-pointer"
            title={t.resetOdometer}
          >
            <RotateCcw className="w-3 h-3" />
            <span>{t.resetOdometer}</span>
          </button>
        )}
      </div>

      {/* Gauge 4: Distance from User */}
      <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-500/40 text-center">
        <div className="text-[10px] font-bold text-amber-400 uppercase tracking-wider flex items-center justify-center space-x-1">
          <span>📍</span>
          <span>{t.distance} (Omaan pisteeseen)</span>
        </div>
        <div className="text-xl font-black text-amber-300 mt-1 font-mono">
          {userLocation
            ? formatDistance(
                calculateDistance(
                  userLocation.lat,
                  userLocation.lng,
                  dog.lat,
                  dog.lng
                )
              )
            : '---'}
        </div>
        <div className="text-[10px] text-amber-200/80 mt-1 font-mono">
          {userLocation
            ? `${calculateBearing(userLocation.lat, userLocation.lng, dog.lat, dog.lng)}° (${getCompassDirection(
                calculateBearing(
                  userLocation.lat,
                  userLocation.lng,
                  dog.lat,
                  dog.lng
                )
              )})`
            : t.bearing}
        </div>
      </div>

      {/* Gauge 5: Battery & GPS Signal */}
      <div className="p-3 rounded-xl bg-stone-900/60 border border-stone-700/60 text-center">
        <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">
          {t.battery} & {t.dogStatus}
        </div>
        <div className="text-lg font-bold text-emerald-400 mt-1 flex items-center justify-center space-x-2">
          <span className="flex items-center space-x-1">
            <Battery className="w-4 h-4" />
            <span>{dog.battery}%</span>
          </span>
        </div>
        <div className="text-xs text-sky-400 font-semibold mt-1 flex items-center justify-center space-x-1">
          <Signal className="w-3.5 h-3.5" />
          <span>{dog.signal}% (4G Sat)</span>
        </div>
      </div>
    </div>
  );
};
