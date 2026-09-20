import React, { useState, useEffect } from 'react';
import { Dog } from '../types';
import { fetchDevicePosition, extractTractiveToken } from '../services/collarService';
import { DOG_COLOR_PALETTE } from '../data/dogColors';
import {
  X,
  Zap,
  CheckCircle2,
  AlertCircle,
  RotateCw,
  Phone,
  Radio,
  Copy,
  Check,
  Server,
  Activity,
} from 'lucide-react';

export interface CollarSyncModalProps {
  dog: Dog;
  isOpen: boolean;
  onClose: () => void;
  onUpdateDog: (dogId: string, updates: Partial<Dog>) => void;
  isDarkMode?: boolean;
  /** Colours worn by the other dogs in this hunt, shown so a clash is easy to spot. */
  otherDogColors?: string[];
}

export type IcarSyncModalProps = CollarSyncModalProps;

export const CollarSyncModal: React.FC<CollarSyncModalProps> = ({
  dog,
  isOpen,
  onClose,
  onUpdateDog,
  isDarkMode = true,
  otherDogColors = [],
}) => {
  // Direct Erätutka GPS Server & Micro Gateway state
  const [directId, setDirectId] = useState(
    dog.directGpsId || dog.imei || dog.collarId || ''
  );
  const [gatewayServerUrl, setGatewayServerUrl] = useState(
    dog.gatewayServerUrl || 'http://35.206.111.214:8080/api/positions'
  );
  const [liveDirectTelemetry, setLiveDirectTelemetry] = useState<any>(null);
  const [isSimulating, setIsSimulating] = useState(false);

  // Shared state
  const [simNumber, setSimNumber] = useState(dog.simNumber || '');
  const [autoSync, setAutoSync] = useState(dog.autoSyncEnabled ?? true);
  const [isTesting, setIsTesting] = useState(false);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Coordinates
  const [customLat, setCustomLat] = useState<string>(dog.lat ? dog.lat.toFixed(6) : '60.852140');
  const [customLng, setCustomLng] = useState<string>(dog.lng ? dog.lng.toFixed(6) : '25.681420');

  // Test Results
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    lat?: number;
    lng?: number;
    battery?: number;
    speed?: number;
  } | null>(null);

  // Live polling of direct telemetry if modal is open
  useEffect(() => {
    if (!isOpen) return;

    const checkDirect = async () => {
      try {
        const clean = String(directId).replace(/^ID[:\s]*/i, '').trim();
        if (!clean) return;
        const res = await fetch(`/api/gps/device/${encodeURIComponent(clean)}`);
        if (res.ok) {
          const json = await res.json();
          setLiveDirectTelemetry(json);
        }
      } catch {}
    };

    checkDirect();
    const interval = setInterval(checkDirect, 3000);
    return () => clearInterval(interval);
  }, [isOpen, directId]);

  if (!isOpen) return null;

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://eratutka.fi';
  const cleanDirectId = String(directId).replace(/^ID[:\s]*/i, '').trim();
  const directHttpUrl = `${currentOrigin}/api/gps/update?id=${cleanDirectId}&lat={LAT}&lon={LON}&speed={SPEED}&batt={BATT}`;

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  // Trigger simulated ping to test the pipeline
  const handleSendTestPing = async () => {
    setIsSimulating(true);
    try {
      const baseLat = parseFloat(customLat) || (dog.lat || 60.85214);
      const baseLng = parseFloat(customLng) || (dog.lng || 25.68142);
      const newLat = baseLat + (Math.random() - 0.5) * 0.002;
      const newLng = baseLng + (Math.random() - 0.5) * 0.002;
      const testSpeed = Math.floor(Math.random() * 15) + 5;
      const testBatt = Math.max(70, Math.floor(Math.random() * 25) + 75);

      const res = await fetch('/api/gps/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: cleanDirectId,
          lat: newLat,
          lng: newLng,
          speed: testSpeed,
          battery: testBatt,
          heading: Math.floor(Math.random() * 360),
        }),
      });

      const data = await res.json();
      setIsSimulating(false);

      if (data.success) {
        setCustomLat(newLat.toFixed(6));
        setCustomLng(newLng.toFixed(6));
        setTestResult({
          success: true,
          message: `Testisignaali vastaanotettu Erätutkaan! Sijainti: ${newLat.toFixed(5)}°, ${newLng.toFixed(5)}°, Nopeus: ${testSpeed} km/h, Akku: ${testBatt}%. Data päivittyi tutkakartalle!`,
          lat: newLat,
          lng: newLng,
          speed: testSpeed,
          battery: testBatt,
        });

        onUpdateDog(dog.id, {
          telematicsProvider: 'eratutka_direct',
          directGpsId: cleanDirectId,
          lat: newLat,
          lng: newLng,
          speed: testSpeed,
          battery: testBatt,
          status: 'juoksee',
          lastUpdated: Date.now(),
        });
      }
    } catch (err: any) {
      setIsSimulating(false);
      setTestResult({
        success: false,
        message: `Virhe testisignaalin lähetyksessä: ${err.message}`,
      });
    }
  };

  // Test connection & fetch coordinates from Micro GPS Gateway
  const handleTestAndSync = async () => {
    if (!cleanDirectId) {
      setTestResult({
        success: false,
        message: 'Anna pannan Laite-ID tai IMEI ennen testiyhteyttä.',
      });
      return;
    }
    setIsTesting(true);
    setTestResult(null);

    try {
      const isTractive =
        dog.telematicsProvider === 'tractive' ||
        Boolean(dog.tractiveShareUrl) ||
        Boolean(dog.trackerModel?.toLowerCase().includes('tractive')) ||
        cleanDirectId.toLowerCase().includes('tractive') ||
        gatewayServerUrl.toLowerCase().includes('tractive') ||
        extractTractiveToken(cleanDirectId) !== null ||
        extractTractiveToken(gatewayServerUrl) !== null;

      const gwUrl = isTractive
        ? (gatewayServerUrl.includes('http') ? gatewayServerUrl : `https://my.tractive.com/p/${cleanDirectId}`)
        : (gatewayServerUrl || 'http://35.206.111.214:8080/api/positions');

      const data = await fetchDevicePosition(cleanDirectId, gwUrl);
      setIsTesting(false);

      if (data && data.success && typeof data.lat === 'number' && typeof data.lng === 'number' && data.lat !== 0 && data.lng !== 0) {
        setCustomLat(data.lat.toFixed(6));
        setCustomLng(data.lng.toFixed(6));

        setTestResult({
          success: true,
          message: isTractive
            ? `Tractive Live -yhteys aktiivinen! Viimeisin sijainti (${data.lat.toFixed(5)}°, ${data.lng.toFixed(5)}°), Lemmikki: ${data.tractiveInfo?.petName || 'Nirppu'}, Akku: ${data.battery}%. Automaattinen live-seuranta on päällä!`
            : `Erätutka Micro GPS Gateway -yhteys aktiivinen! Viimeisin sijainti (${data.lat.toFixed(5)}°, ${data.lng.toFixed(5)}°), Akku: ${data.battery}%, Nopeus: ${data.speed} km/h (Ikä: ${data.ageSeconds ?? 0}s). Automaattinen seuranta on päällä!`,
          lat: data.lat,
          lng: data.lng,
          battery: data.battery,
          speed: data.speed,
        });

        onUpdateDog(dog.id, {
          telematicsProvider: isTractive ? 'tractive' : 'eratutka_direct',
          gatewayServerUrl: isTractive ? (gatewayServerUrl || `https://my.tractive.com/p/${cleanDirectId}`) : gwUrl,
          directGpsId: cleanDirectId,
          tractiveShareUrl: isTractive ? (gatewayServerUrl || `https://my.tractive.com/p/${cleanDirectId}`) : dog.tractiveShareUrl,
          tractivePetName: data.tractiveInfo?.petName || dog.tractivePetName,
          tractiveTrackerId: data.tractiveInfo?.trackerId || dog.tractiveTrackerId,
          tractiveOwnerName: data.tractiveInfo?.ownerName || dog.tractiveOwnerName,
          simNumber: simNumber,
          autoSyncEnabled: autoSync,
          lat: data.lat,
          lng: data.lng,
          speed: data.speed || 0,
          battery: data.battery || dog.battery || 95,
          heading: data.heading || dog.heading || 0,
          barkRate: data.barkRate || 0,
          status: data.barkRate > 0 ? 'haukkuu' : ((data.speed || 0) > 2 ? 'juoksee' : 'paikallaan'),
          satellites: data.satellites ?? dog.satellites ?? (isTractive ? 14 : 12),
          gsmSignalCsq: data.gsmSignalCsq ?? dog.gsmSignalCsq ?? 24,
          gsmSignalDb: data.gsmSignalDb ?? dog.gsmSignalDb ?? -65,
          voltage: data.voltage ?? dog.voltage ?? 4.12,
          networkStatus: data.networkStatus ?? dog.networkStatus ?? (isTractive ? 'Tractive Cloud Online (eSIM)' : 'GPRS / TCP Yhdistetty'),
          fixMode: data.fixMode ?? dog.fixMode ?? '3D GPS Fix (Tarkka)',
          hdop: data.hdop ?? dog.hdop ?? 0.9,
          rawPayload: data.rawPayload || dog.rawPayload,
          protocolName: isTractive ? 'Tractive GPS Live Share' : (data.protocolName || dog.protocolName || 'Micro GPS Gateway'),
          lastPacketLatencySec: data.lastPacketLatencySec ?? 0,
          lastUpdated: data.timestamp || Date.now(),
        });
      } else {
        setTestResult({
          success: false,
          message: data?.message || `Laitteelta (${cleanDirectId}) ei saatu GPS-datapisteitä palvelimelta (${gwUrl}). Varmista että linkki tai tunnus on oikein.`,
        });
      }
    } catch (err: any) {
      setIsTesting(false);
      setTestResult({
        success: false,
        message: `Yhteysvirhe: ${err.message || 'Verkkovirhe'}`,
      });
    }
  };

  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    const latVal = parseFloat(customLat) || dog.lat;
    const lngVal = parseFloat(customLng) || dog.lng;

    const isTractive =
      dog.telematicsProvider === 'tractive' ||
      Boolean(dog.tractiveShareUrl) ||
      Boolean(dog.trackerModel?.toLowerCase().includes('tractive')) ||
      cleanDirectId.toLowerCase().includes('tractive') ||
      gatewayServerUrl.toLowerCase().includes('tractive') ||
      extractTractiveToken(cleanDirectId) !== null ||
      extractTractiveToken(gatewayServerUrl) !== null;

    onUpdateDog(dog.id, {
      telematicsProvider: isTractive ? 'tractive' : 'eratutka_direct',
      gatewayServerUrl: isTractive ? (gatewayServerUrl || `https://my.tractive.com/p/${cleanDirectId}`) : gatewayServerUrl,
      directGpsId: cleanDirectId,
      tractiveShareUrl: isTractive ? (gatewayServerUrl || `https://my.tractive.com/p/${cleanDirectId}`) : dog.tractiveShareUrl,
      simNumber: simNumber,
      autoSyncEnabled: autoSync,
      lat: latVal,
      lng: lngVal,
      status: 'paikallaan',
      speed: 0,
      lastUpdated: Date.now(),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fadeIn overflow-y-auto">
      <div
        className={`w-full max-w-2xl max-h-[92vh] flex flex-col rounded-3xl border ${
          isDarkMode
            ? 'bg-stone-900 border-amber-500/30 text-stone-100'
            : 'bg-white border-stone-300 text-stone-900'
        } shadow-2xl relative my-auto overflow-hidden`}
      >
        {/* Fixed Modal Header */}
        <div className="p-4 sm:p-5 pb-3 flex items-center justify-between border-b border-stone-800/80 shrink-0 bg-stone-900/90">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
              <Radio className="w-5 h-5 sm:w-6 sm:h-6 animate-pulse" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-amber-400 leading-tight">
                Pannan Live-seuranta & Micro GPS Gateway
              </h3>
              <p className="text-[11px] sm:text-xs text-stone-400">
                Koira: <strong className="text-stone-200">{dog.name}</strong> • Malli:{' '}
                <span className="text-amber-300">{dog.trackerModel || 'IK122T Pro 4G'}</span> • ID:{' '}
                <span className="font-mono text-amber-300">{dog.directGpsId || dog.imei || dog.collarId || 'Ei määritetty'}</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full bg-stone-800/80 hover:bg-stone-700 text-stone-400 hover:text-white transition shrink-0"
            title="Sulje ikkuna"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
          {/* The dog's map colour is a display setting, so it applies at once rather than
              waiting for the form's save button. Swatches worn by another dog in this hunt
              are flagged, which is the whole reason to change it. */}
          <div className="p-3.5 rounded-2xl bg-stone-950/80 border border-stone-800">
            <label className="block text-xs font-bold uppercase tracking-wider text-amber-400 mb-2.5">
              Koiran tunnusväri kartalla
            </label>
            <div className="flex flex-wrap items-center gap-3">
              {DOG_COLOR_PALETTE.map(({ value: c, label }) => {
                const selected = String(dog.color || '').toLowerCase() === c.toLowerCase();
                const sharedWithOther = otherDogColors.includes(c.toLowerCase());
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => onUpdateDog(dog.id, { color: c })}
                    title={sharedWithOther ? `${label} — sama väri toisella koiralla` : label}
                    aria-label={label}
                    aria-pressed={selected}
                    className={`relative w-8 h-8 rounded-full transition-transform ${
                      selected ? 'scale-125 ring-2 ring-amber-400 shadow-lg' : 'opacity-70 hover:opacity-100'
                    } ${sharedWithOther && !selected ? 'ring-2 ring-red-500/70' : ''}`}
                    style={{ backgroundColor: c }}
                  >
                    {sharedWithOther && (
                      <span
                        className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-stone-950 border border-red-500 text-[10px] leading-[14px] text-red-400 font-bold text-center"
                        aria-hidden="true"
                      >
                        !
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-stone-400 mt-2.5 leading-relaxed">
              {otherDogColors.length > 0
                ? 'Punaisella merkityt värit ovat jo toisen koiran käytössä tässä jahdissa. Väri päivittyy heti koko jahtiporukalle.'
                : 'Väri näkyy kartalla ja tutkassa, ja se päivittyy koko jahtiporukalle.'}
            </p>
          </div>

          <form onSubmit={handleSaveConfig} className="space-y-4">
            {/* DIRECT ERÄTUTKA GPS GATEWAY / GCE e2-micro */}
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-3">
                <div className="flex items-center space-x-2 text-xs text-amber-300 font-bold">
                  <Server className="w-4 h-4 text-amber-400" />
                  <span>Erätutka Micro GPS Gateway (Oma telemetriapalvelin)</span>
                </div>

                <div className="text-xs text-stone-300 space-y-2 leading-relaxed">
                  <div className="flex items-start space-x-2">
                    <span className="w-5 h-5 rounded-full bg-amber-500/30 text-amber-300 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                      1
                    </span>
                    <span>
                      Ohjaa panta omaan virtuaalipalvelimeesi tekstiviestillä (korvaa IP palvelimesi julkisella IP:llä):
                      <div className="mt-1 space-y-1.5">
                        <div className="p-2 rounded-xl bg-stone-950 border border-stone-800 flex items-center justify-between">
                          <div>
                            <span className="text-[10px] text-stone-400 block font-sans">ICAR IK122 / IK122T Pro (Portti 5023):</span>
                            <code className="text-amber-300 font-mono text-xs">SL DP&lt;PALVELIN_IP&gt;#5023#</code>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleCopy('SL DP35.206.111.214#5023#')}
                            className="p-1 text-stone-400 hover:text-white"
                            title="Kopioi oletuspalvelimen komento"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="p-2 rounded-xl bg-stone-950 border border-stone-800 flex items-center justify-between">
                          <div>
                            <span className="text-[10px] text-stone-400 block font-sans">SinoTrack ST-904L (Portti 5013):</span>
                            <code className="text-amber-300 font-mono text-xs">8040000 &lt;PALVELIN_IP&gt; 5013</code>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleCopy('8040000 35.206.111.214 5013')}
                            className="p-1 text-stone-400 hover:text-white"
                            title="Kopioi SinoTrack-komento"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </span>
                  </div>

                  <div className="flex items-start space-x-2">
                    <span className="w-5 h-5 rounded-full bg-amber-500/30 text-amber-300 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                      2
                    </span>
                    <span>
                      Varmista että alla oleva <strong>Pannan ID</strong> vastaa pannan IMEI-numeroa tai tunnusta. Gateway välittää saapuvan datan automaattisesti tälle koiralle.
                    </span>
                  </div>
                </div>
              </div>

              {/* Direct GPS Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-amber-400 mb-1">
                    Pannan Laite-ID / IMEI
                  </label>
                  <input
                    type="text"
                    value={directId}
                    onChange={(e) => setDirectId(e.target.value)}
                    placeholder="esim. 868123456789012"
                    className="w-full px-3 py-2.5 rounded-xl bg-stone-950 border border-stone-800 text-stone-100 text-xs font-mono outline-none focus:border-amber-500"
                  />
                  <span className="text-[10px] text-stone-400">
                    Pannan IMEI tai laitetunnus (esim. 868123456789012 tai 7026216737)
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-amber-400 mb-1">
                    Micro GPS Gateway -palvelin (PULL/GPS-haku)
                  </label>
                  <input
                    type="text"
                    value={gatewayServerUrl}
                    onChange={(e) => setGatewayServerUrl(e.target.value)}
                    placeholder="http://35.206.111.214:8080/api/positions"
                    className="w-full px-3 py-2.5 rounded-xl bg-stone-950 border border-stone-800 text-stone-100 text-xs font-mono outline-none focus:border-amber-500"
                  />
                  <span className="text-[10px] text-stone-400">
                    Erätutka PULL-osoite tai gatewayn juuriosoite
                  </span>
                </div>
              </div>

              {/* Live Status Badge */}
              <div className="p-3 rounded-xl bg-stone-950/80 border border-stone-800 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div
                    className={`w-2.5 h-2.5 rounded-full ${
                      liveDirectTelemetry?.isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-stone-500'
                    }`}
                  />
                  <span className="text-xs font-bold text-stone-200">
                    {liveDirectTelemetry?.isOnline
                      ? 'Reaaliaikainen yhteys muodostettu (aktiivinen)'
                      : 'Odottaa GPS-paketteja pannalta'}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleSendTestPing}
                  disabled={isSimulating}
                  className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold transition flex items-center space-x-1"
                  title="Lähetä testi-GPS-sijainti pannan ID:llä tarkistaaksesi putken toiminnan"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>{isSimulating ? 'Lähetetään...' : 'Lähetä testisijainti'}</span>
                </button>
              </div>

              {/* HTTP Webhook / OsmAnd Endpoint info */}
              <div className="p-3 rounded-xl bg-stone-950 border border-stone-800/80 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider flex items-center space-x-1">
                    <Activity className="w-3.5 h-3.5 text-amber-400" />
                    <span>Suora HTTP Webhook / OsmAnd Ingest -osoite:</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(directHttpUrl)}
                    className="text-[10px] text-amber-400 hover:text-amber-300 font-mono flex items-center space-x-1"
                  >
                    {copiedText === directHttpUrl ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                    <span>Kopioi URL</span>
                  </button>
                </div>
                <div className="p-2 rounded-lg bg-stone-900 font-mono text-[10px] text-amber-300/90 break-all select-all">
                  {directHttpUrl}
                </div>
              </div>
            </div>

            {/* SIM & SMS section */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-amber-400 mb-1">
                  Pannan SIM-puhelinnumero
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 absolute left-3 top-3 text-stone-500" />
                  <input
                    type="tel"
                    value={simNumber}
                    onChange={(e) => setSimNumber(e.target.value)}
                    placeholder="+358401234567"
                    className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-stone-950 border border-stone-800 text-stone-100 text-xs font-mono outline-none focus:border-amber-500"
                  />
                </div>
                <span className="text-[10px] text-stone-400">SMS-komennoille & kuuntelupuheluille</span>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-amber-400 mb-1">
                  Automaattinen Live-päivitys
                </label>
                <div className="flex items-center space-x-2 pt-2.5">
                  <input
                    type="checkbox"
                    id="autoSyncCheck"
                    checked={autoSync}
                    onChange={(e) => setAutoSync(e.target.checked)}
                    className="w-4 h-4 rounded text-amber-500 accent-amber-500 cursor-pointer"
                  />
                  <label htmlFor="autoSyncCheck" className="text-xs font-bold text-stone-200 cursor-pointer">
                    Hae sijainti 5s välein automaattisesti
                  </label>
                </div>
              </div>
            </div>

            {/* Coordinate inspection & manual override */}
            <div className="p-3 rounded-xl bg-stone-950/80 border border-stone-800 space-y-2">
              <label className="block text-[11px] font-bold text-amber-400 uppercase tracking-wider">
                Pannan koordinaatit kartalla (WGS84)
              </label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[10px] text-stone-400 block mb-0.5">Leveyspiiri (Lat)</span>
                  <input
                    type="text"
                    value={customLat}
                    onChange={(e) => setCustomLat(e.target.value)}
                    placeholder="64.225000"
                    className="w-full px-2.5 py-1.5 rounded-lg bg-stone-900 border border-stone-700 text-stone-100 text-xs font-mono outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-stone-400 block mb-0.5">Pituuspiiri (Lng)</span>
                  <input
                    type="text"
                    value={customLng}
                    onChange={(e) => setCustomLng(e.target.value)}
                    placeholder="27.735000"
                    className="w-full px-2.5 py-1.5 rounded-lg bg-stone-900 border border-stone-700 text-stone-100 text-xs font-mono outline-none focus:border-amber-500"
                  />
                </div>
              </div>
            </div>

            {/* Test connection & sync button */}
            <div className="pt-1">
              <button
                type="button"
                onClick={handleTestAndSync}
                disabled={isTesting}
                className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs transition flex items-center justify-center space-x-2 shadow-lg shadow-amber-500/20 cursor-pointer"
              >
                {isTesting ? (
                  <RotateCw className="w-4 h-4 animate-spin text-stone-950" />
                ) : (
                  <Zap className="w-4 h-4 text-stone-950" />
                )}
                <span>
                  {isTesting
                    ? 'Yhdistetään ja haetaan live-sijaintia...'
                    : 'Tarkista pannan yhteystila (Micro GPS Gateway)'}
                </span>
              </button>
            </div>

            {/* Diagnostic Result */}
            {testResult && (
              <div
                className={`p-3.5 rounded-xl border text-xs leading-relaxed animate-fadeIn ${
                  testResult.success
                    ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                    : 'bg-red-950/40 border-red-500/40 text-red-300'
                }`}
              >
                <div className="flex items-center space-x-2 font-bold mb-1">
                  {testResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-400" />
                  )}
                  <span>{testResult.success ? 'Yhteystesti onnistui!' : 'Yhteysvirhe / Huomio'}</span>
                </div>
                <p>{testResult.message}</p>
              </div>
            )}

            {/* Helpful SMS commands list */}
            <div className="p-3.5 rounded-xl bg-stone-950 border border-stone-800 space-y-2 text-xs">
              <span className="font-bold text-amber-400 flex items-center space-x-1.5">
                <Phone className="w-3.5 h-3.5" />
                <span>Hyödylliset IK122T Pro -tekstiviestikomennot (lähetä pannan numeroon):</span>
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono">
                <div className="p-2 rounded-lg bg-stone-900 border border-stone-800 flex justify-between items-center">
                  <div>
                    <span className="text-amber-300 font-bold block">SL SC0,10</span>
                    <span className="text-stone-400 text-[10px]">10s paikannusväli</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy('SL SC0,10')}
                    className="text-stone-400 hover:text-white p-1"
                    title="Kopioi leikepöydälle"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="p-2 rounded-lg bg-stone-900 border border-stone-800 flex justify-between items-center">
                  <div>
                    <span className="text-amber-300 font-bold block">G123456#</span>
                    <span className="text-stone-400 text-[10px]">Pyydä sijainti heti SMS:llä</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy('G123456#')}
                    className="text-stone-400 hover:text-white p-1"
                    title="Kopioi leikepöydälle"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="p-2 rounded-lg bg-stone-900 border border-stone-800 flex justify-between items-center">
                  <div>
                    <span className="text-amber-300 font-bold block">SL CHECK</span>
                    <span className="text-stone-400 text-[10px]">Tarkista akun & GSM-tila</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy('SL CHECK')}
                    className="text-stone-400 hover:text-white p-1"
                    title="Kopioi leikepöydälle"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="p-2 rounded-lg bg-stone-900 border border-stone-800 flex justify-between items-center">
                  <div>
                    <span className="text-amber-300 font-bold block">SL RESET</span>
                    <span className="text-stone-400 text-[10px]">Käynnistä panta uudelleen</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy('SL RESET')}
                    className="text-stone-400 hover:text-white p-1"
                    title="Kopioi leikepöydälle"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs font-bold transition"
              >
                Sulje
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold transition shadow-lg shadow-amber-500/20"
              >
                Tallenna asetukset
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export const IcarSyncModal = CollarSyncModal;
