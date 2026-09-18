import React, { useState } from 'react';
import { HuntSession, TeamMember } from '../types';
import { useLanguage } from '../context/LanguageContext';
import { Copy, Check, QrCode, Share2, Key, Users, LogOut, ShieldCheck, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

interface ShareSessionModalProps {
  session: HuntSession;
  team: TeamMember[];
  onClose: () => void;
  onLeaveSession: () => void;
  isDarkMode: boolean;
}

/** Groups the 32-character capability key into blocks so it can be copied or dictated. */
function formatHuntKey(huntKey?: string): string {
  if (!huntKey) return '';
  return String(huntKey)
    .trim()
    .toUpperCase()
    .replace(/(.{4})/g, '$1 ')
    .trim();
}

export const ShareSessionModal: React.FC<ShareSessionModalProps> = ({
  session,
  team,
  onClose,
  onLeaveSession,
  isDarkMode,
}) => {
  const { language } = useLanguage();
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedMsg, setCopiedMsg] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // The capability key goes into the URL fragment, not the query string: a fragment is
  // never sent to the server and never leaks through the Referer header.
  const inviteUrl = session.huntKey
    ? `${window.location.origin}${window.location.pathname}?huntCode=${session.code}#huntKey=${session.huntKey}`
    : `${window.location.origin}${window.location.pathname}?huntCode=${session.code}`;
  const readableKey = formatHuntKey(session.huntKey);
  const shareText = language === 'fi'
    ? `Tule mukaan Erätutka-koiramaastokartalle! Jahtipäivä: ${session.name}. Linkki (avautuu suoraan): ${inviteUrl}` +
      (readableKey ? `\nTai koodilla: ${session.code}, PIN: ${session.password || '1234'}, jahtiavain: ${readableKey}` : '')
    : `Join our Erätutka hunting map! Hunt session: ${session.name}. Link (opens directly): ${inviteUrl}` +
      (readableKey ? `\nOr by code: ${session.code}, PIN: ${session.password || '1234'}, hunt key: ${readableKey}` : '');

  const handleCopyCode = () => {
    navigator.clipboard.writeText(session.code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2500);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(inviteUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleCopyMsg = () => {
    navigator.clipboard.writeText(shareText);
    setCopiedMsg(true);
    setTimeout(() => setCopiedMsg(false), 2500);
  };

  const handleCopyKey = () => {
    if (!session.huntKey) return;
    navigator.clipboard.writeText(session.huntKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2500);
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[3000] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in overflow-y-auto"
    >
      <div
        className={`w-full max-w-lg max-h-[88vh] flex flex-col rounded-3xl border ${
          isDarkMode ? 'bg-stone-900 border-amber-500/30 text-stone-100' : 'bg-white border-amber-300 text-stone-900'
        } shadow-2xl relative my-auto overflow-hidden`}
      >
        {/* Top Accent */}
        <div className="h-2 bg-gradient-to-r from-amber-500 via-emerald-500 to-amber-500 shrink-0"></div>

        <button
          onClick={onClose}
          className="absolute top-3.5 right-3.5 sm:top-4 sm:right-4 p-2 rounded-full bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 shadow-md transition z-20 flex items-center justify-center cursor-pointer active:scale-95"
          title={language === 'fi' ? 'Sulje ikkuna' : 'Close window'}
          aria-label={language === 'fi' ? 'Sulje ikkuna' : 'Close window'}
        >
          <X className="w-5 h-5" />
        </button>

        {/* Scrollable Container */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-4">
          {/* Header */}
          <div className="flex items-center space-x-3 mb-2">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center">
            <Share2 className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-black text-amber-400 font-sans tracking-wide">
              {language === 'fi' ? 'JAA JAHTIPÄIVÄ' : 'SHARE HUNT SESSION'}
            </h2>
            <p className="text-xs text-stone-400">
              {session.name}
            </p>
          </div>
        </div>

        {/* Code & Password Box */}
        <div className="p-4 rounded-2xl bg-stone-950 border border-stone-800 space-y-3 mb-5">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                {language === 'fi' ? 'JAHTIKOODI' : 'HUNT CODE'}
              </span>
              <div className="text-2xl font-black font-mono text-white tracking-widest">
                {session.code}
              </div>
            </div>
            <button
              onClick={handleCopyCode}
              className="px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs transition flex items-center space-x-1.5 shadow cursor-pointer"
            >
              {copiedCode ? <Check className="w-4 h-4 text-emerald-950" /> : <Copy className="w-4 h-4" />}
              <span>{copiedCode ? (language === 'fi' ? 'Kopioitu!' : 'Copied!') : (language === 'fi' ? 'Kopioi koodi' : 'Copy code')}</span>
            </button>
          </div>

          <div className="pt-2 border-t border-stone-800/80 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Key className="w-4 h-4 text-stone-400" />
              <span className="text-xs text-stone-300 font-semibold">{language === 'fi' ? 'Salasana:' : 'Password:'}</span>
              <span className="text-xs font-mono font-bold text-amber-300">
                {showPassword ? (session.password || '1234') : '••••••••'}
              </span>
            </div>
            <button
              onClick={() => setShowPassword(!showPassword)}
              className="text-[11px] font-bold text-stone-400 hover:text-stone-200 underline cursor-pointer"
            >
              {showPassword ? (language === 'fi' ? 'Piilota' : 'Hide') : (language === 'fi' ? 'Näytä' : 'Show')}
            </button>
          </div>

          {readableKey && (
            <div className="pt-2 border-t border-stone-800/80 space-y-2">
              <div className="flex items-center space-x-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span className="text-xs text-stone-300 font-semibold">
                  {language === 'fi' ? 'Jahtiavain:' : 'Hunt key:'}
                </span>
              </div>
              <div className="text-[11px] font-mono font-bold text-emerald-300 break-all leading-relaxed">
                {readableKey}
              </div>
              <button
                onClick={handleCopyKey}
                className="w-full py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 font-bold text-[11px] transition flex items-center justify-center space-x-1.5 cursor-pointer"
              >
                {copiedKey ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                <span>
                  {copiedKey
                    ? language === 'fi'
                      ? 'Avain kopioitu!'
                      : 'Key copied!'
                    : language === 'fi'
                    ? 'Kopioi jahtiavain'
                    : 'Copy hunt key'}
                </span>
              </button>
              <p className="text-[10px] text-stone-500 leading-snug">
                {language === 'fi'
                  ? 'Jahtiavain tarvitaan vain, jos kaveri liittyy koodilla ilman jakolinkkiä.'
                  : 'The hunt key is only needed if someone joins by code without the share link.'}
              </p>
            </div>
          )}
        </div>

        {/* QR Code Graphic Card */}
        <div className="p-4 rounded-2xl bg-stone-950 border border-stone-800 flex flex-col sm:flex-row items-center justify-between gap-4 mb-5">
          <div className="bg-white p-3 rounded-xl border-2 border-amber-500/40 shadow-md shrink-0">
            {/* A real QR code encoding the invite link. Level M error correction keeps it
                readable on a scuffed phone screen; the link carries the hunt key in the
                URL fragment, so scanning it is the fastest way into the hunt. */}
            <QRCodeSVG
              value={inviteUrl}
              size={124}
              level="M"
              bgColor="#ffffff"
              fgColor="#0c0a09"
              title={language === 'fi' ? 'Kutsulinkki jahtiin' : 'Hunt invite link'}
            />
          </div>

          <div className="flex-1 space-y-2 text-center sm:text-left">
            <div className="flex items-center justify-center sm:justify-start space-x-1.5 text-xs font-bold text-amber-400">
              <QrCode className="w-4 h-4" />
              <span>{language === 'fi' ? 'SKANNAA TAI KUTSU LINKILLÄ' : 'SCAN OR INVITE VIA LINK'}</span>
            </div>
            <p className="text-xs text-stone-400 leading-relaxed">
              {language === 'fi'
                ? 'Kaveri voi skannata koodin suoraan maastossa tai avata liittymislinkin puhelimellaan.'
                : 'Teammates can scan the code directly in the field or open the invite link on their phones.'}
            </p>
            <button
              onClick={handleCopyLink}
              className="w-full py-2 px-3 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 text-xs font-bold transition flex items-center justify-center space-x-1.5 cursor-pointer"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>
                {copiedLink
                  ? (language === 'fi' ? 'Kutsulinkki kopioitu!' : 'Invite link copied!')
                  : (language === 'fi' ? 'Kopioi suora kutsulinkki' : 'Copy direct invite link')}
              </span>
            </button>
          </div>
        </div>

        {/* WhatsApp / SMS Share Message Button */}
        <button
          onClick={handleCopyMsg}
          className="w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-sm transition flex items-center justify-center space-x-2 shadow-lg mb-6 cursor-pointer"
        >
          {copiedMsg ? <Check className="w-5 h-5 text-white" /> : <Share2 className="w-5 h-5" />}
          <span>
            {copiedMsg
              ? (language === 'fi' ? 'Kutsuviesti kopioitu!' : 'Invite message copied!')
              : (language === 'fi' ? 'Kopioi kutsuviesti (WhatsApp / Viesti)' : 'Copy invite message (WhatsApp / SMS)')}
          </span>
        </button>

        {/* Participants Summary */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-stone-400 uppercase flex items-center space-x-1">
              <Users className="w-4 h-4 text-amber-400" />
              <span>{language === 'fi' ? 'Jahtiporukan jäsenet' : 'Group Members'} ({team.length})</span>
            </span>
            <span className="text-[10px] text-stone-400 font-mono">
              {language === 'fi' ? 'Olet:' : 'You:'} {session.myNickname} ({session.myRole})
            </span>
          </div>
          <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
            {team.map((m) => (
              <div
                key={m.id}
                className="p-2 rounded-xl bg-stone-950 border border-stone-800/80 flex items-center justify-between text-xs"
              >
                <div className="flex items-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  <span className="font-bold text-stone-200">{m.name}</span>
                  {m.role === 'päällikkö' || m.role === 'Jahtimestari' ? (
                    <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      {language === 'fi' ? 'Jahtimestari' : 'Hunt Master'}
                    </span>
                  ) : (
                    <span className="text-[9px] font-medium text-stone-400 capitalize">
                      {m.role}
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-stone-400">{language === 'fi' ? 'Aktiivinen' : 'Active'}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Actions: Close window & Leave session */}
        <div className="flex flex-col sm:flex-row items-center gap-2 mt-4 pt-4 border-t border-stone-800">
          <button
            onClick={onClose}
            className="w-full sm:flex-1 py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs transition shadow-md flex items-center justify-center space-x-1.5 cursor-pointer"
          >
            <Check className="w-4 h-4 text-stone-950" />
            <span>{language === 'fi' ? 'Sulje ikkuna ja palaa kartalle' : 'Close window & return to map'}</span>
          </button>
          <button
            onClick={onLeaveSession}
            className="w-full sm:w-auto px-3.5 py-3 rounded-xl bg-stone-950 hover:bg-red-950/60 border border-red-900/40 text-red-400 hover:text-red-300 font-bold text-xs transition flex items-center justify-center space-x-1.5 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>{language === 'fi' ? 'Poistu jahtipäivästä' : 'Leave hunt session'}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
);
};
