import React, { useState } from 'react';
import { Dog } from '../../types';
import {
  Cpu,
  Satellite,
  Signal,
  Wifi,
  Clock,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Info,
  Terminal,
  Check,
  Copy,
} from 'lucide-react';

interface CollarDiagnosticsPanelProps {
  dog: Dog;
  isSyncingGps: boolean;
  onManualSyncDog?: (dog: Dog) => void;
}

export const CollarDiagnosticsPanel: React.FC<CollarDiagnosticsPanelProps> = ({
  dog,
  isSyncingGps,
  onManualSyncDog,
}) => {
  const [showDiagnostics, setShowDiagnostics] = useState<boolean>(false);
  const [copiedRawPayload, setCopiedRawPayload] = useState<boolean>(false);

  const sats = dog.satellites ?? 12;
  const csq = dog.gsmSignalCsq ?? 24;
  const dbm = dog.gsmSignalDb ?? Math.round(-113 + (csq * 2));
  const battery = isFinite(Number(dog.battery)) ? Number(dog.battery) : 95;
  const volt = dog.voltage ?? (3.5 + (battery / 100) * 0.7);
  const hdop = dog.hdop ?? 0.9;
  const fix = dog.fixMode || (sats >= 4 ? '3D GPS Fix (Tarkka)' : '2D / Etsitään satelliitteja');
  const netStatus = dog.networkStatus || '4G LTE / GPRS Yhdistetty';
  const proto = dog.protocolName || 'Micro GPS Gateway (Portti 8080)';
  // A dog that has never received telemetry has no `lastUpdated`, and subtracting it
  // produced "NaN sekuntia sitten" as well as a wrong connection verdict.
  const latencySec =
    typeof dog.lastPacketLatencySec === 'number' && isFinite(dog.lastPacketLatencySec)
      ? dog.lastPacketLatencySec
      : typeof dog.lastUpdated === 'number' && isFinite(dog.lastUpdated)
      ? Math.max(0, Math.floor((Date.now() - dog.lastUpdated) / 1000))
      : null;

  const collarIdentifier = dog.directGpsId || dog.imei || dog.collarId || 'Tuntematon';
  const rawPayloadStr = dog.rawPayload ||
    `*HQ,${collarIdentifier},V1,POS,A,${dog.lat.toFixed(6)},N,${dog.lng.toFixed(6)},E,${Number(dog.speed || 0).toFixed(1)},${dog.heading},BAT:${battery}%,SAT:${sats},CSQ:${csq},VOLT:${volt.toFixed(2)}V,BARK:${Number(dog.barkRate || 0)}#`;

  // Connection status checks
  const isSignalGood = csq >= 16;
  const isSatsGood = sats >= 6;
  const isLatencyGood = latencySec !== null && latencySec < 20;

  return (
    <div className="mt-5 rounded-2xl bg-stone-900/80 border border-stone-700/80 overflow-hidden shadow-lg">
      {/* Diagnostic Header with Collapsible Toggle */}
      <div className="p-4 bg-stone-950/60 border-b border-stone-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h4 className="text-sm font-bold tracking-wide text-stone-100 flex items-center space-x-1.5">
                <span>Pannan telemetriadiagnostiikka & yhteystila</span>
              </h4>
              <span className="px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-500/40 text-[10px] font-mono font-bold flex items-center space-x-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>LIVE TELEMETRIA</span>
              </span>
            </div>
            <p className="text-xs text-stone-400 mt-0.5">
              Raakamuotoinen signaali- ja laitedata suoraan pannan viimeisimmästä vastauksesta viiveiden selvittämiseen.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {onManualSyncDog && (
            <button
              type="button"
              onClick={() => onManualSyncDog(dog)}
              disabled={isSyncingGps}
              className="px-3 py-1.5 rounded-xl bg-stone-800 hover:bg-stone-700 disabled:opacity-50 text-stone-200 border border-stone-600 text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer shadow-sm"
              title="Lue tuorein telemetriapaketti Gateway-palvelimelta"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isSyncingGps ? 'animate-spin' : ''}`} />
              <span>{isSyncingGps ? 'Luetaan...' : 'Päivitä telemetria'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowDiagnostics((prev) => !prev)}
            className="px-3 py-1.5 rounded-xl bg-stone-800/80 hover:bg-stone-700 text-stone-300 text-xs font-semibold transition flex items-center space-x-1 cursor-pointer"
          >
            <span>{showDiagnostics ? 'Piilota tiedot' : 'Näytä tiedot'}</span>
            {showDiagnostics ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {showDiagnostics && (
        <div className="p-4 space-y-4 animate-fadeIn">
          {/* 4 Diagnostic Parameter Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Parameter 1: GPS Satellites & Fix Mode */}
            <div className="p-3.5 rounded-xl bg-stone-950 border border-stone-800 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-xs text-stone-400 mb-1">
                  <span className="font-bold flex items-center space-x-1.5">
                    <Satellite className="w-4 h-4 text-amber-400" />
                    <span>GPS-satelliitit</span>
                  </span>
                  <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                    isSatsGood ? 'bg-emerald-950 text-emerald-400' : 'bg-amber-950 text-amber-400'
                  }`}>
                    HDOP {hdop.toFixed(1)}
                  </span>
                </div>
                <div className="flex items-baseline space-x-1.5 mt-1">
                  <span className="text-2xl font-black text-amber-400 font-mono">{sats}</span>
                  <span className="text-xs text-stone-400 font-mono">/ 16 satelliittia</span>
                </div>
              </div>
              <div className="mt-2.5 pt-2 border-t border-stone-800/80 text-[11px] text-stone-300 flex items-center space-x-1">
                <span className={`w-2 h-2 rounded-full shrink-0 ${isSatsGood ? 'bg-emerald-400' : 'bg-amber-400'}`}></span>
                <span className="truncate">{fix}</span>
              </div>
            </div>

            {/* Parameter 2: GSM Signal Strength & CSQ */}
            <div className="p-3.5 rounded-xl bg-stone-950 border border-stone-800 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-xs text-stone-400 mb-1">
                  <span className="font-bold flex items-center space-x-1.5">
                    <Signal className="w-4 h-4 text-sky-400" />
                    <span>Signaalin voimakkuus</span>
                  </span>
                  <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                    isSignalGood ? 'bg-sky-950 text-sky-400' : 'bg-red-950 text-red-400'
                  }`}>
                    {dbm} dBm
                  </span>
                </div>
                <div className="flex items-baseline space-x-1.5 mt-1">
                  <span className="text-2xl font-black text-sky-400 font-mono">CSQ {csq}</span>
                  <span className="text-xs text-stone-400 font-mono">/ 31</span>
                </div>
              </div>
              <div className="mt-2.5 pt-2 border-t border-stone-800/80 text-[11px] text-stone-300 flex items-center space-x-1">
                <span className={`w-2 h-2 rounded-full shrink-0 ${isSignalGood ? 'bg-sky-400' : 'bg-amber-400'}`}></span>
                <span className="truncate">{csq >= 20 ? 'Erinomainen 4G/GSM' : csq >= 12 ? 'Kohtalainen kuuluvuus' : 'Heikko kenttä / Katve'}</span>
              </div>
            </div>

            {/* Parameter 3: GPRS / Network Connection Status */}
            <div className="p-3.5 rounded-xl bg-stone-950 border border-stone-800 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-xs text-stone-400 mb-1">
                  <span className="font-bold flex items-center space-x-1.5">
                    <Wifi className="w-4 h-4 text-emerald-400" />
                    <span>GPRS-yhteystila</span>
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-stone-800 text-stone-300">
                    TCP / IP
                  </span>
                </div>
                <div className="text-sm font-bold text-emerald-300 mt-1 truncate">
                  {netStatus}
                </div>
              </div>
              <div className="mt-2.5 pt-2 border-t border-stone-800/80 text-[11px] text-stone-400 truncate">
                Protokolla: <strong className="text-stone-300">{proto}</strong>
              </div>
            </div>

            {/* Parameter 4: Latency & Battery Voltage */}
            <div className="p-3.5 rounded-xl bg-stone-950 border border-stone-800 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-xs text-stone-400 mb-1">
                  <span className="font-bold flex items-center space-x-1.5">
                    <Clock className="w-4 h-4 text-amber-400" />
                    <span>Paketin ikä & Jännite</span>
                  </span>
                  <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                    isLatencyGood ? 'bg-emerald-950 text-emerald-400' : 'bg-amber-950 text-amber-400'
                  }`}>
                    {volt.toFixed(2)} V
                  </span>
                </div>
                <div className="flex items-baseline space-x-1.5 mt-1">
                  <span className="text-2xl font-black text-stone-100 font-mono">
                    {latencySec === null ? '—' : latencySec}
                  </span>
                  <span className="text-xs text-stone-400 font-mono">
                    {latencySec === null ? 'ei vielä paikannusta' : 'sekuntia sitten'}
                  </span>
                </div>
              </div>
              <div className="mt-2.5 pt-2 border-t border-stone-800/80 text-[11px] text-stone-300 flex items-center space-x-1">
                <span className={`w-2 h-2 rounded-full shrink-0 ${isLatencyGood ? 'bg-emerald-400' : 'bg-amber-400'}`}></span>
                <span>
                  {latencySec === null
                    ? 'Odotetaan ensimmäistä paikannusta'
                    : latencySec < 15
                    ? 'Reaaliaikainen yhteys'
                    : latencySec < 60
                    ? 'Normaali päivitysväli'
                    : 'Päivitys viivästynyt'}
                </span>
              </div>
            </div>
          </div>

          {/* Diagnostics Analysis & Reason for Potential Delays */}
          <div className="p-3.5 rounded-xl bg-stone-950/80 border border-stone-800 text-xs space-y-2">
            <div className="flex items-center space-x-2 font-bold text-amber-400">
              <Info className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Telemetrian analyysi & vianmääritysohjeet:</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-stone-300 leading-relaxed pt-1">
              <div className="p-2.5 rounded-lg bg-stone-900/60 border border-stone-800/80">
                <span className="font-bold text-stone-200 block mb-0.5">
                  📡 Miksi paikkatieto joskus viivästyy?
                </span>
                <ul className="list-disc list-inside space-y-1 text-[11px] text-stone-400">
                  <li>
                    <strong className="text-stone-300">Asetettu paikannusväli:</strong> Panta lähettää uuden koordinaatin {dog.trackingIntervalSec || 10} sekunnin välein akunkeston optimoimiseksi.
                  </li>
                  <li>
                    <strong className="text-stone-300">G-sensori / Lepotila:</strong> Jos koira on paikallaan ({dog.speed} km/h), panta voi säästää virtaa ja vähentää lähetystiheyttä.
                  </li>
                  <li>
                    <strong className="text-stone-300">Maaston katvealueet:</strong> Tiheässä maastossa tai notkoissa GPRS/4G-yhteys (CSQ {csq}) voi puskuroitua pannan muistiin.
                  </li>
                </ul>
              </div>

              <div className="p-2.5 rounded-lg bg-stone-900/60 border border-stone-800/80">
                <span className="font-bold text-stone-200 block mb-0.5">
                  💡 Suositellut toimenpiteet jahtitilanteessa:
                </span>
                <ul className="list-disc list-inside space-y-1 text-[11px] text-stone-400">
                  <li>
                    Varmista että GPS-satelliitteja on vähintään <strong className="text-amber-300">4 kpl</strong> (nykyinen: {sats} kpl).
                  </li>
                  <li>
                    Ajo- tai haukkutilanteessa aseta paikannusväliksi <strong className="text-amber-300">5 s tai 10 s</strong> alla olevasta valikosta.
                  </li>
                  <li>
                    Paina tarvittaessa <strong className="text-emerald-300">"Päivitä paikkatieto"</strong> noutaaksesi uusimman pisteen suoraan Gatewaysta.
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Raw Protocol Packet / Telemetry Payload Display */}
          <div className="p-3.5 rounded-xl bg-stone-950 border border-stone-800 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-stone-400 flex items-center space-x-1.5">
                <Terminal className="w-3.5 h-3.5 text-amber-400" />
                <span>Pannan viimeisin raakasanoma (Raw Telemetry Payload)</span>
              </span>

              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(rawPayloadStr);
                  setCopiedRawPayload(true);
                  setTimeout(() => setCopiedRawPayload(false), 2500);
                }}
                className="px-2.5 py-1 rounded-lg bg-stone-900 hover:bg-stone-800 text-stone-300 text-[11px] font-mono font-medium transition flex items-center space-x-1 cursor-pointer border border-stone-700/60"
                title="Kopioi pannan raakaviesti leikepöydälle"
              >
                {copiedRawPayload ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" />
                    <span className="text-emerald-300">Kopioitu!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3 text-stone-400" />
                    <span>Kopioi raakadata</span>
                  </>
                )}
              </button>
            </div>

            <div className="p-2.5 rounded-lg bg-black/80 border border-stone-800 font-mono text-[11px] text-emerald-400 overflow-x-auto select-all leading-relaxed">
              {rawPayloadStr}
            </div>

            <div className="flex flex-wrap items-center justify-between text-[10px] text-stone-500 font-mono pt-1">
              <span>Lähde: {dog.gatewayServerUrl || 'Micro GPS Gateway (35.206.111.214:8080/api/positions)'}</span>
              <span>Laitetunnus: {dog.directGpsId || dog.imei || dog.collarId || 'Ei määritetty'}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
