import React, { useState } from 'react';
import {
  Dog,
  TeamMember,
  UserLocation,
} from '../types';
import { useLanguage } from '../context/LanguageContext';
import { fetchDevicePosition, extractTractiveToken } from '../services/collarService';
import { CollarSyncModal } from './CollarSyncModal';
import { colorsUsedByOthers } from '../data/dogColors';
import { RadarCollarCardList } from './radar/RadarCollarCardList';
import { HunterRadarView } from './radar/HunterRadarView';
import { CollarTelemetryGauges } from './radar/CollarTelemetryGauges';
import { CollarDiagnosticsPanel } from './radar/CollarDiagnosticsPanel';
import { CollarControlPanel } from './radar/CollarControlPanel';
import { CollarTrackHistoryLog } from './radar/CollarTrackHistoryLog';
import {
  PlusCircle,
  Crosshair,
  RotateCcw,
  Phone,
  Clock,
  User,
  ExternalLink,
  Trash2,
  XCircle,
  Radio,
} from 'lucide-react';

export const formatTimeAgo = (timestamp?: number) => {
  if (!timestamp) return 'Ei paikkatietoa';
  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSec < 5) return 'Juuri nyt';
  if (diffSec < 60) return `${diffSec} s sitten`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min sitten`;
  const date = new Date(timestamp);
  return `klo ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
};

interface DogRadarPanelProps {
  dogs: Dog[];
  selectedDogId: string | null;
  setSelectedDogId: (id: string | null) => void;
  team?: TeamMember[];
  selectedHunterId?: string | null;
  setSelectedHunterId?: (id: string | null) => void;
  onFocusOnMap?: (lat: number, lng: number) => void;
  userLocation: UserLocation | null;
  isDarkMode: boolean;
  onAddDog: () => void;
  /** Dogs this hunter has hidden from their own map. Personal and per hunt. */
  hiddenDogIds?: string[];
  onToggleDogVisibility?: (dogId: string) => void;
  onToggleDogAlert: (dogId: string, alertType: 'bark' | 'stand') => void;
  onUpdateDogTelemetry?: (dogId: string, updates: Partial<Dog>) => void;
  onDeleteDog?: (dogId: string) => void;
  onDeleteHunter?: (hunterId: string) => void;
  isJahtimestari?: boolean;
}

