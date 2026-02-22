import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getSocket } from '@/services/socket';
import { demoApi, predictiveApi } from '@/services/api';

export interface StandbyNotification {
  suggestionId: string;
  vehicleId: string;
  vehicleType: string;
  vehicleNo: string;
  currentLat: number;
  currentLng: number;
  suggestedLat: number;
  suggestedLng: number;
  distanceKm: number;
  responseTimeImprove: number;
  expiresAt: string;
  riskZone?: { gridKey: string; riskScore: number; centerLat: number; centerLng: number } | null;
  timestamp: string;
  /** local UI state */
  accepting?: boolean;
  dismissing?: boolean;
  resolved?: 'accepted' | 'dismissed' | 'expired';
}

export interface SimulationInfo {
  dispatchId: string;
  dispatchType: string;
  vehicleId: string;
  vehicleType: string;
  vehicleNo: string;
  phase: string;
  progress: number;
  etaSeconds: number;
  startTimestamp: number;
}

export interface SimulationProgress {
  dispatchId: string;
  vehicleId: string;
  vehicleNo: string;
  phase: string;
  progress: number;
  etaSeconds: number;
  latitude: number;
  longitude: number;
  timestamp: string;
}

interface DemoState {
  /** Whether demo mode is enabled (persisted) */
  enabled: boolean;
  /** Active simulations from backend */
  simulations: SimulationInfo[];
  /** Loading state */
  loading: boolean;
  /** Error message */
  error: string | null;
  /** Progress updates keyed by dispatchId */
  progressMap: Record<string, SimulationProgress>;
  /** Green corridor route coords from simulation [lat, lng][] */
  corridorRouteCoords: [number, number][];
  /** Whether green corridor overlay is visible */
  corridorOverlayVisible: boolean;
  /** Corridor banner message */
  corridorMessage: string | null;
  /** Real-time standby notifications from predictive service */
  standbyNotifications: StandbyNotification[];

  // Actions
  toggleDemoMode: (enabled: boolean) => Promise<void>;
  fetchStatus: () => Promise<void>;
  startSimulation: (dispatchId: string, intervalMs?: number) => Promise<void>;
  startAllSimulations: (intervalMs?: number) => Promise<void>;
  stopSimulation: (dispatchId: string) => Promise<void>;
  stopAllSimulations: () => Promise<void>;
  overrideStatus: (dispatchId: string, status: string) => Promise<void>;
  acceptStandby: (suggestionId: string) => Promise<void>;
  dismissStandby: (suggestionId: string) => Promise<void>;
  clearResolvedNotifications: () => void;
  initDemoSocket: () => void;
}

let demoSocketInitialized = false;

