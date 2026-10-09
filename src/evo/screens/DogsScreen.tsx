import React, { useState } from 'react';
import { Plus, Battery, Signal, Trash2, MapPin, Download, PawPrint, Activity } from 'lucide-react';
import { Dog } from '../../types';
import { EvoProps, EvoNav, useEvo, relToUser, fmtDist, dogStatusLabel, dogStatusTone, timeAgo, fmtClock, Sheet, Btn } from '../core';

const toneColor = (t: string) => (t === 'live' ? 'var(--e-live)' : t === 'info' ? 'var(--e-info)' : t === 'alert' ? 'var(--e-alert)' : 'var(--e-text-2)');

export const DogsScreen: React.FC<{ p: EvoProps; nav: EvoNav }> = ({ p, nav }) => {
  const { s, lang } = useEvo();
  const [detail, setDetail] = useState<Dog | null>(null);

  return (
    <section className="absolute inset-0 overflow-y-auto pb-6">
      <header className="sticky top-0 z-10 flex items-end justify-between gap-3 px-4 pt-4 pb-2.5" style={{ background: 'linear-gradient(180deg, rgba(11,15,20,.98) 72%, rgba(11,15,20,0))' }}>
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
              </div>
              <div className="flex-none text-right">
                <div className="evo-mono text-[16px] font-bold">{rel ? fmtDist(rel.dist) : '—'}</div>
                <div className="text-[10px] font-bold" style={{ color: 'var(--e-text-3)' }}>{rel ? rel.compass : s.lost} · {timeAgo(dog.lastUpdated, lang)}</div>
              </div>
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
          <DogDetail dog={detail} p={p} nav={nav} onClose={() => setDetail(null)} />
        </Sheet>
      )}
    </section>
  );
};

const DogDetail: React.FC<{ dog: Dog; p: EvoProps; nav: EvoNav; onClose: () => void }> = ({ dog, p, nav, onClose }) => {
  const { s, lang } = useEvo();
  const rel = relToUser(p.userLocation, dog.lat, dog.lng);
  const points = dog.trackHistory?.length || 0;

  return (
    <div className="space-y-3">
      <div className="evo-card flex items-center gap-3 px-3.5 py-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl text-[17px] font-extrabold" style={{ background: dog.color + '22', color: dog.color }}>{dog.name.charAt(0)}</span>
        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-extrabold">{dog.name}</div>
          <div className="text-[11.5px]" style={{ color: 'var(--e-text-3)' }}>{dog.breed} · <span className="evo-mono">{dog.trackerModel || dog.collarId}</span></div>
        </div>
        <span className="font-bold" style={{ color: toneColor(dogStatusTone(dog.status)) }}>{dogStatusLabel(dog.status, s)}</span>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        <Gauge value={rel ? fmtDist(rel.dist) : '—'} label={`${s.distance}${rel ? ' · ' + rel.compass : ''}`} />
        <Gauge value={String(dog.speed)} label={`${s.speed} (km/h)`} />
        <Gauge value={dog.battery + '%'} label={s.battery} />
      </div>

      <div className="evo-card flex items-center justify-between px-3.5 py-3 text-[12px]">
        <span className="flex items-center gap-2" style={{ color: 'var(--e-text-2)' }}><Activity className="h-4 w-4" style={{ color: 'var(--e-signal)' }} />{s.history}: <b>{points}</b> {lang === 'en' ? 'points' : 'pistettä'}</span>
        <span style={{ color: 'var(--e-text-3)' }}>{s.lastSeen}: {fmtClock(dog.lastUpdated)}</span>
      </div>

      <div className="flex gap-2">
        <Btn block onClick={() => { p.setSelectedDogId(dog.id); p.setMapFocusTarget({ lat: dog.lat, lng: dog.lng }); nav.goMap(); onClose(); }}><MapPin className="h-4 w-4" />{s.map}</Btn>
      </div>

      {p.isMyDog(dog) && (
        <Btn block onClick={() => { p.onUnshareDog(dog.id); onClose(); }}><Download className="h-4 w-4" />{s.toLibrary}</Btn>
      )}

      <Btn variant="danger" block onClick={() => {
        if (window.confirm(`${s.remove} “${dog.name}”?`)) { p.onDeleteDog(dog.id); onClose(); }
      }}><Trash2 className="h-4 w-4" />{s.remove}</Btn>
    </div>
  );
};

const Gauge: React.FC<{ value: string; label: string }> = ({ value, label }) => (
  <div className="evo-card px-2.5 py-3 text-center">
    <div className="evo-mono text-[19px] font-bold">{value}</div>
    <div className="evo-micro mt-1">{label}</div>
  </div>
);
