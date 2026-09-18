import React from 'react';
import { Dog } from '../../types';

interface CollarTrackHistoryLogProps {
  trackHistory?: Dog['trackHistory'];
}

export const CollarTrackHistoryLog: React.FC<CollarTrackHistoryLogProps> = ({
  trackHistory = [],
}) => {
  return (
    <div className="mt-5">
      <h4 className="text-xs font-bold uppercase tracking-wider text-stone-400 mb-2">
        Reittihistoria & Lokipisteet ({trackHistory.length} kpl)
      </h4>
      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
        {trackHistory.map((pt, idx) => (
          <div
            key={idx}
            className="flex items-center justify-between text-xs font-mono p-2 rounded-lg bg-stone-900/50 border border-stone-800 text-stone-300"
          >
            <div className="flex items-center space-x-2">
              <span className="text-stone-500">#{idx + 1}</span>
              <span>
                {new Date(pt.timestamp).toLocaleTimeString('fi-FI', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </span>
              <span className="text-stone-400">
                ({pt.lat.toFixed(4)}°, {pt.lng.toFixed(4)}°)
              </span>
            </div>
            <div className="flex items-center space-x-3">
              <span className="text-sky-400">{pt.speed} km/h</span>
              <span className="text-red-400 font-bold">{pt.barkRate} hkm/m</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
