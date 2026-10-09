import React, { useEffect, useState } from 'react';
import { Plus, Key, Share2, Trash2, LogOut } from 'lucide-react';
import { EvoProps, useEvo, fmtBytes } from '../core';
import { listStoredHunts, forgetStoredHunt, StoredHunt } from '../../services/huntIndex';

/**
 * The hunt hub. Honest about what exists today: the live session, create/join, share,
 * and the hunts stored on *this device*. There is no ownership or archive yet — the
 * server denies `list` and `delete`, and a stored hunt cannot be reopened from here
 * (its capability key is stripped), so this does not pretend otherwise.
 */
export const HuntHub: React.FC<{ p: EvoProps; onClose: () => void }> = ({ p, onClose }) => {
  const { s, lang } = useEvo();
  const [showPin, setShowPin] = useState(false);
  const [deviceHunts, setDeviceHunts] = useState<StoredHunt[]>([]);

  useEffect(() => { setDeviceHunts(listStoredHunts()); }, []);

  const clearOne = (code: string) => {
    forgetStoredHunt(code, p.currentSession?.code);
    setDeviceHunts(listStoredHunts());
  };

  const session = p.currentSession;

  return (
    <div className="space-y-3">
      {session ? (
        <div className="evo-card px-4 py-3.5" style={{ borderColor: 'rgba(245,165,36,.3)' }}>
          <div className="flex items-center justify-between">
            <span className="evo-mono text-[17px] font-bold tracking-wide" style={{ color: 'var(--e-signal)' }}>{session.code}</span>
            <span className="evo-chip live">{s.live}</span>
          </div>
          <div className="mt-1 text-[13px] font-bold">{session.name}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {session.password && (
              <button className="evo-btn sm" onClick={() => setShowPin((v) => !v)}>
                <Key className="h-4 w-4" /><span className="evo-mono">{showPin ? session.password : '••••'}</span>
              </button>
            )}
            <button className="evo-btn sm" onClick={() => { onClose(); p.openShare(); }}><Share2 className="h-4 w-4" />{s.shareHunt}</button>
            <button className="evo-btn sm danger" onClick={p.onLeaveSession}><LogOut className="h-4 w-4" />{s.leaveHunt}</button>
          </div>
        </div>
      ) : (
        <div className="evo-card px-4 py-4 text-center">
          <div className="font-bold">{s.noSessionTitle}</div>
          <p className="mt-1 text-[12px]" style={{ color: 'var(--e-text-3)' }}>{s.noSessionBody}</p>
        </div>
      )}

      <div className="flex gap-2">
        <button className="evo-btn primary flex-1" onClick={() => { onClose(); p.openSessionAuth(); }}><Plus className="h-4 w-4" />{s.createHunt}</button>
        <button className="evo-btn flex-1" onClick={() => { onClose(); p.openSessionAuth(); }}><Key className="h-4 w-4" />{s.joinHunt}</button>
      </div>

      <div className="evo-micro px-1 pt-2">{s.deviceHunts}</div>
      <p className="px-1 text-[11px]" style={{ color: 'var(--e-text-3)' }}>{s.deviceNote}</p>

      {deviceHunts.length === 0 && <p className="px-1 py-2 text-[12px]" style={{ color: 'var(--e-text-3)' }}>—</p>}
      {deviceHunts.map((h) => (
        <div key={h.code} className="evo-card flex items-center justify-between gap-3 px-3.5 py-3">
          <div className="min-w-0">
            <div className="evo-mono text-[14px] font-bold tracking-wide" style={{ color: 'var(--e-signal)' }}>{h.code}</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px]" style={{ color: 'var(--e-text-3)' }}>
              {h.name && <span className="truncate">{h.name}</span>}
              <span>{fmtBytes(h.bytes)}</span>
              <span>{h.dogCount} {lang === 'en' ? 'dogs' : 'koiraa'}</span>
            </div>
          </div>
          <button className="evo-iconbtn flex-none" onClick={() => clearOne(h.code)} aria-label={s.clearDevice}><Trash2 className="h-[18px] w-[18px]" /></button>
        </div>
      ))}
    </div>
  );
};
