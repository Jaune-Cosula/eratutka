import React, { useState } from 'react';
import { Layers, Radar, Crosshair, TriangleAlert, Plus, Ruler, PawPrint } from 'lucide-react';
import { MapContainer } from '../../components/MapContainer';
import { Dog } from '../../types';
import { EvoProps, EvoNav, useEvo, relToUser, fmtDist, dogStatusLabel, Sheet } from '../core';

/**
 * The field view. The map itself is the real, shared <MapContainer> in its "evo"
 * variant — every collar position, track and ring the classic UI draws is drawn here
 * too, because it is the same component. Evo only replaces the chrome around it.
 */
export const MapScreen: React.FC<{ p: EvoProps; nav: EvoNav }> = ({ p }) => {
  const { s } = useEvo();
  const [radarOn, setRadarOn] = useState(false);
  const [ruler, setRuler] = useState(false);
  const [layerSheet, setLayerSheet] = useState(false);

  const recenter = () => {
    if (p.userLocation) p.setMapFocusTarget({ lat: p.userLocation.lat, lng: p.userLocation.lng });
  };

  return (
    <section className="absolute inset-0">
      <MapContainer
        variant="evo"
        mapLayer={p.mapLayer}
        setMapLayer={p.setMapLayer}
        dogs={p.dogs}
        hiddenDogIds={p.hiddenDogIds}
        selectedDogId={p.selectedDogId}
        setSelectedDogId={p.setSelectedDogId}
        team={p.team}
        selectedHunterId={p.selectedHunterId}
        setSelectedHunterId={p.setSelectedHunterId}
        annotations={p.annotations}
        safetySectors={p.safetySectors}
        userLocation={p.userLocation}
        isDarkMode={true}
        onMapClick={p.onMapClick}
        activeRulerPoint={p.activeRulerPoint}
        rulerActive={ruler}
        onClearRulerPoint={() => p.setActiveRulerPoint(null)}
        showSafetySectors={p.showSafetySectors}
        setShowSafetySectors={p.setShowSafetySectors}
        showDogTracks={p.showDogTracks}
        setShowDogTracks={p.setShowDogTracks}
        showHunterNames={p.showHunterNames}
        setShowHunterNames={p.setShowHunterNames}
        toggleGps={p.toggleGps}
        isGpsTracking={p.isGpsTracking}
        mapFocusTarget={p.mapFocusTarget}
        myNickname={p.currentSession?.myNickname}
      />

      {/* Overlays — positioned over the full-bleed map, inside the viewport */}
      <div className="pointer-events-none absolute inset-0">
        {/* Safety legend */}
        <div className="pointer-events-auto absolute left-3 top-3 rounded-[10px] border px-3 py-2" style={{ borderColor: 'var(--e-border-soft)', background: 'rgba(11,15,20,.72)', backdropFilter: 'blur(8px)' }}>
          <div className="flex items-center gap-2 text-[10.5px] font-bold" style={{ color: '#fcd34d' }}>
            <span className="inline-block h-3 w-3 rounded-full border border-dashed" style={{ borderColor: 'rgba(245,165,36,.7)' }} />
            {s.buildingLimit}
          </div>
        </div>

        {/* Tools */}
        <div className="pointer-events-auto absolute right-3 top-3 flex flex-col gap-2">
          <button className="evo-iconbtn" onClick={() => setLayerSheet(true)} title={s.layers}><Layers className="h-[19px] w-[19px]" /></button>
          <button className={'evo-iconbtn' + (radarOn ? ' on' : '')} onClick={() => setRadarOn((v) => !v)} title={s.radar}><Radar className="h-[19px] w-[19px]" /></button>
          <button className={'evo-iconbtn' + (ruler ? ' on' : '')} onClick={() => setRuler((v) => !v)} title={s.distance}><Ruler className="h-[19px] w-[19px]" /></button>
          <button className="evo-iconbtn" onClick={recenter} title={s.recenter}><Crosshair className="h-[19px] w-[19px]" /></button>
          <button className="evo-iconbtn" onClick={p.openSos} title={s.sos} style={{ color: '#fca5a5', borderColor: 'rgba(239,68,68,.4)' }}><TriangleAlert className="h-[19px] w-[19px]" /></button>
        </div>

        {radarOn && <RadarOverlay p={p} />}

        {/* Dog rail */}
        <div
          className="pointer-events-auto absolute inset-x-0 bottom-0 px-3 pb-3"
          style={{ background: 'linear-gradient(0deg, rgba(11,15,20,.92), rgba(11,15,20,.5) 60%, transparent)' }}
        >
          {p.visibleDogs.length === 0 ? (
            <button className="evo-btn primary block" onClick={p.openAddDog}><Plus className="h-4 w-4" />{s.addDog}</button>
          ) : (
            <div className="evo-rail">
              {p.visibleDogs.map((dog) => <DogChip key={dog.id} dog={dog} p={p} selected={p.selectedDogId === dog.id} />)}
              <button className="evo-btn sm flex-none self-center" onClick={p.openAddDog}><Plus className="h-4 w-4" /></button>
            </div>
          )}
        </div>
      </div>

      {layerSheet && (
        <Sheet title={s.layers} onClose={() => setLayerSheet(false)}>
          <div className="space-y-2">
            {([
              ['mml_maasto', s.layerTerrain], ['mml_tausta', s.layerBase], ['opentopo', s.layerOpenTopo], ['satellite', s.layerAerial],
            ] as const).map(([v, label]) => (
              <div key={v} className="evo-card tap flex items-center justify-between px-4 py-3" onClick={() => { p.setMapLayer(v); setLayerSheet(false); }}>
                <span className="text-[15px] font-bold">{label}</span>
                {p.mapLayer === v && <span style={{ color: 'var(--e-signal)' }}>✓</span>}
              </div>
            ))}
          </div>
        </Sheet>
      )}
    </section>
  );
};

