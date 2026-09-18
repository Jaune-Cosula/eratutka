import React, { useState } from 'react';
import { TeamMember, RadioMessage, HunterStatus, UserLocation } from '../types';
import { calculateDistance, formatDistance, getCompassDirection, calculateBearing } from '../utils/geoUtils';
import { useLanguage } from '../context/LanguageContext';
import {
  Users,
  Radio,
  Send,
  CheckCircle,
  AlertOctagon,
  ShieldAlert,
  Battery,
  MapPin,
  Clock,
  PhoneCall,
  Volume2,
  Trash2,
} from 'lucide-react';

interface TeamPanelProps {
  team: TeamMember[];
  radioMessages: RadioMessage[];
  onSendMessage: (text: string, category?: 'alert' | 'info' | 'action') => void;
  onUpdateMemberStatus: (memberId: string, newStatus: HunterStatus) => void;
  userLocation: UserLocation | null;
  isDarkMode: boolean;
  onSelectHunterForTracking?: (hunterId: string) => void;
  onRemoveMember?: (memberId: string) => void;
  isJahtimestari?: boolean;
}

export const TeamPanel: React.FC<TeamPanelProps> = ({
  team,
  radioMessages,
  onSendMessage,
  onUpdateMemberStatus,
  userLocation,
  isDarkMode,
  onSelectHunterForTracking,
  onRemoveMember,
  isJahtimestari = false,
}) => {
  const { t, language } = useLanguage();
  const [customMsgText, setCustomMsgText] = useState('');

  const quickMessages = [
    { text: language === 'fi' ? 'Passi valmiina' : 'Stand ready', category: 'info' as const },
    { text: language === 'fi' ? 'Ajo käynnissä' : 'Drive in progress', category: 'info' as const },
    { text: language === 'fi' ? '🫎 Hirvi liikkeellä!' : '🫎 Moose spotted!', category: 'alert' as const },
    { text: language === 'fi' ? '💥 Laukaus ammuttu' : '💥 Shot fired', category: 'alert' as const },
    { text: language === 'fi' ? '✅ Kaato tehty' : '✅ Harvest confirmed', category: 'action' as const },
    { text: language === 'fi' ? '⚠️ Ammuntakielto / Sektorivaroitus' : '⚠️ Cease fire / Sector warning', category: 'alert' as const },
  ];

  const handleSendCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customMsgText.trim()) return;
    onSendMessage(customMsgText.trim());
    setCustomMsgText('');
  };

  return (
    <div
      className={`p-4 h-full overflow-y-auto ${
        isDarkMode ? 'bg-stone-900 text-stone-100' : 'bg-stone-50 text-stone-900'
      }`}
    >
      {/* Header */}
      <div className="pb-4 border-b border-stone-800 flex items-center justify-between">
        <div>
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-sky-600/20 border border-sky-500/40 text-sky-400 flex items-center justify-center font-bold">
              💬
            </div>
            <h2 className="text-xl font-bold font-sans tracking-wide">
              {language === 'fi' ? 'METSÄSTYSPORUKKA & CHAT' : 'HUNTING GROUP & CHAT'}
            </h2>
          </div>
          <p className="text-xs text-stone-400 mt-0.5">
            {language === 'fi'
              ? 'Metsästysseurueen passimiehet, koiramiehet ja ryhmän chat-viestit'
              : 'Hunting group members, stand positions, and group chat messages'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        {/* Left Column: Team Members List */}
        <div className="lg:col-span-1 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-stone-400 px-1">
            {language === 'fi' ? 'Seurueen jäsenet' : 'Group Members'} ({team.length})
          </h3>

          {team.map((member) => {
            const dist = userLocation
              ? calculateDistance(userLocation.lat, userLocation.lng, member.lat, member.lng)
              : null;
            const bearing = userLocation
              ? calculateBearing(userLocation.lat, userLocation.lng, member.lat, member.lng)
              : null;

            const timeAgoSec = member.lastUpdated ? Math.max(0, Math.floor((Date.now() - member.lastUpdated) / 1000)) : null;
            const timeAgoText = timeAgoSec !== null
              ? (timeAgoSec < 5 ? 'Juuri nyt' : timeAgoSec < 60 ? `${timeAgoSec} s sitten` : `${Math.floor(timeAgoSec / 60)} min sitten`)
              : 'Ei tietoa';

            return (
              <div
                key={member.id}
                className={`p-3.5 rounded-2xl border transition-all ${
                  isDarkMode ? 'bg-stone-800/60 border-stone-700' : 'bg-white border-stone-200'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-xl bg-sky-600 text-white font-bold flex items-center justify-center text-base shadow-md">
                      🎯
                    </div>
                    <div>
                      <h4 className="font-bold text-base">{member.name}</h4>
                      <p className="text-xs text-sky-400 font-medium">
                        {member.role === 'koiramies'
                          ? '🐕 Koiramies'
                          : member.role === 'päällikkö'
                          ? '👑 Jahtipäällikkö'
                          : member.role === 'passimies'
                          ? '🎯 Passimies'
                          : 'Ajomies'}
                      </p>
                    </div>
                  </div>

                  {/* Status selection pill */}
                  <select
                    value={member.status}
                    onChange={(e) =>
                      onUpdateMemberStatus(member.id, e.target.value as HunterStatus)
                    }
                    className="text-xs font-bold px-2.5 py-1 rounded-lg bg-stone-900 text-amber-400 border border-stone-700 cursor-pointer focus:outline-none"
                  >
                    <option value="passissa">🎯 Passissa</option>
                    <option value="liikkeella">🚶 Liikkeellä</option>
                    <option value="kaato">💥 Kaato</option>
                    <option value="tauolla">☕ Tauolla</option>
                  </select>
                </div>

                {member.standName && (
                  <div className="mt-2 text-xs font-medium text-amber-400 flex items-center space-x-1">
                    <MapPin className="w-3.5 h-3.5" />
                    <span>{member.standName}</span>
                  </div>
                )}

                <div className="mt-3 pt-2.5 border-t border-stone-700/40 flex items-center justify-between text-xs font-mono text-stone-300">
                  <div className="flex flex-col space-y-0.5">
                    <span className="font-bold text-amber-400">
                      📍 Etäisyys sinuun: {dist !== null ? formatDistance(dist) : '---'}
                      {bearing !== null ? ` (${bearing}° ${getCompassDirection(bearing)})` : ''}
                    </span>
                    <span className="text-[11px] text-emerald-400 font-sans flex items-center space-x-1">
                      <Clock className="w-3 h-3 inline text-emerald-400" />
                      <span>Paikannettu: {timeAgoText}</span>
                    </span>
                  </div>

                  <div className="flex flex-col items-end space-y-1">
                    <span className="flex items-center space-x-1">
                      <Battery className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{member.battery}%</span>
                    </span>
                    <div className="flex items-center space-x-1">
                      {onSelectHunterForTracking && (
                        <button
                          type="button"
                          onClick={() => onSelectHunterForTracking(member.id)}
                          className="px-2 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-sans text-[11px] font-bold shadow transition cursor-pointer"
                        >
                          🎯 Seuraa
                        </button>
                      )}
                      {/* Only the hunt master may remove someone from the hunt. Members
                          leave on their own from the share-session dialog. */}
                      {isJahtimestari && onRemoveMember && (
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`Haluatko varmasti poistaa jäsenen "${member.name}" jahdista?`)) {
                              onRemoveMember(member.id);
                            }
                          }}
                          className="p-1 rounded-lg bg-red-950/70 hover:bg-red-900 text-red-300 border border-red-700/60 text-[11px] font-bold transition cursor-pointer"
                          title="Poista jäsen jahdista"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Right Column: Radio & Chat Channel */}
        <div className="lg:col-span-2 space-y-4">
          <div
            className={`p-5 rounded-2xl border ${
              isDarkMode ? 'bg-stone-800/80 border-stone-700' : 'bg-white border-stone-200'
            } shadow-xl flex flex-col h-[520px]`}
          >
            {/* Channel Bar */}
            <div className="pb-3 border-b border-stone-700 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Radio className="w-5 h-5 text-amber-400 animate-pulse" />
                <span className="font-bold text-sm tracking-wide">
                  CHAT-KANAVA #1 (Eräseura Chat)
                </span>
              </div>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                Aktiivinen • Salattu
              </span>
            </div>

            {/* Radio Quick Actions Buttons */}
            <div className="py-3 flex flex-wrap gap-2 border-b border-stone-700/50">
              {quickMessages.map((msg, idx) => (
                <button
                  key={idx}
                  onClick={() => onSendMessage(msg.text, msg.category)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shadow-sm border ${
                    msg.category === 'alert'
                      ? 'bg-red-600/20 border-red-500/50 text-red-300 hover:bg-red-600/40'
                      : msg.category === 'action'
                      ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-300 hover:bg-emerald-600/40'
                      : 'bg-stone-700/50 border-stone-600 text-stone-200 hover:bg-stone-700'
                  }`}
                >
                  {msg.text}
                </button>
              ))}
            </div>

            {/* Message Feed */}
            <div className="flex-1 overflow-y-auto my-3 space-y-2.5 pr-1">
              {radioMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`p-3 rounded-xl border font-sans text-xs ${
                    msg.category === 'alert'
                      ? 'bg-red-950/40 border-red-800/80 text-red-100'
                      : msg.category === 'action'
                      ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-100'
                      : 'bg-stone-900/60 border-stone-700/60 text-stone-200'
                  }`}
                >
                  <div className="flex items-center justify-between font-bold text-[11px] mb-1">
                    <span className="text-amber-400">{msg.senderName}</span>
                    <span className="text-stone-400 font-mono">
                      {new Date(msg.timestamp).toLocaleTimeString('fi-FI', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <p className="text-sm font-medium">{msg.text}</p>
                </div>
              ))}
            </div>

            {/* Custom Input Form */}
            <form onSubmit={handleSendCustom} className="pt-2 border-t border-stone-700 flex space-x-2">
              <input
                type="text"
                value={customMsgText}
                onChange={(e) => setCustomMsgText(e.target.value)}
                placeholder="Kirjoita viesti chat-kanavalle..."
                className="flex-1 px-3 py-2 rounded-xl bg-stone-900 border border-stone-700 text-white text-xs focus:outline-none focus:border-amber-500"
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs transition flex items-center space-x-1"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Lähetä</span>
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
