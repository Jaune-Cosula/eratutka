import React, { useState } from 'react';
import { Plus, Battery, Signal, Trash2, MapPin, Download, PawPrint, Eye, EyeOff, RotateCcw, Radio, Phone, UserCheck } from 'lucide-react';
import { Dog } from '../../types';
import { EvoProps, EvoNav, useEvo, relToUser, fmtDist, dogStatusLabel, dogStatusTone, timeAgo, Sheet, Btn } from '../core';
import { CollarTelemetryGauges } from '../../components/radar/CollarTelemetryGauges';
import { CollarDiagnosticsPanel } from '../../components/radar/CollarDiagnosticsPanel';
import { CollarControlPanel } from '../../components/radar/CollarControlPanel';
import { CollarTrackHistoryLog } from '../../components/radar/CollarTrackHistoryLog';
import { CollarSyncModal } from '../../components/CollarSyncModal';
import { useManualCollarSync } from '../../hooks/useManualCollarSync';
import { colorsUsedByOthers } from '../../data/dogColors';
import { calculateTotalBarkMs, formatBarkDuration } from '../../utils/geoUtils';

const toneColor = (t: string) => (t === 'live' ? 'var(--e-live)' : t === 'info' ? 'var(--e-info)' : t === 'alert' ? 'var(--e-alert)' : 'var(--e-text-2)');

