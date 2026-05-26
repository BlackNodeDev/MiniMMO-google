/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { motion } from 'motion/react';
import { LogIn, Compass, FileText, Settings, Heart } from 'lucide-react';
import { auth, googleProvider } from '../firebase';
import { signInWithPopup } from 'firebase/auth';
import { playAmbientSound } from './SoundFX';

interface LandingViewProps {
  onAuthSuccess: () => void;
  soundEnabled: boolean;
}

export default function LandingView({ onAuthSuccess, soundEnabled }: LandingViewProps) {
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    setIsAuthenticating(true);
    setAuthError(null);
    playAmbientSound('click', soundEnabled);

    try {
      const result = await signInWithPopup(auth, googleProvider);
      if (result.user) {
        // Play peaceful Zen bell to mark successful access entry
        playAmbientSound('bell', soundEnabled);
        onAuthSuccess();
      }
    } catch (err: any) {
      console.error('Google Auth Error: ', err);
      // Give standard clear user message
      setAuthError(err.message || 'Authentication could not be completed. Please try again.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  return (
    <div className="relative min-h-screen flex flex-col justify-between p-6 md:p-12 overflow-hidden select-none bg-stone-50 text-stone-900 dark:bg-zinc-950 dark:text-zinc-100 transition-colors duration-1000">
      
      {/* Hairline Grid Accent Lines (Japanese shoji lattice-work inspiration) */}
      <div className="absolute inset-x-0 top-1/4 h-[1px] bg-stone-200/50 dark:bg-zinc-800/40 pointer-events-none" />
      <div className="absolute inset-x-0 bottom-1/4 h-[1px] bg-stone-200/50 dark:bg-zinc-800/40 pointer-events-none" />
      <div className="absolute left-1/4 inset-y-0 w-[1px] bg-stone-200/50 dark:bg-zinc-800/40 pointer-events-none hidden md:block" />
      <div className="absolute right-1/4 inset-y-0 w-[1px] bg-stone-200/50 dark:bg-zinc-800/40 pointer-events-none hidden md:block" />

      {/* Header Panel */}
      <header className="z-10 flex justify-between items-start">
        <div className="flex items-center space-x-3">
          {/* Hanko Stamp - Traditional Japanese vermillion red seal */}
          <div className="w-8 h-8 bg-red-600 flex items-center justify-center font-serif text-white text-xs font-bold shadow-sm">
            白
          </div>
          <div>
            <h1 className="font-sans font-semibold tracking-widest text-xs uppercase text-stone-500 dark:text-zinc-400">
              SHIROSTUDIO
            </h1>
            <p className="font-mono text-[9px] text-stone-400 dark:text-zinc-500 tracking-tight">
              PORTFOLIO SHELL // v1.0.0
            </p>
          </div>
        </div>
        <div className="text-right hidden sm:block">
          <p className="font-mono text-xs text-stone-400 dark:text-zinc-500">
            LOC // ASIA-EAST [1]
          </p>
          <p className="font-mono text-[10px] text-stone-500 dark:text-zinc-400 tracking-widest">
            2026.05
          </p>
        </div>
      </header>

      {/* Main Structural Hero Layout */}
      <main className="z-10 my-auto grid grid-cols-1 md:grid-cols-12 gap-8 items-center py-12">
        
        {/* Left column decorative Zen concepts */}
        <div className="md:col-span-3 hidden md:flex flex-col space-y-8 pl-4">
          <div className="flex items-start space-x-2">
            <span className="font-serif text-3xl text-stone-300 dark:text-zinc-800 font-normal leading-none">
              静
            </span>
            <div className="pt-1">
              <h3 className="font-sans font-medium text-[10px] tracking-widest uppercase text-stone-500 dark:text-zinc-400">
                SEI — STILLNESS
              </h3>
              <p className="font-mono text-[9px] text-stone-400 dark:text-zinc-500 max-w-[120px] leading-normal pt-1">
                A design centered in calm, omitting the unnecessary.
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-2">
            <span className="font-serif text-3xl text-stone-300 dark:text-zinc-800 font-normal leading-none">
              間
            </span>
            <div className="pt-1">
              <h3 className="font-sans font-medium text-[10px] tracking-widest uppercase text-stone-500 dark:text-zinc-400">
                MA — THE GAP
              </h3>
              <p className="font-mono text-[9px] text-stone-400 dark:text-zinc-500 max-w-[120px] leading-normal pt-1">
                Mindful negative space that invites breath.
              </p>
            </div>
          </div>
        </div>

        {/* Core Introductory Column */}
        <div className="md:col-span-6 flex flex-col justify-center text-left space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className="space-y-4"
          >
            <span className="inline-block font-mono text-[10px] bg-stone-200/50 text-stone-600 dark:bg-zinc-800/40 dark:text-zinc-400 px-3 py-1 rounded-full tracking-widest uppercase">
              IMMERSIVE BACKGROUND CORE
            </span>
            <h2 className="font-sans font-light tracking-tight text-4xl sm:text-5xl md:text-6xl text-stone-900 dark:text-zinc-50 leading-tight">
              Minimalist Creative <br />
              <span className="font-normal text-stone-800 dark:text-zinc-200">
                Design Portfolio
              </span>
            </h2>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 1 }}
            className="font-sans text-stone-500 dark:text-zinc-400 text-sm max-w-lg leading-relaxed font-light"
          >
            A high-fidelity framework utilizing an interactive 3D procedural orb built in Three.js. Clean, airy typography meets a Zero-Trust Firebase Firestore architecture.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.8 }}
            className="pt-4 flex flex-col sm:flex-row items-stretch sm:items-center space-y-4 sm:space-y-0 sm:space-x-4 max-w-sm"
          >
            <button
              onClick={handleGoogleLogin}
              disabled={isAuthenticating}
              id="google-authenticate-btn"
              className="flex items-center justify-center space-x-3 bg-stone-900 hover:bg-stone-800 text-stone-50 dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-950 px-6 py-4 rounded-none font-mono text-xs tracking-widest uppercase border border-stone-800 dark:border-zinc-200 transition-all duration-300 disabled:opacity-50 group hover:shadow-lg active:scale-95 cursor-pointer"
            >
              {isAuthenticating ? (
                <>
                  <div className="w-4 h-4 border-2 border-stone-50 dark:border-zinc-950 border-t-transparent rounded-full animate-spin" />
                  <span>NEGOTIATING AUTH...</span>
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  <span>AUTHENTICATE PORTAL</span>
                </>
              )}
            </button>
          </motion.div>

          {authError && (
            <p className="font-mono text-xs text-red-500 dark:text-red-400 mt-2">
              ERR // {authError}
            </p>
          )}
        </div>

        {/* Right column system stats */}
        <div className="md:col-span-3 hidden md:flex flex-col space-y-6 pt-12 items-end pr-4 text-right">
          <div className="space-y-1">
            <p className="font-mono text-[9px] text-stone-400 dark:text-zinc-500 uppercase">
              RENDER SYSTEM
            </p>
            <p className="font-sans font-semibold text-xs tracking-widest text-stone-700 dark:text-zinc-300">
              VANILLA THREE.JS
            </p>
          </div>
          <div className="space-y-1">
            <p className="font-mono text-[9px] text-stone-400 dark:text-zinc-500 uppercase">
              GPU HARDENING
            </p>
            <p className="font-sans font-semibold text-xs tracking-widest text-stone-700 dark:text-zinc-300">
              GLSL NOISE COMPILER
            </p>
          </div>
          <div className="space-y-1">
            <p className="font-mono text-[9px] text-stone-400 dark:text-zinc-500 uppercase">
              AUTHENTICATOR
            </p>
            <p className="font-sans font-semibold text-xs tracking-widest text-stone-700 dark:text-zinc-300">
              FIREBASE AUTH v2
            </p>
          </div>
        </div>

      </main>

      {/* Footer System Details */}
      <footer className="z-10 flex flex-col sm:flex-row justify-between items-center border-t border-stone-200/50 dark:border-zinc-800/40 pt-6 mt-8">
        <div className="flex items-center space-x-6 text-[11px] font-mono text-stone-400 dark:text-zinc-500">
          <span className="flex items-center">
            <Compass className="w-3.5 h-3.5 mr-1 text-stone-500" /> WABI-SABI SYSTEM
          </span>
          <span className="flex items-center">
            <FileText className="w-3.5 h-3.5 mr-1 text-stone-500" /> SECURE FIRESTORE ACTIVE
          </span>
        </div>
        <p className="font-mono text-[10px] text-stone-400 dark:text-zinc-500 mt-2 sm:mt-0">
          DESIGN SHIPPED VIA GOOGLE AI STUDIO © 2026.
        </p>
      </footer>
    </div>
  );
}
