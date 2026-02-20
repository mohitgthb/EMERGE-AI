import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Operator, OperatorRole } from '@/types';
import { authApi } from '@/services/api';
import { getSocket } from '@/services/socket';

interface AuthState {
  token: string | null;
  operator: Operator | null;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;

  login: (operatorId: string, password: string) => Promise<boolean>;
  loginWithVehicle: (vehicleNo: string, password: string) => Promise<boolean>;
  loginWithHospital: (hospitalName: string, password: string) => Promise<boolean>;
  logout: () => void;
  switchAccount: () => void;
  checkAuth: () => Promise<void>;
  joinVehicleRoom: () => void;
  leaveVehicleRoom: () => void;
  joinHospitalRoom: () => void;
  leaveHospitalRoom: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      operator: null,
      isAuthenticated: false,
      loading: false,
      error: null,

      login: async (operatorId: string, password: string) => {
        set({ loading: true, error: null });
        try {
          const result = await authApi.login(operatorId, password);
          localStorage.setItem('emerge-ai-token', result.token);
          set({
            token: result.token,
            operator: result.operator,
            isAuthenticated: true,
            loading: false,
            error: null,
          });

          // Join vehicle-specific socket room
          if (result.operator.vehicleId) {
            const socket = getSocket();
            socket.emit('JOIN_VEHICLE_ROOM', result.operator.vehicleId);
          }

          return true;
        } catch (err: any) {
          const message = err?.response?.data?.message || 'Login failed';
          set({ loading: false, error: message });
          return false;
        }
      },

      loginWithVehicle: async (vehicleNo: string, password: string) => {
        set({ loading: true, error: null });
        try {
          const result = await authApi.vehicleLogin(vehicleNo, password);
          localStorage.setItem('emerge-ai-token', result.token);
          set({
            token: result.token,
            operator: result.operator,
            isAuthenticated: true,
            loading: false,
            error: null,
          });

          if (result.operator.vehicleId) {
            const socket = getSocket();
            socket.emit('JOIN_VEHICLE_ROOM', result.operator.vehicleId);
          }

          return true;
        } catch (err: any) {
          const message = err?.response?.data?.message || 'Login failed';
          set({ loading: false, error: message });
          return false;
        }
      },

      loginWithHospital: async (hospitalName: string, password: string) => {
        set({ loading: true, error: null });
        try {
          const result = await authApi.hospitalLogin(hospitalName, password);
          localStorage.setItem('emerge-ai-token', result.token);
          set({
            token: result.token,
            operator: result.operator,
            isAuthenticated: true,
            loading: false,
            error: null,
          });

          if (result.operator.hospitalId) {
            const socket = getSocket();
            socket.emit('JOIN_HOSPITAL_ROOM', result.operator.hospitalId);
          }

          return true;
        } catch (err: any) {
          const message = err?.response?.data?.message || 'Login failed';
          set({ loading: false, error: message });
          return false;
        }
      },

      logout: () => {
        const { operator } = get();
        // Leave vehicle/hospital room
        if (operator?.vehicleId) {
          try {
            const socket = getSocket();
            socket.emit('LEAVE_VEHICLE_ROOM', operator.vehicleId);
          } catch {}
        }
        if (operator?.hospitalId) {
          try {
            const socket = getSocket();
            socket.emit('LEAVE_HOSPITAL_ROOM', operator.hospitalId);
          } catch {}
        }

        localStorage.removeItem('emerge-ai-token');
        localStorage.removeItem('emerge-ai-last-activity');
        set({
          token: null,
          operator: null,
          isAuthenticated: false,
          error: null,
        });

        authApi.logout().catch(() => {});
      },

      switchAccount: () => {
        // Same as logout but intended for switching to a different vehicle/hospital login
        const { operator } = get();
        if (operator?.vehicleId) {
          try {
            const socket = getSocket();
            socket.emit('LEAVE_VEHICLE_ROOM', operator.vehicleId);
          } catch {}
        }
        if (operator?.hospitalId) {
          try {
            const socket = getSocket();
            socket.emit('LEAVE_HOSPITAL_ROOM', operator.hospitalId);
          } catch {}
        }

        localStorage.removeItem('emerge-ai-token');
        localStorage.removeItem('emerge-ai-last-activity');
        set({
          token: null,
          operator: null,
          isAuthenticated: false,
          error: null,
        });

        authApi.logout().catch(() => {});
      },

      checkAuth: async () => {
        const token = localStorage.getItem('emerge-ai-token');
        if (!token) {
          set({ isAuthenticated: false, operator: null, token: null });
          return;
        }

        try {
          const result = await authApi.me();
          set({
            token,
            operator: result.operator,
            isAuthenticated: true,
          });

          // Re-join vehicle/hospital room on reconnect
          if (result.operator.vehicleId) {
            const socket = getSocket();
            socket.emit('JOIN_VEHICLE_ROOM', result.operator.vehicleId);
          }
          if (result.operator.hospitalId) {
            const socket = getSocket();
            socket.emit('JOIN_HOSPITAL_ROOM', result.operator.hospitalId);
          }
        } catch {
          // Token expired or invalid
          localStorage.removeItem('emerge-ai-token');
          set({ token: null, operator: null, isAuthenticated: false });
        }
      },

      joinVehicleRoom: () => {
        const { operator } = get();
        if (operator?.vehicleId) {
          const socket = getSocket();
          socket.emit('JOIN_VEHICLE_ROOM', operator.vehicleId);
        }
      },

      leaveVehicleRoom: () => {
        const { operator } = get();
        if (operator?.vehicleId) {
          const socket = getSocket();
          socket.emit('LEAVE_VEHICLE_ROOM', operator.vehicleId);
        }
      },

      joinHospitalRoom: () => {
        const { operator } = get();
        if (operator?.hospitalId) {
          const socket = getSocket();
          socket.emit('JOIN_HOSPITAL_ROOM', operator.hospitalId);
        }
      },

      leaveHospitalRoom: () => {
        const { operator } = get();
        if (operator?.hospitalId) {
          const socket = getSocket();
          socket.emit('LEAVE_HOSPITAL_ROOM', operator.hospitalId);
        }
      },
    }),
    {
      name: 'emerge-ai-auth',
      partialize: (state) => ({
        token: state.token,
        operator: state.operator,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
