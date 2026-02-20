/**
 * NotificationSoundManager
 * Handles browser audio playback for emergency notifications.
 * Uses Web Audio API with fallback to HTMLAudioElement.
 */

type SoundType = 'default' | 'urgent' | 'police' | 'fire' | 'success';

class NotificationSoundManager {
  private audioContext: AudioContext | null = null;
  private enabled = true;
  private volume = 0.7;

  private getContext(): AudioContext {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
    return this.audioContext;
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Play a synthesized notification sound.
   * Uses oscillators to generate tones — no external audio files needed.
   */
  async play(type: SoundType = 'default') {
    if (!this.enabled) return;

    try {
      const ctx = this.getContext();

      switch (type) {
        case 'police':
          await this.playPoliceAlert(ctx);
          break;
        case 'urgent':
          await this.playUrgentBeep(ctx);
          break;
        case 'fire':
          await this.playFireAlarm(ctx);
          break;
        case 'success':
          await this.playSuccessChime(ctx);
          break;
        default:
          await this.playDefaultBeep(ctx);
          break;
      }
    } catch (err) {
      console.warn('[Sound] Failed to play notification sound:', err);
    }
  }

  private async playDefaultBeep(ctx: AudioContext) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.value = this.volume * 0.3;

    const now = ctx.currentTime;
    gain.gain.setValueAtTime(this.volume * 0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    osc.start(now);
    osc.stop(now + 0.3);
  }

  private async playUrgentBeep(ctx: AudioContext) {
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = 'square';
      osc.frequency.value = 1000;
      gain.gain.value = this.volume * 0.25;

      const start = ctx.currentTime + i * 0.2;
      gain.gain.setValueAtTime(this.volume * 0.25, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.12);

      osc.start(start);
      osc.stop(start + 0.12);
    }
  }

  private async playPoliceAlert(ctx: AudioContext) {
    // Two-tone siren — louder and longer
    const duration = 1.2;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sawtooth';
    gain.gain.value = this.volume * 0.4;

    const now = ctx.currentTime;
    // Alternate between high and low frequencies
    for (let t = 0; t < duration; t += 0.3) {
      osc.frequency.setValueAtTime(800, now + t);
      osc.frequency.setValueAtTime(600, now + t + 0.15);
    }

    gain.gain.setValueAtTime(this.volume * 0.4, now);
    gain.gain.setValueAtTime(this.volume * 0.4, now + duration - 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.start(now);
    osc.stop(now + duration);
  }

  private async playFireAlarm(ctx: AudioContext) {
    // Rapid pulsing alarm
    for (let i = 0; i < 4; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = 'sawtooth';
      osc.frequency.value = 1200;
      gain.gain.value = this.volume * 0.3;

      const start = ctx.currentTime + i * 0.15;
      gain.gain.setValueAtTime(this.volume * 0.3, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.08);

      osc.start(start);
      osc.stop(start + 0.08);
    }
  }

  private async playSuccessChime(ctx: AudioContext) {
    const notes = [523, 659, 784]; // C5, E5, G5
    for (let i = 0; i < notes.length; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = 'sine';
      osc.frequency.value = notes[i];
      gain.gain.value = this.volume * 0.25;

      const start = ctx.currentTime + i * 0.15;
      gain.gain.setValueAtTime(this.volume * 0.25, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.3);

      osc.start(start);
      osc.stop(start + 0.3);
    }
  }

  dispose() {
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
    }
    this.audioContext = null;
  }
}

// Singleton instance
export const soundManager = new NotificationSoundManager();
export default soundManager;
