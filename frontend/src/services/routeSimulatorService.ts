/**
 * RouteSimulatorService
 *
 * Frontend service that manages client-side interpolation for smooth
 * animated vehicle markers between coordinate updates received from
 * the backend demo simulation. This does NOT generate coordinates — it
 * only smooths the movement between server-pushed positions.
 *
 * Usage:
 *   const tracker = new RouteSimulatorService();
 *   tracker.onPositionUpdate((vehicleId, lat, lng) => { ... });
 *   tracker.pushPosition(vehicleId, lat, lng);
 *   tracker.destroy();
 */

export interface InterpolatedPosition {
  vehicleId: string;
  latitude: number;
  longitude: number;
  heading: number; // degrees from north
  timestamp: number;
}

type PositionCallback = (position: InterpolatedPosition) => void;

interface VehicleTrack {
  vehicleId: string;
  positions: { lat: number; lng: number; time: number }[];
  currentLat: number;
  currentLng: number;
  targetLat: number;
  targetLng: number;
  heading: number;
  animationFrame: number | null;
  startTime: number;
  duration: number; // ms to interpolate over
}

export class RouteSimulatorService {
  private tracks = new Map<string, VehicleTrack>();
  private listeners: PositionCallback[] = [];
  private destroyed = false;

  /**
   * Register a callback for smooth position updates.
   */
  onPositionUpdate(cb: PositionCallback): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  /**
   * Push a new target position from the backend.
   * This triggers smooth interpolation from the current position.
   */
  pushPosition(vehicleId: string, lat: number, lng: number): void {
    if (this.destroyed) return;

    let track = this.tracks.get(vehicleId);

    if (!track) {
      track = {
        vehicleId,
        positions: [],
        currentLat: lat,
        currentLng: lng,
        targetLat: lat,
        targetLng: lng,
        heading: 0,
        animationFrame: null,
        startTime: performance.now(),
        duration: 1400, // slightly less than server interval for smooth blending
      };
      this.tracks.set(vehicleId, track);
      this.emit(track);
      return;
    }

    // Update heading based on movement direction
    const dLng = lng - track.targetLng;
    const dLat = lat - track.targetLat;
    if (Math.abs(dLng) > 0.00001 || Math.abs(dLat) > 0.00001) {
      track.heading = (Math.atan2(dLng, dLat) * 180) / Math.PI;
    }

    // Start new interpolation from current visual position
    track.currentLat = this.getInterpolatedLat(track);
    track.currentLng = this.getInterpolatedLng(track);
    track.targetLat = lat;
    track.targetLng = lng;
    track.startTime = performance.now();
    track.positions.push({ lat, lng, time: Date.now() });

    // Keep last 10 positions for potential replays
    if (track.positions.length > 10) {
      track.positions = track.positions.slice(-10);
    }

    // Start animation loop if not already running
    if (!track.animationFrame) {
      this.animateTrack(track);
    }
  }

  /**
   * Remove tracking for a vehicle.
   */
  removeVehicle(vehicleId: string): void {
    const track = this.tracks.get(vehicleId);
    if (track?.animationFrame) {
      cancelAnimationFrame(track.animationFrame);
    }
    this.tracks.delete(vehicleId);
  }

  /**
   * Stop all animations and clean up.
   */
  destroy(): void {
    this.destroyed = true;
    for (const [, track] of this.tracks) {
      if (track.animationFrame) {
        cancelAnimationFrame(track.animationFrame);
      }
    }
    this.tracks.clear();
    this.listeners = [];
  }

  /**
   * Get current interpolated position for a vehicle.
   */
  getPosition(vehicleId: string): InterpolatedPosition | null {
    const track = this.tracks.get(vehicleId);
    if (!track) return null;
    return {
      vehicleId,
      latitude: this.getInterpolatedLat(track),
      longitude: this.getInterpolatedLng(track),
      heading: track.heading,
      timestamp: Date.now(),
    };
  }

  /**
   * Get all tracked vehicle IDs.
   */
  getTrackedVehicles(): string[] {
    return Array.from(this.tracks.keys());
  }

  // ── private ──

  private getProgress(track: VehicleTrack): number {
    const elapsed = performance.now() - track.startTime;
    return Math.min(1, elapsed / track.duration);
  }

  private easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  private getInterpolatedLat(track: VehicleTrack): number {
    const p = this.easeInOutCubic(this.getProgress(track));
    return track.currentLat + (track.targetLat - track.currentLat) * p;
  }

  private getInterpolatedLng(track: VehicleTrack): number {
    const p = this.easeInOutCubic(this.getProgress(track));
    return track.currentLng + (track.targetLng - track.currentLng) * p;
  }

  private animateTrack(track: VehicleTrack): void {
    if (this.destroyed) return;

    const progress = this.getProgress(track);
    this.emit(track);

    if (progress < 1) {
      track.animationFrame = requestAnimationFrame(() => this.animateTrack(track));
    } else {
      track.animationFrame = null;
      // Snap to target
      track.currentLat = track.targetLat;
      track.currentLng = track.targetLng;
    }
  }

  private emit(track: VehicleTrack): void {
    const pos: InterpolatedPosition = {
      vehicleId: track.vehicleId,
      latitude: this.getInterpolatedLat(track),
      longitude: this.getInterpolatedLng(track),
      heading: track.heading,
      timestamp: Date.now(),
    };
    for (const cb of this.listeners) {
      try {
        cb(pos);
      } catch (e) {
        console.warn('[RouteSimulatorService] Listener error:', e);
      }
    }
  }
}

// Singleton instance for app-wide use
let _instance: RouteSimulatorService | null = null;

export function getRouteSimulator(): RouteSimulatorService {
  if (!_instance) {
    _instance = new RouteSimulatorService();
  }
  return _instance;
}

export function destroyRouteSimulator(): void {
  if (_instance) {
    _instance.destroy();
    _instance = null;
  }
}