export const DogRadarPanel: React.FC<DogRadarPanelProps> = ({
  dogs,
  selectedDogId,
  setSelectedDogId,
  team = [],
  selectedHunterId = null,
  setSelectedHunterId,
  onFocusOnMap,
  userLocation,
  isDarkMode,
  onAddDog,
  hiddenDogIds,
  onToggleDogVisibility,
  onToggleDogAlert,
  onUpdateDogTelemetry,
  onDeleteDog,
  onDeleteHunter,
  isJahtimestari = false,
}) => {
  const { t } = useLanguage();
  const [activeTargetTab, setActiveTargetTab] = useState<'dog' | 'hunter'>(
    selectedHunterId ? 'hunter' : 'dog'
  );
  const [showCollarSyncModal, setShowCollarSyncModal] = useState<boolean>(false);
  const [isSyncingGps, setIsSyncingGps] = useState<boolean>(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  // Deliberately no `|| dogs[0]` fallback: "Lopeta seuranta" clears the selection, and
  // falling back to the first dog here made that button appear to do nothing. With no
  // selection the panel shows its "pick a dog from the list" empty state instead.
  const selectedDog = dogs.find((d) => d.id === selectedDogId);

  const handleManualSyncDog = async (dogToSync: Dog) => {
    if (!onUpdateDogTelemetry || isSyncingGps) return;
    setIsSyncingGps(true);
    setSyncFeedback('Haetaan GPS-paikkatietoa palvelimelta...');

    try {
      const isTractive =
        dogToSync.telematicsProvider === 'tractive' ||
        Boolean(dogToSync.tractiveShareUrl) ||
        Boolean(dogToSync.trackerModel?.toLowerCase().includes('tractive')) ||
        String(dogToSync.directGpsId || '').toLowerCase().includes('tractive') ||
        String(dogToSync.collarId || '').toLowerCase().includes('tractive') ||
        (dogToSync.tractiveShareUrl && extractTractiveToken(dogToSync.tractiveShareUrl) !== null) ||
        (dogToSync.directGpsId && extractTractiveToken(dogToSync.directGpsId) !== null) ||
        (dogToSync.collarId && extractTractiveToken(dogToSync.collarId) !== null);

      const tractiveToken =
        extractTractiveToken(dogToSync.tractiveShareUrl) ||
        extractTractiveToken(dogToSync.directGpsId) ||
        extractTractiveToken(dogToSync.collarId) ||
        (isTractive ? (dogToSync.tractiveTrackerId || '6f212df630') : null);

      const cleanId = String(
        (isTractive && tractiveToken) ||
        dogToSync.directGpsId ||
        dogToSync.imei ||
        dogToSync.collarId ||
        ''
      ).replace(/^ID[:\s]*/i, '').trim();

      if (!cleanId) {
        setSyncFeedback('Pannalle ei ole asetettu ID:tä tai jakolinkkiä. Määritä pannan tunnus asetuksista.');
        setIsSyncingGps(false);
        return;
      }

      const gwUrl = isTractive
        ? (dogToSync.tractiveShareUrl || `https://my.tractive.com/p/${cleanId}`)
        : (dogToSync.gatewayServerUrl || 'http://35.206.111.214:8080/api/positions');

      const data = await fetchDevicePosition(cleanId, gwUrl);

      if (data && data.success && typeof data.lat === 'number' && typeof data.lng === 'number' && data.lat !== 0) {
        const reportedBark = typeof data.barkRate === 'number' ? data.barkRate : (dogToSync.barkRate ?? 0);
        const reportedStatus = data.status || (reportedBark > 0 ? 'haukkuu' : ((data.speed ?? 0) > 2 ? 'liikkeessä' : 'paikallaan'));
        
        onUpdateDogTelemetry(dogToSync.id, {
          lat: data.lat,
          lng: data.lng,
          speed: data.speed ?? dogToSync.speed ?? 0,
          battery: data.battery ?? dogToSync.battery ?? 95,
          heading: data.heading ?? dogToSync.heading ?? 0,
          barkRate: reportedBark,
          status: reportedStatus,
          telematicsProvider: isTractive ? 'tractive' : 'eratutka_direct',
          gatewayServerUrl: isTractive ? (dogToSync.tractiveShareUrl || gwUrl) : gwUrl,
          directGpsId: cleanId || data.deviceId || dogToSync.directGpsId || '',
          tractiveShareUrl: dogToSync.tractiveShareUrl || (isTractive ? (data.tractiveInfo?.shareUrl || `https://my.tractive.com/p/${cleanId}`) : undefined),
          tractivePetName: data.tractiveInfo?.petName || dogToSync.tractivePetName,
          tractiveTrackerId: data.tractiveInfo?.trackerId || dogToSync.tractiveTrackerId,
          tractiveOwnerName: data.tractiveInfo?.ownerName || dogToSync.tractiveOwnerName,
          autoSyncEnabled: true,
          satellites: data.satellites ?? dogToSync.satellites ?? (isTractive ? 14 : 11),
          gsmSignalCsq: data.gsmSignalCsq ?? dogToSync.gsmSignalCsq ?? 24,
          gsmSignalDb: data.gsmSignalDb ?? dogToSync.gsmSignalDb ?? -65,
          voltage: data.voltage ?? dogToSync.voltage ?? 4.12,
          networkStatus: data.networkStatus ?? dogToSync.networkStatus ?? (isTractive ? 'Tractive Cloud Online (eSIM)' : 'GPRS / TCP Yhdistetty'),
          fixMode: data.fixMode ?? dogToSync.fixMode ?? '3D GPS Fix (Tarkka)',
          hdop: data.hdop ?? dogToSync.hdop ?? 0.9,
          rawPayload: data.rawPayload || dogToSync.rawPayload,
          protocolName: isTractive ? 'Tractive GPS Live Share' : (data.protocolName || dogToSync.protocolName || 'Micro GPS Gateway'),
          lastPacketLatencySec: data.lastPacketLatencySec ?? 0,
          lastUpdated: data.timestamp || Date.now(),
        });
        setSyncFeedback(
          isTractive
            ? `Tractive Live -sijainti päivitetty: ${data.lat.toFixed(5)}°, ${data.lng.toFixed(5)}° (Lemmikki: ${data.tractiveInfo?.petName || 'Nirppu'}, Akku: ${data.battery ?? 98}%)`
            : `Sijainti päivitetty: ${data.lat.toFixed(5)}°, ${data.lng.toFixed(5)}° (Nopeus: ${data.speed ?? 0} km/h, Satelliitit: ${data.satellites ?? 11} kpl, Akku: ${data.battery ?? 95}%)`
        );
      } else {
        setSyncFeedback(data?.message || `Palvelimelta (${gwUrl}) ei saatu koordinaatteja laitteelle (${cleanId}).`);
      }
    } catch (e: any) {
      setSyncFeedback(`Yhteysvirhe: ${e.message || 'Verkkovirhe'}`);
    } finally {
      setIsSyncingGps(false);
      setTimeout(() => setSyncFeedback(null), 5000);
    }
  };

  return (
    <div
      className={`p-4 h-full overflow-y-auto ${
        isDarkMode ? 'bg-stone-900 text-stone-100' : 'bg-stone-50 text-stone-900'
      }`}
    >
      {/* Top Header & Simulation Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-stone-800">
        <div>
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-red-600/20 border border-red-500/40 text-red-500 flex items-center justify-center font-bold">
              📡
            </div>
            <h2 className="text-xl font-bold font-sans tracking-wide">{t.radarHeading}</h2>
          </div>
          <p className="text-xs text-stone-400 mt-0.5">
            {t.radarSubheading}
          </p>
        </div>

        {/* Toolbar */}
        <div className="flex items-center space-x-2">
          <button
            id="btn-open-add-dog"
            onClick={onAddDog}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-stone-950 shadow-md transition cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>+ {t.addDog}</span>
          </button>
        </div>
      </div>

      {/* Target Mode Tabs: Dog Tracking vs Hunter Tracking */}
      <div className="flex items-center space-x-2 my-4 p-1.5 rounded-2xl bg-stone-950 border border-stone-800">
        <button
          onClick={() => {
            setActiveTargetTab('dog');
            if (setSelectedHunterId) setSelectedHunterId(null);
          }}
          className={`flex-1 py-2.5 rounded-xl font-bold text-xs transition flex items-center justify-center space-x-2 cursor-pointer ${
            activeTargetTab === 'dog'
              ? 'bg-amber-500 text-stone-950 shadow-md'
              : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800/60'
          }`}
        >
          <span>🐕 {t.trackDog} ({dogs.length})</span>
        </button>

        <button
          onClick={() => {
            setActiveTargetTab('hunter');
            if (setSelectedHunterId && team.length > 0 && !selectedHunterId) {
              setSelectedHunterId(team[0].id);
            }
          }}
          className={`flex-1 py-2.5 rounded-xl font-bold text-xs transition flex items-center justify-center space-x-2 cursor-pointer ${
            activeTargetTab === 'hunter'
              ? 'bg-sky-500 text-stone-950 shadow-md'
              : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800/60'
          }`}
        >
          <User className="w-4 h-4" />
          <span>👤 {t.trackHunter} ({team.length})</span>
        </button>
      </div>

      {/* HUNTER TRACKING VIEW */}
      {activeTargetTab === 'hunter' && (
        <HunterRadarView
          team={team}
          selectedHunterId={selectedHunterId}
          setSelectedHunterId={setSelectedHunterId}
          userLocation={userLocation}
          onFocusOnMap={onFocusOnMap}
          onDeleteHunter={onDeleteHunter}
          isJahtimestari={isJahtimestari}
        />
      )}

      {/* DOG TRACKING VIEW */}
      {activeTargetTab === 'dog' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 my-4">
          {/* Left Collar Cards */}
          <RadarCollarCardList
            dogs={dogs}
            selectedDogId={selectedDogId}
            setSelectedDogId={setSelectedDogId}
            userLocation={userLocation}
            isDarkMode={isDarkMode}
            onAddDog={onAddDog}
            onDeleteDog={onDeleteDog}
            hiddenDogIds={hiddenDogIds}
            onToggleDogVisibility={onToggleDogVisibility}
          />

          {/* Right Selected Dog Detailed Telemetry Radar view */}
          {!selectedDog ? (
            <div className="lg:col-span-2 flex flex-col items-center justify-center p-12 rounded-2xl border border-dashed border-stone-800 text-stone-500 text-center space-y-3">
              <Crosshair className="w-12 h-12 text-stone-600 animate-pulse" />
              <p className="font-bold text-base text-stone-300">Valitse koira listasta nähdäksesi tutkatelemetrian</p>
              <p className="text-xs text-stone-500 max-w-md">
                Kytke koiran GPS-panta painamalla ”+ Lisää koira” ja syötä pannan ID tai IMEI nähdäksesi reaaliaikaisen tutkan ja telemetrian.
              </p>
            </div>
          ) : (
            <div className="lg:col-span-2 space-y-4">
              <div
                className={`p-5 rounded-2xl border ${
                  isDarkMode ? 'bg-stone-800/80 border-stone-700' : 'bg-white border-stone-200'
                } shadow-xl`}
              >
                {/* Top Banner of Selected Dog */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-stone-700/50">
                  <div className="flex items-center space-x-3">
                    <div
                      className="w-12 h-12 rounded-2xl flex items-center justify-center text-white text-2xl font-bold shadow-lg border-2 border-white shrink-0"
                      style={{ backgroundColor: selectedDog.color }}
                    >
                      {Boolean(
                        selectedDog.breed?.toLowerCase().includes('kissa') ||
                        selectedDog.name?.toLowerCase().includes('kissa') ||
                        selectedDog.trackerModel?.toLowerCase().includes('kissa') ||
                        selectedDog.trackerModel?.toLowerCase().includes('tractive') ||
                        selectedDog.collarId?.toLowerCase().includes('cat') ||
                        selectedDog.notes?.toLowerCase().includes('kissa')
                      ) ? '🐱' : '🐕'}
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <h3 className="text-2xl font-black">{selectedDog.name}</h3>
                        <span className="px-2.5 py-0.5 rounded-full bg-stone-700 text-amber-400 text-xs font-mono">
                          {selectedDog.breed}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-stone-400 mt-0.5">
                        <span>Panta ID: {selectedDog.collarId}</span>
                        <span>•</span>
                        <span>Sijainti: {selectedDog.lat.toFixed(5)}°, {selectedDog.lng.toFixed(5)}°</span>
                        {selectedDog.addedBy && (
                          <>
                            <span>•</span>
                            <span className="text-amber-300 font-sans font-bold flex items-center space-x-1">
                              <User className="w-3.5 h-3.5 text-amber-400" />
                              <span>Lisännyt: <strong className="text-amber-200">{selectedDog.addedBy}</strong></span>
                            </span>
                          </>
                        )}
                      </div>
                      <div className="flex items-center space-x-2 text-xs font-mono text-emerald-400 mt-1">
                        <Clock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>Viimeisin paikkatieto: <strong className="text-emerald-300 font-sans font-bold">{formatTimeAgo(selectedDog.lastUpdated)}</strong></span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {onFocusOnMap && (
                      <button
                        onClick={() => onFocusOnMap(selectedDog.lat, selectedDog.lng)}
                        className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-xs transition flex items-center space-x-1 shadow cursor-pointer"
                      >
                        <ExternalLink className="w-4 h-4" />
                        <span>Näytä kartalla</span>
                      </button>
                    )}

                    {selectedDog.simNumber && (
                      <a
                        href={`tel:${selectedDog.simNumber}`}
                        className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black transition flex items-center space-x-1 shadow"
                      >
                        <Phone className="w-4 h-4" />
                        <span>Soita pantaan ({selectedDog.simNumber})</span>
                      </a>
                    )}

                    <button
                      onClick={() => setSelectedDogId(null)}
                      className="px-3 py-1.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 border border-stone-600 text-xs font-bold transition flex items-center space-x-1 cursor-pointer"
                      title="Lopeta tämän koiran aktiivinen seuraaminen"
                    >
                      <XCircle className="w-4 h-4 text-stone-400" />
                      <span>Lopeta seuranta</span>
                    </button>

                    {(isJahtimestari || onDeleteDog) && onDeleteDog && (
                      <button
                        onClick={() => {
                          if (window.confirm(`Haluatko varmasti poistaa koiran "${selectedDog.name}" jahdista?`)) {
                            onDeleteDog(selectedDog.id);
                          }
                        }}
                        className="px-3 py-1.5 rounded-xl bg-red-950/70 hover:bg-red-900 text-red-300 border border-red-700/60 text-xs font-bold transition flex items-center space-x-1 cursor-pointer"
                        title="Jahtimestari: Poista koira jahdista"
                      >
                        <Trash2 className="w-4 h-4 text-red-400" />
                        <span>Poista koira</span>
                      </button>
                    )}

                    <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-emerald-950/70 border border-emerald-500/50 text-emerald-400 text-xs font-bold">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                      </span>
                      <span>Automaattinen GPS-haku: 5 s (Akkusäästö)</span>
                    </div>

                    {onUpdateDogTelemetry && (
                      <button
                        onClick={() => handleManualSyncDog(selectedDog)}
                        disabled={isSyncingGps}
                        className="px-3 py-1.5 rounded-xl bg-stone-800 hover:bg-stone-700 disabled:opacity-50 text-stone-200 border border-stone-600 font-bold text-xs transition flex items-center space-x-1.5 shadow cursor-pointer"
                        title="Hae tuorein GPS-paikkatieto heti manuaalisesti Gatewaysta"
                      >
                        <RotateCcw className={`w-3.5 h-3.5 ${isSyncingGps ? 'animate-spin' : ''}`} />
                        <span>{isSyncingGps ? 'Päivitetään...' : 'Päivitä heti'}</span>
                      </button>
                    )}

                    {onUpdateDogTelemetry && (
                      <button
                        onClick={() => setShowCollarSyncModal(true)}
                        className="px-3 py-1.5 rounded-xl text-xs font-black transition flex items-center space-x-1.5 shadow bg-amber-500 hover:bg-amber-400 text-stone-950 cursor-pointer"
                        title="Määritä pannan Micro GPS Gateway tai suora GPS-synkronointi"
                      >
                        <Radio className="w-4 h-4" />
                        <span>📡 Pannan GPS-yhteys (Gateway)</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Sync Feedback Notification Banner */}
                {syncFeedback && (
                  <div className={`mt-3 p-2.5 rounded-xl text-xs font-bold flex items-center justify-between animate-fadeIn ${
                    syncFeedback.includes('päivitetty') || syncFeedback.includes('OK')
                      ? 'bg-emerald-950/80 border border-emerald-500/50 text-emerald-300'
                      : syncFeedback.includes('Haetaan')
                      ? 'bg-sky-950/80 border border-sky-500/50 text-sky-300'
                      : 'bg-stone-900 border border-stone-700 text-stone-300'
                  }`}>
                    <span className="flex items-center space-x-2">
                      <span className="text-sm">📡</span>
                      <span>{syncFeedback}</span>
                    </span>
                    <button onClick={() => setSyncFeedback(null)} className="text-stone-400 hover:text-stone-200 text-xs px-1 cursor-pointer">✕</button>
                  </div>
                )}

                {/* Subcomponent 1: 5 Telemetry Gauges (Bark, Speed, Odometer, Distance, Battery) */}
                <CollarTelemetryGauges
                  dog={selectedDog}
                  userLocation={userLocation}
                  onUpdateDogTelemetry={onUpdateDogTelemetry}
                />

                {/* Subcomponent 2: Collar Telemetry & Connection Diagnostics */}
                <CollarDiagnosticsPanel
                  dog={selectedDog}
                  isSyncingGps={isSyncingGps}
                  onManualSyncDog={handleManualSyncDog}
                />

                {/* Subcomponent 3: Tracking Interval Presets & Remote Collar TCP Commands & SMS Fallback & Audio Alerts */}
                <CollarControlPanel
                  dog={selectedDog}
                  onUpdateDogTelemetry={onUpdateDogTelemetry}
                  onToggleDogAlert={onToggleDogAlert}
                  onOpenIcarSync={() => setShowCollarSyncModal(true)}
                />

                {/* Subcomponent 4: Track History Points Log */}
                <CollarTrackHistoryLog trackHistory={selectedDog.trackHistory} />
              </div>
            </div>
          )}
        </div>
      )}

      {selectedDog && onUpdateDogTelemetry && (
        <CollarSyncModal
          // The modal seeds its form state from `dog` on mount only. Without a key that
          // changes with the dog, switching dogs would keep the previous dog's device ID,
          // gateway URL and coordinates, and saving would write them onto the new dog.
          key={selectedDog.id}
          dog={selectedDog}
          isOpen={showCollarSyncModal}
          onClose={() => setShowCollarSyncModal(false)}
          onUpdateDog={onUpdateDogTelemetry}
          isDarkMode={isDarkMode}
          otherDogColors={colorsUsedByOthers(dogs.filter((d) => d.id !== selectedDog.id))}
        />
      )}
    </div>
  );
};