export const useDemoStore = create<DemoState>()(
  persist(
    (set, get) => ({
      enabled: false,
      simulations: [],
      loading: false,
      error: null,
      progressMap: {},
      corridorRouteCoords: [],
      corridorOverlayVisible: false,
      corridorMessage: null,
      standbyNotifications: [],

      toggleDemoMode: async (enabled) => {
        set({ loading: true, error: null });
        try {
          const result = await demoApi.toggle(enabled);
          set({
            enabled: result.enabled,
            loading: false,
            // Clear simulations when disabling
            ...(enabled ? {} : { simulations: [], progressMap: {}, corridorRouteCoords: [], corridorOverlayVisible: false, corridorMessage: null }),
          });
        } catch (err: any) {
          set({ loading: false, error: err?.response?.data?.message || err?.message || 'Failed to toggle demo mode' });
        }
      },

      fetchStatus: async () => {
        try {
          const result = await demoApi.status();
          set({
            enabled: result.enabled,
            simulations: result.simulations || [],
          });
        } catch {
          // non-critical
        }
      },

      startSimulation: async (dispatchId, intervalMs) => {
        set({ loading: true, error: null });
        try {
          await demoApi.startSimulation(dispatchId, intervalMs);
          await get().fetchStatus();
          set({ loading: false });
        } catch (err: any) {
          set({ loading: false, error: err?.response?.data?.message || err?.message || 'Failed to start simulation' });
        }
      },

      startAllSimulations: async (intervalMs) => {
        set({ loading: true, error: null });
        try {
          await demoApi.startAllSimulations(intervalMs);
          await get().fetchStatus();
          set({ loading: false });
        } catch (err: any) {
          set({ loading: false, error: err?.response?.data?.message || err?.message || 'Failed to start simulations' });
        }
      },

      stopSimulation: async (dispatchId) => {
        try {
          await demoApi.stopSimulation(dispatchId);
          set((s) => ({
            simulations: s.simulations.filter((sim) => sim.dispatchId !== dispatchId),
            progressMap: { ...s.progressMap, [dispatchId]: undefined } as any,
          }));
        } catch (err: any) {
          set({ error: err?.response?.data?.message || 'Failed to stop simulation' });
        }
      },

      stopAllSimulations: async () => {
        try {
          await demoApi.stopAllSimulations();
          set({ simulations: [], progressMap: {}, corridorRouteCoords: [], corridorOverlayVisible: false, corridorMessage: null });
        } catch (err: any) {
          set({ error: err?.response?.data?.message || 'Failed to stop simulations' });
        }
      },

      overrideStatus: async (dispatchId, status) => {
        try {
          await demoApi.overrideStatus(dispatchId, status);
        } catch (err: any) {
          set({ error: err?.response?.data?.message || 'Failed to override status' });
        }
      },

      acceptStandby: async (suggestionId) => {
        // Mark as accepting
        set((s) => ({
          standbyNotifications: s.standbyNotifications.map((n) =>
            n.suggestionId === suggestionId ? { ...n, accepting: true } : n
          ),
        }));
        try {
          await predictiveApi.acceptSuggestion(suggestionId);
          set((s) => ({
            standbyNotifications: s.standbyNotifications.map((n) =>
              n.suggestionId === suggestionId ? { ...n, accepting: false, resolved: 'accepted' } : n
            ),
          }));
        } catch (err: any) {
          set((s) => ({
            standbyNotifications: s.standbyNotifications.map((n) =>
              n.suggestionId === suggestionId ? { ...n, accepting: false } : n
            ),
            error: err?.response?.data?.message || 'Failed to accept standby',
          }));
        }
      },

      dismissStandby: async (suggestionId) => {
        set((s) => ({
          standbyNotifications: s.standbyNotifications.map((n) =>
            n.suggestionId === suggestionId ? { ...n, dismissing: true } : n
          ),
        }));
        try {
          await predictiveApi.dismissSuggestion(suggestionId);
          set((s) => ({
            standbyNotifications: s.standbyNotifications.map((n) =>
              n.suggestionId === suggestionId ? { ...n, dismissing: false, resolved: 'dismissed' } : n
            ),
          }));
        } catch (err: any) {
          set((s) => ({
            standbyNotifications: s.standbyNotifications.map((n) =>
              n.suggestionId === suggestionId ? { ...n, dismissing: false } : n
            ),
            error: err?.response?.data?.message || 'Failed to dismiss standby',
          }));
        }
      },

      clearResolvedNotifications: () => {
        set((s) => ({
          standbyNotifications: s.standbyNotifications.filter((n) => !n.resolved),
        }));
      },

      initDemoSocket: () => {
        if (demoSocketInitialized) return;
        demoSocketInitialized = true;

        const socket = getSocket();

        // Demo mode changed
        socket.on('DEMO_MODE_CHANGED', (data: { enabled: boolean }) => {
          set({
            enabled: data.enabled,
            ...(data.enabled ? {} : { simulations: [], progressMap: {}, corridorRouteCoords: [], corridorOverlayVisible: false, corridorMessage: null }),
          });
        });

        // Simulation progress updates
        socket.on('DEMO_SIMULATION_PROGRESS', (data: SimulationProgress) => {
          set((s) => ({
            progressMap: {
              ...s.progressMap,
              [data.dispatchId]: data,
            },
            // Update matching simulation's progress
            simulations: s.simulations.map((sim) =>
              sim.dispatchId === data.dispatchId
                ? { ...sim, phase: data.phase, progress: data.progress, etaSeconds: data.etaSeconds }
                : sim
            ),
          }));
        });

        // Simulation stopped
        socket.on('DEMO_SIMULATION_STOPPED', (data: { dispatchId: string }) => {
          set((s) => ({
            simulations: s.simulations.filter((sim) => sim.dispatchId !== data.dispatchId),
          }));
        });

        // Green corridor with route coords from simulation
        socket.on('GREEN_CORRIDOR_ACTIVE', (data: any) => {
          if (data.isSimulated && data.routeCoords) {
            set({
              corridorRouteCoords: data.routeCoords || [],
              corridorOverlayVisible: true,
              corridorMessage: data.message || 'Priority route activated',
            });
          }
        });

        socket.on('GREEN_CORRIDOR_DEACTIVATED', (data: any) => {
          if (data.isSimulated) {
            set({
              corridorRouteCoords: [],
              corridorOverlayVisible: false,
              corridorMessage: null,
            });
          }
        });

        // Dispatch completed — remove from simulations
        socket.on('DISPATCH_COMPLETED', (data: any) => {
          if (data.isSimulated) {
            set((s) => ({
              simulations: s.simulations.filter((sim) => sim.dispatchId !== data.dispatchId),
            }));
          }
        });

        // Standby notification from predictive readiness
        socket.on('STANDBY_NOTIFICATION', (data: StandbyNotification) => {
          set((s) => {
            // Avoid duplicates (same suggestionId)
            const exists = s.standbyNotifications.some((n) => n.suggestionId === data.suggestionId);
            if (exists) return s;
            return {
              standbyNotifications: [data, ...s.standbyNotifications].slice(0, 20), // keep max 20
            };
          });
        });

        // Standby accepted by another operator — mark as resolved
        socket.on('STANDBY_ACCEPTED', (data: { suggestionId: string }) => {
          set((s) => ({
            standbyNotifications: s.standbyNotifications.map((n) =>
              n.suggestionId === data.suggestionId && !n.resolved
                ? { ...n, resolved: 'accepted' as const }
                : n
            ),
          }));
        });

        // Periodically sync status
        const syncInterval = setInterval(() => {
          if (get().enabled) {
            get().fetchStatus();
          }
        }, 10000);

        // Clean up — won't actually fire in SPA, but good practice
        return () => clearInterval(syncInterval);
      },
    }),
    {
      name: 'emerge-demo-mode',
      partialize: (state) => ({
        enabled: state.enabled,
      }),
    }
  )
);
