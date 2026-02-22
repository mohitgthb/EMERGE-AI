import { io, Socket } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      autoConnect: true,
    });

    socket.on('connect', () => {
      console.log('[Socket] Connected:', socket?.id);
    });

    socket.on('disconnect', (reason) => {
      console.warn('[Socket] Disconnected:', reason);
    });

    socket.on('connect_error', (err) => {
      console.error('[Socket] Connection error:', err.message);
    });
  }
  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

// ─── Event names matching backend socket.getIO().emit() calls ────────────────
export const SOCKET_EVENTS = {
  // Accidents
  NEW_ACCIDENT: 'new_accident',
  ACCIDENT_CONFIRMED: 'ACCIDENT_CONFIRMED',
  ACCIDENT_QUEUED: 'ACCIDENT_QUEUED',

  // Ambulance
  AMBULANCE_ASSIGNED: 'AMBULANCE_ASSIGNED',
  AMBULANCE_STATUS_UPDATE: 'AMBULANCE_STATUS_UPDATE',
  AMBULANCE_LOCATION_UPDATE: 'AMBULANCE_LOCATION_UPDATE',

  // Fire
  FIRE_DETECTED: 'FIRE_DETECTED',
  FIRE_CONFIRMED: 'FIRE_CONFIRMED',
  FIRE_QUEUED: 'FIRE_QUEUED',
  FIRE_BRIGADE_DISPATCHED: 'FIRE_BRIGADE_DISPATCHED',
  FIRE_BRIGADE_STATUS_UPDATE: 'FIRE_BRIGADE_STATUS_UPDATE',

  // Police
  POLICE_STATUS_UPDATE: 'POLICE_STATUS_UPDATE',

  // SOS
  SOS_TRIGGERED: 'SOS_TRIGGERED',
  SOS_CONFIRMED: 'SOS_CONFIRMED',
  SOS_REJECTED: 'SOS_REJECTED',
  SOS_ESCALATED: 'SOS_ESCALATED',

  // SOS Camera Flow
  INCIDENT_CONFIRMED: 'INCIDENT_CONFIRMED',
  DISPATCH_CREATED: 'DISPATCH_CREATED',
  VEHICLE_EN_ROUTE: 'VEHICLE_EN_ROUTE',

  // Multi-type dispatch
  NEW_INCIDENT: 'NEW_INCIDENT',
  POLICE_ALERT: 'POLICE_ALERT',
  FIRE_BRIGADE_ASSIGNED: 'FIRE_BRIGADE_ASSIGNED',
  POLICE_UNIT_ASSIGNED: 'POLICE_UNIT_ASSIGNED',
  DISPATCH_ASSIGNED: 'DISPATCH_ASSIGNED',

  // Reassignment
  DISPATCH_REASSIGNED: 'DISPATCH_REASSIGNED',
  REASSIGNMENT_FAILED: 'REASSIGNMENT_FAILED',

  // Incident clustering
  INCIDENT_UPDATED: 'INCIDENT_UPDATED',

  // Unified vehicle tracking
  VEHICLE_STATUS_UPDATED: 'VEHICLE_STATUS_UPDATED',
  VEHICLE_LOCATION_UPDATE: 'VEHICLE_LOCATION_UPDATE',

  // Dispatch lifecycle
  DISPATCH_STATUS_CHANGED: 'DISPATCH_STATUS_CHANGED',
  DISPATCH_COMPLETED: 'DISPATCH_COMPLETED',

  // Green corridor
  GREEN_CORRIDOR_ACTIVE: 'GREEN_CORRIDOR_ACTIVE',
  GREEN_CORRIDOR_DEACTIVATED: 'GREEN_CORRIDOR_DEACTIVATED',
  GREEN_CORRIDOR_STATUS: 'GREEN_CORRIDOR_STATUS',
  SIGNAL_GREEN: 'SIGNAL_GREEN',
  SIGNAL_RESET: 'SIGNAL_RESET',

  // Emergency queue
  EMERGENCY_QUEUED: 'EMERGENCY_QUEUED',
  EMERGENCY_STARTED: 'EMERGENCY_STARTED',
  EMERGENCY_CONFIRMED: 'EMERGENCY_CONFIRMED',
  EMERGENCY_REJECTED: 'EMERGENCY_REJECTED',
  EMERGENCY_ESCALATED: 'EMERGENCY_ESCALATED',

  // Demo simulation events
  DEMO_MODE_CHANGED: 'DEMO_MODE_CHANGED',
  DEMO_SIMULATION_PROGRESS: 'DEMO_SIMULATION_PROGRESS',
  DEMO_SIMULATION_STOPPED: 'DEMO_SIMULATION_STOPPED',

  // Predictive Readiness
  RISK_ZONE_UPDATED: 'RISK_ZONE_UPDATED',
  STANDBY_SUGGESTION: 'STANDBY_SUGGESTION',
  STANDBY_ACCEPTED: 'STANDBY_ACCEPTED',
  STANDBY_NOTIFICATION: 'STANDBY_NOTIFICATION',

  // Vehicle Crash Alert
  VEHICLE_CRASH_DETECTED: 'VEHICLE_CRASH_DETECTED',
  VEHICLE_CRASH_CANCELLED: 'VEHICLE_CRASH_CANCELLED',
} as const;
