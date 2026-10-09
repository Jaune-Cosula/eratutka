import React from 'react';
import { User, LogIn, ChevronRight, Layers, MapPin, RotateCcw } from 'lucide-react';
import { EvoProps, EvoNav, useEvo, Btn, Seg } from '../core';
import { useSyncedSetting } from '../../hooks/useSyncedSetting';
import { useLanguage } from '../../context/LanguageContext';
import { MapLayerType } from '../../types';

export const AccountScreen: React.FC<{ p: EvoProps; nav: EvoNav }> = ({ p, nav }) => {
  const { s } = useEvo();
  const { language, setLanguage } = useLanguage();
  const [bounds, setBounds] = useSyncedSetting('showPropertyBoundaries');
  const [mmlSource, setMmlSource] = useSyncedSetting('mmlSource');
  const [mmlKey, setMmlKey] = useSyncedSetting('mmlApiKey');

  const signedIn = Boolean(p.currentUser);
  const name = p.userProfile?.displayName || p.currentUser?.displayName || p.currentUser?.email || s.notSignedIn;

  return (
    <section className="absolute inset-0 overflow-y-auto pb-6">
      <header className="px-4 pt-4 pb-2.5">
        <h1 className="text-[22px] font-extrabold">{s.account}</h1>
        <div className="evo-micro">{s.profile}</div>
      </header>

      <div className="space-y-2.5 px-4">
        {signedIn ? (
          <div className="evo-card flex items-center gap-3.5 px-4 py-4" style={{ background: 'linear-gradient(135deg, rgba(245,165,36,.10), rgba(34,197,94,.06))' }}>
            <span className="flex h-14 w-14 flex-none items-center justify-center rounded-2xl text-[24px] font-extrabold" style={{ background: 'linear-gradient(180deg,#ffc65c,var(--e-signal))', color: '#201400' }}>{name.charAt(0).toUpperCase()}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[18px] font-extrabold">{name}</div>
              {p.currentUser?.email && <div className="truncate text-[12px]" style={{ color: 'var(--e-text-3)' }}>{p.currentUser.email}</div>}
              {p.userProfile?.huntingClub && <div className="text-[12px]" style={{ color: 'var(--e-text-3)' }}>{s.club}: {p.userProfile.huntingClub}</div>}
            </div>
          </div>
        ) : (
          <div className="evo-card px-4 py-5 text-center">
            <User className="mx-auto mb-2 h-9 w-9" style={{ color: 'var(--e-text-3)' }} />
            <div className="font-bold">{s.notSignedIn}</div>
            <p className="mt-1 text-[12px]" style={{ color: 'var(--e-text-3)' }}>{s.signedInHint}</p>
            <Btn variant="primary" className="mt-4" onClick={p.openUserAuth}><LogIn className="h-4 w-4" />{s.signIn}</Btn>
          </div>
        )}

        <Row label={s.currentHunt} hint={p.currentSession?.code || s.noHunt} onClick={() => nav.openHub()} />
        <Row label={p.currentSession ? s.shareHunt : s.createHunt} hint={p.currentSession?.name} onClick={() => (p.currentSession ? p.openShare() : p.openSessionAuth())} />

        <div className="evo-micro px-1 pt-3">{s.settings}</div>

        <div className="evo-card divide-y" style={{ borderColor: 'var(--e-border-soft)' }}>
          <div className="flex items-center justify-between px-4 py-3">
            <span className="font-bold">{s.language}</span>
            <div style={{ width: 120 }}>
              <Seg value={language} onChange={setLanguage} options={[{ v: 'fi', label: 'FI' }, { v: 'en', label: 'EN' }]} />
            </div>
          </div>

          <label className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="flex items-center gap-2 font-bold"><Layers className="h-4 w-4" style={{ color: 'var(--e-signal)' }} />{s.mapLayer}</span>
            <select
              className="rounded-[10px] border bg-transparent px-3 py-2 text-[14px] font-semibold outline-none"
              style={{ borderColor: 'var(--e-border)', color: 'var(--e-text)', width: 150 }}
              value={p.mapLayer}
              onChange={(e) => p.setMapLayer(e.target.value as MapLayerType)}
            >
              <option value="mml_maasto">{s.layerTerrain}</option>
              <option value="mml_tausta">{s.layerBase}</option>
              <option value="opentopo">{s.layerOpenTopo}</option>
              <option value="satellite">{s.layerAerial}</option>
            </select>
          </label>

          <div className="flex items-center justify-between px-4 py-3">
            <span className="flex items-center gap-2 font-bold"><MapPin className="h-4 w-4" style={{ color: 'var(--e-signal)' }} />{s.bounds}</span>
            <button className={'evo-switch' + (bounds ? ' on' : '')} onClick={() => setBounds(!bounds)} aria-label={s.bounds} />
          </div>

          <div className="flex items-center justify-between px-4 py-3">
            <span className="font-bold">{s.mmlSource}</span>
            <div style={{ width: 150 }}>
              <Seg value={mmlSource} onChange={setMmlSource} options={[{ v: 'kapsi', label: s.kapsi }, { v: 'custom', label: s.ownKey }]} />
            </div>
          </div>

          {mmlSource === 'custom' && (
            <div className="px-4 py-3">
              <input
                className="evo-mono w-full rounded-[10px] border bg-transparent px-3 py-2.5 text-[14px] outline-none"
                style={{ borderColor: 'var(--e-border)', color: 'var(--e-text)' }}
                value={mmlKey}
                onChange={(e) => setMmlKey(e.target.value)}
                placeholder="MML API key"
              />
            </div>
          )}
        </div>

        <div className="evo-micro px-1 pt-3">Prototyyppi</div>
        <div className="evo-card px-4 py-3">
          <p className="text-[12px]" style={{ color: 'var(--e-text-3)' }}>{s.switchToClassicHint}</p>
          <Btn block className="mt-3" onClick={() => p.setUiMode('classic')}><RotateCcw className="h-4 w-4" />{s.switchToClassic}</Btn>
        </div>
      </div>
    </section>
  );
};

const Row: React.FC<{ label: string; hint?: string; onClick: () => void }> = ({ label, hint, onClick }) => (
  <div className="evo-card tap flex items-center justify-between px-4 py-3" onClick={onClick}>
    <div className="min-w-0">
      <div className="font-bold">{label}</div>
      {hint && <div className="truncate text-[12px]" style={{ color: 'var(--e-text-3)' }}>{hint}</div>}
    </div>
    <ChevronRight className="h-4 w-4 flex-none" style={{ color: 'var(--e-text-3)' }} />
  </div>
);
