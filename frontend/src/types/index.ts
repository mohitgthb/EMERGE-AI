// ─── Backend-aligned Types ───────────────────────────────────────────────────
// These types match the Prisma schema exactly. No mock shapes.

// ─── Enums ───────────────────────────────────────────────────────────────────
export type EmergencyType = 'ACCIDENT' | 'FIRE' | 'MEDICAL' | 'SAFETY';
export type SOSStatus = 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'ESCALATED';
export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type VehicleStatus = 'AVAILABLE' | 'BUSY' | 'EN_ROUTE' | 'ARRIVED' | 'COMPLETED';
export type QueueStatus = 'PENDING' | 'CONFIRMED' | 'REJECTED';
export type OperatorRole = 'AMBULANCE' | 'FIRE_BRIGADE' | 'POLICE' | 'HOSPITAL' | 'ADMIN';

// ─── Auth / Operator ─────────────────────────────────────────────────────────
export interface Operator {
  id: string;
  operatorId: string;
  name: string;
  role: OperatorRole;
  vehicleId: string | null;
  hospitalId: string | null;
  vehicle?: Ambulance | FireBrigade | PoliceUnit | null;
  hospital?: Hospital | null;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface LoginResponse {
  token: string;
  operator: Operator;
}

// ─── Database Models ─────────────────────────────────────────────────────────
export interface Accident {
  id: string;
  latitude: number;
  longitude: number;
  severity: string;
  detectedBy: string;
  confidence: number | null;
  cameraId: string | null;
  emergencyType: string;
  createdAt: string;
  dispatch?: Dispatch | null;
  queueEntry?: EmergencyQueueEntry | null;
}

export interface FireIncident {
  id: string;
  latitude: number;
  longitude: number;
  severity: string;
  detectedBy: string;
  confidence: number | null;
  cameraId: string | null;
  createdAt: string;
  dispatch?: FireDispatch | null;
  queueEntry?: EmergencyQueueEntry | null;
}

export interface SOSEvent {
  id: string;
  latitude: number;
  longitude: number;
  emergencyType: string;
  severity: string;
  imageUrl: string | null;
  deviceIP: string | null;
  deviceMAC: string | null;
  userAgent: string | null;
  deviceFingerprint: string | null;
  isVerified: boolean;
  verificationMethod: string | null;
  status: string;
  lastSOSAt: string | null;
  sosCount: number;
  clusterId: string | null;
  clusterCount: number;
  severityScore: number;
  createdAt: string;
  policeDispatch?: PoliceDispatch | null;
}

export interface Ambulance {
  id: string;
  vehicleNo: string;
  latitude: number;
  longitude: number;
  status: string;
  updatedAt: string;
}

export interface Hospital {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  beds: number;
  updatedAt: string;
}

export interface FireBrigade {
  id: string;
  vehicleNo: string;
  latitude: number;
  longitude: number;
  status: string;
  updatedAt: string;
}

export interface PoliceUnit {
  id: string;
  vehicleNo: string;
  latitude: number;
  longitude: number;
  status: string;
  updatedAt: string;
}

export interface Dispatch {
  id: string;
  accidentId: string;
  ambulanceId: string;
  hospitalId: string;
  status: string;
  reassignCount: number;
  replacedById: string | null;
  startTime: string;
  endtime: string | null;
  routeProvider: string | null;
  routeDistanceKm: number | null;
  routeDurationSec: number | null;
  routeGeometry: unknown | null;
  hospitalRouteProvider: string | null;
  hospitalRouteDistanceKm: number | null;
  hospitalRouteDurationSec: number | null;
  hospitalRouteGeometry: unknown | null;
  accident?: Accident;
  ambulance?: Ambulance;
  hospital?: Hospital;
}

export interface FireDispatch {
  id: string;
  fireIncidentId: string;
  fireBrigadeId: string;
  status: string;
  reassignCount: number;
  replacedById: string | null;
  startTime: string;
  endtime: string | null;
  routeProvider: string | null;
  routeDistanceKm: number | null;
  routeDurationSec: number | null;
  routeGeometry: unknown | null;
  fireIncident?: FireIncident;
  fireBrigade?: FireBrigade;
}

export interface PoliceDispatch {
  id: string;
  sosEventId: string;
  policeUnitId: string;
  status: string;
  reassignCount: number;
  replacedById: string | null;
  startTime: string;
  endtime: string | null;
  routeProvider: string | null;
  routeDistanceKm: number | null;
  routeDurationSec: number | null;
  routeGeometry: unknown | null;
  sosEvent?: SOSEvent;
  policeUnit?: PoliceUnit;
}

export interface EmergencyQueueEntry {
  id: string;
  emergencyType: string;
  emergencyId: string;
  confidence: number;
  severity: string;
  latitude: number;
  longitude: number;
  status: string;
  assignedTo: string | null;
  reviewedAt: string | null;
  createdAt: string;
  accident?: Accident | null;
  fireIncident?: FireIncident | null;
}

export interface TrafficSignal {
  id: string;
  junctionId: string;
  latitude: number;
  longitude: number;
  state: string;
  updatedAt: string;
}

export interface Camera {
  id: string;
  cameraId: string;
  name: string;
  location: string;
  latitude: number;
  longitude: number;
  rtspUrl: string | null;
  videoPath: string | null;
  streamType: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── API Response Types ──────────────────────────────────────────────────────
export interface DispatchesResponse {
  accidentDispatches: Dispatch[];
  fireDispatches: FireDispatch[];
  policeDispatches: PoliceDispatch[];
}

export interface AnalyticsData {
  totalIncidents: number;
  totalAccidents: number;
  totalFires: number;
  totalSOS: number;
  pendingSOS: number;
  pendingQueue: number;
  unitsAvailable: number;
  unitsBusy: number;
  totalBeds: number;
  avgResponseTime: number;
  ambulances: number;
  fireBrigades: number;
  policeUnits: number;
}

export interface QueueStats {
  pending: number;
  confirmed: number;
  rejected: number;
  avgConfidence: number | null;
}

// ─── Socket Event Payloads ───────────────────────────────────────────────────
export interface SocketAmbulanceLocation {
  ambulanceId: string;
  latitude: number;
  longitude: number;
  status: string;
  timestamp: string;
}

export interface SocketNewAccident extends Accident {}

export interface SocketAmbulanceAssigned {
  accidentId: string;
  dispatchId?: string;
  ambulanceId: string;
  hospitalId?: string;
  route?: {
    provider: string | null;
    distanceKm: number | null;
    durationSec: number | null;
    geometry: unknown | null;
  };
}

export interface SocketSOSTriggered {
  sosEventId: string;
  latitude: number;
  longitude: number;
  emergencyType: string;
  severity: string;
  imageUrl: string | null;
  deviceIP: string | null;
  timestamp: string;
}

// ─── Live Event (for feed) ───────────────────────────────────────────────────
export interface LiveEvent {
  id: string;
  type: 'accident' | 'fire' | 'sos' | 'dispatch' | 'unit_update' | 'vehicle_update' | 'system';
  message: string;
  severity: string;
  timestamp: string;
}

// ─── Evidence ────────────────────────────────────────────────────────────────
export interface EvidenceItem {
  id: string;
  incidentId: string;
  type: 'image' | 'video';
  url: string;
  timestamp: string;
  confidence: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
}

// ─── SOS Verification ────────────────────────────────────────────────────────
export interface SOSVerifyResult {
  event_type: 'ACCIDENT' | 'FIRE' | 'CRIME' | 'NONE';
  confidence: number;
  incident_id: string;
  dispatch_created: boolean;
}

// ─── SOS Emergency Type Selection ────────────────────────────────────────────
export type SOSEmergencyType = 'ACCIDENT' | 'FIRE' | 'CRIME';

// ─── Notification System ─────────────────────────────────────────────────────
export type NotificationLevel = 'info' | 'warning' | 'critical' | 'success';

export interface SystemNotification {
  id: string;
  type: 'NEW_INCIDENT' | 'DISPATCH_CREATED' | 'POLICE_ALERT' | 'VEHICLE_STATUS_UPDATED' | 'GREEN_CORRIDOR_ACTIVE' | 'SOS_TRIGGERED' | 'FIRE_DETECTED' | 'VEHICLE_CRASH_DETECTED' | 'GENERAL';
  title: string;
  message: string;
  level: NotificationLevel;
  emergencyType?: string;
  incidentId?: string;
  timestamp: string;
  read: boolean;
  autoDismiss: boolean;
  soundType?: 'default' | 'urgent' | 'police' | 'fire' | 'success';
}

export interface PoliceAlertPayload {
  sosEventId: string;
  latitude: number;
  longitude: number;
  severity: string;
  emergencyType: string;
  timestamp: string;
}

export interface NewIncidentPayload {
  incidentType: string;
  incidentId: string;
  latitude: number;
  longitude: number;
  severity: string;
  timestamp: string;
}

// ─── Map Marker ──────────────────────────────────────────────────────────────
export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  label: string;
  color: string;
  icon?: string;
  popupHtml?: string;
}

// ─── Route Info ──────────────────────────────────────────────────────────────
export interface RouteInfo {
  provider: string;
  distanceKm: number;
  durationSec: number | null;
  geometry: GeoJSONLineString | null;
  error?: string;
}

export interface GeoJSONLineString {
  type: 'LineString';
  coordinates: [number, number][];
}

// ─── Green Corridor ──────────────────────────────────────────────────────────
export interface GreenCorridorSignal {
  id: string;
  junctionId: string;
  latitude: number;
  longitude: number;
}

export interface GreenCorridorResponse {
  status: string;
  vehicleId: string;
  greenSignals: GreenCorridorSignal[];
}

// ─── Vehicle Status Event ────────────────────────────────────────────────────
export interface VehicleStatusEvent {
  vehicleId: string;
  vehicleNo: string;
  vehicleType: string;
  status: string;
  latitude: number;
  longitude: number;
  timestamp: string;
}

// ─── Green Corridor Event ────────────────────────────────────────────────────
export interface GreenCorridorEvent {
  vehicleId: string;
  vehicleType: string;
  signals: GreenCorridorSignal[];
  timestamp: string;
}

// ─── Status Timeline ─────────────────────────────────────────────────────────
export interface StatusHistoryEntry {
  id: string;
  dispatchId: string;
  dispatchType: string;
  vehicleId: string;
  vehicleType: string;
  status: string;
  latitude: number | null;
  longitude: number | null;
  timestamp: string;
}

// ─── Dual Routes ─────────────────────────────────────────────────────────────
export interface DualRouteResponse {
  dispatchId: string;
  dispatchType: string;
  vehicle: { latitude: number; longitude: number };
  incident: { latitude: number; longitude: number };
  hospital: {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    beds: number;
  };
  vehicleToIncident: RouteInfo;
  incidentToHospital: RouteInfo;
}

// ─── Reassignment ────────────────────────────────────────────────────────────
export interface ReassignmentPayload {
  dispatchId: string;
  dispatchType: string;
  oldVehicleId: string;
  newVehicleId: string;
  newVehicleNo: string;
  oldVehicleNo?: string;
  incidentLat: number;
  incidentLng: number;
  route: RouteInfo;
  hospitalRoute?: RouteInfo;
  attemptNumber: number;
  attempt?: number;
  reason?: string;
  newRoute?: RouteInfo;
  timestamp: string;
}

export interface ReassignmentFailedPayload {
  dispatchId: string;
  dispatchType: string;
  vehicleId?: string;
  reason: string;
  attempts: number;
  timestamp: string;
}

// ─── Incident Cluster ────────────────────────────────────────────────────────
export interface IncidentClusterInfo {
  clusterId: string;
  clusterCount: number;
  severityScore: number;
  severity: string;
  totalReports?: number;
  emergencyType?: string;
  members: SOSEvent[];
}

export interface IncidentUpdatedPayload {
  incidentId: string;
  eventType: string;
  clusterCount: number;
  severityScore: number;
  severity: string;
  newReportId: string;
  newImageUrl: string | null;
  latitude: number;
  longitude: number;
  emergencyType: string;
  timestamp: string;
}

// ─── Predictive Emergency Readiness ──────────────────────────────────────────

export interface RiskZone {
  id: string;
  gridKey: string;
  centerLat: number;
  centerLng: number;
  riskScore: number;
  incidentScore: number;
  densityScore: number;
  timeScore: number;
  incidentCount: number;
  avgDensity: number;
  peakHour: number | null;
  reasons: string[];
  updatedAt: string;
  createdAt: string;
  suggestions?: StandbySuggestion[];
}

export interface StandbySuggestion {
  id: string;
  riskZoneId: string;
  vehicleId: string;
  vehicleType: string;
  vehicleNo: string;
  currentLat: number;
  currentLng: number;
  suggestedLat: number;
  suggestedLng: number;
  distanceKm: number;
  responseTimeImprove: number;
  status: string;
  createdAt: string;
  expiresAt: string;
  riskZone?: RiskZone;
}

export interface PredictiveRiskData {
  zones: RiskZone[];
  topZones: RiskZone[];
  suggestions: StandbySuggestion[];
  timestamp: string;
}

// ─── Connected Vehicle Crash Alert ──────────────────────────────────────────
export interface VehicleCrash {
  id: string;
  vehicleRegNo: string;
  latitude: number;
  longitude: number;
  severity: string;
  airbagDeployed: boolean;
  source: string;
  status: string;
  accidentId: string | null;
  dispatchId: string | null;
  cancelledAt: string | null;
  idempotencyKey: string | null;
  createdAt: string;
}

export interface VehicleCrashResponse {
  message: string;
  crash: VehicleCrash;
  accident: Accident;
  dispatch: Dispatch | null;
  cancelWindowMs: number;
  gpsAvailable: boolean;
}
