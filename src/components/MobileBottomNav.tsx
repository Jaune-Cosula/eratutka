import React from 'react';
import { Navigation, Dog, MessageSquare, MapPin, Ruler } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

interface MobileBottomNavProps {
  activeTab: 'map' | 'radar' | 'team' | 'annotations' | 'ruler';
  setActiveTab: (tab: 'map' | 'radar' | 'team' | 'annotations' | 'ruler') => void;
  activeDogCount: number;
  teamCount: number;
  unreadRadioCount: number;
  isDarkMode: boolean;
  onAddDog?: () => void;
  onAddAnnotation?: () => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  setActiveTab,
  activeDogCount,
  teamCount,
  unreadRadioCount,
  isDarkMode,
}) => {
  const { t } = useLanguage();

  return (
    <div
      id="mobile-bottom-nav"
      className={`fixed bottom-0 left-0 right-0 z-[2000] border-t px-1 py-1.5 md:hidden transition-all duration-200 shadow-2xl backdrop-blur-lg ${
        isDarkMode
          ? 'bg-stone-950/95 border-stone-800 text-stone-300'
          : 'bg-stone-900/95 border-stone-800 text-stone-200'
      }`}
      style={{ paddingBottom: 'calc(0.375rem + env(safe-area-inset-bottom, 0px))' }}
    >
      <nav className="grid grid-cols-5 gap-0.5 items-center justify-items-center max-w-md mx-auto">
        {/* Tab 1: Map */}
        <button
          id="mobile-tab-map"
          onClick={() => setActiveTab('map')}
          className={`flex flex-col items-center justify-center w-full py-1 rounded-xl transition-all ${
            activeTab === 'map'
              ? 'bg-amber-500/20 text-amber-400 font-bold border border-amber-500/30'
              : 'text-stone-400 hover:text-stone-200'
          }`}
        >
          <Navigation className={`w-5 h-5 ${activeTab === 'map' ? 'text-amber-400 scale-110' : ''}`} />
          <span className="text-[10px] font-medium mt-0.5 tracking-tight">{t.map}</span>
        </button>

        {/* Tab 2: Dogs */}
        <button
          id="mobile-tab-radar"
          onClick={() => setActiveTab('radar')}
          className={`relative flex flex-col items-center justify-center w-full py-1 rounded-xl transition-all ${
            activeTab === 'radar'
              ? 'bg-amber-500/20 text-amber-400 font-bold border border-amber-500/30'
              : 'text-stone-400 hover:text-stone-200'
          }`}
        >
          <div className="relative">
            <Dog className={`w-5 h-5 ${activeTab === 'radar' ? 'text-amber-400 scale-110' : 'text-red-400'}`} />
            {activeDogCount > 0 && (
              <span className="absolute -top-1.5 -right-2 bg-red-600 text-white font-extrabold text-[9px] px-1 rounded-full border border-stone-900 leading-tight">
                {activeDogCount}
              </span>
            )}
          </div>
          <span className="text-[10px] font-medium mt-0.5 tracking-tight">{t.dogs}</span>
        </button>

        {/* Tab 3: Chat */}
        <button
          id="mobile-tab-team"
          onClick={() => setActiveTab('team')}
          className={`relative flex flex-col items-center justify-center w-full py-1 rounded-xl transition-all ${
            activeTab === 'team'
              ? 'bg-amber-500/20 text-amber-400 font-bold border border-amber-500/30'
              : 'text-stone-400 hover:text-stone-200'
          }`}
        >
          <div className="relative">
            <MessageSquare className={`w-5 h-5 ${activeTab === 'team' ? 'text-amber-400 scale-110' : 'text-sky-400'}`} />
            {unreadRadioCount > 0 && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500 border border-stone-900 animate-pulse" />
            )}
          </div>
          <span className="text-[10px] font-medium mt-0.5 tracking-tight">Chat</span>
        </button>

        {/* Tab 4: Markers */}
        <button
          id="mobile-tab-annotations"
          onClick={() => setActiveTab('annotations')}
          className={`flex flex-col items-center justify-center w-full py-1 rounded-xl transition-all ${
            activeTab === 'annotations'
              ? 'bg-amber-500/20 text-amber-400 font-bold border border-amber-500/30'
              : 'text-stone-400 hover:text-stone-200'
          }`}
        >
          <MapPin className={`w-5 h-5 ${activeTab === 'annotations' ? 'text-amber-400 scale-110' : 'text-emerald-400'}`} />
          <span className="text-[10px] font-medium mt-0.5 tracking-tight">{t.annotations}</span>
        </button>

        {/* Tab 5: Ruler */}
        <button
          id="mobile-tab-ruler"
          onClick={() => setActiveTab('ruler')}
          className={`flex flex-col items-center justify-center w-full py-1 rounded-xl transition-all ${
            activeTab === 'ruler'
              ? 'bg-amber-500/20 text-amber-400 font-bold border border-amber-500/30'
              : 'text-stone-400 hover:text-stone-200'
          }`}
        >
          <Ruler className={`w-5 h-5 ${activeTab === 'ruler' ? 'text-amber-400 scale-110' : 'text-purple-400'}`} />
          <span className="text-[10px] font-medium mt-0.5 tracking-tight">{t.ruler}</span>
        </button>
      </nav>
    </div>
  );
};

