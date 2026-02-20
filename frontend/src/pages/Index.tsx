import { KPICard } from '@/components/KPICard';
import { LiveFeed } from '@/components/LiveFeed';
import { IncidentChart, StatusDistributionChart } from '@/components/Charts';
import { useEmergencyStore } from '@/stores/emergencyStore';
import { LoadingState, BackendUnavailable } from '@/components/ErrorBoundary';
import { AlertTriangle, CheckCircle, Clock, Users, Siren, Activity } from 'lucide-react';

const Dashboard = () => {
  const { analytics, accidents, fireIncidents, sosEvents, ambulances, fireBrigades, policeUnits, loading, connected } = useEmergencyStore();

  if (loading && !analytics) return <LoadingState label="Loading dashboard..." />;
  if (!connected && !analytics && !loading) return <BackendUnavailable />;

  const kpi = analytics ?? {
    totalIncidents: accidents.length + fireIncidents.length,
    pendingSOS: sosEvents.filter((s) => s.status === 'PENDING').length,
    totalAccidents: accidents.length,
    totalFires: fireIncidents.length,
    totalSOS: sosEvents.length,
    unitsAvailable: ambulances.filter((a) => a.status === 'AVAILABLE').length
      + fireBrigades.filter((f) => f.status === 'AVAILABLE').length
      + policeUnits.filter((p) => p.status === 'AVAILABLE').length,
    unitsBusy: ambulances.filter((a) => a.status !== 'AVAILABLE').length
      + fireBrigades.filter((f) => f.status !== 'AVAILABLE').length
      + policeUnits.filter((p) => p.status !== 'AVAILABLE').length,
    totalBeds: 0,
    avgResponseTime: 0,
    ambulances: ambulances.length,
    fireBrigades: fireBrigades.length,
    policeUnits: policeUnits.length,
    pendingQueue: 0,
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-foreground">Operations Dashboard</h2>
        <p className="text-xs text-muted-foreground font-mono mt-1">
          REAL-TIME OVERVIEW • LAST UPDATED: {new Date().toLocaleTimeString('en-US', { hour12: false })}
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <KPICard title="Active Incidents" value={kpi.totalIncidents} icon={Activity} variant="warning" />
        <KPICard title="Pending SOS" value={kpi.pendingSOS} icon={AlertTriangle} variant="critical" />
        <KPICard title="Dispatches" value={kpi.totalAccidents + kpi.totalFires} icon={Siren} />
        <KPICard title="Avg Response" value={kpi.avgResponseTime > 0 ? `${kpi.avgResponseTime.toFixed(1)}m` : 'N/A'} icon={Clock} subtitle="minutes" />
        <KPICard title="Units Available" value={kpi.unitsAvailable} icon={Users} variant="success" />
        <KPICard title="Units Busy" value={kpi.unitsBusy} icon={CheckCircle} variant="warning" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <IncidentChart />
          <StatusDistributionChart />
        </div>
        <div>
          <LiveFeed />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
