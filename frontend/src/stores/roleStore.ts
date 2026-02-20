import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type UserRole = 'public' | 'ambulance' | 'hospital' | 'fire_brigade' | 'police' | 'admin';

interface RoleState {
  currentRole: UserRole;
  setRole: (role: UserRole) => void;
}

export const useRoleStore = create<RoleState>()(
  persist(
    (set) => ({
      currentRole: 'public',
      setRole: (role) => set({ currentRole: role }),
    }),
    { name: 'emerge-ai-role' }
  )
);
