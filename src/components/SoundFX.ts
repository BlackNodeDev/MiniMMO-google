/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Procedural audio engine utilizing Web Audio API for a sleek Japanese Zen feel.
let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    // Standard AudioContext initialization
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  // Resume context if suspended (browser security autoplays)
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

export function playAmbientSound(type: 'click' | 'bell' | 'toggle' | 'hover', enabled: boolean = true) {
  if (!enabled) return;
  
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  switch (type) {
    case 'click': {
      // Procedural mineral stone/wood click
      // Layer a quick snap with a high-resonance bandpass filter
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(80, now + 0.08);

      filter.type = 'bandpass';
      filter.Q.setValueAtTime(12, now);
      filter.frequency.setValueAtTime(600, now);

      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.12);
      break;
    }

    case 'bell': {
      // Zen temple bell: fundamental + harmonic overtones with exponential decay
      const frequencies = [110, 165, 220, 275, 330, 440];
      const gains = [0.08, 0.04, 0.03, 0.02, 0.015, 0.01];
      const decay = 2.4;

      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0.8, now);
      masterGain.gain.exponentialRampToValueAtTime(0.001, now + decay);
      masterGain.connect(ctx.destination);

      frequencies.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const oscGain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);
        
        // Add a clean, organic detune vibration
        osc.detune.setValueAtTime((Math.random() - 0.5) * 6, now);

        oscGain.gain.setValueAtTime(gains[idx] || 0.01, now);
        // Slightly quicker decay for higher overtones
        oscGain.gain.exponentialRampToValueAtTime(0.00001, now + (decay * (1 - idx * 0.12)));

        osc.connect(oscGain);
        oscGain.connect(masterGain);

        osc.start(now);
        osc.stop(now + decay);
      });
      break;
    }

    case 'toggle': {
      // Subtle sweep representing a slider or screen transition
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(240, now + 0.18);

      gain.gain.setValueAtTime(0.03, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.22);
      break;
    }

    case 'hover': {
      // Ultra-subtle, airy click for tactile hover feedback
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200, now);

      filter.type = 'highpass';
      filter.frequency.setValueAtTime(1000, now);

      gain.gain.setValueAtTime(0.006, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.04);
      break;
    }
  }
}
