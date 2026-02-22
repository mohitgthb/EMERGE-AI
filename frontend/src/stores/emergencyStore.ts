import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Accident,
  FireIncident,
  SOSEvent,
  Ambulance,
  Hospital,
  FireBrigade,
  PoliceUnit,
  AnalyticsData,
  EmergencyQueueEntry,
  LiveEvent,
  DispatchesResponse,
  TrafficSignal,
  GreenCorridorSignal,
  VehicleStatusEvent,
} from '@/types';
import {
  accidentApi,
  fireApi,
  sosApi,
  ambulanceApi,
  hospitalApi,
  fireBrigadeApi,
  policeApi,
  dispatchApi,
  queueApi,
  signalApi,
} from '@/services/api';
import { getSocket, SOCKET_EVENTS } from '@/services/socket';

// ─── Emergency Store ─────────────────────────────────────────────────────────
interface EmergencyState {
  // Data
  accidents: Accident[];
  fireIncidents: FireIncident[];
  sosEvents: SOSEvent[];
  ambulances: Ambulance[];
  hospitals: Hospital[];
  fireBrigades: FireBrigade[];
  policeUnits: PoliceUnit[];
  dispatches: DispatchesResponse | null;
  queue: EmergencyQueueEntry[];
  analytics: AnalyticsData | null;
  liveEvents: LiveEvent[];
  signals: TrafficSignal[];

  // Green Corridor
  greenCorridorActive: boolean;
  greenCorridorVehicleId: string | null;
  greenCorridorSignals: GreenCorridorSignal[];

  // Loading
  loading: boolean;
  error: string | null;
  connected: boolean;

  // Actions
  fetchAll: () => Promise<void>;
  fetchAccidents: () => Promise<void>;
  fetchFireIncidents: () => Promise<void>;
  fetchSOSEvents: () => Promise<void>;
  fetchAmbulances: () => Promise<void>;
  fetchHospitals: () => Promise<void>;
  fetchFireBrigades: () => Promise<void>;
  fetchPoliceUnits: () => Promise<void>;
  fetchDispatches: () => Promise<void>;
  fetchQueue: () => Promise<void>;
  fetchAnalytics: () => Promise<void>;
  fetchSignals: () => Promise<void>;

  addLiveEvent: (event: LiveEvent) => void;
  initSocket: () => void;

  // Ambulance location updates (smooth tracking)
  updateAmbulanceLocation: (id: string, lat: number, lng: number, status: string) => void;
  // Unified vehicle updates
  updateVehicleLocation: (data: VehicleStatusEvent) => void;
}

let socketInitialized = false;

