/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LogOut, Heart, Settings, Sliders, Volume2, VolumeX, Eye, Github, 
  ExternalLink, User, Compass, ServerCrash, Check, Sparkles, AlertCircle 
} from 'lucide-react';
import { auth, db, handleFirestoreError } from '../firebase';
import { 
  collection, query, where, getDocs, doc, setDoc, deleteDoc, writeBatch, serverTimestamp 
} from 'firebase/firestore';
import { Project, ThemeType, Favorite, UserSetting, OperationType } from '../types';
import { playAmbientSound } from './SoundFX';

interface PortfolioViewProps {
  onSignOut: () => void;
  currentTheme: ThemeType;
  onChangeTheme: (theme: ThemeType) => void;
  soundEnabled: boolean;
  onToggleSound: (enabled: boolean) => void;
  bgComplexity: 'low' | 'regular' | 'high';
  onChangeBgComplexity: (complexity: 'low' | 'regular' | 'high') => void;
}

// Highly stylized Japanese-inspired portfolio projects (Curated Placeholders)
const staticProjects: Project[] = [
  {
    id: 'project-karesansui',
    title: 'ZenGarden OS',
    japaneseTitle: '枯山水',
    description: 'A desktop system framework employing tranquil timers, quiet notifications, and modular sliding grids.',
    longDescription: 'Driven by the philosophy of Karesansui (dry sand gardens), this application environment eliminates floating workspace clutter. It features integrated breath-calibrated intervals, silent horizontal grid widgets, and spatial organization which helps users achieve persistent state flow.',
    coverImage: 'https://images.unsplash.com/photo-1504198453319-5ce911bafcde?q=80&w=600&auto=format&fit=crop',
    tags: ['React', 'Simplex Noise', 'WebAudio', 'CSS Grid'],
    githubUrl: 'https://github.com/example/zengarden-os',
    projectUrl: 'https://example.com/karesansui',
    order: 1
  },
  {
    id: 'project-sumie',
    title: 'Sumi Brush Shader',
    japaneseTitle: '墨絵',
    description: 'An HTML Canvas rendering engine replicating brush pressure, calligraphic bleed, and water capillary flow.',
    longDescription: 'A procedural paint-simulation API replicating sumi-e wash techniques. It maps input coordinate velocities to dynamic fluid equations on local HTML canvases, rendering organic capillary run-offs, bristle splitting, and authentic charcoal pigment dryout patterns.',
    coverImage: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?q=80&w=600&auto=format&fit=crop',
    tags: ['WebGL', 'GLSL Shaders', 'HTML5 Canvas', 'Mathematics'],
    githubUrl: 'https://github.com/example/sumi-shader',
    projectUrl: 'https://example.com/sumie',
    order: 2
  },
  {
    id: 'project-urushi',
    title: 'Urushi Lacquer Grid',
    japaneseTitle: '漆器',
    description: 'A high-contrast design system featuring high-gloss black boundaries, deep scarlet highlights, and gold dust transitions.',
    longDescription: 'Inspired by traditional Japanese Urushi artware, this web-layout framework relies on stark organic boundaries. It utilizes hardware-accelerated CSS transformations to emulate the layering of protective sap over wood, and applies dynamic particle filters to render gold dust (maki-e) transitions during item switches.',
    coverImage: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?q=80&w=600&auto=format&fit=crop',
    tags: ['Tailwind', 'Framer Motion', 'WebAssembly', 'Lottie'],
    githubUrl: 'https://github.com/example/urushi-grid',
    projectUrl: 'https://example.com/urushi',
    order: 3
  },
  {
    id: 'project-kinbaku',
    title: 'Kinbaku Topology',
    japaneseTitle: '緊縛',
    description: 'An experimental layout engine managing grid constraints, vector lines, and geometric tension cords.',
    longDescription: 'Exploring structural balance under force limits, this library uses a spring-physics lattice solver. It links standard web elements using elegant vector tension lines, ensuring that resizing coordinates react naturally to grid constraints like taut cord binding.',
    coverImage: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=600&auto=format&fit=crop',
    tags: ['Three.js', 'Spring Physics', 'TypeScript', 'Lattice Solver'],
    githubUrl: 'https://github.com/example/kinbaku-topology',
    projectUrl: 'https://example.com/kinbaku',
    order: 4
  }
];

