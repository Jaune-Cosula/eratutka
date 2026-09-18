import React, { useState } from 'react';
import { Dog } from '../../types';
import { playBarkSpikeAlert, playStandAlert } from '../../utils/audioAlerts';
import {
  Timer,
  Terminal,
  Check,
  Send,
  Copy,
  Phone,
  Bell,
  Volume2,
  VolumeX,
} from 'lucide-react';

interface CollarControlPanelProps {
  dog: Dog;
  onUpdateDogTelemetry?: (dogId: string, updates: Partial<Dog>) => void;
  onToggleDogAlert: (dogId: string, alertType: 'bark' | 'stand') => void;
  onOpenIcarSync: () => void;
}

export const CollarControlPanel: React.FC<CollarControlPanelProps> = ({
  dog,
  onUpdateDogTelemetry,
  onToggleDogAlert,
  onOpenIcarSync,
}) => {
  const [isSendingCommand, setIsSendingCommand] = useState<boolean>(false);
  const [customCommandInput, setCustomCommandInput] = useState<string>('');
  const [showCommandConsole, setShowCommandConsole] = useState<boolean>(false);
  const [commandFeedback, setCommandFeedback] = useState<{ message: string; isError?: boolean; timestamp: number } | null>(null);
  const [copiedSmsCmd, setCopiedSmsCmd] = useState<string | null>(null);

  const handleSendCollarCommand = async (commandStr?: string, targetInterval?: number, presetLabel?: string) => {
    setIsSendingCommand(true);

    const cleanId = String(dog.directGpsId || dog.imei || dog.collarId || '').replace(/^ID[:\s]*/i, '').trim();
    const gwUrl = dog.gatewayServerUrl || 'http://35.206.111.214:8080/api/positions';
    const effectiveCmd = commandStr || (targetInterval ? `UPLOAD,${targetInterval}#` : '');

    try {
      // 1. Update local state immediately if interval changed
      if (typeof targetInterval === 'number' && onUpdateDogTelemetry) {
        onUpdateDogTelemetry(dog.id, {
          trackingIntervalSec: targetInterval,
          lastUpdated: Date.now(),
        });
      }

      // 2. Call backend proxy to Gateway
      const res = await fetch('/api/collar/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: cleanId,
          command: effectiveCmd,
          interval: targetInterval,
          gatewayUrl: gwUrl,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setCommandFeedback({
          message: targetInterval 
            ? `Päivitysväli (${targetInterval} s - ${presetLabel || 'Vahvistettu'}) välitetty suoraan pannan TCP-yhteyteen!` 
            : `Komento "${effectiveCmd}" lähetetty pantaan onnistuneesti!`,
          isError: false,
          timestamp: Date.now(),
        });
      } else {
        setCommandFeedback({
          message: data.message || `Pantaan (${cleanId}) ei saatu heti TCP-yhteyttä (panta ei linjoilla Gatewaylla). Asetus tallennettu sovellukseen.`,
          isError: false,
          timestamp: Date.now(),
        });
      }
    } catch (err: any) {
      setCommandFeedback({
        message: `Yhteysilmoitus: ${err.message || 'Pyyntö lähetetty'}. Paikannusväli päivitetty.`,
        isError: false,
        timestamp: Date.now(),
      });
    } finally {
      setIsSendingCommand(false);
      setTimeout(() => {
        setCommandFeedback((prev) => (prev && Date.now() - prev.timestamp > 7000 ? null : prev));
      }, 8000);
    }
  };

  const currentSec = dog.trackingIntervalSec || 10;
  const isIkModel = dog.trackerModel?.includes('IK122') || !dog.trackerModel;
  const isSino = dog.trackerModel?.includes('SinoTrack');
  const smsCmd = isIkModel 
    ? `SL SC0,${currentSec}` 
    : isSino 
    ? `8050000 ${currentSec}` 
    : `TIMER,${currentSec}#`;

  return (
    <>
      {/* Tracking Interval & Remote Collar Downlink Commands */}
      <div className="mt-5 p-4 rounded-2xl bg-stone-900/70 border border-stone-700/70 space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400">
              <Timer className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400">
                  Pannan paikannusväli & etäkomennot (TCP Downlink)
                </h4>
                <span className="px-2 py-0.2 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-500/40 text-[9px] font-mono font-bold">
                  GATEWAY 2-WAY
                </span>
              </div>
              <p className="text-[11px] text-stone-400">
                Valitse päivitysväli napauttamalla – komento välittyy suoraan pannan avoimeen TCP-yhteyteen.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <div className="text-xs font-mono text-stone-300 bg-stone-950 px-3 py-1 rounded-xl border border-stone-800 flex items-center space-x-1.5">
              <span className="text-stone-400">Aktiivinen väli:</span>
              <strong className="text-amber-300 font-bold">
                {dog.trackingIntervalSec ? `${dog.trackingIntervalSec} s` : '10 s (Vakio)'}
              </strong>
            </div>

            <button
              type="button"
              onClick={() => setShowCommandConsole((prev) => !prev)}
              className="px-2.5 py-1 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 border border-stone-600 text-xs font-semibold transition flex items-center space-x-1 cursor-pointer"
              title="Avaa vapaa komentorivi pantaan"
            >
              <Terminal className="w-3.5 h-3.5 text-amber-400" />
              <span>{showCommandConsole ? 'Sulje konsoli' : 'Komentorivi'}</span>
            </button>
          </div>
        </div>

        {/* Interval Selection Presets (Sends Live Downlink Command to Collar) */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1">
          {[
            { sec: 5, label: '5 sekuntia', sub: '⚡ Teho / Ajo', desc: 'Suurin tarkkuus, lyhyempi akunkesto' },
            { sec: 10, label: '10 sekuntia', sub: '🏃 Vakiojahti', desc: 'Suositeltu jahtiasetus' },
            { sec: 30, label: '30 sekuntia', sub: '⏱️ Normaali', desc: 'Hyvä tasapaino haussa' },
            { sec: 60, label: '1 minuutti', sub: '🔋 Akunsäästö', desc: 'Pitkät jahtipäivät' },
            { sec: 300, label: '5 minuuttia', sub: '💤 Valmiustila', desc: 'Maksimaalinen akun kesto' },
          ].map((preset) => {
            const isSelected = (dog.trackingIntervalSec || 10) === preset.sec;

            return (
              <button
                key={preset.sec}
                type="button"
                disabled={isSendingCommand}
                onClick={() => handleSendCollarCommand(undefined, preset.sec, preset.sub)}
                className={`p-2.5 rounded-xl border text-left transition relative cursor-pointer disabled:opacity-60 ${
                  isSelected
                    ? 'bg-amber-500/20 border-amber-500 text-amber-200 ring-2 ring-amber-500/40 shadow'
                    : 'bg-stone-950 border-stone-800 text-stone-400 hover:text-stone-200 hover:border-stone-700'
                }`}
                title={`Aseta pannan päivitysväliksi ${preset.sec} s`}
              >
                <div className="text-xs font-bold text-stone-100 flex items-center justify-between">
                  <span>{preset.label}</span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-amber-400" />}
                </div>
                <div className="text-[10px] text-amber-300/90 font-medium mt-0.5">{preset.sub}</div>
              </button>
            );
          })}
        </div>

        {/* Command Feedback / Toast Banner */}
        {commandFeedback && (
          <div className={`p-2.5 rounded-xl border text-xs flex items-center justify-between animate-fadeIn ${
            commandFeedback.isError
              ? 'bg-red-950/80 border-red-500/50 text-red-300'
              : 'bg-emerald-950/80 border border-emerald-500/50 text-emerald-300'
          }`}>
            <span className="flex items-center space-x-2">
              <span className="text-sm">{commandFeedback.isError ? '⚠️' : '📡'}</span>
              <span>{commandFeedback.message}</span>
            </span>
            <button
              onClick={() => setCommandFeedback(null)}
              className="text-stone-400 hover:text-stone-200 text-xs px-1 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Optional Free Terminal / Command Console for Collar */}
        {showCommandConsole && (
          <div className="p-3 rounded-xl bg-stone-950 border border-stone-800 space-y-2.5 animate-fadeIn">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1.5 text-xs font-bold text-stone-300">
                <Terminal className="w-4 h-4 text-amber-400" />
                <span>Lähetä suora komentolause pannan TCP-socketiin</span>
              </div>
              <span className="text-[10px] text-stone-500 font-mono">
                Kohde: {dog.directGpsId || dog.imei || dog.collarId}
              </span>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={customCommandInput}
                onChange={(e) => setCustomCommandInput(e.target.value)}
                placeholder="esim. UPLOAD,10# tai FREQ,5# tai STATUS#"
                className="flex-1 px-3 py-1.5 bg-stone-900 border border-stone-700 rounded-xl text-xs font-mono text-amber-300 placeholder-stone-600 focus:outline-none focus:border-amber-500"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && customCommandInput.trim()) {
                    handleSendCollarCommand(customCommandInput.trim());
                    setCustomCommandInput('');
                  }
                }}
              />
              <button
                type="button"
                disabled={isSendingCommand || !customCommandInput.trim()}
                onClick={() => {
                  if (customCommandInput.trim()) {
                    handleSendCollarCommand(customCommandInput.trim());
                    setCustomCommandInput('');
                  }
                }}
                className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 text-xs font-bold rounded-xl transition flex items-center space-x-1 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Lähetä</span>
              </button>
            </div>

            {/* Quick Command Suggestion Pills */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px]">
              <span className="text-stone-500 text-[10px]">Pikakomennot:</span>
              {['UPLOAD,5#', 'UPLOAD,10#', 'UPLOAD,30#', 'STATUS#', 'RESET#'].map((cmd) => (
                <button
                  key={cmd}
                  type="button"
                  onClick={() => handleSendCollarCommand(cmd)}
                  className="px-2 py-0.5 rounded-lg bg-stone-900 hover:bg-stone-800 text-stone-300 font-mono text-[10px] border border-stone-700 hover:border-amber-500/50 transition cursor-pointer"
                >
                  {cmd}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Collar SMS Command Fallback Helper Bar */}
        <div className="p-3 rounded-xl bg-stone-950 border border-stone-800 flex flex-wrap items-center justify-between gap-2.5">
          <div className="text-xs">
            <span className="text-stone-400 text-[11px] block">
              Varayhteys (SMS-komento tekstiviestinä):
            </span>
            <code className="text-amber-300 font-mono font-bold text-xs bg-stone-900 px-2 py-0.5 rounded border border-stone-800 inline-block mt-0.5">
              {smsCmd}
            </code>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(smsCmd);
                setCopiedSmsCmd(smsCmd);
                setTimeout(() => setCopiedSmsCmd(null), 2500);
              }}
              className="px-3 py-1.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs font-semibold transition flex items-center space-x-1 cursor-pointer"
              title="Kopioi SMS-komento leikepöydälle"
            >
              {copiedSmsCmd === smsCmd ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-300">Kopioitu!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Kopioi SMS</span>
                </>
              )}
            </button>

            {dog.simNumber ? (
              <a
                href={`sms:${dog.simNumber}?body=${encodeURIComponent(smsCmd)}`}
                className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-black transition flex items-center space-x-1 shadow"
                title={`Lähetä tekstiviesti suoraan pantaan (${dog.simNumber})`}
              >
                <Send className="w-3.5 h-3.5" />
                <span>Lähetä SMS pantaan</span>
              </a>
            ) : (
              <button
                type="button"
                onClick={onOpenIcarSync}
                className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold transition flex items-center space-x-1 cursor-pointer"
                title="Lisää SIM-numero pantaan lähettääksesi suoria SMS-komentoja"
              >
                <Phone className="w-3.5 h-3.5" />
                <span>Lisää SIM-numero</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Sound & Alert Toggles Settings */}
      <div className="mt-5 p-3.5 rounded-xl bg-stone-900/40 border border-stone-700/50 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-2">
          <Bell className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-stone-300">
            Äänihälytykset
          </span>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => {
              playBarkSpikeAlert();
              onToggleDogAlert(dog.id, 'bark');
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition flex items-center space-x-1.5 cursor-pointer ${
              dog.barkAlertEnabled
                ? 'bg-red-600/30 border-red-500 text-red-300'
                : 'bg-stone-800 border-stone-700 text-stone-400'
            }`}
          >
            {dog.barkAlertEnabled ? (
              <Volume2 className="w-3.5 h-3.5 text-red-400" />
            ) : (
              <VolumeX className="w-3.5 h-3.5" />
            )}
            <span>Haukku-hälytys</span>
          </button>

          <button
            onClick={() => {
              playStandAlert();
              onToggleDogAlert(dog.id, 'stand');
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition flex items-center space-x-1.5 cursor-pointer ${
              dog.standAlertEnabled
                ? 'bg-amber-500/30 border-amber-500 text-amber-300'
                : 'bg-stone-800 border-stone-700 text-stone-400'
            }`}
          >
            {dog.standAlertEnabled ? (
              <Volume2 className="w-3.5 h-3.5 text-amber-400" />
            ) : (
              <VolumeX className="w-3.5 h-3.5" />
            )}
            <span>Seisontahälytys</span>
          </button>
        </div>
      </div>
    </>
  );
};
