import React, { useState } from 'react';
import {
  X,
  UserCheck,
  Mail,
  Lock,
  User,
  Shield,
  LogIn,
  UserPlus,
  LogOut,
  Compass,
  CheckCircle2,
  Sparkles,
  Building,
  KeyRound,
} from 'lucide-react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInAnonymously,
  signOut,
  User as FirebaseUser,
} from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';
import { UserProfile, saveUserProfile } from '../services/userService';
import { useLanguage } from '../context/LanguageContext';

interface UserAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: FirebaseUser | null;
  userProfile: UserProfile | null;
  savedDogsCount: number;
  savedMarkersCount: number;
}

export const UserAuthModal: React.FC<UserAuthModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  userProfile,
  savedDogsCount,
  savedMarkersCount,
}) => {
  const { t, language } = useLanguage();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [huntingClub, setHuntingClub] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);

    try {
      if (mode === 'register') {
        if (!displayName.trim()) {
          setErrorMsg('Syötä nimi tai nimimerkki.');
          setLoading(false);
          return;
        }
        const userCred = await createUserWithEmailAndPassword(auth, email, password);
        const profile: UserProfile = {
          uid: userCred.user.uid,
          email: userCred.user.email,
          displayName: displayName.trim(),
          huntingClub: huntingClub.trim() || 'Ei määritelty',
          createdAt: Date.now(),
          isAnonymous: false,
        };
        await saveUserProfile(profile);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      onClose();
    } catch (err: any) {
      console.error('Auth error:', err);
      if (err.code === 'auth/operation-not-allowed') {
        setErrorMsg(
          '⚠️ Sähköpostikirjautuminen (Email/Password) ei ole kytketty päälle Firebase Consolessa (Authentication -> Sign-in method). Voit kirjautua heti ilman lisäasetuksia valitsemalla "Jatka Google-tilillä"!'
        );
      } else if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
        setErrorMsg('Virheellinen sähköposti tai salasana.');
      } else if (err.code === 'auth/email-already-in-use') {
        setErrorMsg('Tämä sähköpostiosoite on jo rekisteröity.');
      } else if (err.code === 'auth/weak-password') {
        setErrorMsg('Salasanan tulee olla vähintään 6 merkkiä pitkä.');
      } else {
        setErrorMsg(err.message || 'Kirjautuminen epäonnistui.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMsg('');
    setLoading(true);
    try {
      const res = await signInWithPopup(auth, googleProvider);
      const profile: UserProfile = {
        uid: res.user.uid,
        email: res.user.email,
        displayName: res.user.displayName || 'Metsästäjä',
        huntingClub: userProfile?.huntingClub || 'Ei määritelty',
        createdAt: Date.now(),
        isAnonymous: false,
      };
      await saveUserProfile(profile);
      onClose();
    } catch (err: any) {
      console.error('Google sign-in error:', err);
      setErrorMsg('Google-kirjautuminen epäonnistui tai se peruttiin.');
    } finally {
      setLoading(false);
    }
  };

  const handleGuestSignIn = async () => {
    setErrorMsg('');
    setLoading(true);
    try {
      const res = await signInAnonymously(auth);
      const profile: UserProfile = {
        uid: res.user.uid,
        email: null,
        displayName: 'Vieras-metsästäjä',
        huntingClub: 'Tilapäinen tili',
        createdAt: Date.now(),
        isAnonymous: true,
      };
      await saveUserProfile(profile);
      onClose();
    } catch (err: any) {
      console.error('Guest sign-in error:', err);
      if (err.code === 'auth/operation-not-allowed') {
        setErrorMsg('⚠️ Vieraskirjautuminen (Anonymous Auth) ei ole kytketty päälle Firebase Consolessa. Käytä Google-kirjautumista ("Jatka Google-tilillä").');
      } else {
        setErrorMsg('Vieraskirjautuminen epäonnistui.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    setLoading(true);
    try {
      await signOut(auth);
      onClose();
    } catch (err) {
      console.error('Sign out error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[3000] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in overflow-y-auto"
    >
      <div className="relative w-full max-w-md max-h-[88vh] flex flex-col bg-stone-900 border border-stone-800 rounded-3xl shadow-2xl overflow-hidden text-stone-100 my-auto">
        {/* Top Accent Line */}
        <div className="h-2 bg-gradient-to-r from-amber-500 via-emerald-500 to-amber-500 shrink-0"></div>

        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-stone-800/80 bg-stone-950/80 shrink-0">
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="p-2.5 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">
              <UserCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-black text-amber-400 tracking-wide font-sans truncate">
                {currentUser ? 'Omat Käyttäjätiedot' : 'Erätutka Käyttäjätili'}
              </h2>
              <p className="text-[11px] text-stone-400 truncate">
                {currentUser
                  ? 'Koirat, passipaikat ja reitit tallessa pilvessä'
                  : 'Tallenna koirasi ja passipaikkasi pilveen'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2.5 rounded-2xl bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white border border-stone-700/80 shadow-md transition cursor-pointer active:scale-95 shrink-0 ml-2"
            title="Sulje ikkuna"
            aria-label="Sulje ikkuna"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          {currentUser ? (
            /* Signed-in View */
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Compass className="w-5 h-5 text-amber-400 shrink-0" />
                    <span className="font-extrabold text-sm text-amber-300">
                      {userProfile?.displayName || currentUser.displayName || 'Kirjautunut Metsästäjä'}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-bold shrink-0">
                    {currentUser.isAnonymous ? 'Vierastili' : 'Vakituinen Tili'}
                  </span>
                </div>
                <p className="text-xs text-stone-300 break-all">
                  {currentUser.email || 'Sähköpostia ei kytketty (tilapäinen tili)'}
                </p>
                {userProfile?.huntingClub && (
                  <p className="text-xs text-amber-400/90 flex items-center space-x-1.5 pt-0.5">
                    <Building className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>Metsästysseura: <strong>{userProfile.huntingClub}</strong></span>
                  </p>
                )}
              </div>

              {/* Sync Statistics */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 rounded-2xl bg-stone-950 border border-stone-800 text-center">
                  <span className="block text-2xl font-black text-amber-400">{savedDogsCount}</span>
                  <span className="text-xs font-semibold text-stone-400">Tallennettua koiraa</span>
                </div>
                <div className="p-3.5 rounded-2xl bg-stone-950 border border-stone-800 text-center">
                  <span className="block text-2xl font-black text-emerald-400">{savedMarkersCount}</span>
                  <span className="text-xs font-semibold text-stone-400">Passipaikkaa & merkintää</span>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-stone-950/80 border border-stone-800 text-xs text-stone-300 space-y-1">
                <p className="flex items-center space-x-1.5 text-emerald-400 font-bold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Pilvisynchronointi aktiivinen!</span>
                </p>
                <p className="text-[11px] text-stone-400 leading-relaxed">
                  Kaikki lisäämäsi koirapannat, passipaikat ja maastomerkinnät tallentuvat automaattisesti käyttäjätilillesi. Voit kirjautua toisella laitteella tai puhelimella ja jatkaa saumattomasti!
                </p>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 space-y-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-xs sm:text-sm transition flex items-center justify-center space-x-2 shadow-lg cursor-pointer active:scale-98"
                >
                  <X className="w-4 h-4" />
                  <span>Sulje ja palaa kartalle</span>
                </button>

                <button
                  type="button"
                  onClick={handleSignOut}
                  disabled={loading}
                  className="w-full py-2.5 rounded-2xl bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/40 text-xs font-bold transition flex items-center justify-center space-x-2 cursor-pointer active:scale-98"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Kirjaudu ulos tältä laitteelta</span>
                </button>
              </div>
            </div>
          ) : (
            /* Login / Register View */
            <div className="space-y-4">
              {/* Primary Google Sign In */}
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={loading}
                  className="w-full py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-sm transition flex items-center justify-center space-x-2 shadow-lg cursor-pointer active:scale-98"
                >
                  <Sparkles className="w-4 h-4 text-stone-950 fill-stone-950" />
                  <span>{t.continueWithGoogle}</span>
                </button>
                <p className="text-[11px] text-stone-400 text-center">
                  {t.googleRecommended}
                </p>
              </div>

              <div className="relative flex py-1 items-center">
                <div className="flex-grow border-t border-stone-800"></div>
                <span className="flex-shrink mx-3 text-[10px] uppercase font-bold text-stone-500">
                  {t.orEmailSignIn}
                </span>
                <div className="flex-grow border-t border-stone-800"></div>
              </div>

              {/* Tabs */}
              <div className="flex rounded-2xl bg-stone-950 p-1 border border-stone-800">
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setErrorMsg('');
                  }}
                  className={`flex-1 py-2 text-xs font-bold rounded-xl transition flex items-center justify-center space-x-1.5 ${
                    mode === 'login'
                      ? 'bg-amber-500 text-stone-950 shadow'
                      : 'text-stone-400 hover:text-stone-200'
                  }`}
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>{t.signIn}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('register');
                    setErrorMsg('');
                  }}
                  className={`flex-1 py-2 text-xs font-bold rounded-xl transition flex items-center justify-center space-x-1.5 ${
                    mode === 'register'
                      ? 'bg-amber-500 text-stone-950 shadow'
                      : 'text-stone-400 hover:text-stone-200'
                  }`}
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>{t.createAccount}</span>
                </button>
              </div>

              {errorMsg && (
                <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-200 text-xs leading-relaxed space-y-2">
                  <div>{errorMsg}</div>
                  {errorMsg.includes('Firebase Consolessa') && (
                    <button
                      type="button"
                      onClick={handleGoogleSignIn}
                      className="w-full py-2 rounded-xl bg-amber-500 text-stone-950 font-black text-xs transition hover:bg-amber-400 shadow"
                    >
                      Jatka Google-tilillä ↗
                    </button>
                  )}
                </div>
              )}

              <form onSubmit={handleEmailAuth} className="space-y-3">
                {mode === 'register' && (
                  <>
                    <div>
                      <label className="block text-xs font-semibold text-stone-300 mb-1">
                        Nimi tai Nimimerkki *
                      </label>
                      <div className="relative">
                        <User className="w-4 h-4 text-stone-500 absolute left-3 top-3" />
                        <input
                          type="text"
                          required
                          value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          placeholder="esim. Matti Meikäläinen"
                          className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-stone-950 border border-stone-800 focus:border-amber-500 text-stone-100 text-sm outline-none transition"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-stone-300 mb-1">
                        Metsästysseura / Seura (valinnainen)
                      </label>
                      <div className="relative">
                        <Building className="w-4 h-4 text-stone-500 absolute left-3 top-3" />
                        <input
                          type="text"
                          value={huntingClub}
                          onChange={(e) => setHuntingClub(e.target.value)}
                          placeholder="esim. Tapiolan Eräveikot ry"
                          className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-stone-950 border border-stone-800 focus:border-amber-500 text-stone-100 text-sm outline-none transition"
                        />
                      </div>
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-xs font-semibold text-stone-300 mb-1">
                    Sähköpostiosoite *
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-stone-500 absolute left-3 top-3" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="matti@esimerkki.fi"
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-stone-950 border border-stone-800 focus:border-amber-500 text-stone-100 text-sm outline-none transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-300 mb-1">
                    Salasana *
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-stone-500 absolute left-3 top-3" />
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="vähintään 6 merkkiä"
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-stone-950 border border-stone-800 focus:border-amber-500 text-stone-100 text-sm outline-none transition"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 rounded-2xl bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 font-bold text-xs transition flex items-center justify-center space-x-2 cursor-pointer"
                >
                  {loading ? (
                    <span>Käsitellään...</span>
                  ) : mode === 'login' ? (
                    <>
                      <LogIn className="w-4 h-4 text-amber-400" />
                      <span>Kirjaudu sähköpostilla</span>
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4 text-amber-400" />
                      <span>Luo tili sähköpostilla</span>
                    </>
                  )}
                </button>
              </form>

              {/* Quick Guest Sign In */}
              <button
                type="button"
                onClick={handleGuestSignIn}
                disabled={loading}
                className="w-full py-2 rounded-xl text-stone-400 hover:text-stone-200 text-xs font-medium transition text-center cursor-pointer"
              >
                Jatka pika-vieraskäyttäjänä (kokeilu ilman tiliä)
              </button>

              <div className="pt-2 border-t border-stone-800/80">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full py-2.5 rounded-xl bg-stone-800/60 hover:bg-stone-800 text-stone-300 text-xs font-semibold transition text-center cursor-pointer"
                >
                  Sulje ikkuna
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
