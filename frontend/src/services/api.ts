import axios, { AxiosError, type AxiosInstance } from 'axios';
import type {
  Accident,
  FireIncident,
  SOSEvent,
  Ambulance,
  Hospital,
  FireBrigade,
  PoliceUnit,
  Dispatch,
  DispatchesResponse,
  AnalyticsData,
  EmergencyQueueEntry,
  QueueStats,
  Camera,
  TrafficSignal,
  RouteInfo,
  GreenCorridorResponse,
  LoginResponse,
  Operator,
  StatusHistoryEntry,
  DualRouteResponse,
  IncidentClusterInfo,
  RiskZone,
  StandbySuggestion,
  PredictiveRiskData,
  VehicleCrash,
  VehicleCrashResponse,
} from '@/types';

// ─── Axios Instance ──────────────────────────────────────────────────────────
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const api: AxiosInstance = axios.create({
  baseURL: `${API_URL}/api`,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

// ─── Retry interceptor ──────────────────────────────────────────────────────
api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const config = error.config as any;
    if (!config || config._retryCount >= 2) return Promise.reject(error);
    config._retryCount = (config._retryCount || 0) + 1;
    await new Promise((r) => setTimeout(r, 1000 * config._retryCount));
    return api(config);
  }
);

// ─── Auth header interceptor ────────────────────────────────────────────────
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('emerge-ai-token');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
// ─── 401 auto-logout interceptor ──────────────────────────────────────
api.interceptors.response.use(
  (res) => res,
  (error: AxiosError) => {
    if (
      error.response?.status === 401 &&
      !error.config?.url?.includes('/auth/login') &&
      !error.config?.url?.includes('/auth/vehicle-login') &&
      !error.config?.url?.includes('/auth/hospital-login') &&
      !error.config?.url?.includes('/auth/me')
    ) {
      // Token expired or invalid — clear session and redirect
      localStorage.removeItem('emerge-ai-token');
      localStorage.removeItem('emerge-ai-auth');
      localStorage.removeItem('emerge-ai-last-activity');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);
// ─── Accidents ───────────────────────────────────────────────────────────────
export const accidentApi = {
  list: () => api.get<Accident[]>('/accidents').then((r) => r.data),
  get: (id: string) => api.get<Accident>(`/accidents/${id}`).then((r) => r.data),
  create: (data: Partial<Accident>) => api.post<{ accident: Accident; dispatch: Dispatch }>('/accidents', data).then((r) => r.data),
};

// ─── Fire Incidents ──────────────────────────────────────────────────────────
export const fireApi = {
  list: () => api.get<FireIncident[]>('/fire').then((r) => r.data),
  get: (id: string) => api.get<FireIncident>(`/fire/${id}`).then((r) => r.data),
  create: (data: Partial<FireIncident>) => api.post('/fire', data).then((r) => r.data),
};

// ─── SOS ─────────────────────────────────────────────────────────────────────
export interface SOSVerifyResponse {
  event_type: 'ACCIDENT' | 'FIRE' | 'CRIME' | 'NONE';
  confidence: number;
  incident_id: string;
  dispatch_created: boolean;
  dispatch?: any;
  sosEvent: {
    id: string;
    latitude: number;
    longitude: number;
    emergencyType: string;
    severity: string;
    status: string;
    imageUrl: string | null;
  };
}

export const sosApi = {
  list: (params?: { status?: string; emergencyType?: string }) =>
    api.get<SOSEvent[]>('/sos', { params }).then((r) => r.data),
  trigger: (formData: FormData) =>
    api.post('/sos', formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data),
  verifyWithImage: (
    formData: FormData,
    onUploadProgress?: (progress: number) => void
  ) =>
    api
      .post<SOSVerifyResponse>('/sos/verify', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000,
        onUploadProgress: (e) => {
          if (onUploadProgress && e.total) {
            onUploadProgress(Math.round((e.loaded * 100) / e.total));
          }
        },
      })
      .then((r) => r.data),
  verify: (sosEventId: string, data: { isConfirmed: boolean; notes?: string }) =>
    api.post(`/sos/${sosEventId}/verify`, data).then((r) => r.data),
  escalate: (sosEventId: string) =>
    api.post(`/sos/${sosEventId}/escalate`).then((r) => r.data),
};

// ─── Ambulances ──────────────────────────────────────────────────────────────
export const ambulanceApi = {
  list: () => api.get<Ambulance[]>('/ambulances').then((r) => r.data),
  updateStatus: (data: { ambulanceId: string; status?: string; latitude?: number; longitude?: number }) =>
    api.put('/ambulances/status', data).then((r) => r.data),
};

// ─── Hospitals ───────────────────────────────────────────────────────────────
export const hospitalApi = {
  list: () => api.get<Hospital[]>('/hospitals').then((r) => r.data),
};

// ─── Fire Brigades ───────────────────────────────────────────────────────────
export const fireBrigadeApi = {
  list: (params?: { status?: string }) =>
    api.get<FireBrigade[]>('/fire-brigades', { params }).then((r) => r.data),
  updateStatus: (id: string, data: { status?: string; latitude?: number; longitude?: number }) =>
    api.put(`/fire-brigades/${id}/status`, data).then((r) => r.data),
};

// ─── Police ──────────────────────────────────────────────────────────────────
export const policeApi = {
  list: (params?: { status?: string }) =>
    api.get<PoliceUnit[]>('/police', { params }).then((r) => r.data),
  updateStatus: (id: string, data: { status?: string; latitude?: number; longitude?: number }) =>
    api.put(`/police/${id}/status`, data).then((r) => r.data),
};

// ─── Dispatch ────────────────────────────────────────────────────────────────
export const dispatchApi = {
  list: () => api.get<DispatchesResponse>('/dispatch').then((r) => r.data),
  get: (id: string) => api.get<{ dispatch: any; dispatchType: string }>(`/dispatch/${id}`).then((r) => r.data),
  create: (data: { accidentId: string }) => api.post('/dispatch', data).then((r) => r.data),
  analytics: () => api.get<AnalyticsData>('/dispatch/analytics').then((r) => r.data),
  getRoute: (from: { lat: number; lng: number }, to: { lat: number; lng: number }) =>
    api.get<RouteInfo>('/dispatch/route', {
      params: { fromLat: from.lat, fromLng: from.lng, toLat: to.lat, toLng: to.lng },
    }).then((r) => r.data),
  nearestHospital: (lat: number, lng: number) =>
    api.get<{ hospital: Hospital; distanceKm: number; route: RouteInfo }>('/dispatch/nearest-hospital', {
      params: { latitude: lat, longitude: lng },
    }).then((r) => r.data),
  activateGreenCorridor: (vehicleId: string, vehicleType?: string) =>
    api.post<GreenCorridorResponse>('/dispatch/green-corridor/activate', { vehicleId, vehicleType }).then((r) => r.data),
  deactivateGreenCorridor: () =>
    api.post('/dispatch/green-corridor/deactivate').then((r) => r.data),
  updateVehicleStatus: (data: {
    vehicleId: string;
    vehicleType: string;
    status: string;
    latitude?: number;
    longitude?: number;
    dispatchId?: string;
  }) => api.post('/dispatch/vehicle-status', data).then((r) => r.data),
  updateVehicleLocation: (data: {
    vehicleId: string;
    vehicleType: string;
    latitude: number;
    longitude: number;
  }) => api.post('/dispatch/vehicle-location', data).then((r) => r.data),

  // Dual routes
  getDualRoutes: (dispatchId: string) =>
    api.get<DualRouteResponse>(`/dispatch/${dispatchId}/dual-routes`).then((r) => r.data),

  // Status timeline
  getStatusTimeline: (dispatchId: string) =>
    api.get<StatusHistoryEntry[]>(`/dispatch/${dispatchId}/timeline`).then((r) => r.data),

  // Incident clustering
  getClusterInfo: (eventId: string) =>
    api.get<IncidentClusterInfo>(`/dispatch/cluster/${eventId}`).then((r) => r.data),
  getClusterEvents: (clusterId: string) =>
    api.get<SOSEvent[]>(`/dispatch/cluster/${clusterId}/events`).then((r) => r.data),
};

// ─── Emergency Queue ─────────────────────────────────────────────────────────
export const queueApi = {
  list: (params?: { status?: string; emergencyType?: string }) =>
    api.get<EmergencyQueueEntry[]>('/emergency-queue', { params }).then((r) => r.data),
  review: (id: string, data: { action: 'CONFIRM' | 'REJECT' | 'ESCALATE'; assignedTo?: string; newSeverity?: string }) =>
    api.post(`/emergency-queue/${id}/review`, data).then((r) => r.data),
  stats: () => api.get<QueueStats>('/emergency-queue/stats').then((r) => r.data),
};

// ─── Cameras ─────────────────────────────────────────────────────────────────
export const cameraApi = {
  list: () => api.get<{ success: boolean; cameras: Camera[] }>('/cameras').then((r) => r.data.cameras),
  active: () => api.get<{ success: boolean; cameras: Camera[] }>('/cameras/active').then((r) => r.data.cameras),
};

// ─── Signals ─────────────────────────────────────────────────────────────────
export const signalApi = {
  list: () => api.get<TrafficSignal[]>('/signals').then((r) => r.data),
};

// ─── Auth ────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (operatorId: string, password: string) =>
    api.post<LoginResponse>('/auth/login', { operatorId, password }).then((r) => r.data),
  vehicleLogin: (vehicleNo: string, password: string) =>
    api.post<LoginResponse>('/auth/vehicle-login', { vehicleNo, password }).then((r) => r.data),
  hospitalLogin: (hospitalName: string, password: string) =>
    api.post<LoginResponse>('/auth/hospital-login', { hospitalName, password }).then((r) => r.data),
  me: () => api.get<{ operator: Operator }>('/auth/me').then((r) => r.data),
  logout: () => api.post('/auth/logout').then((r) => r.data),

  // Admin: operator management
  listOperators: () => api.get<Operator[]>('/auth/operators').then((r) => r.data),
  createOperator: (data: { operatorId: string; password: string; name: string; role: string; vehicleId?: string }) =>
    api.post<Operator>('/auth/operators', data).then((r) => r.data),
  updateOperator: (id: string, data: Partial<{ name: string; role: string; vehicleId: string; isActive: boolean; password: string }>) =>
    api.put<Operator>(`/auth/operators/${id}`, data).then((r) => r.data),
  deleteOperator: (id: string) => api.delete(`/auth/operators/${id}`).then((r) => r.data),
};

