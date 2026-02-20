import { useEffect, useState } from 'react';
import { getSocket } from '@/services/socket';
import { SOCKET_EVENTS } from '@/services/socket';

interface DispatchInfo {
  type: string;
  dispatchId: string;
  vehicleId?: string;
  vehicleNo?: string;
  incidentLat: number;
  incidentLng: number;
  route?: {
    provider: string | null;
    distanceKm: number | null;
    durationSec: number | null;
  };
  hospitalId?: string;
  timestamp: string;
}

/**
 * DispatchAssignmentHandler
 * Shows assigned vehicle details, route info, and nearest hospital
 * after a dispatch is created. Listens for DISPATCH_ASSIGNED events
 * for a specific vehicle (operator's own vehicle).
 */
export function DispatchAssignmentHandler({ vehicleId }: { vehicleId?: string }) {
  const [assignment, setAssignment] = useState<DispatchInfo | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const socket = getSocket();

    const handleAssignment = (data: any) => {
      // Only show assignments for this vehicle
      if (vehicleId && data.ambulanceId !== vehicleId && data.fireBrigadeId !== vehicleId && data.policeUnitId !== vehicleId) {
        return;
      }

      setAssignment({
        type: data.type || 'DISPATCH',
        dispatchId: data.dispatchId,
        vehicleId: data.ambulanceId || data.fireBrigadeId || data.policeUnitId,
        incidentLat: data.incidentLat,
        incidentLng: data.incidentLng,
        route: data.route,
        hospitalId: data.hospitalId,
        timestamp: data.timestamp || new Date().toISOString(),
      });
      setVisible(true);
    };

    socket.on(SOCKET_EVENTS.DISPATCH_ASSIGNED, handleAssignment);

    return () => {
      socket.off(SOCKET_EVENTS.DISPATCH_ASSIGNED, handleAssignment);
    };
  }, [vehicleId]);

  if (!visible || !assignment) return null;

  const typeLabel = assignment.type.replace('_', ' ');
  const distanceText = assignment.route?.distanceKm
    ? `${assignment.route.distanceKm.toFixed(1)} km`
    : 'Calculating...';
  const etaText = assignment.route?.durationSec
    ? `${Math.ceil(assignment.route.durationSec / 60)} min`
    : '--';

  return (
    <div className="rounded-xl border-2 border-green-400 bg-green-50 shadow-lg overflow-hidden mb-4">
      <div className="bg-green-600 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-white text-lg">🚐</span>
          <h3 className="text-white font-bold text-sm uppercase tracking-wide">
            {typeLabel} — You've Been Assigned
          </h3>
        </div>
        <button
          onClick={() => setVisible(false)}
          className="text-green-200 hover:text-white transition-colors"
          aria-label="Close"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="p-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-500 font-medium uppercase">Dispatch ID</p>
            <p className="text-sm font-mono text-gray-800 mt-0.5">
              {assignment.dispatchId?.slice(0, 12)}...
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 font-medium uppercase">Incident Location</p>
            <p className="text-sm text-gray-800 mt-0.5">
              {assignment.incidentLat?.toFixed(4)}, {assignment.incidentLng?.toFixed(4)}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 font-medium uppercase">Distance</p>
            <p className="text-sm font-semibold text-gray-800 mt-0.5">{distanceText}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 font-medium uppercase">ETA</p>
            <p className="text-sm font-semibold text-gray-800 mt-0.5">{etaText}</p>
          </div>
          {assignment.route?.provider && (
            <div>
              <p className="text-xs text-gray-500 font-medium uppercase">Route Provider</p>
              <p className="text-sm text-gray-800 mt-0.5 capitalize">{assignment.route.provider}</p>
            </div>
          )}
          {assignment.hospitalId && (
            <div>
              <p className="text-xs text-gray-500 font-medium uppercase">Destination Hospital</p>
              <p className="text-sm font-mono text-gray-800 mt-0.5">
                {assignment.hospitalId.slice(0, 12)}...
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 mt-4 pt-3 border-t border-green-200">
          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <span className="text-xs text-green-700 font-medium">
            Assigned at {new Date(assignment.timestamp).toLocaleTimeString()}
          </span>
        </div>
      </div>
    </div>
  );
}

export default DispatchAssignmentHandler;