export const DogsScreen: React.FC<{ p: EvoProps; nav: EvoNav }> = ({ p, nav }) => {
  const { s, lang } = useEvo();
  const [detail, setDetail] = useState<Dog | null>(null);
  // The collar's Gateway/Tractive sync modal is a viewport-level overlay, so it is rendered
  // as a sibling of the detail Sheet rather than inside it.
  const [syncDog, setSyncDog] = useState<Dog | null>(null);

  return (
    <section className="absolute inset-0 overflow-y-auto pb-6">
      <header className="sticky top-0 z-10 flex items-end justify-between gap-3 px-4 pt-4 pb-2.5" style={{ background: 'linear-gradient(180deg, rgba(var(--e-veil),.98) 72%, rgba(var(--e-veil),0))' }}>
        <div>
          <h1 className="text-[22px] font-extrabold">{s.dogs}</h1>
          <div className="evo-micro">{p.visibleDogs.length} {s.inHunt} · {p.dogLibrary.length} {s.library}</div>
        </div>
        <Btn variant="primary" sm onClick={p.openAddDog}><Plus className="h-4 w-4" />{s.addDog}</Btn>
      </header>

      <div className="space-y-2.5 px-4">
        {p.dogs.length === 0 && (
          <div className="evo-card px-5 py-8 text-center">
            <PawPrint className="mx-auto mb-2 h-9 w-9" style={{ color: 'var(--e-text-3)' }} />
            <div className="font-bold">{s.noDogs}</div>
            <p className="mt-1 text-[12px]" style={{ color: 'var(--e-text-3)' }}>{s.noDogsHint}</p>
            <Btn variant="primary" sm className="mt-4" onClick={p.openAddDog}><Plus className="h-4 w-4" />{s.addDog}</Btn>
          </div>
        )}

        {p.dogs.map((dog) => {
          const rel = relToUser(p.userLocation, dog.lat, dog.lng);
          const hidden = p.hiddenDogIds.includes(dog.id);
          return (
            <div key={dog.id} className="evo-card tap flex items-center gap-3 px-3.5 py-3" style={{ opacity: hidden ? 0.6 : 1 }} onClick={() => setDetail(dog)}>
              <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl text-[15px] font-extrabold" style={{ background: dog.color + '22', color: dog.color }}>{dog.name.charAt(0)}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[15px] font-extrabold">
                  <span className="truncate">{dog.name}</span>
                  {hidden && <span className="evo-chip muted">{s.hidden}</span>}
                  {dog.manualBarkActive && <span className="evo-chip" style={{ color: 'var(--e-alert)' }}>🔊 HAUKKUU</span>}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11.5px]" style={{ color: 'var(--e-text-3)' }}>
                  <span>{dog.breed}</span>
                  <span className="evo-mono">{dog.trackerModel || dog.collarId}</span>
                </div>
                <div className="mt-1.5 flex items-center gap-3 text-[11px] font-bold">
                  <span className="flex items-center gap-1" style={{ color: toneColor(dogStatusTone(dog.status)) }}><PawPrint className="h-3 w-3" />{dogStatusLabel(dog.status, s)}</span>
                  <span className="flex items-center gap-1" style={{ color: 'var(--e-text-2)' }}><Battery className="h-3 w-3" />{dog.battery}%</span>
                  <span className="flex items-center gap-1" style={{ color: 'var(--e-text-2)' }}><Signal className="h-3 w-3" />{dog.signal}%</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2.5 text-[10.5px] font-bold" style={{ color: 'var(--e-text-3)' }}>
                  <span>🔊 {s.totalBarked}: {formatBarkDuration(calculateTotalBarkMs(dog.trackHistory))}</span>
                  {dog.lastBarkTimestamp ? <span>· {s.lastBark} {timeAgo(dog.lastBarkTimestamp, lang)}</span> : null}
                </div>
              </div>
              <div className="flex-none text-right">
                <div className="evo-mono text-[16px] font-bold">{rel ? fmtDist(rel.dist) : '—'}</div>
                <div className="text-[10px] font-bold" style={{ color: 'var(--e-text-3)' }}>{rel ? rel.compass : s.lost} · {timeAgo(dog.lastUpdated, lang)}</div>
              </div>
              <button
                className="evo-iconbtn flex-none"
                style={{ width: 34, height: 34, color: dog.manualBarkActive ? 'var(--e-alert)' : 'var(--e-text-3)' }}
                onClick={(e) => { e.stopPropagation(); p.onToggleManualBark(dog.id); }}
                title={dog.manualBarkActive ? 'Lopeta haukku' : 'Merkitse haukku'}
                aria-label={dog.manualBarkActive ? 'Lopeta haukku' : 'Merkitse haukku'}
              >
                🔊
              </button>
              <button
                className="evo-iconbtn flex-none"
                style={{ width: 34, height: 34, color: hidden ? 'var(--e-text-3)' : undefined }}
                onClick={(e) => { e.stopPropagation(); p.onToggleDogVisibility(dog.id); }}
                title={hidden ? s.showOnMap : s.hideOnMap}
                aria-label={hidden ? s.showOnMap : s.hideOnMap}
              >
                {hidden ? <EyeOff className="h-[17px] w-[17px]" /> : <Eye className="h-[17px] w-[17px]" />}
              </button>
            </div>
          );
        })}

        {p.dogLibrary.length > 0 && (
          <>
            <div className="evo-micro px-1 pt-3">{s.library} · {s.shareInHunt} = ei</div>
            {p.dogLibrary.map((dog) => (
              <div key={dog.id} className="evo-card flex items-center gap-3 px-3.5 py-3" style={{ opacity: 0.85 }}>
                <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl text-[15px] font-extrabold" style={{ background: dog.color + '22', color: dog.color }}>{dog.name.charAt(0)}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-extrabold">{dog.name}</div>
                  <div className="mt-0.5 text-[11.5px]" style={{ color: 'var(--e-text-3)' }}>{dog.trackerModel || dog.collarId}</div>
                </div>
                <Btn sm onClick={() => p.onShareLibraryDog(dog)}>{s.inHunt}</Btn>
              </div>
            ))}
          </>
        )}
      </div>

      {detail && (
        <Sheet title={detail.name} onClose={() => setDetail(null)}>
          <DogDetail dog={detail} p={p} nav={nav} onClose={() => setDetail(null)} onOpenSync={setSyncDog} />
        </Sheet>
      )}

      {syncDog && (
        <CollarSyncModal
          // Seeds its form from `dog` on mount only, so the key must change with the dog.
          key={syncDog.id}
          dog={syncDog}
          isOpen
          onClose={() => setSyncDog(null)}
          onUpdateDog={p.onUpdateDogTelemetry}
          isDarkMode
          otherDogColors={colorsUsedByOthers(p.dogs.filter((d) => d.id !== syncDog.id))}
        />
      )}
    </section>
  );
};

