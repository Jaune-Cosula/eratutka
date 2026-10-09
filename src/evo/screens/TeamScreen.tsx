import React, { useMemo, useState } from 'react';
import { Users, Radio as RadioIcon, Send, Trash2, Crown } from 'lucide-react';
import { TeamMember, HunterStatus } from '../../types';
import { EvoProps, EvoNav, useEvo, relToUser, fmtDist, roleLabel, hunterStatusLabel, fmtClock, Sheet, Btn, Seg } from '../core';

export const TeamScreen: React.FC<{ p: EvoProps; nav: EvoNav }> = ({ p }) => {
  const { s } = useEvo();
  const [seg, setSeg] = useState<'members' | 'radio'>('members');
  const [member, setMember] = useState<TeamMember | null>(null);

  return (
    <section className="absolute inset-0 flex flex-col">
      <header className="flex-none px-4 pt-4 pb-3">
        <h1 className="text-[22px] font-extrabold">{s.team}</h1>
        <div className="evo-micro">{p.currentSession?.code || s.noHunt}</div>
      </header>

      <div className="flex-none px-4">
        <Seg
          value={seg}
          onChange={setSeg}
          options={[
            { v: 'members', label: <><Users className="h-4 w-4" />{s.members} {p.team.length}</> },
            { v: 'radio', label: <><RadioIcon className="h-4 w-4" />{s.radio}</> },
          ]}
        />
      </div>

      {seg === 'members' ? (
        <div className="flex-1 space-y-2.5 overflow-y-auto px-4 pb-6 pt-3">
          {p.team.map((m) => {
            const rel = relToUser(p.userLocation, m.lat, m.lng);
            const isMe = Boolean(p.currentSession?.myNickname && m.name === p.currentSession.myNickname) || m.id === 'self';
            return (
              <div key={m.id} className="evo-card tap flex items-center gap-3 px-3.5 py-3" onClick={() => setMember(m)}>
                <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl text-[15px] font-extrabold" style={{ background: 'rgba(56,189,248,.14)', color: 'var(--e-info)' }}>{m.name.charAt(0)}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[15px] font-extrabold">
                    <span className="truncate">{m.name}{isMe ? ' (sinä)' : ''}</span>
                    {m.role === 'päällikkö' && <span className="evo-chip warn"><Crown className="h-3 w-3" />{s.owner}</span>}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[11.5px]">
                    <span style={{ color: 'var(--e-text-3)' }}>{roleLabel(m.role, s)}</span>
                    <span style={{ color: m.status === 'liikkeella' ? 'var(--e-info)' : 'var(--e-text-2)' }}>· {hunterStatusLabel(m.status, s)}</span>
                  </div>
                </div>
                <div className="flex-none text-right">
                  <div className="evo-mono text-[15px] font-bold">{rel ? fmtDist(rel.dist) : '—'}</div>
                  <div className="text-[10px] font-bold" style={{ color: 'var(--e-text-3)' }}>{rel ? rel.compass : ''} · {m.battery}%</div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Radio p={p} />
      )}

      {member && (
        <Sheet title={member.name} onClose={() => setMember(null)}>
          <MemberDetail member={member} p={p} onClose={() => setMember(null)} />
        </Sheet>
      )}
    </section>
  );
};

const MemberDetail: React.FC<{ member: TeamMember; p: EvoProps; onClose: () => void }> = ({ member, p, onClose }) => {
  const { s } = useEvo();
  const statuses: HunterStatus[] = ['passissa', 'liikkeella', 'kaato', 'tauolla'];
  const canManage = Boolean(p.currentSession?.isJahtimestari);

  return (
    <div className="space-y-3">
      <div className="evo-card px-3.5 py-3">
        <div className="text-[16px] font-extrabold">{member.name}</div>
        <div className="text-[12px]" style={{ color: 'var(--e-text-3)' }}>{roleLabel(member.role, s)}</div>
      </div>
      <div className="evo-micro px-1">{s.status}</div>
      <div className="grid grid-cols-2 gap-2">
        {statuses.map((st) => (
          <div
            key={st}
            className="evo-card tap px-3 py-2.5 text-center font-bold"
            style={{ borderColor: member.status === st ? 'var(--e-signal)' : undefined, color: member.status === st ? 'var(--e-signal)' : 'var(--e-text-2)' }}
            onClick={() => { p.onUpdateMemberStatus(member.id, st); onClose(); }}
          >
            {hunterStatusLabel(st, s)}
          </div>
        ))}
      </div>
      {canManage && (
        <Btn variant="danger" block onClick={() => { p.onDeleteHunter(member.id); onClose(); }}><Trash2 className="h-4 w-4" />{s.remove}</Btn>
      )}
    </div>
  );
};

const Radio: React.FC<{ p: EvoProps }> = ({ p }) => {
  const { s } = useEvo();
  const [text, setText] = useState('');
  const quick = ['Rex haukkuu', 'Kaato', 'Siirtykää linjaan', 'Näköhavainto', 'Odottakaa'];

  const ordered = useMemo(() => [...p.radioMessages].sort((a, b) => a.timestamp - b.timestamp), [p.radioMessages]);
  const send = (t: string) => {
    const clean = t.trim();
    if (!clean) return;
    p.onSendMessage(clean);
    setText('');
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="evo-rail flex-none px-4 py-2">
        {quick.map((q) => (
          <button key={q} className="evo-btn sm flex-none" onClick={() => send(q)}>{q}</button>
        ))}
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto px-4 pb-3">
        {ordered.length === 0 && <p className="py-6 text-center text-[12px]" style={{ color: 'var(--e-text-3)' }}>{s.radio}</p>}
        {ordered.map((msg) => {
          const mine = Boolean(p.currentSession?.myNickname && msg.senderName === p.currentSession.myNickname);
          return (
            <div key={msg.id} className={'max-w-[85%] rounded-2xl border px-3 py-2 text-[13.5px] leading-snug ' + (mine ? 'ml-auto' : '')}
              style={mine ? { background: 'var(--e-signal-soft)', borderColor: 'rgba(245,165,36,.3)' } : { background: 'var(--e-surface-2)', borderColor: 'var(--e-border-soft)' }}>
              <div className="text-[10px] font-extrabold uppercase tracking-wide opacity-70">{msg.senderName}</div>
              <div>{msg.text}</div>
              <div className="mt-0.5 text-[9.5px] opacity-55">{fmtClock(msg.timestamp)}</div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-none items-center gap-2 border-t px-4 py-3" style={{ borderColor: 'var(--e-border-soft)' }}>
        <input
          className="w-full rounded-[10px] border bg-transparent px-3 py-2.5 text-[15px] font-semibold outline-none"
          style={{ borderColor: 'var(--e-border)', color: 'var(--e-text)' }}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') send(text); }}
          placeholder={s.msgPlaceholder}
        />
        <button className="evo-iconbtn on" onClick={() => send(text)} aria-label={s.send}><Send className="h-[19px] w-[19px]" /></button>
      </div>
    </div>
  );
};
