import React, { useState } from 'react';
import { UserLocation } from '../types';
import { wgs84ToEtrsTm35Fin } from '../utils/geoUtils';
import { AlertTriangle, Copy, Check, Phone, ShieldAlert, X } from 'lucide-react';

interface SosModalProps {
  userLocation: UserLocation | null;
  onClose: () => void;
  isDarkMode: boolean;
}

export const SosModal: React.FC<SosModalProps> = ({ userLocation, onClose, isDarkMode }) => {
  const [copied, setCopied] = useState(false);

  const lat = userLocation ? userLocation.lat : 63.854;
  const lng = userLocation ? userLocation.lng : 29.812;

  const etrs = wgs84ToEtrsTm35Fin(lat, lng);

  const sosText = `HÄTÄ-SOS: Sijainti ${etrs.text} (WGS84: ${lat.toFixed(6)}°, ${lng.toFixed(6)}°). Tarvitaan apua maastossa!`;

  const handleCopy = () => {
    navigator.clipboard.writeText(sosText);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[3000] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in overflow-y-auto"
    >
      <div
        className={`w-full max-w-lg rounded-3xl border ${
          isDarkMode ? 'bg-stone-900 border-red-800 text-stone-100' : 'bg-white border-red-300 text-stone-900'
        } p-5 sm:p-6 shadow-2xl relative my-auto overflow-hidden`}
      >
        {/* Emergency top accent bar */}
        <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-red-600 via-amber-500 to-red-600"></div>

        <button
          type="button"
          onClick={onClose}
          className="absolute top-3.5 right-3.5 sm:top-4 sm:right-4 p-2 rounded-full bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 shadow-md transition cursor-pointer active:scale-95"
          title="Sulje ikkuna"
          aria-label="Sulje ikkuna"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-3 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-red-600 text-white flex items-center justify-center font-black text-xl shadow-lg shrink-0">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <div>
            <h3 className="text-lg sm:text-xl font-extrabold text-red-500 tracking-wide uppercase leading-tight">
              112 HÄTÄSIJAINTI & SOS
            </h3>
            <p className="text-xs text-stone-400">
              Viralliset maastokoordinaatit hätäkeskukselle ja pelastuspalvelulle
            </p>
          </div>
        </div>

        {/* Coordinates Display Card */}
        <div className="p-4 rounded-2xl bg-stone-950/80 border border-red-900/60 font-mono text-stone-100 space-y-2 my-4 shadow-inner">
          <div>
            <span className="text-xs font-bold text-amber-400 uppercase">ETRS-TM35FIN (Virallinen):</span>
            <div className="text-lg font-black text-white">{etrs.text}</div>
          </div>

          <div className="pt-2 border-t border-stone-800">
            <span className="text-xs font-bold text-sky-400 uppercase">WGS84 GPS:</span>
            <div className="text-sm font-bold text-stone-300">
              N {lat.toFixed(6)}° • E {lng.toFixed(6)}°
            </div>
          </div>
        </div>

        {/* Copy & Share Button */}
        <div className="space-y-2.5">
          <button
            type="button"
            onClick={handleCopy}
            className="w-full py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-extrabold text-sm transition flex items-center justify-center space-x-2 shadow-lg cursor-pointer active:scale-98"
          >
            {copied ? <Check className="w-5 h-5 text-emerald-950" /> : <Copy className="w-5 h-5" />}
            <span>{copied ? 'Kopioitu leikepöydälle!' : 'Kopioi hätäteksti & koordinaatit'}</span>
          </button>

          <a
            href="tel:112"
            className="w-full py-3 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-extrabold text-sm transition flex items-center justify-center space-x-2 shadow-lg text-center block cursor-pointer active:scale-98"
          >
            <Phone className="w-5 h-5" />
            <span>Soita Hätäkeskukseen (112)</span>
          </a>

          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-stone-800/80 hover:bg-stone-800 text-stone-300 text-xs font-bold transition text-center cursor-pointer active:scale-98"
          >
            Sulje ikkuna
          </button>
        </div>
      </div>
    </div>
  );
};