export default function PortfolioView({
  onSignOut,
  currentTheme,
  onChangeTheme,
  soundEnabled,
  onToggleSound,
  bgComplexity,
  onChangeBgComplexity
}: PortfolioViewProps) {
  const [projects, setProjects] = useState<Project[]>(staticProjects);
  const [userFavorites, setUserFavorites] = useState<string[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(staticProjects[0]);
  const [showSettings, setShowSettings] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [dbStatusMsg, setDbStatusMsg] = useState<'synced' | 'saving' | 'error' | 'ready'>('ready');
  const [activeTab, setActiveTab] = useState<'showcase' | 'about'>('showcase');

  const user = auth.currentUser;

  // 1. Synchronize data with Firebase on startup (Firestore settings and favorites)
  useEffect(() => {
    if (!user) return;
    
    const fetchUserData = async () => {
      setIsSyncing(true);
      setDbStatusMsg('saving');
      
      try {
        // A. Load Favorites
        const favPath = 'favorites';
        const qFavs = query(collection(db, favPath), where('userId', '==', user.uid));
        const qSnap = await getDocs(qFavs);
        const loadedFavs: string[] = [];
        qSnap.forEach((docSnap) => {
          const data = docSnap.data();
          if (data && data.projectId) {
            loadedFavs.push(data.projectId);
          }
        });
        setUserFavorites(loadedFavs);

        // B. Load Settings
        const settingsPath = `settings`;
        const qSettings = query(collection(db, settingsPath), where('userId', '==', user.uid));
        const sSnap = await getDocs(qSettings);
        
        if (!sSnap.empty) {
          const userSet = sSnap.docs[0].data() as UserSetting;
          if (userSet.themePreference) onChangeTheme(userSet.themePreference);
          if (userSet.soundEnabled !== undefined) onToggleSound(userSet.soundEnabled);
          if (userSet.interactiveBgComplexity) onChangeBgComplexity(userSet.interactiveBgComplexity);
        }
        
        setDbStatusMsg('synced');
      } catch (err) {
        console.warn('Firestore fetch was sandboxed or empty. Reverting to persistent Local preferences.', err);
        setDbStatusMsg('error');
        // Load settings from local storage as fallback
        const savedSettings = localStorage.getItem(`shiro_settings_${user.uid}`);
        if (savedSettings) {
          try {
            const parsed = JSON.parse(savedSettings);
            if (parsed.theme) onChangeTheme(parsed.theme);
            if (parsed.sound !== undefined) onToggleSound(parsed.sound);
            if (parsed.complexity) onChangeBgComplexity(parsed.complexity);
          } catch (_) {}
        }
      } finally {
        setIsSyncing(false);
      }
    };

    fetchUserData();
  }, [user]);

  // Handle Logout
  const handleLogout = async () => {
    playAmbientSound('click', soundEnabled);
    try {
      await auth.signOut();
      onSignOut();
    } catch (err) {
      console.error('Logout error: ', err);
    }
  };

  // Toggle Project Favorite (Uses Firebase with atomic local redundancy)
  const handleToggleFavorite = async (projectId: string) => {
    if (!user) return;
    playAmbientSound('click', soundEnabled);

    const isFav = userFavorites.includes(projectId);
    let updated: string[];

    if (isFav) {
      updated = userFavorites.filter(id => id !== projectId);
    } else {
      updated = [...userFavorites, projectId];
    }
    
    // Immediate local optimistic UI switch
    setUserFavorites(updated);
    setDbStatusMsg('saving');

    const favDocId = `${user.uid}_${projectId}`;
    const targetPath = `favorites`;

    try {
      if (isFav) {
        // Delete favorite document from Firestore
        await deleteDoc(doc(db, targetPath, favDocId));
      } else {
        // Save complete validated Favorite structure to Firestore
        const favoritePayload = {
          userId: user.uid,
          projectId: projectId,
          favoritedAt: new Date() // Will pass schema verification bounds
        };
        await setDoc(doc(db, targetPath, favDocId), favoritePayload);
      }
      setDbStatusMsg('synced');
    } catch (error) {
      // Catch permissions error or timeout and trigger standard handled JSON logs
      try {
        handleFirestoreError(error, isFav ? OperationType.DELETE : OperationType.CREATE, `${targetPath}/${favDocId}`);
      } catch (finalErr: any) {
        console.error('High-Fidelity DB Handler Logged:', finalErr.message);
        setDbStatusMsg('error');
      }
    }
  };

  // Toggle Preferences and sync to database / localStorage
  const handleSaveSetting = async (
    theme: ThemeType, 
    sound: boolean, 
    complexity: 'low' | 'regular' | 'high'
  ) => {
    if (!user) return;

    onChangeTheme(theme);
    onToggleSound(sound);
    onChangeBgComplexity(complexity);

    playAmbientSound('toggle', sound);

    // Write to LocalStorage for offline fallback
    localStorage.setItem(`shiro_settings_${user.uid}`, JSON.stringify({
      theme, sound, complexity
    }));

    setDbStatusMsg('saving');
    const targetPath = `settings`;

    try {
      // Save structural, validated user setting to Firestore
      const settingsPayload = {
        userId: user.uid,
        themePreference: theme,
        soundEnabled: sound,
        interactiveBgComplexity: complexity,
        updatedAt: new Date() // Will match standard formatted timestamp
      };
      await setDoc(doc(db, targetPath, user.uid), settingsPayload);
      setDbStatusMsg('synced');
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.WRITE, `${targetPath}/${user.uid}`);
      } catch (finalErr: any) {
        console.error('High-Fidelity Preference Logged:', finalErr.message);
        setDbStatusMsg('error');
      }
    }
  };

  return (
    <div className="relative min-h-screen flex flex-col justify-between p-4 md:p-8 select-none bg-stone-50 text-stone-900 dark:bg-zinc-950 dark:text-zinc-100 transition-colors duration-1000">
      
      {/* Hairline Shoji Screen Layout Bounds */}
      <div className="absolute inset-x-0 top-16 h-[1px] bg-stone-200/50 dark:bg-zinc-800/40 pointer-events-none" />
      <div className="absolute inset-x-0 bottom-12 h-[1px] bg-stone-200/50 dark:bg-zinc-800/40 pointer-events-none" />
      <div className="absolute left-1/2 inset-y-0 w-[1px] bg-stone-200/50 dark:bg-zinc-800/40 pointer-events-none hidden lg:block" />

      {/* HEADER SECTION */}
      <header className="z-10 flex justify-between items-center h-12">
        <div className="flex items-center space-x-3">
          <div className="w-6 h-6 bg-red-600 flex items-center justify-center font-serif text-white text-[10px] font-bold">
            白
          </div>
          <div>
            <h1 className="font-sans font-semibold tracking-widest text-[11px] uppercase text-stone-800 dark:text-zinc-100">
              SHIRO PORTFOLIO
            </h1>
          </div>
        </div>

        {/* Database Sync Status line (Anti Tech-Larp / Clean Professional Indicator) */}
        <div className="hidden sm:flex items-center space-x-2 bg-stone-150 dark:bg-zinc-900 px-3 py-1 border border-stone-200/60 dark:border-zinc-800/60 rounded-none text-[10px] font-mono">
          <span className={`w-1.5 h-1.5 rounded-full ${
            dbStatusMsg === 'synced' ? 'bg-emerald-500' :
            dbStatusMsg === 'saving' ? 'bg-amber-500 animate-pulse' :
            dbStatusMsg === 'error' ? 'bg-red-500' : 'bg-stone-300 dark:bg-zinc-600'
          }`} />
          <span className="text-stone-500 dark:text-zinc-400">
            {dbStatusMsg === 'synced' ? 'DATABASE SYNCHRONIZED' :
             dbStatusMsg === 'saving' ? 'RECONCILING RECURSION...' :
             dbStatusMsg === 'error' ? 'SECURE BLOCK fallback mode' : 'READY'}
          </span>
        </div>

        {/* Nav Controls */}
        <div className="flex items-center space-x-2">
          <nav className="flex space-x-1 border border-stone-200/60 dark:border-zinc-800/60 p-0.5">
            <button
              onClick={() => { playAmbientSound('click', soundEnabled); setActiveTab('showcase'); }}
              className={`px-3 py-1 font-sans text-[10px] tracking-widest uppercase rounded-none cursor-pointer transition-colors ${
                activeTab === 'showcase' 
                  ? 'bg-stone-900 text-stone-50 dark:bg-zinc-100 dark:text-zinc-950' 
                  : 'hover:bg-stone-200/50 dark:hover:bg-zinc-900 text-stone-500 dark:text-zinc-400'
              }`}
            >
              SHOWCASE
            </button>
            <button
              onClick={() => { playAmbientSound('click', soundEnabled); setActiveTab('about'); }}
              className={`px-3 py-1 font-sans text-[10px] tracking-widest uppercase rounded-none cursor-pointer transition-colors ${
                activeTab === 'about' 
                  ? 'bg-stone-900 text-stone-50 dark:bg-zinc-100 dark:text-zinc-950' 
                  : 'hover:bg-stone-200/50 dark:hover:bg-zinc-900 text-stone-500 dark:text-zinc-400'
              }`}
            >
              ABOUT STUDIO
            </button>
          </nav>
          
          <button
            onClick={() => { playAmbientSound('click', soundEnabled); setShowSettings(!showSettings); }}
            className={`p-2 border border-stone-200/60 dark:border-zinc-800/60 hover:bg-stone-200/40 dark:hover:bg-zinc-900 cursor-pointer transition-colors ${
              showSettings ? 'bg-stone-250 dark:bg-zinc-800' : ''
            }`}
            title="Aesthetic Settings"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* MAIN CONTAINER LAYOUT */}
      <main className="z-10 flex-grow grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch pt-8 pb-4">
        
        {/* SETTINGS PANEL (DOCK SLIDE-IN) */}
        <AnimatePresence>
          {showSettings && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute left-4 right-4 md:left-8 md:right-8 top-16 bg-stone-100/95 dark:bg-zinc-900/95 backdrop-blur-md border border-stone-300 dark:border-zinc-800 p-6 z-20 shadow-xl max-w-lg ml-auto flex flex-col space-y-5"
            >
              <div className="flex justify-between items-center border-b border-stone-250 dark:border-zinc-800 pb-2">
                <h3 className="font-mono text-[10px] tracking-widest text-stone-400 dark:text-zinc-500 uppercase flex items-center">
                  <Sliders className="w-3 h-3 mr-1" /> CORE CONFIG
                </h3>
                <span className="text-[9px] font-mono text-stone-400 bg-stone-200 dark:bg-zinc-800 px-2 py-0.5">
                  SECURE PREFERENCES
                </span>
              </div>

              {/* Theme Settings selector */}
              <div className="space-y-2">
                <label className="font-sans text-[10px] tracking-widest text-stone-500 dark:text-zinc-400 uppercase">
                  Aesthetic Theme Palette
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {(['light', 'dark', 'sepia', 'wabi-sabi'] as ThemeType[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => handleSaveSetting(t, soundEnabled, bgComplexity)}
                      className={`py-2 text-[10px] font-mono tracking-wider border cursor-pointer uppercase transition-all duration-300 ${
                        currentTheme === t
                          ? 'border-red-600 bg-stone-900 text-stone-50 dark:bg-zinc-100 dark:text-zinc-950 font-semibold'
                          : 'border-stone-200 dark:border-zinc-800 hover:bg-stone-200/50 dark:hover:bg-zinc-800'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* sound toggle */}
              <div className="flex justify-between items-center bg-stone-50 dark:bg-zinc-950 p-3 border border-stone-200/60 dark:border-zinc-800/40">
                <div>
                  <h4 className="font-sans text-xs font-medium">Tactile Sounds</h4>
                  <p className="font-mono text-[9px] text-stone-400 dark:text-zinc-500">Procedural mineral audio feedback</p>
                </div>
                <button
                  onClick={() => handleSaveSetting(currentTheme, !soundEnabled, bgComplexity)}
                  className={`p-2 border transition-all cursor-pointer ${
                    soundEnabled 
                      ? 'border-stone-900 bg-stone-900 text-stone-50 dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950' 
                      : 'border-stone-200 text-stone-400 dark:border-zinc-800'
                  }`}
                >
                  {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                </button>
              </div>

              {/* orb scale complexity */}
              <div className="space-y-2">
                <div className="flex justify-between">
                  <label className="font-sans text-[10px] tracking-widest text-stone-500 dark:text-zinc-400 uppercase">
                    3D Background Complexity
                  </label>
                  <span className="font-mono text-[9px] text-red-600 dark:text-red-400 uppercase">
                    GPU DENSITY
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(['low', 'regular', 'high'] as const).map((c) => (
                    <button
                      key={c}
                      onClick={() => handleSaveSetting(currentTheme, soundEnabled, c)}
                      className={`py-2 text-[10px] font-mono border cursor-pointer uppercase transition-all duration-300 ${
                        bgComplexity === c
                          ? 'border-stone-900 bg-stone-900 text-stone-50 dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950'
                          : 'border-stone-200 dark:border-zinc-800 hover:bg-stone-200/50 dark:hover:bg-zinc-800'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                <p className="font-mono text-[8px] text-stone-400 dark:text-zinc-500 leading-tight">
                  High updates vertex subdivision on the sphere mesh and increases GLSL displacement frequency. Low saves battery.
                </p>
              </div>

              <div className="border-t border-stone-250 dark:border-zinc-800 pt-3 flex justify-end">
                <button
                  onClick={() => { playAmbientSound('click', soundEnabled); setShowSettings(false); }}
                  className="px-4 py-2 bg-stone-900 text-stone-50 dark:bg-zinc-100 dark:text-zinc-950 font-mono text-[10px] tracking-widest uppercase cursor-pointer hover:bg-stone-800 transition-colors"
                >
                  CONFIRM / 確定
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* TAB 1: SHOWCASE PORTFOLIO VIEW */}
        {activeTab === 'showcase' && (
          <>
            {/* LEFT SPLIT: PROJECTS GRID */}
            <div className="flex flex-col justify-between pr-0 lg:pr-8 space-y-6">
              
              {/* Introduction Profile block */}
              <div className="space-y-3">
                <span className="font-mono text-[10px] text-red-600 dark:text-red-400 tracking-widest">
                  PORTFOLIO // Selected Works
                </span>
                <h2 className="font-sans font-extralight text-3xl md:text-4xl text-stone-900 dark:text-zinc-50 tracking-tight leading-tight">
                  Striking design. <br />
                  <span className="font-medium font-serif italic text-stone-800 dark:text-zinc-200">Zero unnecessary paths.</span>
                </h2>
                <p className="font-sans text-stone-500 dark:text-zinc-400 text-xs max-w-md leading-relaxed font-light">
                  Click a project in the minimalist grid below to deploy its layout specification, interact with its files, or save to your authenticated favorites.
                </p>
              </div>

              {/* Bento-like Grid Projects list */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-auto">
                {projects.map((proj) => {
                  const isFav = userFavorites.includes(proj.id);
                  const isActive = activeProject?.id === proj.id;
                  
                  return (
                    <div
                      key={proj.id}
                      onClick={() => { 
                        playAmbientSound('hover', soundEnabled);
                        setActiveProject(proj); 
                      }}
                      className={`relative p-5 border cursor-pointer text-left transition-all duration-300 flex flex-col justify-between h-44 ${
                        isActive
                          ? 'border-stone-900 bg-stone-200/45 dark:border-zinc-100 dark:bg-zinc-900/60'
                          : 'border-stone-200/70 dark:border-zinc-800/60 hover:border-stone-400 dark:hover:border-zinc-650 hover:bg-stone-500/[0.02]'
                      }`}
                    >
                      {/* Grid hairline indices */}
                      <span className="font-mono text-[9px] text-stone-400 dark:text-zinc-500 absolute top-3 left-3">
                        0{proj.order} // {proj.japaneseTitle}
                      </span>

                      {/* Favorite Heart action */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleFavorite(proj.id);
                        }}
                        className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-stone-250 dark:hover:bg-zinc-800 text-stone-450 dark:text-zinc-500 hover:text-red-600 transition-colors cursor-pointer"
                        title={isFav ? "Remove Favorite" : "Save Favorite"}
                      >
                        <Heart className={`w-3.5 h-3.5 ${isFav ? 'fill-red-600 text-red-600' : ''}`} />
                      </button>

                      {/* Bottom Title block */}
                      <div className="mt-auto space-y-1">
                        <h3 className="font-sans text-sm font-semibold tracking-wide text-stone-900 dark:text-zinc-100">
                          {proj.title}
                        </h3>
                        <p className="font-sans text-stone-400 dark:text-zinc-500 text-[11px] leading-tight line-clamp-2 pr-2">
                          {proj.description}
                        </p>
                      </div>
                      
                      {/* Active indicator bar */}
                      {isActive && (
                        <div className="absolute right-0 bottom-0 top-0 w-[3px] bg-red-600" />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Touch details or scrolling hint indicator */}
              <div className="pt-2 hidden lg:block">
                <p className="font-mono text-[9px] text-stone-400 dark:text-zinc-500 tracking-tight uppercase">
                  ▲ CURSOR HOVER ACTIVE // Click any card to inspect model structural specs
                </p>
              </div>
            </div>

            {/* RIGHT SPLIT: ACTIVE PROJECT SPECIFICATIONS */}
            <div className="flex flex-col justify-between pl-0 lg:pl-8 border-t lg:border-t-0 pt-6 lg:pt-0 border-stone-200/70 dark:border-zinc-800/60">
              
              {activeProject ? (
                <div className="space-y-6 text-left flex flex-col justify-between h-full">
                  <div className="space-y-5">
                    
                    {/* Project Cover Block */}
                    <div className="w-full h-44 overflow-hidden border border-stone-200/50 dark:border-zinc-800/40 relative">
                      <img 
                        src={activeProject.coverImage} 
                        alt={activeProject.title}
                        className="w-full h-full object-cover grayscale brightness-90 hover:grayscale-0 transition-all duration-700"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute bottom-3 left-3 bg-stone-900/90 text-stone-50 dark:bg-zinc-100 dark:text-zinc-950 px-3 py-1 font-mono text-[9px] tracking-widest uppercase">
                        SPEC: {activeProject.japaneseTitle}
                      </div>
                    </div>

                    <div className="flex md:items-center justify-between flex-col md:flex-row space-y-2 md:space-y-0 pb-3 border-b border-stone-200/70 dark:border-zinc-800/40">
                      <div>
                        <h3 className="font-sans font-regular text-2xl text-stone-900 dark:text-zinc-50">
                          {activeProject.title}
                        </h3>
                        <p className="font-sans text-xs text-stone-400 dark:text-zinc-500 font-light">
                          CURATED WORK / NO. 0{activeProject.order}
                        </p>
                      </div>
                      
                      {/* Structural labels */}
                      <span className="inline-block font-serif text-lg text-red-600 bg-red-500/10 px-3 py-0.5 rounded-sm select-none border border-red-500/20 max-w-fit">
                        {activeProject.japaneseTitle}
                      </span>
                    </div>

                    {/* Detailed Spec Description */}
                    <div className="space-y-3">
                      <h4 className="font-sans text-[11px] tracking-widest text-stone-400 dark:text-zinc-500 uppercase">
                        Architectural Overview
                      </h4>
                      <p className="font-sans text-stone-600 dark:text-zinc-300 text-xs leading-relaxed font-light">
                        {activeProject.longDescription}
                      </p>
                    </div>

                    {/* Meta specification categories */}
                    <div className="space-y-2">
                      <h4 className="font-sans text-[11px] tracking-widest text-stone-400 dark:text-zinc-500 uppercase">
                        Technology Frameworks
                      </h4>
                      <div className="flex flex-wrap gap-1.5">
                        {activeProject.tags.map((tag, idx) => (
                          <span 
                            key={idx}
                            className="font-mono text-[9px] bg-stone-150 text-stone-600 dark:bg-zinc-900 dark:text-zinc-400 px-2 py-1 border border-stone-200/70 dark:border-zinc-800/50"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>

                  </div>

                  {/* Actions Bar Footer */}
                  <div className="pt-6 border-t border-stone-200/70 dark:border-zinc-800/40 flex items-center justify-between">
                    <div className="flex space-x-2">
                      {activeProject.githubUrl && (
                        <a 
                          href={activeProject.githubUrl}
                          target="_blank"
                          rel="noreferrer"
                          onClick={() => playAmbientSound('click', soundEnabled)}
                          className="flex items-center space-x-1 border border-stone-300 dark:border-zinc-800 px-4 py-2 hover:bg-stone-900 hover:text-stone-100 dark:hover:bg-zinc-100 dark:hover:text-zinc-900 font-mono text-[10px] tracking-widest transition-all cursor-pointer"
                        >
                          <Github className="w-3.5 h-3.5" />
                          <span>SOURCE</span>
                        </a>
                      )}
                      
                      {activeProject.projectUrl && (
                        <a 
                          href={activeProject.projectUrl}
                          target="_blank"
                          rel="noreferrer"
                          onClick={() => playAmbientSound('click', soundEnabled)}
                          className="flex items-center space-x-1 bg-stone-950 text-stone-100 dark:bg-zinc-100 dark:text-zinc-900 px-4 py-2 hover:opacity-90 font-mono text-[10px] tracking-widest transition-all cursor-pointer"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>LAUNCH</span>
                        </a>
                      )}
                    </div>

                    <button
                      onClick={() => handleToggleFavorite(activeProject.id)}
                      className={`flex items-center space-x-1.5 px-3 py-2 border font-mono text-[9px] tracking-wider cursor-pointer transition-colors ${
                        userFavorites.includes(activeProject.id)
                          ? 'border-red-600 bg-red-600/10 text-red-600'
                          : 'border-stone-300 dark:border-zinc-800 hover:bg-stone-150 text-stone-500'
                      }`}
                    >
                      <Heart className="w-3 h-3 fill-current" />
                      <span>{userFavorites.includes(activeProject.id) ? 'FAVORITED' : 'SAVE TO DATABASE'}</span>
                    </button>
                  </div>

                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center space-y-2 opacity-55">
                  <Compass className="w-8 h-8 animate-spin-slow" />
                  <p className="font-mono text-xs">AWAITING OBJECT inspect instruction</p>
                </div>
              )}

            </div>
          </>
        )}

        {/* TAB 2: ABOUT / PROFILE VIEWS */}
        {activeTab === 'about' && (
          <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-12 gap-8 items-stretch max-w-5xl mx-auto w-full">
            
            {/* Left bio */}
            <div className="md:col-span-7 space-y-6 text-left pr-0 md:pr-4 flex flex-col justify-between">
              <div className="space-y-5">
                <span className="font-mono text-[10px] text-red-600 dark:text-red-400 tracking-widest uppercase">
                  STUDIO ARCHITECTURE // USER IDENT
                </span>
                
                {user ? (
                  <div className="flex items-center space-x-4 bg-stone-100 dark:bg-zinc-900 p-4 border border-stone-250 dark:border-zinc-800/50">
                    {user.photoURL ? (
                      <img 
                        src={user.photoURL} 
                        alt={user.displayName || "Avatar"} 
                        className="w-12 h-12 rounded-none border border-stone-400 dark:border-zinc-650"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-12 h-12 bg-stone-900 text-stone-100 dark:bg-zinc-100 dark:text-zinc-950 flex items-center justify-center font-bold">
                        {user.displayName?.charAt(0) || <User className="w-6 h-6" />}
                      </div>
                    )}
                    <div>
                      <h4 className="font-sans font-medium text-sm">{user.displayName || 'Anonymous Guest'}</h4>
                      <p className="font-mono text-[10px] text-stone-400 dark:text-zinc-500 leading-none pt-1">{user.email}</p>
                    </div>
                  </div>
                ) : null}

                <div className="space-y-3 pt-2">
                  <h3 className="font-sans font-light text-2xl tracking-tight text-stone-900 dark:text-zinc-100">
                    A design framework rooted in <br />
                    <span className="font-serif italic font-medium">calm intentionality.</span>
                  </h3>
                  <p className="font-sans text-stone-500 dark:text-zinc-400 text-xs leading-relaxed font-light">
                    Shiro Studio represents creative software building with absolute restraint. By employing spacious margins, deep color tones, tactile sound triggers, and optimized high-speed GPU rendering, we deliver web platforms that feel like premium physical print or architecture.
                  </p>
                  <p className="font-sans text-stone-500 dark:text-zinc-400 text-xs leading-relaxed font-light">
                    This shell remains ready to be customized. Built around Firestore schema templates, you can instantly link databases to maintain project records, user notes, and favoritings without refactoring.
                  </p>
                </div>
              </div>

              {/* Secure claims indicator */}
              <div className="pt-8 border-t border-stone-200/50 dark:border-zinc-800/40 font-mono text-[9px] text-stone-400 dark:text-zinc-400 leading-relaxed grid grid-cols-2 gap-4">
                <div>
                  <p className="font-bold">SECURITY ENFORCER</p>
                  <p>Verified Token Claims: TRUE</p>
                  <p>Auth State: RESOLVED</p>
                </div>
                <div>
                  <p className="font-bold">SYSTEM STAT</p>
                  <p>Core Latency: <span className="text-emerald-500">14ms</span></p>
                  <p>FPS: <span className="text-emerald-500">60</span> / GPU Accel</p>
                </div>
              </div>
            </div>

            {/* Right Profile Actions / Logout */}
            <div className="md:col-span-5 flex flex-col justify-between border-t md:border-t-0 md:border-l border-stone-200/50 dark:border-zinc-800/40 pt-6 md:pt-0 pl-0 md:pl-8">
              <div className="space-y-4 text-left">
                <span className="font-mono text-[10px] text-stone-400 dark:text-zinc-500 tracking-widest uppercase">
                  PORTAL ACTIONS
                </span>
                <p className="font-sans text-stone-400 dark:text-zinc-500 text-xs font-light">
                  Terminate your verification credentials to lock the portfolio layout. Your settings (theme, sound) remain persistent on subsequent access.
                </p>

                <div className="space-y-2 pt-2">
                  <button
                    onClick={handleLogout}
                    id="sign-out-btn"
                    className="w-full flex items-center justify-center space-x-3 bg-red-600 text-white hover:bg-red-700 px-5 py-3.5 rounded-none font-mono text-xs tracking-widest uppercase transition-colors shadow-sm outline-none cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>TERMINATE LOGOUT</span>
                  </button>
                </div>
              </div>

              {/* Japanese Calligraphic Graphic Seal */}
              <div className="pt-12 text-center md:text-right">
                <div className="inline-block border border-stone-300 dark:border-zinc-800 p-4 text-left">
                  <p className="font-serif text-lg leading-tight font-normal text-stone-400 dark:text-zinc-650">
                    一古美寂
                  </p>
                  <p className="font-mono text-[8px] text-stone-400 dark:text-zinc-500 mt-1">
                    WABI-SABI ACCENT // BEAUTY IN TIMEFALL
                  </p>
                </div>
              </div>

            </div>

          </div>
        )}

      </main>

      {/* FOOTER GENERAL INFO */}
      <footer className="z-10 flex flex-col sm:flex-row justify-between items-center border-t border-stone-200/50 dark:border-zinc-800/40 pt-4 mt-6">
        <p className="font-mono text-[9px] text-stone-400 dark:text-zinc-500">
          DESIGNED WITH MAXIMUM COMPASSION ON GOOGLE PLATFORM // ARCH: SECURE
        </p>
        <p className="font-mono text-[9px] text-stone-500 dark:text-zinc-400 mt-1 sm:mt-0 uppercase">
          Signed in as: <span className="font-semibold text-stone-700 dark:text-zinc-200">{user?.displayName || 'PORTAL GUEST'}</span>
        </p>
      </footer>

    </div>
  );
}
