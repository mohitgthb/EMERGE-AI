import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
  cameraApi,
  signalApi,
} from '@/services/api';

// ─── Query Keys ──────────────────────────────────────────────────────────────
export const queryKeys = {
  accidents: ['accidents'] as const,
  fireIncidents: ['fireIncidents'] as const,
  sosEvents: ['sosEvents'] as const,
  ambulances: ['ambulances'] as const,
  hospitals: ['hospitals'] as const,
  fireBrigades: ['fireBrigades'] as const,
  policeUnits: ['policeUnits'] as const,
  dispatches: ['dispatches'] as const,
  analytics: ['analytics'] as const,
  queue: ['queue'] as const,
  queueStats: ['queueStats'] as const,
  cameras: ['cameras'] as const,
  signals: ['signals'] as const,
};

// ─── Queries ─────────────────────────────────────────────────────────────────
export const useAccidents = () =>
  useQuery({ queryKey: queryKeys.accidents, queryFn: accidentApi.list, refetchInterval: 30000, staleTime: 10000 });

export const useFireIncidents = () =>
  useQuery({ queryKey: queryKeys.fireIncidents, queryFn: fireApi.list, refetchInterval: 30000, staleTime: 10000 });

export const useSOSEvents = (params?: { status?: string; emergencyType?: string }) =>
  useQuery({ queryKey: [...queryKeys.sosEvents, params], queryFn: () => sosApi.list(params), refetchInterval: 15000, staleTime: 5000 });

export const useAmbulances = () =>
  useQuery({ queryKey: queryKeys.ambulances, queryFn: ambulanceApi.list, refetchInterval: 10000, staleTime: 5000 });

export const useHospitals = () =>
  useQuery({ queryKey: queryKeys.hospitals, queryFn: hospitalApi.list, refetchInterval: 60000, staleTime: 30000 });

export const useFireBrigades = (params?: { status?: string }) =>
  useQuery({ queryKey: [...queryKeys.fireBrigades, params], queryFn: () => fireBrigadeApi.list(params), refetchInterval: 10000, staleTime: 5000 });

export const usePoliceUnits = (params?: { status?: string }) =>
  useQuery({ queryKey: [...queryKeys.policeUnits, params], queryFn: () => policeApi.list(params), refetchInterval: 10000, staleTime: 5000 });

export const useDispatches = () =>
  useQuery({ queryKey: queryKeys.dispatches, queryFn: dispatchApi.list, refetchInterval: 15000, staleTime: 10000 });

export const useAnalytics = () =>
  useQuery({ queryKey: queryKeys.analytics, queryFn: dispatchApi.analytics, refetchInterval: 15000, staleTime: 10000 });

export const useQueue = (params?: { status?: string; emergencyType?: string }) =>
  useQuery({ queryKey: [...queryKeys.queue, params], queryFn: () => queueApi.list(params), refetchInterval: 10000, staleTime: 5000 });

export const useQueueStats = () =>
  useQuery({ queryKey: queryKeys.queueStats, queryFn: queueApi.stats, refetchInterval: 10000, staleTime: 5000 });

export const useCameras = () =>
  useQuery({ queryKey: queryKeys.cameras, queryFn: cameraApi.list, refetchInterval: 60000, staleTime: 30000 });

export const useSignals = () =>
  useQuery({ queryKey: queryKeys.signals, queryFn: signalApi.list, refetchInterval: 30000, staleTime: 15000 });

// ─── Mutations ───────────────────────────────────────────────────────────────
export const useTriggerSOS = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: sosApi.trigger,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.sosEvents });
      qc.invalidateQueries({ queryKey: queryKeys.analytics });
    },
  });
};

export const useVerifySOS = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sosEventId, data }: { sosEventId: string; data: { isConfirmed: boolean; notes?: string } }) =>
      sosApi.verify(sosEventId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.sosEvents });
    },
  });
};

export const useEscalateSOS = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: sosApi.escalate,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.sosEvents });
    },
  });
};

export const useUpdateAmbulanceStatus = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ambulanceApi.updateStatus,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.ambulances });
      qc.invalidateQueries({ queryKey: queryKeys.dispatches });
    },
  });
};

export const useUpdateFireBrigadeStatus = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { status?: string; latitude?: number; longitude?: number } }) =>
      fireBrigadeApi.updateStatus(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.fireBrigades });
    },
  });
};

export const useUpdatePoliceStatus = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { status?: string; latitude?: number; longitude?: number } }) =>
      policeApi.updateStatus(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.policeUnits });
    },
  });
};

export const useReviewQueue = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { action: 'CONFIRM' | 'REJECT' | 'ESCALATE'; assignedTo?: string; newSeverity?: string } }) =>
      queueApi.review(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.queue });
      qc.invalidateQueries({ queryKey: queryKeys.queueStats });
      qc.invalidateQueries({ queryKey: queryKeys.analytics });
    },
  });
};
