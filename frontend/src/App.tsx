import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect } from "react";
import { useInactivityTimeout } from "@/hooks/useInactivityTimeout";
import AppLayout from "@/components/AppLayout";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { GlobalAlertProvider } from "@/components/GlobalAlertProvider";
import { useRoleStore } from "@/stores/roleStore";
import { useAuthStore } from "@/stores/authStore";
import { useEmergencyStore } from "@/stores/emergencyStore";import { useDemoStore } from '@/stores/demoStore';import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import MapPage from "./pages/MapPage";
import SOSPage from "./pages/SOSPage";
import DispatchPage from "./pages/DispatchPage";
import AmbulanceDashboard from "./pages/AmbulanceDashboard";
import HospitalDashboard from "./pages/HospitalDashboard";
import FireBrigadeDashboard from "./pages/FireBrigadeDashboard";
import PoliceDashboard from "./pages/PoliceDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import DemoPage from "./pages/DemoPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      refetchOnWindowFocus: false,
      staleTime: 10000,
    },
  },
});

function AppInit() {
  const initSocket = useEmergencyStore((s) => s.initSocket);
  const fetchAll = useEmergencyStore((s) => s.fetchAll);
  const checkAuth = useAuthStore((s) => s.checkAuth);
  const joinVehicleRoom = useAuthStore((s) => s.joinVehicleRoom);
  const initDemoSocket = useDemoStore((s) => s.initDemoSocket);
  const fetchDemoStatus = useDemoStore((s) => s.fetchStatus);

  // Auto-logout on 30 min inactivity
  useInactivityTimeout();

  useEffect(() => {
    initSocket();
    // Authenticate first so fetchAll sends the JWT token,
    // allowing the backend to scope dispatches by vehicleId
    checkAuth().then(() => {
      joinVehicleRoom();
      fetchAll();
      // Initialize demo simulation socket listeners and sync status
      initDemoSocket();
      fetchDemoStatus();
    });
  }, [initSocket, fetchAll, checkAuth, joinVehicleRoom, initDemoSocket, fetchDemoStatus]);

  return null;
}

/**
 * Determines which dashboard to show based on:
 * 1. If an operator is logged in → show their role-specific dashboard
 * 2. Otherwise fall back to the role-store (legacy role picker)
 */
function RoleDashboard() {
  const { isAuthenticated, operator } = useAuthStore();
  const role = useRoleStore((s) => s.currentRole);

  // If operator is logged in, use their role
  if (isAuthenticated && operator) {
    switch (operator.role) {
      case 'AMBULANCE': return <AmbulanceDashboard />;
      case 'HOSPITAL': return <HospitalDashboard />;
      case 'FIRE_BRIGADE': return <FireBrigadeDashboard />;
      case 'POLICE': return <PoliceDashboard />;
      case 'ADMIN': return <AdminDashboard />;
      default: return <AmbulanceDashboard />;
    }
  }

  // Fallback to role store selection
  switch (role) {
    case 'ambulance': return <AmbulanceDashboard />;
    case 'hospital': return <HospitalDashboard />;
    case 'fire_brigade': return <FireBrigadeDashboard />;
    case 'police': return <PoliceDashboard />;
    case 'admin': return <AdminDashboard />;
    default: return <AdminDashboard />;
  }
}

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} storageKey="emerge-theme">
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <ErrorBoundary>
        <GlobalAlertProvider>
        <BrowserRouter>
          <AppInit />
          <AppLayout>
            <Routes>
              <Route path="/" element={<LandingPageWrapper />} />
              <Route path="/login" element={<LoginGuard />} />
              <Route path="/dashboard" element={<RoleDashboard />} />
              <Route path="/map" element={<MapPage />} />
              <Route path="/sos" element={<SOSPage />} />
              <Route path="/dispatch" element={<DispatchPage />} />
              <Route path="/demo" element={<DemoPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AppLayout>
        </BrowserRouter>
        </GlobalAlertProvider>
      </ErrorBoundary>
    </TooltipProvider>
  </QueryClientProvider>
  </ThemeProvider>
);

function LandingPageWrapper() {
  const role = useRoleStore((s) => s.currentRole);
  if (role !== 'public') {
    return <RoleDashboard />;
  }
  return <LandingPage />;
}

/** Redirect to dashboard if already logged in, otherwise show login */
function LoginGuard() {
  const { isAuthenticated } = useAuthStore();
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }
  return <LoginPage />;
}

export default App;
