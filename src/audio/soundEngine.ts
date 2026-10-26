// Zero-asset procedural Web Audio API synthesizer for B'n'D (Bind and Divide)

class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted: boolean = false;
  private volume: number = 0.45;

  constructor() {
    if (typeof window !== 'undefined') {
      const savedMute = window.localStorage.getItem('bnd_muted');
      if (savedMute === 'true') this.muted = true;
    }
  }

  private getContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(mute: boolean): void {
    this.muted = mute;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('bnd_muted', String(mute));
    }
  }

  public toggleMute(): boolean {
    this.setMuted(!this.muted);
    if (!this.muted) {
      this.playHover();
    }
    return this.muted;
  }

  private playTone(
    freq: number,
    duration: number,
    type: OscillatorType = 'triangle',
    gainLevel = 0.25,
    delay = 0,
    endFreq?: number
  ): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (endFreq !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
    }

    const peak = gainLevel * this.volume;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(peak, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  private playNoiseBurst(duration: number, filterFreq: number, gainLevel = 0.2, delay = 0): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime + delay;
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.35));
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(filterFreq, now);
    filter.Q.setValueAtTime(1.8, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainLevel * this.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    source.start(now);
  }

  public playHover(): void {
    this.playTone(520, 0.045, 'sine', 0.08, 0, 640);
  }

  public playSelectCard(): void {
    this.playNoiseBurst(0.08, 1800, 0.22);
    this.playTone(440, 0.09, 'triangle', 0.16, 0.01, 587.33);
  }

  public playPlaceCard(): void {
    // Warm wooden tabletop thump + crisp claim note
    this.playTone(135, 0.14, 'sine', 0.42, 0, 58);
    this.playNoiseBurst(0.07, 900, 0.25);
    this.playTone(392.0, 0.16, 'triangle', 0.2, 0.02, 523.25);
  }

  public playNeutralize(count = 1): void {
    const steps = Math.min(4, Math.max(1, count));
    for (let i = 0; i < steps; i++) {
      const d = i * 0.055;
      this.playNoiseBurst(0.14, 2400 - i * 220, 0.28, d);
      this.playTone(680 - i * 60, 0.16, 'sawtooth', 0.14, d, 210);
    }
  }

  public playFlank(count: number): void {
    const scale = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51];
    const flips = Math.min(scale.length, Math.max(1, count));
    for (let i = 0; i < flips; i++) {
      const freq = scale[i];
      this.playTone(freq, 0.22, 'triangle', 0.26, 0.08 + i * 0.065);
      this.playTone(freq * 1.5, 0.18, 'sine', 0.11, 0.09 + i * 0.065);
    }
  }

  public playShieldBreak(): void {
    this.playTone(1180, 0.18, 'square', 0.14, 0, 420);
    this.playTone(880, 0.22, 'triangle', 0.2, 0.03, 310);
  }

  public playCharacterAura(): void {
    const notes = [329.63, 440.0, 554.37, 659.25, 880.0];
    notes.forEach((f, idx) => {
      this.playTone(f, 0.42, 'sine', 0.18, idx * 0.055);
    });
  }

  public playCoinToss(): void {
    this.playTone(1318.5, 0.35, 'sine', 0.22, 0);
    this.playTone(1975.5, 0.45, 'sine', 0.18, 0.04);
  }

  public playRouletteTick(): void {
    this.playTone(760, 0.04, 'triangle', 0.16, 0, 480);
  }

  public playVictory(): void {
    const fanfare = [
      { f: 523.25, d: 0.13, t: 0.0 },
      { f: 659.25, d: 0.13, t: 0.12 },
      { f: 783.99, d: 0.13, t: 0.24 },
      { f: 1046.5, d: 0.55, t: 0.38 },
    ];
    for (const n of fanfare) {
      this.playTone(n.f, n.d, 'triangle', 0.3, n.t);
      this.playTone(n.f * 0.5, n.d, 'sine', 0.2, n.t);
    }
  }

  public playDefeat(): void {
    const notes = [
      { f: 392.0, d: 0.22, t: 0.0 },
      { f: 369.99, d: 0.22, t: 0.2 },
      { f: 329.63, d: 0.24, t: 0.4 },
      { f: 293.66, d: 0.55, t: 0.62 },
    ];
    for (const n of notes) {
      this.playTone(n.f, n.d, 'triangle', 0.24, n.t);
    }
  }

  public playDraw(): void {
    this.playTone(440, 0.24, 'triangle', 0.22, 0);
    this.playTone(493.88, 0.38, 'triangle', 0.22, 0.2);
  }
}

export const soundEngine = new SoundEngine();
