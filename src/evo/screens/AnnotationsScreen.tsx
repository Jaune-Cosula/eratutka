import React, { useState } from 'react';
import { Plus, MapPin, Trash2 } from 'lucide-react';
import { MapAnnotation } from '../../types';
import { EvoProps, EvoNav, useEvo, relToUser, fmtDist, catLabel, catColor, fmtClock, Sheet, Btn } from '../core';

export const AnnotationsScreen: React.FC<{ p: EvoProps; nav: EvoNav }> = ({ p, nav }) => {
  const { s, lang } = useEvo();
  const [detail, setDetail] = useState<MapAnnotation | null>(null);

  return (
    <section className="absolute inset-0 overflow-y-auto pb-6">
      <header className="sticky top-0 z-10 flex items-end justify-between gap-3 px-4 pt-4 pb-2.5" style={{ background: 'linear-gradient(180deg, rgba(11,15,20,.98) 72%, rgba(11,15,20,0))' }}>
        <div>
          <h1 className="text-[22px] font-extrabold">{s.marks}</h1>
          <div className="evo-micro">{p.annotations.length} {lang === 'en' ? 'on map' : 'kartalla'}</div>
        </div>
        <Btn variant="primary" sm onClick={p.openAddAnnotation}><Plus className="h-4 w-4" />{s.addMark}</Btn>
      </header>

      <div className="space-y-2.5 px-4">
        {p.annotations.length === 0 && (
          <div className="evo-card px-5 py-8 text-center">
            <MapPin className="mx-auto mb-2 h-9 w-9" style={{ color: 'var(--e-text-3)' }} />
            <div className="font-bold">{s.marks}</div>
            <Btn variant="primary" sm className="mt-4" onClick={p.openAddAnnotation}><Plus className="h-4 w-4" />{s.addMark}</Btn>
          </div>
        )}
        {p.annotations.map((a) => {
          const rel = relToUser(p.userLocation, a.lat, a.lng);
          const color = catColor(a.category);
          return (
            <div key={a.id} className="evo-card tap flex items-center gap-3 px-3.5 py-3" onClick={() => setDetail(a)}>
              <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl" style={{ background: color + '22', color }}><MapPin className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-extrabold">{a.title}</div>
                <div className="mt-0.5 flex items-center gap-2 text-[11.5px]" style={{ color: 'var(--e-text-3)' }}>
                  <span>{catLabel(a.category, s)}</span>
                  {a.description && <><span>·</span><span className="truncate">{a.description}</span></>}
                </div>
              </div>
              <div className="flex-none text-right">
                <div className="evo-mono text-[15px] font-bold">{rel ? fmtDist(rel.dist) : '—'}</div>
                <div className="text-[10px] font-bold" style={{ color: 'var(--e-text-3)' }}>{rel ? rel.compass + ' · ' : ''}{fmtClock(a.createdAt)}</div>
              </div>
            </div>
          );
        })}
      </div>

      {detail && (
        <Sheet title={detail.title} onClose={() => setDetail(null)}>
          <div className="space-y-3">
            <div className="evo-card flex items-center gap-3 px-3.5 py-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: catColor(detail.category) + '22', color: catColor(detail.category) }}><MapPin className="h-5 w-5" /></span>
              <div>
                <div className="text-[15px] font-extrabold">{catLabel(detail.category, s)}</div>
                {detail.description && <div className="text-[12px]" style={{ color: 'var(--e-text-3)' }}>{detail.description}</div>}
              </div>
            </div>
            <div className="text-[12px]" style={{ color: 'var(--e-text-3)' }}>{detail.createdBy} · {fmtClock(detail.createdAt)}</div>
            <Btn block onClick={() => { p.setMapFocusTarget({ lat: detail.lat, lng: detail.lng }); nav.goMap(); setDetail(null); }}><MapPin className="h-4 w-4" />{s.map}</Btn>
            <Btn variant="danger" block onClick={() => { p.onDeleteAnnotation(detail.id); setDetail(null); }}><Trash2 className="h-4 w-4" />{s.remove}</Btn>
          </div>
        </Sheet>
      )}
    </section>
  );
};
