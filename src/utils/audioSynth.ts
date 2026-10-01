/**
 * Web Audio API synthesizer for crystal-clear harmonic chimes
 * and SpeechSynthesis helper for native multilingual pronunciation.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

// Pentatonic frequencies in Hz (C major / A minor pentatonic)
const PENTATONIC_SCALE = [
  261.63, // C4
  293.66, // D4
  329.63, // E4
  392.00, // G4
  440.00, // A4
  523.25, // C5
  587.33, // D5
  659.25, // E5
  783.99, // G5
  880.00, // A5
];

export function playChime(freqIndex = 4, duration = 0.8): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const freq = PENTATONIC_SCALE[freqIndex % PENTATONIC_SCALE.length] || 440;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    // Soft warm bell overtone
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);

    // Exponential decay envelope
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.25, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + duration);
  } catch (err) {
    console.debug('Audio chime playback omitted:', err);
  }
}

export function playCelebrationArpeggio(): void {
  const notes = [0, 2, 4, 5, 7, 9];
  notes.forEach((noteIdx, i) => {
    setTimeout(() => {
      playChime(noteIdx, 0.9);
    }, i * 110);
  });
}

export function speakGreeting(text: string, langCode = 'en-US'): void {
  try {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      playChime(4, 0.6);
      return;
    }

    window.speechSynthesis.cancel();

    // Clean text of binary or morse codes that can't be spoken
    if (text.startsWith('0100') || text.startsWith('....')) {
      playCelebrationArpeggio();
      return;
    }

    const cleanText = text.replace(/[!¡,]/g, '');
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = langCode;
    utterance.rate = 0.92;
    utterance.pitch = 1.05;

    // Pick an appropriate voice if available
    const voices = window.speechSynthesis.getVoices();
    const matchingVoice = voices.find(v => v.lang.startsWith(langCode.split('-')[0]));
    if (matchingVoice) {
      utterance.voice = matchingVoice;
    }

    window.speechSynthesis.speak(utterance);
    playChime(2, 0.4);
  } catch (err) {
    console.debug('Speech synthesis unavailable, falling back to chime:', err);
    playChime(4, 0.6);
  }
}
