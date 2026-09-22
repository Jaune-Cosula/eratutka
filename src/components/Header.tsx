import React, { useState } from 'react';
import {
  Compass,
  Dog,
  Users,
  MapPin,
  Ruler,
  AlertTriangle,
  Sun,
  Moon,
  Navigation,
  Download,
  Upload,
  PlusCircle,
  Radio,
  Share2,
  Shield,
  Plus,
  User,
  UserCheck,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Globe,
} from 'lucide-react';
import { UserLocation, HuntSession } from '../types';
import { UserProfile } from '../services/userService';
import { User as FirebaseUser } from 'firebase/auth';
import { useLanguage } from '../context/LanguageContext';

interface HeaderProps {
  activeTab: 'map' | 'radar' | 'team' | 'annotations' | 'ruler';
  setActiveTab: (tab: 'map' | 'radar' | 'team' | 'annotations' | 'ruler') => void;
  isDarkMode: boolean;
  setIsDarkMode: (val: boolean | ((prev: boolean) => boolean)) => void;
  userLocation: UserLocation | null;
  isGpsTracking: boolean;
  toggleGps: () => void;
  onOpenSos: () => void;
  onExportGpx: () => void;
  onImportMapData?: () => void;
  onAddDog: () => void;
  onAddAnnotation: () => void;
  activeDogCount: number;
  teamCount: number;
  unreadRadioCount: number;
  session: HuntSession | null;
  onOpenSessionModal: () => void;
  onOpenShareModal: () => void;
  currentUser?: FirebaseUser | null;
  userProfile?: UserProfile | null;
  onOpenAuthModal?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  isDarkMode,
  setIsDarkMode,
  userLocation,
  isGpsTracking,
  toggleGps,
  onOpenSos,
  onExportGpx,
  onImportMapData,
  onAddDog,
  onAddAnnotation,
  activeDogCount,
  teamCount,
  unreadRadioCount,
  session,
  onOpenSessionModal,
  onOpenShareModal,
  currentUser = null,
  userProfile = null,
  onOpenAuthModal,
}) => {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const { language, setLanguage, t } = useLanguage();

  return (
    <header
      id="main-header"
      className={`sticky top-0 z-[2000] flex-shrink-0 border-b transition-all duration-300 ${
        isDarkMode
          ? 'bg-stone-900/95 border-stone-800 text-stone-100 shadow-lg backdrop-blur-md'
          : 'bg-emerald-900/95 border-emerald-800 text-white shadow-lg backdrop-blur-md'
      }`}
    >
      {/* Top Always-Visible Bar */}
      <div className="max-w-7xl mx-auto px-2 sm:px-4 py-1.5 sm:py-2 flex items-center justify-between gap-1.5 sm:gap-3 min-w-0">
        {/* Left Side: Logo + Main Navigation Tabs */}
        <div className="flex items-center space-x-2 sm:space-x-3 min-w-0 flex-1">
          {/* Compass Logo Button */}
          <button
            id="btn-header-square-toggle"
            onClick={() => setIsCollapsed((prev) => !prev)}
            title={isCollapsed ? (language === 'fi' ? 'Avaa työkalut' : 'Open tools') : (language === 'fi' ? 'Piilota työkalut' : 'Hide tools')}
            className="relative flex-shrink-0 flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400 hover:bg-amber-500/30 transition-all cursor-pointer shadow-sm active:scale-95 group"
          >
            <Compass className="w-4 h-4 sm:w-5 sm:h-5 animate-spin-slow group-hover:scale-110 transition-transform" />
            <span className="absolute -top-1 -right-1 flex h-3 w-3 sm:h-3.5 sm:w-3.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-80"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 sm:h-3.5 sm:w-3.5 bg-emerald-500 border-2 border-stone-900"></span>
            </span>
          </button>

          {/* Title */}
          <div className="flex items-center space-x-1 flex-shrink-0">
            <h1
              onClick={() => setIsCollapsed((prev) => !prev)}
              className="font-extrabold text-sm sm:text-lg lg:text-xl tracking-wide font-sans text-amber-400 cursor-pointer drop-shadow-sm hover:opacity-90 transition-opacity"
            >
              ERÄTUTKA
            </h1>
            <span className="text-[9px] sm:text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-300 font-bold hidden md:inline-block">
              v2.7.7
            </span>
          </div>

          {/* Primary Navigation Tabs - ALWAYS VISIBLE */}
          <nav className="flex items-center space-x-1 sm:space-x-1.5 overflow-x-auto scrollbar-none py-0.5 min-w-0 flex-1">
            <button
              id="header-tab-map"
              onClick={() => setActiveTab('map')}
              className={`flex-shrink-0 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs sm:text-sm font-bold flex items-center space-x-1 sm:space-x-1.5 transition-all ${
                activeTab === 'map'
                  ? 'bg-amber-500 text-stone-950 shadow-md scale-[1.02]'
                  : 'bg-stone-800/80 hover:bg-stone-700 text-stone-200 border border-stone-700/60'
              }`}
            >
              <Navigation className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span>{t.map}</span>
            </button>

            <button
              id="header-tab-radar"
              onClick={() => setActiveTab('radar')}
              className={`flex-shrink-0 relative px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs sm:text-sm font-bold flex items-center space-x-1 sm:space-x-1.5 transition-all ${
                activeTab === 'radar'
                  ? 'bg-amber-500 text-stone-950 shadow-md scale-[1.02]'
                  : 'bg-stone-800/80 hover:bg-stone-700 text-stone-200 border border-stone-700/60'
              }`}
            >
              <Dog className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${activeTab === 'radar' ? '' : 'text-red-400'}`} />
              <span>{t.dogs} ({activeDogCount})</span>
            </button>

            <button
              id="header-tab-team"
              onClick={() => setActiveTab('team')}
              className={`flex-shrink-0 relative px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs sm:text-sm font-bold flex items-center space-x-1 sm:space-x-1.5 transition-all ${
                activeTab === 'team'
                  ? 'bg-amber-500 text-stone-950 shadow-md scale-[1.02]'
                  : 'bg-stone-800/80 hover:bg-stone-700 text-stone-200 border border-stone-700/60'
              }`}
            >
              <MessageSquare className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${activeTab === 'team' ? '' : 'text-sky-400'}`} />
              <span>{t.chatRadio} ({teamCount})</span>
              {unreadRadioCount > 0 && (
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              )}
            </button>

            <button
              id="header-tab-annotations"
              onClick={() => setActiveTab('annotations')}
              className={`flex-shrink-0 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs sm:text-sm font-bold flex items-center space-x-1 sm:space-x-1.5 transition-all ${
                activeTab === 'annotations'
                  ? 'bg-amber-500 text-stone-950 shadow-md scale-[1.02]'
                  : 'bg-stone-800/80 hover:bg-stone-700 text-stone-200 border border-stone-700/60'
              }`}
            >
              <MapPin className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${activeTab === 'annotations' ? '' : 'text-emerald-400'}`} />
              <span>{t.annotations}</span>
            </button>

            <button
              id="header-tab-ruler"
              onClick={() => setActiveTab('ruler')}
              className={`flex-shrink-0 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs sm:text-sm font-bold flex items-center space-x-1 sm:space-x-1.5 transition-all ${
                activeTab === 'ruler'
                  ? 'bg-amber-500 text-stone-950 shadow-md scale-[1.02]'
                  : 'bg-stone-800/80 hover:bg-stone-700 text-stone-200 border border-stone-700/60'
              }`}
            >
              <Ruler className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${activeTab === 'ruler' ? '' : 'text-purple-400'}`} />
              <span>{t.ruler}</span>
            </button>
          </nav>
        </div>

        {/* Right Side: Language Switcher + SOS Button + Toolbar Drawer Toggle */}
        <div className="flex items-center space-x-1.5 sm:space-x-2 flex-shrink-0">
          {/* Language Toggle Button */}
          <button
            id="btn-toggle-language-top"
            onClick={() => setLanguage(language === 'fi' ? 'en' : 'fi')}
            className="flex items-center space-x-1 px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-xl bg-stone-800 hover:bg-stone-700 border border-stone-700 text-amber-300 font-extrabold text-xs transition cursor-pointer shadow-sm active:scale-95"
            title={language === 'fi' ? 'Switch to English' : 'Vaihda suomeksi'}
          >
            <Globe className="w-3.5 h-3.5 text-amber-400" />
            <span className="font-mono uppercase tracking-wider">{language === 'fi' ? '🇫🇮 FI' : '🇬🇧 EN'}</span>
          </button>

          <button
            id="btn-open-sos"
            onClick={onOpenSos}
            className="flex items-center space-x-1 px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-full text-xs font-black bg-red-600 hover:bg-red-500 text-white shadow-md border border-red-400 transition transform active:scale-95"
            title={t.sos}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-yellow-300" />
            <span className="hidden sm:inline">{t.sos}</span>
            <span className="sm:hidden">SOS</span>
          </button>

          <button
            id="btn-toggle-menu-collapse"
            onClick={() => setIsCollapsed((prev) => !prev)}
            className="flex items-center space-x-1 px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-stone-950 transition-all shadow border border-amber-400 active:scale-95 cursor-pointer"
            title={isCollapsed ? 'Tools' : 'Hide'}
          >
            {isCollapsed ? (
              <>
                <ChevronDown className="w-4 h-4" />
                <span className="hidden sm:inline">Tools</span>
              </>
            ) : (
              <>
                <ChevronUp className="w-4 h-4" />
                <span className="hidden sm:inline">Hide</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Expanded Tools Drawer */}
      {!isCollapsed && (
        <div className="max-w-7xl mx-auto px-3 sm:px-4 pb-2.5 pt-1.5 border-t border-stone-800/60 flex flex-wrap items-center justify-between gap-2 animate-fadeIn">
          {/* Quick Toolbar Actions */}
          <div className="flex items-center space-x-1.5 sm:space-x-2 flex-wrap gap-y-1.5 w-full justify-between sm:justify-start">
            {/* Hunt Session Status / Share Button */}
            {session ? (
              <div className="flex items-center space-x-1">
                <button
                  id="btn-open-share-session"
                  onClick={onOpenShareModal}
                  title="Jaa jahtipäivä tai katso kutsukoodi"
                  className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-extrabold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 transition"
                >
                  <Shield className="w-3.5 h-3.5 text-amber-400" />
                  <span className="max-w-[100px] truncate hidden sm:inline">{session.name}</span>
                  <span className="font-mono text-[11px] font-bold px-1 py-0.2 rounded bg-amber-500/30">
                    {session.code}
                  </span>
                </button>

                <button
                  id="btn-quick-share"
                  onClick={onOpenShareModal}
                  title="Jaa jahtipäivä (QR / Koodi / Linkki)"
                  className="p-1.5 rounded-lg bg-emerald-600/80 hover:bg-emerald-500 text-white transition flex items-center justify-center"
                >
                  <Share2 className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                id="btn-create-join-hunt"
                onClick={onOpenSessionModal}
                title={t.huntSession}
                className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-stone-950 transition shadow"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t.huntSession}</span>
              </button>
            )}

            {/* GPS Toggle */}
            <button
              id="btn-toggle-gps"
              onClick={toggleGps}
              title={isGpsTracking ? 'GPS Active' : 'Enable GPS'}
              className={`flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                isGpsTracking
                  ? 'bg-emerald-600/30 border-emerald-500 text-emerald-300'
                  : 'bg-stone-800/50 border-stone-700 text-stone-400 hover:text-stone-200'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${isGpsTracking ? 'bg-emerald-400 animate-ping' : 'bg-stone-500'}`}></span>
              <span className="hidden sm:inline">{isGpsTracking ? 'GPS On' : 'GPS Off'}</span>
            </button>

            {/* New Dog Button */}
            <button
              id="btn-add-dog"
              onClick={onAddDog}
              title={t.addDog}
              className="flex items-center space-x-1 px-2 py-1.5 rounded-lg text-xs font-semibold bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 transition"
            >
              <PlusCircle className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden lg:inline">+ {t.dogs}</span>
            </button>

            {/* New Marker Button */}
            <button
              id="btn-add-marker"
              onClick={onAddAnnotation}
              title={t.addMarker}
              className="flex items-center space-x-1 px-2 py-1.5 rounded-lg text-xs font-semibold bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 transition"
            >
              <MapPin className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden lg:inline">+ {t.annotations}</span>
            </button>

            {/* User Account / Profile Button */}
            {onOpenAuthModal && (
              <button
                id="btn-open-user-auth"
                onClick={onOpenAuthModal}
                title={
                  currentUser
                    ? `${t.account}: ${userProfile?.displayName || currentUser.email || 'Logged in'}`
                    : t.signIn
                }
                className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition border ${
                  currentUser
                    ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border-amber-500/40'
                    : 'bg-stone-800 hover:bg-stone-700 text-stone-300 border-stone-700'
                }`}
              >
                {currentUser ? (
                  <UserCheck className="w-4 h-4 text-amber-400" />
                ) : (
                  <User className="w-4 h-4 text-stone-400" />
                )}
                <span className="hidden md:inline">
                  {currentUser
                    ? userProfile?.displayName || t.account
                    : t.signIn}
                </span>
              </button>
            )}

            {/* Theme Switcher */}
            <button
              id="btn-toggle-theme"
              onClick={() => setIsDarkMode((prev) => !prev)}
              title={isDarkMode ? 'Vaihda päiväteemaan' : 'Vaihda pimeä/yöteemaan'}
              className="p-1.5 rounded-lg bg-stone-800/80 hover:bg-stone-700 text-amber-400 border border-stone-700 transition"
            >
              {isDarkMode ? <Sun className="w-4 h-4 text-amber-300" /> : <Moon className="w-4 h-4 text-amber-400" />}
            </button>

            {/* GPX Export / Download map data */}
            <button
              id="btn-export-gpx"
              onClick={onExportGpx}
              title="Lataa karttatiedot & reitit GPX-muodossa"
              className="p-1.5 rounded-lg bg-stone-800/80 hover:bg-stone-700 text-sky-300 border border-stone-700 transition"
            >
              <Download className="w-4 h-4" />
            </button>

            {/* Map Data Import / Tuo karttatiedot */}
            {onImportMapData && (
              <button
                id="btn-import-map-data"
                onClick={onImportMapData}
                title="Tuo karttatiedot (GPX, GeoJSON, KML, JSON)"
                className="p-1.5 rounded-lg bg-stone-800/80 hover:bg-stone-700 text-amber-300 border border-stone-700 transition"
              >
                <Upload className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
};