/* ------------------------------------------------------------------ dog chip */

const DogChip: React.FC<{ dog: Dog; p: EvoProps; selected: boolean }> = ({ dog, p, selected }) => {
  const { s } = useEvo();
  const rel = relToUser(p.userLocation, dog.lat, dog.lng);
  const tone = dog.status === 'haukkuu' ? 'var(--e-live)' : dog.status === 'juoksee' || dog.status === 'liikkeessä' ? 'var(--e-info)' : 'var(--e-text-2)';
  const label = dogStatusLabel(dog.status, s);

  return (
    <button
      className="evo-card relative flex-none overflow-hidden px-3 py-2.5 text-left"
      style={{ width: 138, borderColor: selected ? dog.color : undefined }}
      onClick={() => {
        p.setSelectedDogId(dog.id);
        p.setMapFocusTarget({ lat: dog.lat, lng: dog.lng });
      }}
    >
      <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: dog.color }} />
      <span className="flex items-center gap-1.5">
        <span className="flex-1 truncate text-[14px] font-extrabold">{dog.name}</span>
        <span className="text-[10px] font-bold" style={{ color: 'var(--e-text-3)' }}>{dog.battery}%</span>
      </span>
      <span className="mt-1.5 flex items-baseline gap-1">
        <span className="evo-mono text-[20px] font-bold">{rel ? fmtDist(rel.dist) : '—'}</span>
        {rel && <span className="ml-auto text-[11px] font-bold" style={{ color: dog.color }}>{rel.compass}</span>}
      </span>
      <span className="mt-1 flex items-center gap-1 text-[10.5px] font-extrabold" style={{ color: tone }}>
        <PawPrint className="h-3 w-3" /> {label}
      </span>
    </button>
  );
};

/* --------------------------------------------------------------------- radar */

const RadarOverlay: React.FC<{ p: EvoProps }> = ({ p }) => {
  const { s } = useEvo();
  const RANGE = 900;
  return (
    <div className="pointer-events-none absolute bottom-[112px] right-3 h-[168px] w-[168px]">
      <div className="evo-radar absolute inset-0">
        <span className="ring" style={{ width: '100%', height: '100%' }} />
        <span className="ring" style={{ width: '66%', height: '66%' }} />
        <span className="ring" style={{ width: '33%', height: '33%' }} />
        <span className="sweep" />
        {p.visibleDogs.map((dog) => {
          const rel = relToUser(p.userLocation, dog.lat, dog.lng);
          if (!rel) return null;
          const pct = Math.min(1, rel.dist / RANGE);
          const a = ((rel.bearing - 90) * Math.PI) / 180;
          return (
            <span
              key={dog.id}
              className="blip"
              style={{ left: (50 + pct * 44 * Math.cos(a)) + '%', top: (50 + pct * 44 * Math.sin(a)) + '%', background: dog.color, color: dog.color }}
            />
          );
        })}
        <span className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ background: 'var(--e-signal)', boxShadow: '0 0 10px var(--e-signal)' }} />
      </div>
      <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[9.5px] font-extrabold uppercase tracking-widest" style={{ color: 'var(--e-live)' }}>
        {s.radarRange}
      </span>
    </div>
  );
};