// ─── Helper: media URL builder ───────────────────────────────────────────────
export function mediaUrl(path: string | null | undefined): string {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return `${API_URL}${path}`;
}

// ─── Demo Simulation ─────────────────────────────────────────────────────────
export const demoApi = {
  status: () =>
    api.get<{ enabled: boolean; simulations: any[] }>('/demo/status').then((r) => r.data),
  toggle: (enabled: boolean) =>
    api.post<{ enabled: boolean; message: string }>('/demo/toggle', { enabled }).then((r) => r.data),
  startSimulation: (dispatchId: string, intervalMs?: number) =>
    api.post(`/demo/simulate/${dispatchId}`, { intervalMs }).then((r) => r.data),
  startAllSimulations: (intervalMs?: number) =>
    api.post('/demo/simulate-all', { intervalMs }).then((r) => r.data),
  stopSimulation: (dispatchId: string) =>
    api.post(`/demo/stop/${dispatchId}`).then((r) => r.data),
  stopAllSimulations: () =>
    api.post('/demo/stop-all').then((r) => r.data),
  overrideStatus: (dispatchId: string, status: string) =>
    api.post(`/demo/override-status/${dispatchId}`, { status }).then((r) => r.data),
};

// ─── Predictive Readiness ────────────────────────────────────────────────────
export const predictiveApi = {
  riskData: () =>
    api.get<PredictiveRiskData>('/predictive/risk-data').then((r) => r.data),
  zones: () =>
    api.get<RiskZone[]>('/predictive/zones').then((r) => r.data),
  topZones: () =>
    api.get<RiskZone[]>('/predictive/top-zones').then((r) => r.data),
  suggestions: () =>
    api.get<StandbySuggestion[]>('/predictive/suggestions').then((r) => r.data),
  recalculate: () =>
    api.post<PredictiveRiskData>('/predictive/recalculate').then((r) => r.data),
  acceptSuggestion: (id: string) =>
    api.post(`/predictive/suggestions/${id}/accept`).then((r) => r.data),
  dismissSuggestion: (id: string) =>
    api.post(`/predictive/suggestions/${id}/dismiss`).then((r) => r.data),
};

// ─── Vehicle Crash Alert ─────────────────────────────────────────────────────
export const vehicleCrashApi = {
  trigger: (data: {
    vehicleId: string;
    latitude: number;
    longitude: number;
    severity: string;
    airbagDeployed: boolean;
    timestamp: string;
  }) => api.post<VehicleCrashResponse>('/vehicle/crash', data).then((r) => r.data),
  cancel: (id: string) =>
    api.post<{ message: string; crashId: string }>(`/vehicle/crash/${id}/cancel`).then((r) => r.data),
  list: () => api.get<VehicleCrash[]>('/vehicle/crashes').then((r) => r.data),
  get: (id: string) => api.get<VehicleCrash>(`/vehicle/crash/${id}`).then((r) => r.data),
};

export { api, API_URL };
export default api;
