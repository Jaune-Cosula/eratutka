import React, { useState } from 'react';
import { Dog } from '../types';
import { extractTractiveToken } from '../services/collarService';
import {
  X,
  PlusCircle,
  Radio,
  Copy,
  Check,
  Smartphone,
  Info,
  Sliders,
  Sparkles,
  Zap,
  Phone,
  ShieldCheck,
} from 'lucide-react';

interface AddDogModalProps {
  onAddDog: (newDog: Dog) => void;
  onClose: () => void;
  isDarkMode: boolean;
  userLat: number;
  userLng: number;
  currentUserName?: string;
}

export const AddDogModal: React.FC<AddDogModalProps> = ({
  onAddDog,
  onClose,
  isDarkMode,
  userLat,
  userLng,
  currentUserName,
}) => {
  const [trackerModel, setTrackerModel] = useState<string>('Icarii IK122 4G / IK122T Pro');
  const [name, setName] = useState('Valto (IK122T Pro)');
  const [breed, setBreed] = useState('Jämtlanninpystykorva');
  const [addedBy, setAddedBy] = useState(currentUserName || '');
  const [imei, setImei] = useState('868123456789012');
  const [tractiveShareUrl, setTractiveShareUrl] = useState('');
  const [simNumber, setSimNumber] = useState('');
  const [color, setColor] = useState('#3b82f6');
  const [customLat, setCustomLat] = useState<string>(userLat.toFixed(6));
  const [customLng, setCustomLng] = useState<string>(userLng.toFixed(6));
  const [useCurrentLocation, setUseCurrentLocation] = useState<boolean>(true);
  const [operator, setOperator] = useState<'elisa' | 'telia' | 'dna' | 'moi'>('elisa');
  const [copiedSms, setCopiedSms] = useState(false);

  // Operator APNs for SinoTrack ST-904L / IK122 SMS configuration
  const apnMap = {
    elisa: 'internet',
    telia: 'internet',
    dna: 'internet',
    moi: 'data.moimobiili.fi',
  };

  // SinoTrack ST-904L default server SMS command (Command 803 / 804 / SERVER)
  const apnSmsCmd = `8030000 ${apnMap[operator]}`;

  const handleCopyApnSms = () => {
    navigator.clipboard.writeText(apnSmsCmd);
    setCopiedSms(true);
    setTimeout(() => setCopiedSms(false), 2000);
  };

  const handleQuickIk122Preset = () => {
    setTrackerModel('Icarii IK122 4G / IK122T Pro');
    setName('Valto (IK122T Pro)');
    setBreed('Jämtlanninpystykorva');
    setImei(`8681${Math.floor(10000000000 + Math.random() * 90000000000)}`);
    setColor('#3b82f6');
  };

  const handleQuickSinoTrackPreset = () => {
    setTrackerModel('SinoTrack ST-904L');
    setName('Pyry (SinoTrack 4G)');
    setBreed('Karjalankarhukoira');
    setImei(`9170${Math.floor(10000000000 + Math.random() * 90000000000)}`);
    setColor('#10b981');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const parsedLat = parseFloat(customLat.replace(',', '.'));
    const parsedLng = parseFloat(customLng.replace(',', '.'));

    const targetLat = useCurrentLocation
      ? userLat
      : (!isNaN(parsedLat) && parsedLat !== 0 ? parsedLat : userLat);
    const targetLng = useCurrentLocation
      ? userLng
      : (!isNaN(parsedLng) && parsedLng !== 0 ? parsedLng : userLng);

    const isTractive = trackerModel.includes('Tractive');
    const tractiveToken =
      extractTractiveToken(tractiveShareUrl) ||
      extractTractiveToken(imei) ||
      (isTractive && tractiveShareUrl ? tractiveShareUrl.trim() : (isTractive ? '6f212df630' : undefined));

    const defaultPrefix = isTractive ? 'TRAC-CAT' : trackerModel.includes('SinoTrack') ? 'ST904' : 'IK122';
    const generatedCollarId = (isTractive && tractiveToken)
      ? tractiveToken
      : (imei.trim() || `${defaultPrefix}-${Math.floor(100000 + Math.random() * 900000)}`);

    const dog: Dog = {
      id: `dog-real-${Date.now()}`,
      name: name.trim(),
      breed,
      collarId: generatedCollarId,
      color,
      status: 'paikallaan',
      lat: targetLat,
      lng: targetLng,
      battery: 100,
      signal: 98,
      speed: 0,
      barkRate: 0,
      heading: 0,
      isActive: true,
      barkAlertEnabled: true,
      standAlertEnabled: true,
      addedBy: addedBy.trim() || currentUserName || 'Jahtilainen',
      lastUpdated: Date.now(),
      trackerModel,
      imei: isTractive ? (tractiveToken || imei.trim()) : imei.trim(),
      simNumber: simNumber.trim(),
      telematicsProvider: isTractive ? 'tractive' : 'eratutka_direct',
      directGpsId: (isTractive && tractiveToken) ? tractiveToken : (imei.trim() || generatedCollarId),
      gatewayServerUrl: isTractive
        ? (tractiveShareUrl.trim() || `https://my.tractive.com/p/${tractiveToken || '6f212df630'}`)
        : 'http://35.206.111.214:8080/api/positions',
      tractiveShareUrl: isTractive ? (tractiveShareUrl.trim() || `https://my.tractive.com/p/${tractiveToken || '6f212df630'}`) : undefined,
      tractiveTrackerId: isTractive && tractiveToken ? tractiveToken : undefined,
      autoSyncEnabled: true, // Continuous live sync active for all collars including Tractive
      trackingIntervalSec: 5,
      trackHistory: [
        {
          lat: targetLat,
          lng: targetLng,
          timestamp: Date.now(),
          speed: 0,
          barkRate: 0,
        },
      ],
    };

    onAddDog(dog);
    onClose();
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[3000] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in overflow-y-auto"
    >
      <div
        className={`w-full max-w-xl max-h-[88vh] flex flex-col rounded-3xl border ${
          isDarkMode ? 'bg-stone-900 border-amber-500/30 text-stone-100' : 'bg-white border-amber-300 text-stone-900'
        } shadow-2xl relative my-auto overflow-hidden`}
      >
        {/* Top Accent Bar */}
        <div className="h-2 bg-gradient-to-r from-amber-500 via-emerald-500 to-amber-500 shrink-0"></div>

        {/* Modal Header */}
        <div className="p-4 sm:p-5 pb-3 flex items-center justify-between border-b border-stone-800/80 shrink-0 bg-stone-900/90">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center font-bold text-xl sm:text-2xl shadow-inner shrink-0">
              🐕
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-amber-400 tracking-wide font-sans leading-tight">
                LISÄÄ GPS-PANTALAITE
              </h3>
              <p className="text-[11px] sm:text-xs text-stone-400">
                Kytke IK122T, SinoTrack ST-904L tai muu paikannin kartalle
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 shadow-md transition z-20 flex items-center justify-center cursor-pointer shrink-0 active:scale-95"
            title="Sulje ikkuna"
            aria-label="Sulje ikkuna"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-5">
          {/* Tracker Model Selection Presets */}
          <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-amber-400 mb-2">
            1. Valitse pannan laitemalli
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setTrackerModel('Icarii IK122 4G / IK122T Pro');
                if (!imei) setImei('868123456789012');
              }}
              className={`p-3 rounded-2xl border text-left transition relative overflow-hidden flex flex-col justify-between ${
                trackerModel.includes('IK122')
                  ? 'bg-amber-500/20 border-amber-500 text-amber-200 ring-2 ring-amber-500/50 shadow-md'
                  : 'bg-stone-950 border-stone-800 text-stone-400 hover:text-stone-200'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-black text-xs text-amber-300 flex items-center space-x-1">
                  <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                  <span>IK122 / IK122T Pro</span>
                </span>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  4G GPS
                </span>
              </div>
              <span className="text-[10px] text-stone-400 leading-tight">
                Erätutka Gateway / 15-num. IMEI
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setTrackerModel('SinoTrack ST-904L');
                if (!imei) setImei('917088234567890');
              }}
              className={`p-3 rounded-2xl border text-left transition relative overflow-hidden flex flex-col justify-between ${
                trackerModel === 'SinoTrack ST-904L'
                  ? 'bg-amber-500/20 border-amber-500 text-amber-200 ring-2 ring-amber-500/50 shadow-md'
                  : 'bg-stone-950 border-stone-800 text-stone-400 hover:text-stone-200'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-black text-xs text-amber-300 flex items-center space-x-1">
                  <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                  <span>SinoTrack ST-904L</span>
                </span>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  4G GPS
                </span>
              </div>
              <span className="text-[10px] text-stone-400 leading-tight">
                Helppo pika-asennus & IMEI
              </span>
            </button>

            <button
              type="button"
              onClick={() => setTrackerModel('Garmin Alpha / Atemos')}
              className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between ${
                trackerModel === 'Garmin Alpha / Atemos'
                  ? 'bg-amber-500/20 border-amber-500 text-amber-200 ring-2 ring-amber-500/50'
                  : 'bg-stone-950 border-stone-800 text-stone-400 hover:text-stone-200'
              }`}
            >
              <span className="font-bold text-xs text-stone-200">Garmin Alpha / Atemos</span>
              <span className="text-[10px] text-stone-400">T5, TT15, Garmin Explore</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setTrackerModel('Tractive GPS (Kissa / Koira)');
                setName('Nirppu (Tractive Kissa)');
                setBreed('Kotikissa');
                setTractiveShareUrl('https://my.tractive.com/p/6f212df630');
                setImei('6f212df630');
                setColor('#06b6d4');
              }}
              className={`p-3 rounded-2xl border text-left transition relative overflow-hidden flex flex-col justify-between ${
                trackerModel === 'Tractive GPS (Kissa / Koira)'
                  ? 'bg-amber-500/20 border-amber-500 text-amber-200 ring-2 ring-amber-500/50 shadow-md'
                  : 'bg-stone-950 border-stone-800 text-stone-400 hover:text-stone-200'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-black text-xs text-amber-300 flex items-center space-x-1">
                  <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                  <span>Tractive GPS</span>
                </span>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">
                  Kissa / Koira
                </span>
              </div>
              <span className="text-[10px] text-stone-400 leading-tight">
                Tractive Live Share / Tunnus
              </span>
            </button>
          </div>
        </div>

        {/* Special Icarii IK122 4G Setup Assistant Box */}
        {trackerModel.includes('IK122') && (
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 mb-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-amber-300 uppercase tracking-wider flex items-center space-x-1.5">
                <ShieldCheck className="w-4 h-4 text-amber-400" />
                <span>IK122 / IK122T Pro 4G -pannan asennus & ohje</span>
              </span>
              <button
                type="button"
                onClick={handleQuickIk122Preset}
                className="text-[11px] font-bold px-2 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 transition flex items-center space-x-1 shadow"
              >
                <Sparkles className="w-3 h-3" />
                <span>Täytä esimerkkitiedot</span>
              </button>
            </div>

            <p className="text-xs text-stone-300 leading-relaxed">
              IK122T Pro 4G -koirapanta lähettää mobiilidatalla paikkatietonsa Erätutkan <strong>Micro GPS Gatewayhin</strong>. Erätutkassa pannan telemetria (sijainti, nopeus, akku ja haukku) päivittyy automaattisesti kartalle ja voit lähettää pantaan SMS-komentoja.
            </p>

            {/* Operator APN helper tool for Icarii */}
            <div className="pt-2 border-t border-amber-500/20 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-stone-300 font-semibold">Liittymän operaattori pannassa:</span>
                <div className="flex space-x-1">
                  {(['elisa', 'telia', 'dna', 'moi'] as const).map((op) => (
                    <button
                      key={op}
                      type="button"
                      onClick={() => setOperator(op)}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase transition ${
                        operator === op
                          ? 'bg-amber-500 text-stone-950'
                          : 'bg-stone-950 text-stone-400 hover:text-stone-200'
                      }`}
                    >
                      {op}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-stone-950 border border-stone-800 flex items-center justify-between text-xs">
                <div>
                  <span className="text-[10px] text-stone-400 block font-mono">SMS APN-asennuskomento:</span>
                  <code className="text-amber-300 font-mono font-bold">apn123456 {apnMap[operator]}</code>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(`apn123456 ${apnMap[operator]}`);
                    setCopiedSms(true);
                    setTimeout(() => setCopiedSms(false), 2000);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 text-[11px] font-bold transition flex items-center space-x-1"
                >
                  {copiedSms ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedSms ? 'Kopioitu' : 'Kopioi SMS'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Special SinoTrack ST-904L Setup Assistant Box */}
        {trackerModel === 'SinoTrack ST-904L' && (
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 mb-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-amber-300 uppercase tracking-wider flex items-center space-x-1.5">
                <ShieldCheck className="w-4 h-4 text-amber-400" />
                <span>SinoTrack ST-904L 4G pantaohje</span>
              </span>
              <button
                type="button"
                onClick={handleQuickSinoTrackPreset}
                className="text-[11px] font-bold px-2 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 transition flex items-center space-x-1 shadow"
              >
                <Sparkles className="w-3 h-3" />
                <span>Täytä esimerkkitiedot</span>
              </button>
            </div>

            <p className="text-xs text-stone-300 leading-relaxed">
              SinoTrack ST-904L lukee sijainnin 4G-verkon kautta. Syötä pannan takana / myyntipakkauksessa oleva <strong>15-numeroinen IMEI-koodi</strong> alla olevaan kenttään.
            </p>

            {/* Operator APN helper tool */}
            <div className="pt-2 border-t border-amber-500/20 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-stone-300 font-semibold">Liittymän operaattori pannassa:</span>
                <div className="flex space-x-1">
                  {(['elisa', 'telia', 'dna', 'moi'] as const).map((op) => (
                    <button
                      key={op}
                      type="button"
                      onClick={() => setOperator(op)}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase transition ${
                        operator === op
                          ? 'bg-amber-500 text-stone-950'
                          : 'bg-stone-950 text-stone-400 hover:text-stone-200'
                      }`}
                    >
                      {op}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-stone-950 border border-stone-800 flex items-center justify-between text-xs">
                <div>
                  <span className="text-[10px] text-stone-400 block font-mono">SMS APN-asetus komento:</span>
                  <code className="text-amber-300 font-mono font-bold">{apnSmsCmd}</code>
                </div>
                <button
                  type="button"
                  onClick={handleCopyApnSms}
                  className="px-2.5 py-1 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 text-[11px] font-bold transition flex items-center space-x-1"
                >
                  {copiedSms ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedSms ? 'Kopioitu' : 'Kopioi SMS'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Special Garmin Box */}
        {trackerModel === 'Garmin Alpha / Atemos' && (
          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 mb-5 space-y-2">
            <div className="flex items-center space-x-2 text-emerald-400 font-extrabold text-xs uppercase tracking-wide">
              <Info className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>Garmin Explore / Live Link</span>
            </div>
            <p className="text-xs text-stone-300 leading-relaxed">
              Garmin käsilaitteet lähettävät VHF-radiosignaalia. Yhdistämistä varten syötä Garmin Explore / MapShare -jako-osoite tai pannan ID-koodi.
            </p>
          </div>
        )}

        {/* Special Tractive GPS Box */}
        {trackerModel === 'Tractive GPS (Kissa / Koira)' && (
          <div className="p-4 rounded-2xl bg-sky-500/10 border border-sky-500/30 mb-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-sky-300 uppercase tracking-wider flex items-center space-x-1.5">
                <ShieldCheck className="w-4 h-4 text-sky-400" />
                <span>Tractive GPS (Kissa & Koira) Opas</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  setTrackerModel('Tractive GPS (Kissa / Koira)');
                  setName('Misu (Tractive Kissa)');
                  setBreed('Kotikissa');
                  setImei(`TRAC-CAT-${Math.floor(10000 + Math.random() * 90000)}`);
                  setColor('#06b6d4');
                }}
                className="text-[11px] font-bold px-2 py-1 rounded-lg bg-sky-500 hover:bg-sky-400 text-stone-950 transition flex items-center space-x-1 shadow cursor-pointer"
              >
                <Sparkles className="w-3 h-3" />
                <span>Täytä kissaesimerkki</span>
              </button>
            </div>

            <p className="text-xs text-stone-300 leading-relaxed">
              <strong>Tractive GPS kissa- ja koiraseuranta Erätutkassa:</strong> Tractive on Tractive GmbH:n suljettu laite- ja pilvipalvelu (eSIM). Panta ei käytä avointa TCP-yhdyskäytävää, mutta voit seurata lemmikkiäsi suoraan Erätutkan maastokartalla.
            </p>
            <div className="p-3 rounded-xl bg-stone-950 border border-stone-800 text-xs text-stone-300 space-y-2">
              <div className="font-bold text-sky-300 flex items-center space-x-1.5">
                <Sparkles className="w-4 h-4 text-sky-400" />
                <span>Näin otat kissapannan käyttöön Erätutkassa:</span>
              </div>
              <ul className="list-disc pl-4 text-[11px] space-y-1.5 text-stone-300">
                <li>
                  <strong>1. Nimeä ja kytke:</strong> Anna kissalle nimi, tunniste ja valitse aloituspaikka (nykyinen sijaintisi tai koordinaatit). Kissa ilmestyy heti kartalle kissamerkillä <span className="text-sky-300 font-bold">🐱</span> ja tutkalistalle.
                </li>
                <li>
                  <strong>2. Karttaseuranta & tutka:</strong> Näet kissan suunnan, etäisyyden ja Maanmittauslaitoksen huipputarkat maastokartat, kiinteistörajat ja maastomuodot.
                </li>
                <li>
                  <strong>3. Tractive-reittien tuonti:</strong> Voit ladata Tractive-sovelluksesta kissan tallennetun reittihistorian (GPX / KML) ja tuoda sen Erätutkan <em>”Tuo GPX / KML”</em> -työkalulla kartalle nähdäksesi kissan kulkemat maastolenkit ja reviirin.
                </li>
              </ul>
            </div>
          </div>
        )}

        {/* Dog / Cat Information Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold uppercase text-amber-400 mb-1">
                {trackerModel.includes('Tractive') || breed.toLowerCase().includes('kissa') ? 'Lemmikin / Kissan nimi *' : 'Koiran nimi *'}
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={trackerModel.includes('Tractive') ? 'esim. Misu, Viiru' : 'esim. Sisu, Pyry'}
                className="w-full px-3.5 py-2.5 rounded-xl bg-stone-950 border border-stone-800 focus:border-amber-500 text-stone-100 text-sm outline-none transition"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-amber-400 mb-1">
                {trackerModel.includes('Tractive') || breed.toLowerCase().includes('kissa') ? 'Rotu / Laji' : 'Rotu'}
              </label>
              <select
                value={breed}
                onChange={(e) => setBreed(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-stone-950 border border-stone-800 focus:border-amber-500 text-stone-100 text-sm outline-none transition"
              >
                <option value="Kotikissa">Kotikissa / Kissa</option>
                <option value="Jämtlanninpystykorva">Jämtlanninpystykorva</option>
                <option value="Karjalankarhukoira">Karjalankarhukoira</option>
                <option value="Suomenajokoira">Suomenajokoira</option>
                <option value="Norjanharmaahirvikoira">Norjanharmaahirvikoira</option>
                <option value="Suomenpystykorva">Suomenpystykorva</option>
                <option value="Saksanseisoja">Saksanseisoja</option>
                <option value="Muu rotu">Muu rotu / Lemmikki</option>
              </select>
            </div>
          </div>

          {/* Lisääjä / Omistaja */}
          <div>
            <label className="block text-xs font-bold uppercase text-amber-400 mb-1">
              {trackerModel.includes('Tractive') || breed.toLowerCase().includes('kissa') ? 'Omistaja / Lisääjä' : 'Koiran lisääjä / Omistaja'}
            </label>
            <input
              type="text"
              value={addedBy}
              onChange={(e) => setAddedBy(e.target.value)}
              placeholder={currentUserName || "esim. Matti V."}
              className="w-full px-3.5 py-2.5 rounded-xl bg-stone-950 border border-stone-800 focus:border-amber-500 text-stone-100 text-sm outline-none transition"
            />
            <p className="text-[11px] text-stone-400 mt-1">
              Tämä nimi näkyy lemmikin tiedoissa ja tutkanäytöllä.
            </p>
          </div>

          {trackerModel.includes('Tractive') ? (
            <div className="p-3.5 rounded-2xl bg-sky-950/30 border border-sky-500/40 space-y-2">
              <label className="block text-xs font-bold uppercase text-sky-400 mb-1">
                Tractive Live -jakolinkki tai jakotunnus *
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={tractiveShareUrl || imei}
                  onChange={(e) => {
                    setTractiveShareUrl(e.target.value);
                    setImei(e.target.value);
                  }}
                  placeholder="esim. https://my.tractive.com/p/6f212df630 tai 6f212df630"
                  className="flex-1 px-3.5 py-2.5 rounded-xl bg-stone-950 border border-sky-500/50 focus:border-sky-400 text-sky-200 text-sm font-mono outline-none transition"
                />
                <button
                  type="button"
                  onClick={() => {
                    setTractiveShareUrl('https://my.tractive.com/p/6f212df630');
                    setImei('6f212df630');
                    setName('Nirppu (Tractive Kissa)');
                    setBreed('Kotikissa');
                  }}
                  className="px-3 py-2 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 text-xs font-bold shrink-0 transition cursor-pointer"
                >
                  Kokeile linkkiä (Nirppu)
                </button>
              </div>
              <p className="text-[11px] text-stone-300">
                Kopioi Tractive-sovelluksesta: <strong>Profiili &gt; Lemmikki &gt; Jaa seuranta &gt; Julkinen linkki</strong> (Public Link). Erätutka hakee laitteen reaaliaikaiset koordinaatit, akun ja reitin automaattisesti!
              </p>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-bold uppercase text-amber-400 mb-1">
                {trackerModel === 'SinoTrack ST-904L'
                  ? 'Pannan IMEI / Sarjanumero *'
                  : 'Pannan ID / Tunnus'}
              </label>
              <input
                type="text"
                value={imei}
                onChange={(e) => setImei(e.target.value)}
                placeholder={
                  trackerModel === 'SinoTrack ST-904L'
                    ? 'esim. 917088234567890'
                    : 'esim. ID-99201'
                }
                className="w-full px-3.5 py-2.5 rounded-xl bg-stone-950 border border-stone-800 focus:border-amber-500 text-stone-100 text-sm font-mono outline-none transition"
              />
              <p className="text-[11px] text-stone-400 mt-1">
                {trackerModel === 'SinoTrack ST-904L'
                  ? 'Löytyy SinoTrack ST-904L -pannan tarrasta tai laitteen takapuolelta.'
                  : 'Syötä laitteen tunnus tai jakolinkki.'}
              </p>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold uppercase text-amber-400 mb-1">
              Pannan SIM-kortin puhelinnumero (Valinnainen kuuntelua varten)
            </label>
            <div className="relative">
              <Phone className="w-4 h-4 absolute left-3 top-3 text-stone-500" />
              <input
                type="tel"
                value={simNumber}
                onChange={(e) => setSimNumber(e.target.value)}
                placeholder="+358 40 1234567"
                className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-stone-950 border border-stone-800 focus:border-amber-500 text-stone-100 text-sm font-mono outline-none transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase text-amber-400 mb-1">
              Pannan aloituspaikkatieto kartalla
            </label>
            <div className="space-y-2 p-3 rounded-2xl bg-stone-950 border border-stone-800">
              <div className="flex items-center space-x-3">
                <label className="flex items-center space-x-2 text-xs text-stone-200 cursor-pointer">
                  <input
                    type="radio"
                    name="locMode"
                    checked={useCurrentLocation}
                    onChange={() => setUseCurrentLocation(true)}
                    className="accent-amber-500"
                  />
                  <span>Käytä nykyistä sijaintiani ({userLat.toFixed(4)}°, {userLng.toFixed(4)}°)</span>
                </label>
              </div>
              <div className="flex items-center space-x-3">
                <label className="flex items-center space-x-2 text-xs text-stone-200 cursor-pointer">
                  <input
                    type="radio"
                    name="locMode"
                    checked={!useCurrentLocation}
                    onChange={() => setUseCurrentLocation(false)}
                    className="accent-amber-500"
                  />
                  <span>Syötä pannan koordinaatit käsin (WGS84)</span>
                </label>
              </div>

              {!useCurrentLocation && (
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-stone-800 animate-fadeIn">
                  <div>
                    <label className="block text-[10px] text-stone-400 font-mono mb-1">Leveysaste (Lat)</label>
                    <input
                      type="text"
                      value={customLat}
                      onChange={(e) => setCustomLat(e.target.value)}
                      placeholder="esim. 64.123456"
                      className="w-full px-2.5 py-1.5 rounded-lg bg-stone-900 border border-stone-700 text-stone-100 text-xs font-mono outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-stone-400 font-mono mb-1">Pituusaste (Lng)</label>
                    <input
                      type="text"
                      value={customLng}
                      onChange={(e) => setCustomLng(e.target.value)}
                      placeholder="esim. 29.543210"
                      className="w-full px-2.5 py-1.5 rounded-lg bg-stone-900 border border-stone-700 text-stone-100 text-xs font-mono outline-none focus:border-amber-500"
                    />
                  </div>
                </div>
              )}
            </div>
            <p className="text-[11px] text-stone-400 mt-1">
              💡 Reaalipanta lisätään kiinteänä laitteena. Simulaatiomoottori ei siirrä aitoja pantalaitteita kartalla.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase text-amber-400 mb-1">
              {trackerModel.includes('Tractive') || breed.toLowerCase().includes('kissa') ? 'Lemmikin tunnusväri kartalla' : 'Koiran tunnusväri kartalla'}
            </label>
            <div className="flex items-center space-x-3">
              {['#ef4444', '#10b981', '#3b82f6', '#f59e0b', '#a855f7', '#ec4899', '#06b6d4'].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-full transition-transform ${
                    color === c ? 'scale-125 ring-2 ring-amber-400 shadow-lg' : 'opacity-70 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <button
            type="submit"
            className="w-full mt-4 py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-sm tracking-wide transition flex items-center justify-center space-x-2 shadow-lg cursor-pointer"
          >
            <PlusCircle className="w-5 h-5" />
            <span>
              {trackerModel.includes('Tractive') || breed.toLowerCase().includes('kissa')
                ? `Kytke ${name || 'kissa'} kartalle`
                : `Kytke ${trackerModel} -panta kartalle`}
            </span>
          </button>
        </form>
        </div>
      </div>
    </div>
  );
};
