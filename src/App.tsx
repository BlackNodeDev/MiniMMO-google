/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from './firebase';
import { ThemeType } from './types';
import LandingView from './components/LandingView';
import PortfolioView from './components/PortfolioView';
import ThreeBackground from './components/ThreeBackground';
import { Compass } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Custom user aesthetic settings
  const [theme, setTheme] = useState<ThemeType>('light');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [bgComplexity, setBgComplexity] = useState<'low' | 'regular' | 'high'>('regular');

  useEffect(() => {
    // Listen for authentication changes asynchronously
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Sync theme class to core HTML element to ensure Tailwind picks it up when classes toggle
  useEffect(() => {
    const root = window.document.documentElement;
    
    // Clear previous theme settings
    root.classList.remove('dark', 'theme-sepia', 'theme-wabisabi');

    if (theme === 'dark') {
      root.classList.add('dark');
    } else if (theme === 'sepia') {
      root.classList.add('theme-sepia');
    } else if (theme === 'wabi-sabi') {
      root.classList.add('theme-wabisabi');
    }
  }, [theme]);

  // Design mapping to enforce solid colors corresponding to selected themes
  const themeClasses = {
    light: 'bg-stone-50 text-stone-900 selection:bg-stone-200 selection:text-stone-900',
    dark: 'bg-zinc-950 text-zinc-100 selection:bg-zinc-800 selection:text-zinc-100 dark',
    sepia: 'bg-[#faf6e9] text-[#3e2c1c] selection:bg-[#e8dfc7] selection:text-[#3e2c1c]',
    'wabi-sabi': 'bg-[#f4f5f2] text-[#2c322b] selection:bg-[#dadcd6] selection:text-[#2c322b]',
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-zinc-950 text-stone-600 dark:text-zinc-400 flex flex-col items-center justify-center space-y-3 font-mono text-xs select-none">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
        >
          <Compass className="w-6 h-6 text-red-650" />
        </motion.div>
        <span className="tracking-widest uppercase">INITIALIZING SHIRO CONTEXT // 起動</span>
      </div>
    );
  }

  return (
    <div className={`relative min-h-screen w-full transition-colors duration-1000 overflow-x-hidden ${themeClasses[theme]}`}>
      
      {/* 1. Global Interactive 3D Background */}
      <ThreeBackground complexity={bgComplexity} theme={theme} />

      {/* 2. Structured App screens */}
      <AnimatePresence mode="wait">
        {!user ? (
          <motion.div
            key="landing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
            className="w-full h-full relative z-10"
          >
            <LandingView 
              onAuthSuccess={() => {}} 
              soundEnabled={soundEnabled} 
            />
          </motion.div>
        ) : (
          <motion.div
            key="dashboard"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
            className="w-full h-full relative z-10"
          >
            <PortfolioView
              onSignOut={() => {}}
              currentTheme={theme}
              onChangeTheme={setTheme}
              soundEnabled={soundEnabled}
              onToggleSound={setSoundEnabled}
              bgComplexity={bgComplexity}
              onChangeBgComplexity={setBgComplexity}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
