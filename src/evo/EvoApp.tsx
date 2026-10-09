import React, { useState } from 'react';
import { Map as MapIcon, PawPrint, Users, MapPin, User, ChevronDown } from 'lucide-react';
import './evo.css';
import { EvoProps, EvoNav, useEvo, Sheet } from './core';
import { MapScreen } from './screens/MapScreen';
import { DogsScreen } from './screens/DogsScreen';
import { TeamScreen } from './screens/TeamScreen';
import { AnnotationsScreen } from './screens/AnnotationsScreen';
import { AccountScreen } from './screens/AccountScreen';
import { HuntHub } from './screens/HuntHub';

type EvoTab = 'map' | 'dogs' | 'team' | 'marks' | 'account';

/**
 * Evo — "Kenttäinstrumentti". A second front-end over the same engine: it renders the
 * app's real data and handlers (passed in as `EvoProps`) but with its own shell and
 * screens. It owns no data hooks of its own, so nothing is polled or written twice.
 *
 * Mounted from App.tsx when uiMode === 'evo'. On wide screens the column is capped so
 * the field-instrument feel survives on a desktop without a literal device frame.
 */
export const EvoApp: React.FC<{ p: EvoProps }> = ({ p }) => {
  const { s } = useEvo();
  const [tab, setTab] = useState<EvoTab>('map');
  const [hubOpen, setHubOpen] = useState(false);
  const nav: EvoNav = { goMap: () => setTab('map'), openHub: () => setHubOpen(true) };

  const active = Boolean(p.currentSession);
  const code = p.currentSession?.code || s.noHunt;
  const name = p.currentSession?.name || (p.currentSession ? '' : s.noSessionBody);

  return (
    <div className="evo-root relative flex h-[100dvh] max-h-[100dvh] w-full flex-col overflow-hidden">
      <div className="mx-auto flex h-full w-full max-w-[560px] flex-col overflow-hidden">
        {/* Situation bar */}
        <button
          onClick={() => setHubOpen(true)}
          className="flex flex-none items-center gap-2.5 border-b px-3.5 pb-3 pt-3 text-left"
          style={{ borderColor: 'var(--e-border-soft)', background: 'linear-gradient(180deg, rgba(11,15,20,.96), rgba(11,15,20,.7))' }}
        >
          <span className={active ? 'evo-livedot' : 'evo-livedot off'} />
          <span className="min-w-0 flex-1">
            <span className="evo-mono flex items-center gap-2 text-[15px] font-bold tracking-wide" style={{ color: active ? 'var(--e-signal)' : 'var(--e-text-2)' }}>
              {code}
            </span>
            <span className="mt-0.5 block truncate text-[11px] font-semibold" style={{ color: 'var(--e-text-2)' }}>{name}</span>
          </span>
          {active && (
            <span className="flex flex-none items-center gap-3 text-[12px] font-bold" style={{ color: 'var(--e-text-2)' }}>
              <span className="flex items-center gap-1.5"><Users className="h-4 w-4" style={{ color: 'var(--e-info)' }} />{p.team.length}</span>
              <span className="flex items-center gap-1.5"><PawPrint className="h-4 w-4" style={{ color: 'var(--e-signal)' }} />{p.visibleDogs.length}</span>
            </span>
          )}
          <ChevronDown className="h-4 w-4 flex-none" style={{ color: 'var(--e-text-3)' }} />
        </button>

        {/* Viewport */}
        <div className="relative flex-1 overflow-hidden">
          {tab === 'map' && <MapScreen p={p} nav={nav} />}
          {tab === 'dogs' && <DogsScreen p={p} nav={nav} />}
          {tab === 'team' && <TeamScreen p={p} nav={nav} />}
          {tab === 'marks' && <AnnotationsScreen p={p} nav={nav} />}
          {tab === 'account' && <AccountScreen p={p} nav={nav} />}
        </div>

        {/* Bottom navigation */}
        <nav className="evo-nav flex-none">
          {([
            ['map', <MapIcon className="h-[22px] w-[22px]" key="i" />, s.map],
            ['dogs', <PawPrint className="h-[22px] w-[22px]" key="i" />, s.dogs],
            ['team', <Users className="h-[22px] w-[22px]" key="i" />, s.team],
            ['marks', <MapPin className="h-[22px] w-[22px]" key="i" />, s.marks],
            ['account', <User className="h-[22px] w-[22px]" key="i" />, s.account],
          ] as [EvoTab, React.ReactNode, string][]).map(([key, icon, label]) => (
            <button key={key} className={tab === key ? 'on' : ''} onClick={() => setTab(key)}>
              {icon}
              <span className="evo-navlabel">{label}</span>
              {key === 'team' && p.unreadRadioCount > 0 && (
                <span className="absolute right-1/2 -mr-5 top-1 rounded-full px-1.5 text-[9px] font-extrabold text-white" style={{ background: 'var(--e-alert)' }}>
                  {p.unreadRadioCount}
                </span>
              )}
            </button>
          ))}
        </nav>

        {hubOpen && (
          <Sheet title={s.currentHunt} onClose={() => setHubOpen(false)}>
            <HuntHub p={p} onClose={() => setHubOpen(false)} />
          </Sheet>
        )}
      </div>
    </div>
  );
};