export const useEmergencyStore = create<EmergencyState>((set, get) => ({
  accidents: [],
  fireIncidents: [],
  sosEvents: [],
  ambulances: [],
  hospitals: [],
  fireBrigades: [],
  policeUnits: [],
  dispatches: null,
  queue: [],
  analytics: null,
  liveEvents: [],
  signals: [],
  greenCorridorActive: false,
  greenCorridorVehicleId: null,
  greenCorridorSignals: [],
  loading: false,
  error: null,
  connected: false,

  fetchAll: async () => {
    set({ loading: true, error: null });
    try {
      const [accidents, fireIncidents, sosEvents, ambulances, hospitals, fireBrigades, policeUnits, dispatches, analytics] =
        await Promise.allSettled([
          accidentApi.list(),
          fireApi.list(),
          sosApi.list(),
          ambulanceApi.list(),
          hospitalApi.list(),
          fireBrigadeApi.list(),
          policeApi.list(),
          dispatchApi.list(),
          dispatchApi.analytics(),
        ]);

      set({
        accidents: accidents.status === 'fulfilled' ? accidents.value : [],
        fireIncidents: fireIncidents.status === 'fulfilled' ? fireIncidents.value : [],
        sosEvents: sosEvents.status === 'fulfilled' ? sosEvents.value : [],
        ambulances: ambulances.status === 'fulfilled' ? ambulances.value : [],
        hospitals: hospitals.status === 'fulfilled' ? hospitals.value : [],
        fireBrigades: fireBrigades.status === 'fulfilled' ? fireBrigades.value : [],
        policeUnits: policeUnits.status === 'fulfilled' ? policeUnits.value : [],
        dispatches: dispatches.status === 'fulfilled' ? dispatches.value : null,
        analytics: analytics.status === 'fulfilled' ? analytics.value : null,
        loading: false,
      });
    } catch (err: any) {
      set({ loading: false, error: err?.message || 'Failed to fetch data' });
    }
  },

  fetchAccidents: async () => {
    try { set({ accidents: await accidentApi.list() }); } catch (err) { console.error('fetchAccidents failed:', err); }
  },
  fetchFireIncidents: async () => {
    try { set({ fireIncidents: await fireApi.list() }); } catch (err) { console.error('fetchFireIncidents failed:', err); }
  },
  fetchSOSEvents: async () => {
    try { set({ sosEvents: await sosApi.list() }); } catch (err) { console.error('fetchSOSEvents failed:', err); }
  },
  fetchAmbulances: async () => {
    try { set({ ambulances: await ambulanceApi.list() }); } catch (err) { console.error('fetchAmbulances failed:', err); }
  },
  fetchHospitals: async () => {
    try { set({ hospitals: await hospitalApi.list() }); } catch (err) { console.error('fetchHospitals failed:', err); }
  },
  fetchFireBrigades: async () => {
    try { set({ fireBrigades: await fireBrigadeApi.list() }); } catch (err) { console.error('fetchFireBrigades failed:', err); }
  },
  fetchPoliceUnits: async () => {
    try { set({ policeUnits: await policeApi.list() }); } catch (err) { console.error('fetchPoliceUnits failed:', err); }
  },
  fetchDispatches: async () => {
    try { set({ dispatches: await dispatchApi.list() }); } catch (err) { console.error('fetchDispatches failed:', err); }
  },
  fetchQueue: async () => {
    try { set({ queue: await queueApi.list() }); } catch (err) { console.error('fetchQueue failed:', err); }
  },
  fetchAnalytics: async () => {
    try { set({ analytics: await dispatchApi.analytics() }); } catch (err) { console.error('fetchAnalytics failed:', err); }
  },
  fetchSignals: async () => {
    try { set({ signals: await signalApi.list() }); } catch (err) { console.error('fetchSignals failed:', err); }
  },

  addLiveEvent: (event) => {
    set((s) => ({
      liveEvents: [event, ...s.liveEvents].slice(0, 100),
    }));
  },

  updateAmbulanceLocation: (id, lat, lng, status) => {
    set((s) => ({
      ambulances: s.ambulances.map((a) =>
        a.id === id ? { ...a, latitude: lat, longitude: lng, status, updatedAt: new Date().toISOString() } : a
      ),
    }));
  },

  updateVehicleLocation: (data) => {
    set((s) => {
      if (data.vehicleType === 'FIRE_BRIGADE') {
        return {
          fireBrigades: s.fireBrigades.map((fb) =>
            fb.id === data.vehicleId
              ? { ...fb, latitude: data.latitude, longitude: data.longitude, status: data.status, updatedAt: data.timestamp }
              : fb
          ),
        };
      } else if (data.vehicleType === 'POLICE') {
        return {
          policeUnits: s.policeUnits.map((pu) =>
            pu.id === data.vehicleId
              ? { ...pu, latitude: data.latitude, longitude: data.longitude, status: data.status, updatedAt: data.timestamp }
              : pu
          ),
        };
      } else {
        return {
          ambulances: s.ambulances.map((a) =>
            a.id === data.vehicleId
              ? { ...a, latitude: data.latitude, longitude: data.longitude, status: data.status, updatedAt: data.timestamp }
              : a
          ),
        };
      }
    });
  },

  initSocket: () => {
    if (socketInitialized) return;
    socketInitialized = true;
    const socket = getSocket();

    socket.on('connect', () => set({ connected: true }));
    socket.on('disconnect', () => set({ connected: false }));

    // ─── Accident events ─────────────────────────────────────────────
    socket.on(SOCKET_EVENTS.NEW_ACCIDENT, (accident: Accident) => {
      set((s) => ({ accidents: [accident, ...s.accidents] }));
      get().addLiveEvent({
        id: `ev-${Date.now()}`,
        type: 'accident',
        message: `New accident detected (${accident.severity}) at ${accident.latitude.toFixed(4)}, ${accident.longitude.toFixed(4)}`,
        severity: accident.severity,
        timestamp: new Date().toISOString(),
      });
      get().fetchAnalytics();
    });

    socket.on(SOCKET_EVENTS.ACCIDENT_CONFIRMED, (data: any) => {
      get().addLiveEvent({
        id: `ev-${Date.now()}`,
        type: 'dispatch',
        message: `Accident confirmed and dispatch created`,
        severity: 'HIGH',
        timestamp: new Date().toISOString(),
      });
      get().fetchAccidents();
      get().fetchDispatches();
    });

    // ─── Ambulance events ────────────────────────────────────────────
    socket.on(SOCKET_EVENTS.AMBULANCE_ASSIGNED, (data: any) => {
      get().addLiveEvent({
        id: `ev-${Date.now()}`,
        type: 'dispatch',
        message: `Ambulance assigned to accident ${data.accidentId?.slice(0, 8)}`,
        severity: 'HIGH',
        timestamp: new Date().toISOString(),
      });
      get().fetchAmbulances();
      get().fetchDispatches();
    });

    socket.on(SOCKET_EVENTS.AMBULANCE_STATUS_UPDATE, (data: any) => {
      set((s) => ({
        ambulances: s.ambulances.map((a) =>
          (a.id === data.id || a.id === data.ambulanceId) ? { ...a, status: data.status } : a
        ),
      }));
      get().addLiveEvent({
        id: `ev-${Date.now()}`,
        type: 'vehicle_update',
        message: `Ambulance status: ${data.status}`,
        severity: data.status === 'EN_ROUTE' ? 'HIGH' : 'MEDIUM',
        timestamp: new Date().toISOString(),
      });
    });

    socket.on(SOCKET_EVENTS.AMBULANCE_LOCATION_UPDATE, (data: any) => {
      get().updateAmbulanceLocation(data.ambulanceId, data.latitude, data.longitude, data.status);
    });

    // ─── Fire events ─────────────────────────────────────────────────
    socket.on(SOCKET_EVENTS.FIRE_DETECTED, (fire: FireIncident) => {
      set((s) => ({ fireIncidents: [fire, ...s.fireIncidents] }));
      get().addLiveEvent({
        id: `ev-${Date.now()}`,
        type: 'fire',
        message: `Fire detected (${fire.severity}) at ${fire.latitude.toFixed(4)}, ${fire.longitude.toFixed(4)}`,
        severity: fire.severity,
        timestamp: new Date().toISOString(),
      });
      get().fetchAnalytics();
    });

    socket.on(SOCKET_EVENTS.FIRE_BRIGADE_STATUS_UPDATE, (brigade: FireBrigade) => {
      set((s) => ({
        fireBrigades: s.fireBrigades.map((fb) => (fb.id === brigade.id ? brigade : fb)),
      }));
      get().addLiveEvent({
        id: `ev-${Date.now()}`,
        type: 'vehicle_update',
        message: `Fire brigade ${brigade.vehicleNo} status: ${brigade.status}`,
        severity: 'MEDIUM',
        timestamp: new Date().toISOString(),
      });
    });

    socket.on(SOCKET_EVENTS.FIRE_BRIGADE_DISPATCHED, (data: any) => {
      get().addLiveEvent({
        id: `ev-${Date.now()}`,
        type: 'dispatch',
        message: `Fire brigade dispatched to incident`,
        severity: 'HIGH',
        timestamp: new Date().toISOString(),
      });
      get().fetchFireBrigades();
      get().fetchDispatches();
    });

    // ─── Police events ───────────────────────────────────────────────
    socket.on(SOCKET_EVENTS.POLICE_STATUS_UPDATE, (unit: PoliceUnit) => {
      set((s) => ({
        policeUnits: s.policeUnits.map((p) => (p.id === unit.id ? unit : p)),
      }));
      get().addLiveEvent({
        id: `ev-${Date.now()}`,
        type: 'vehicle_update',
        message: `Police unit ${unit.vehicleNo} status: ${unit.status}`,
        severity: 'MEDIUM',
        timestamp: new Date().toISOString(),
      });
    });

    // ─── SOS events ──────────────────────────────────────────────────
    socket.on(SOCKET_EVENTS.SOS_TRIGGERED, (data: any) => {
      get().addLiveEvent({
        id: `ev-${Date.now()}`,
        type: 'sos',
        message: `SOS triggered: ${data.emergencyType} at ${Number(data.latitude)?.toFixed(4) ?? '?'}, ${Number(data.longitude)?.toFixed(4) ?? '?'}`,
        severity: data.severity || 'HIGH',
        timestamp: new Date().toISOString(),
      });
      get().fetchSOSEvents();
      get().fetchAnalytics();
    });

    socket.on(SOCKET_EVENTS.SOS_CONFIRMED, (data: any) => {
      get().addLiveEvent({
        id: `ev-${Date.now()}`,
        type: 'sos',
        message: `SOS confirmed — help dispatched`,
        severity: 'HIGH',
        timestamp: new Date().toISOString(),
      });
      get().fetchSOSEvents();
    });

    socket.on(SOCKET_EVENTS.SOS_ESCALATED, (data: any) => {
      get().addLiveEvent({
        id: `ev-${Date.now()}`,
        type: 'sos',
        message: `SOS escalated to critical priority`,
        severity: 'CRITICAL',
        timestamp: new Date().toISOString(),
      });
      get().fetchSOSEvents();
    });

    // ─── SOS camera flow events ──────────────────────────────────────
    socket.on(SOCKET_EVENTS.INCIDENT_CONFIRMED, (data: any) => {
      get().addLiveEvent({
        id: `ev-${Date.now()}`,
        type: 'sos',
        message: `Incident verified: ${data.event_type} (${((data.confidence || 0) * 100).toFixed(0)}% confidence)`,
        severity: 'HIGH',
        timestamp: new Date().toISOString(),
      });
      get().fetchSOSEvents();
      get().fetchAnalytics();
    });

    socket.on(SOCKET_EVENTS.DISPATCH_CREATED, (data: any) => {
      get().addLiveEvent({
        id: `ev-${Date.now()}`,
        type: 'dispatch',
        message: data.source === 'VEHICLE_SENSOR'
          ? `Vehicle crash dispatch created for ${data.vehicleRegNo || 'vehicle'}`
          : `Emergency dispatch created for SOS incident`,
        severity: 'HIGH',
        timestamp: new Date().toISOString(),
      });
      // Small delay to ensure backend transaction has committed
      setTimeout(() => {
        get().fetchDispatches();
        get().fetchAccidents();
        get().fetchAmbulances();
        get().fetchAnalytics();
      }, 500);
    });

    socket.on(SOCKET_EVENTS.VEHICLE_CRASH_DETECTED, (data: any) => {
      get().addLiveEvent({
        id: `ev-${Date.now()}`,
        type: 'accident',
        message: `🚗 Vehicle crash: ${data.vehicleRegNo || 'Unknown'} — Airbag deployed (${data.severity || 'HIGH'})`,
        severity: data.severity || 'HIGH',
        timestamp: new Date().toISOString(),
      });
      // Refresh everything — accident + dispatch are created together
      setTimeout(() => {
        get().fetchAccidents();
        get().fetchDispatches();
        get().fetchAmbulances();
        get().fetchAnalytics();
      }, 800);
    });

    socket.on(SOCKET_EVENTS.VEHICLE_EN_ROUTE, (data: any) => {
      get().addLiveEvent({
        id: `ev-${Date.now()}`,
        type: 'vehicle_update',
        message: `Emergency vehicle en route to SOS location`,
        severity: 'HIGH',
        timestamp: new Date().toISOString(),
      });
      get().fetchDispatches();
    });

    // ─── Unified vehicle tracking events ─────────────────────────────
    socket.on(SOCKET_EVENTS.VEHICLE_STATUS_UPDATED, (data: VehicleStatusEvent) => {
      get().updateVehicleLocation(data);
      get().addLiveEvent({
        id: `ev-${Date.now()}`,
        type: 'vehicle_update',
        message: `${data.vehicleType} ${data.vehicleNo} → ${data.status}`,
        severity: data.status === 'EN_ROUTE' ? 'HIGH' : 'MEDIUM',
        timestamp: data.timestamp,
      });
    });

    socket.on(SOCKET_EVENTS.VEHICLE_LOCATION_UPDATE, (data: VehicleStatusEvent) => {
      get().updateVehicleLocation(data);
    });

    // ─── Dispatch lifecycle events ───────────────────────────────────
    socket.on(SOCKET_EVENTS.DISPATCH_STATUS_CHANGED, (data: any) => {
      // Update the dispatch status in-memory so UI reflects EN_ROUTE / ARRIVED / COMPLETED
      set((s) => {
        if (!s.dispatches) return {};
        return {
          dispatches: {
            ...s.dispatches,
            accidentDispatches: s.dispatches.accidentDispatches.map((d) =>
              d.id === data.dispatchId ? { ...d, status: data.dispatchStatus } : d
            ),
            fireDispatches: s.dispatches.fireDispatches.map((d) =>
              d.id === data.dispatchId ? { ...d, status: data.dispatchStatus } : d
            ),
            policeDispatches: s.dispatches.policeDispatches.map((d) =>
              d.id === data.dispatchId ? { ...d, status: data.dispatchStatus } : d
            ),
          },
        };
      });
    });

    socket.on(SOCKET_EVENTS.DISPATCH_COMPLETED, (data: any) => {
      get().addLiveEvent({
        id: `ev-${Date.now()}`,
        type: 'dispatch',
        message: `Dispatch completed — ${data.vehicleType} ${data.vehicleNo} is now available`,
        severity: 'HIGH',
        timestamp: data.timestamp || new Date().toISOString(),
      });
      // Refresh dispatches + vehicles to get final state
      get().fetchDispatches();
      get().fetchAmbulances();
      get().fetchFireBrigades();
      get().fetchPoliceUnits();
      get().fetchAnalytics();
    });


    // ─── Green corridor events ───────────────────────────────────────
    socket.on(SOCKET_EVENTS.GREEN_CORRIDOR_ACTIVE, (data: any) => {
      set({
        greenCorridorActive: true,
        greenCorridorVehicleId: data.vehicleId,
        greenCorridorSignals: data.signals || [],
      });
      get().addLiveEvent({
        id: `ev-${Date.now()}`,
        type: 'system',
        message: `Green corridor activated — ${data.signals?.length || 0} signals prioritized`,
        severity: 'HIGH',
        timestamp: data.timestamp,
      });
      get().fetchSignals();
    });

    socket.on(SOCKET_EVENTS.GREEN_CORRIDOR_DEACTIVATED, () => {
      set({
        greenCorridorActive: false,
        greenCorridorVehicleId: null,
        greenCorridorSignals: [],
      });
      get().addLiveEvent({
        id: `ev-${Date.now()}`,
        type: 'system',
        message: `Green corridor deactivated — signals reset`,
        severity: 'MEDIUM',
        timestamp: new Date().toISOString(),
      });
      get().fetchSignals();
    });

    socket.on(SOCKET_EVENTS.SIGNAL_GREEN, (data: any) => {
      set((s) => ({
        signals: s.signals.map((sig) =>
          sig.junctionId === data.junctionId ? { ...sig, state: 'GREEN' } : sig
        ),
      }));
    });

    socket.on(SOCKET_EVENTS.SIGNAL_RESET, () => {
      set((s) => ({
        signals: s.signals.map((sig) => ({ ...sig, state: 'NORMAL' })),
      }));
    });

    // ─── Queue events ────────────────────────────────────────────────
    socket.on(SOCKET_EVENTS.EMERGENCY_QUEUED, (data: any) => {
      get().addLiveEvent({
        id: `ev-${Date.now()}`,
        type: 'system',
        message: `Emergency queued for human review (confidence: ${(data.confidence * 100).toFixed(0)}%)`,
        severity: 'MEDIUM',
        timestamp: new Date().toISOString(),
      });
      get().fetchQueue();
    });

    socket.on(SOCKET_EVENTS.EMERGENCY_CONFIRMED, () => {
      get().fetchQueue();
      get().fetchDispatches();
    });

    // ─── Reassignment events ─────────────────────────────────────────
    socket.on(SOCKET_EVENTS.DISPATCH_REASSIGNED, (data: any) => {
      get().addLiveEvent({
        id: `ev-${Date.now()}`,
        type: 'dispatch',
        message: `Dispatch reassigned: ${data.oldVehicleId?.slice(0, 8)} → ${data.newVehicleNo} (attempt ${data.attemptNumber})`,
        severity: 'HIGH',
        timestamp: data.timestamp || new Date().toISOString(),
      });
      get().fetchDispatches();
      get().fetchAmbulances();
      get().fetchFireBrigades();
      get().fetchPoliceUnits();
    });

    socket.on(SOCKET_EVENTS.REASSIGNMENT_FAILED, (data: any) => {
      get().addLiveEvent({
        id: `ev-${Date.now()}`,
        type: 'system',
        message: `Reassignment failed for dispatch ${data.dispatchId?.slice(0, 8)}: ${data.reason}`,
        severity: 'CRITICAL',
        timestamp: data.timestamp || new Date().toISOString(),
      });
    });

    // ─── Incident clustering events ──────────────────────────────────
    socket.on(SOCKET_EVENTS.INCIDENT_UPDATED, (data: any) => {
      get().addLiveEvent({
        id: `ev-${Date.now()}`,
        type: 'sos',
        message: `Incident cluster updated: ${data.clusterCount} reports merged (severity: ${data.severity})`,
        severity: data.severity || 'HIGH',
        timestamp: data.timestamp || new Date().toISOString(),
      });
      get().fetchSOSEvents();
    });
  },
}));