const DogDetail: React.FC<{ dog: Dog; p: EvoProps; nav: EvoNav; onClose: () => void; onOpenSync: (dog: Dog) => void }> = ({ dog, p, nav, onClose, onOpenSync }) => {
  const { s, lang } = useEvo();
  // The Sheet captures `dog` when opened; look up the live copy so the manual-bark toggle
  // reflects state changes made here or by other clients.
  const liveDog = p.dogs.find((d) => d.id === dog.id) || dog;
  const rel = relToUser(p.userLocation, dog.lat, dog.lng);
  const hidden = p.hiddenDogIds.includes(dog.id);
  // Only the collar's own device or the hunt master may remove it or drive its settings;
  // everyone else sees it read-only.
  const canManage = p.isMyDog(dog) || Boolean(p.currentSession?.isJahtimestari);
  const { syncNow, isSyncingGps, syncFeedback, clearFeedback } = useManualCollarSync(p.onUpdateDogTelemetry);

  return (
    <div className="space-y-3">
      <div className="evo-card flex items-center gap-3 px-3.5 py-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl text-[17px] font-extrabold" style={{ background: dog.color + '22', color: dog.color }}>{dog.name.charAt(0)}</span>
        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-extrabold">{dog.name}</div>
          <div className="text-[11.5px]" style={{ color: 'var(--e-text-3)' }}>{dog.breed} · <span className="evo-mono">{dog.trackerModel || dog.collarId}</span></div>
        </div>
        <span className="font-bold" style={{ color: liveDog.manualBarkActive ? 'var(--e-alert)' : toneColor(dogStatusTone(dog.status)) }}>
          {liveDog.manualBarkActive ? '🔊 HAUKKUU' : dogStatusLabel(dog.status, s)}
        </span>
      </div>

      <CollarTelemetryGauges dog={dog} userLocation={p.userLocation} onUpdateDogTelemetry={p.onUpdateDogTelemetry} />

      <div className="evo-card flex items-center justify-between gap-3 px-3.5 py-2.5 text-[12px]">
        <span style={{ color: 'var(--e-text-2)' }}>🔊 {s.totalBarked}: <b style={{ color: 'var(--e-text)' }}>{formatBarkDuration(calculateTotalBarkMs(dog.trackHistory))}</b></span>
        {dog.lastBarkTimestamp ? <span style={{ color: 'var(--e-text-3)' }}>{s.lastBark}: {timeAgo(dog.lastBarkTimestamp, lang)}</span> : null}
      </div>

      <div className="flex gap-2">
        <Btn block onClick={() => { p.setSelectedDogId(dog.id); p.setMapFocusTarget({ lat: dog.lat, lng: dog.lng }); nav.goMap(); onClose(); }}><MapPin className="h-4 w-4" />{s.map}</Btn>
        <Btn block onClick={() => p.onToggleDogVisibility(dog.id)}>
          {hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          {hidden ? s.showOnMap : s.hideOnMap}
        </Btn>
      </div>

      <Btn block onClick={() => p.onToggleManualBark(liveDog.id)}>
        🔊 {liveDog.manualBarkActive ? 'Haukkuu – lopeta' : 'Merkitse haukku'}
      </Btn>
      {liveDog.manualBarkActive && (
        <div className="px-1 text-[11px] font-bold" style={{ color: 'var(--e-alert)' }}>
          {liveDog.manualBarkBy ? `${liveDog.manualBarkBy} • ` : ''}
          {liveDog.manualBarkAt
            ? new Date(liveDog.manualBarkAt).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })
            : ''}
        </div>
      )}

      <div className="flex gap-2">
        <Btn block disabled={isSyncingGps} onClick={() => syncNow(dog)}>
          <RotateCcw className={'h-4 w-4' + (isSyncingGps ? ' animate-spin' : '')} />
          {isSyncingGps ? s.refreshing : s.refreshNow}
        </Btn>
        {canManage && (
          <Btn block onClick={() => onOpenSync(dog)}><Radio className="h-4 w-4" />{s.collarConnection}</Btn>
        )}
      </div>

      {dog.simNumber && (
        <a href={`tel:${dog.simNumber}`} className="evo-btn block no-underline">
          <Phone className="h-4 w-4" />{s.callCollar} ({dog.simNumber})
        </a>
      )}

      {syncFeedback && (
        <button className="evo-card block w-full px-3 py-2 text-left text-[12px] font-bold" style={{ color: 'var(--e-signal)' }} onClick={clearFeedback}>
          {syncFeedback}
        </button>
      )}

      {canManage && (
        <CollarDiagnosticsPanel dog={dog} isSyncingGps={isSyncingGps} onManualSyncDog={syncNow} />
      )}
      {canManage && (
        <CollarControlPanel dog={dog} onUpdateDogTelemetry={p.onUpdateDogTelemetry} onToggleDogAlert={p.onToggleDogAlert} onOpenIcarSync={() => onOpenSync(dog)} />
      )}
      <CollarTrackHistoryLog trackHistory={dog.trackHistory} />

      {!p.isMyDog(dog) && (
        <Btn block onClick={() => p.onClaimDog(dog.id)}><UserCheck className="h-4 w-4" />{s.claimCollar}</Btn>
      )}

      {p.isMyDog(dog) && (
        <Btn block onClick={() => { p.onUnshareDog(dog.id); onClose(); }}><Download className="h-4 w-4" />{s.toLibrary}</Btn>
      )}

      {canManage && (
        <Btn variant="danger" block onClick={() => {
          if (window.confirm(`${s.remove} “${dog.name}”?`)) { p.onDeleteDog(dog.id); onClose(); }
        }}><Trash2 className="h-4 w-4" />{s.remove}</Btn>
      )}
    </div>
  );
};
