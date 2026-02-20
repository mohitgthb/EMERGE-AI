import { useState, useEffect } from 'react';
import { KPICard } from '@/components/KPICard';
import { LiveFeed } from '@/components/LiveFeed';
import { IncidentChart, StatusDistributionChart } from '@/components/Charts';
import { ReusableMap } from '@/components/ReusableMap';
import { EvidenceViewer } from '@/components/EvidenceViewer';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { ReassignmentMonitor } from '@/components/ReassignmentMonitor';
import { useRoleStore, type UserRole } from '@/stores/roleStore';
import { useEmergencyStore } from '@/stores/emergencyStore';
import { LoadingState, EmptyState, BackendUnavailable } from '@/components/ErrorBoundary';
import { mediaUrl, authApi, dispatchApi } from '@/services/api';
import type { MapMarker, Operator, DispatchesResponse, Ambulance, FireBrigade, PoliceUnit } from '@/types';
import {
  Activity, AlertTriangle, Siren, Clock, Users, CheckCircle,
  Settings, Plus, Trash2, Edit, UserPlus, Navigation, MapPin, Truck, Flame, Shield,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { DemoModeToggle } from '@/components/DemoModeToggle';

const allRoles: { value: UserRole; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'ambulance', label: 'Ambulance' },
  { value: 'hospital', label: 'Hospital' },
  { value: 'fire_brigade', label: 'Fire Brigade' },
  { value: 'police', label: 'Police' },
];

type VehicleRow = { id: string; callSign: string; type: string; status: string };

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<'overview' | 'vehicles' | 'dispatches' | 'operators' | 'roles' | 'analytics'>('overview');
  const { accidents, fireIncidents, sosEvents, ambulances, fireBrigades, policeUnits, dispatches, analytics, loading, connected } = useEmergencyStore();

  if (loading && !analytics) return <LoadingState label="Loading admin data..." />;
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

  const mapMarkers: MapMarker[] = [
    ...accidents.map((a) => ({
      id: a.id, lat: a.latitude, lng: a.longitude,
      label: a.emergencyType || 'Accident',
      color: a.severity === 'CRITICAL' ? '#ef4444' : a.severity === 'HIGH' ? '#f59e0b' : '#3b82f6',
    })),
    ...fireIncidents.map((f) => ({
      id: f.id, lat: f.latitude, lng: f.longitude,
      label: 'Fire', color: '#ef4444', icon: '??',
    })),
    ...sosEvents.filter((s) => s.status === 'PENDING').map((s) => ({
      id: s.id, lat: s.latitude, lng: s.longitude,
      label: s.emergencyType, color: '#f59e0b', icon: '??',
    })),
    ...ambulances.map((a) => ({
      id: a.id, lat: a.latitude, lng: a.longitude,
      label: a.vehicleNo, color: '#3b82f6', icon: '??',
    })),
    ...fireBrigades.map((f) => ({
      id: f.id, lat: f.latitude, lng: f.longitude,
      label: f.vehicleNo, color: '#ef4444', icon: '??',
    })),
    ...policeUnits.map((p) => ({
      id: p.id, lat: p.latitude, lng: p.longitude,
      label: p.vehicleNo, color: '#a855f7', icon: '??',
    })),
  ];

  const allVehicles: VehicleRow[] = [
    ...ambulances.map((a) => ({ id: a.id, callSign: a.vehicleNo, type: 'ambulance', status: a.status })),
    ...fireBrigades.map((f) => ({ id: f.id, callSign: f.vehicleNo, type: 'fire_brigade', status: f.status })),
    ...policeUnits.map((p) => ({ id: p.id, callSign: p.vehicleNo, type: 'police', status: p.status })),
  ];

  const evidence = sosEvents
    .filter((s) => s.imageUrl)
    .map((s) => ({
      id: s.id, incidentId: s.id, type: 'image' as const,
      url: mediaUrl(s.imageUrl), timestamp: s.createdAt,
      confidence: 90, severity: s.severity.toLowerCase() as 'critical' | 'high' | 'medium' | 'low',
      description: `SOS: ${s.emergencyType} (${s.status})`,
    }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Settings className="w-5 h-5 text-primary" /> Admin Control Center
          </h2>
          <p className="text-xs text-muted-foreground font-mono mt-1">MASTER VIEW � ALL SYSTEMS</p>
        </div>
        <div className="flex items-center gap-3">
          <DemoModeToggle compact />
          {[
            { label: 'API', ok: connected },
            { label: 'Sockets', ok: connected },
            { label: 'AI Engine', ok: true },
            { label: 'DB', ok: connected },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-1.5">
              <span className={cn('w-2 h-2 rounded-full', s.ok ? 'bg-status-success' : 'bg-status-critical')} />
              <span className="text-[10px] font-mono text-muted-foreground">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2 border-b pb-2">
        {(['overview', 'vehicles', 'dispatches', 'operators', 'roles', 'analytics'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'px-4 py-2 rounded-md text-xs font-medium transition-colors capitalize',
              activeTab === tab ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            <KPICard title="Active Incidents" value={kpi.totalIncidents} icon={Activity} variant="warning" />
            <KPICard title="Pending SOS" value={kpi.pendingSOS} icon={AlertTriangle} variant="critical" />
            <KPICard title="Total Dispatches" value={kpi.totalAccidents + kpi.totalFires} icon={Siren} />
            <KPICard title="Avg Response" value={kpi.avgResponseTime > 0 ? `${kpi.avgResponseTime.toFixed(1)}m` : 'N/A'} icon={Clock} subtitle="minutes" />
            <KPICard title="Units Available" value={kpi.unitsAvailable} icon={Users} variant="success" />
            <KPICard title="Units Busy" value={kpi.unitsBusy} icon={CheckCircle} variant="warning" />
          </div>
          {/* System-wide Reassignment Monitor */}
          <ReassignmentMonitor maxEvents={10} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ReusableMap markers={mapMarkers} height="400px" />
            <LiveFeed />
          </div>
        </>
      )}

      {activeTab === 'vehicles' && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-foreground">All Vehicle Status</h3>
          {allVehicles.length === 0 ? (
            <EmptyState title="No vehicles" description="No emergency vehicles registered." />
          ) : (
            <div className="rounded-lg border bg-card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-secondary/50">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Vehicle No</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Type</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {allVehicles.map((v) => (
                    <tr key={v.id} className="hover:bg-accent/30 transition-colors">
                      <td className="px-4 py-3 font-mono font-semibold text-foreground">{v.callSign}</td>
                      <td className="px-4 py-3 text-muted-foreground capitalize">{v.type.replace('_', ' ')}</td>
                      <td className="px-4 py-3">
                        <StatusBadge variant={v.status.toLowerCase() as any}>{v.status.replace('_', ' ')}</StatusBadge>
                      </td>
                      <td className="px-4 py-3">
                        <Button size="sm" variant="outline" className="text-[11px]">Assign</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'operators' && (
        <OperatorManagement allVehicles={allVehicles} />
      )}

      {activeTab === 'dispatches' && (
        <DispatchesTab dispatches={dispatches} ambulances={ambulances} fireBrigades={fireBrigades} policeUnits={policeUnits} />
      )}

      {activeTab === 'roles' && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Role Assignment Panel</h3>
          <p className="text-xs text-muted-foreground">Assign roles to devices/users. No signup required � roles are backend-configured.</p>
          <div className="rounded-lg border bg-card p-4 space-y-3">
            {[
              { device: 'MH-12-AMB-001 (Rajesh Patil)', currentRole: 'ambulance' },
              { device: 'Ruby Hall Clinic', currentRole: 'hospital' },
              { device: 'MH-12-FB-001 (Nilesh Bhosale)', currentRole: 'fire_brigade' },
              { device: 'MH-12-POL-001 (Insp. Patil)', currentRole: 'police' },
              { device: 'ADMIN-001 (System Admin)', currentRole: 'admin' },
            ].map((d) => (
              <div key={d.device} className="flex items-center justify-between p-3 rounded-md bg-secondary/50">
                <div>
                  <p className="text-sm font-medium text-foreground">{d.device}</p>
                  <p className="text-[11px] text-muted-foreground capitalize">{d.currentRole.replace('_', ' ')}</p>
                </div>
                <select className="bg-background border rounded-md px-3 py-1.5 text-xs text-foreground" defaultValue={d.currentRole}>
                  {allRoles.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'analytics' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <IncidentChart />
            <StatusDistributionChart />
          </div>
          {evidence.length > 0 && <EvidenceViewer items={evidence} />}
        </div>
      )}
    </div>
  );
}

// ─── Operator Management Component ──────────────────────────────────────────
function OperatorManagement({ allVehicles }: { allVehicles: { id: string; callSign: string; type: string; status: string }[] }) {
  const [operators, setOperators] = useState<Operator[]>([]);
  const [loadingOps, setLoadingOps] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ operatorId: '', password: '', name: '', role: 'AMBULANCE', vehicleId: '' });
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchOperators = async () => {
    setLoadingOps(true);
    try {
      const data = await authApi.listOperators();
      setOperators(data);
    } catch (err: any) {
      console.error('Failed to load operators:', err);
    } finally {
      setLoadingOps(false);
    }
  };

  useEffect(() => { fetchOperators(); }, []);

  const roleVehicles = allVehicles.filter((v) => {
    if (form.role === 'AMBULANCE') return v.type === 'ambulance';
    if (form.role === 'FIRE_BRIGADE') return v.type === 'fire_brigade';
    if (form.role === 'POLICE') return v.type === 'police';
    return false;
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSaving(true);

    try {
      if (editingId) {
        const updateData: any = { name: form.name, role: form.role, vehicleId: form.vehicleId || undefined };
        if (form.password) updateData.password = form.password;
        await authApi.updateOperator(editingId, updateData);
      } else {
        if (!form.password) { setFormError('Password is required'); setSaving(false); return; }
        await authApi.createOperator({
          operatorId: form.operatorId,
          password: form.password,
          name: form.name,
          role: form.role,
          vehicleId: form.vehicleId || undefined,
        });
      }
      setShowForm(false);
      setEditingId(null);
      setForm({ operatorId: '', password: '', name: '', role: 'AMBULANCE', vehicleId: '' });
      await fetchOperators();
    } catch (err: any) {
      setFormError(err?.response?.data?.message || 'Failed to save operator');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this operator?')) return;
    try {
      await authApi.deleteOperator(id);
      await fetchOperators();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Failed to delete');
    }
  };

  const startEdit = (op: Operator) => {
    setEditingId(op.id);
    setForm({
      operatorId: op.operatorId,
      password: '',
      name: op.name,
      role: op.role,
      vehicleId: op.vehicleId || '',
    });
    setShowForm(true);
    setFormError(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Operator Accounts</h3>
          <p className="text-xs text-muted-foreground">Add vehicle operators with login credentials. Each operator is linked to a specific vehicle.</p>
        </div>
        <Button
          size="sm"
          onClick={() => { setShowForm(true); setEditingId(null); setForm({ operatorId: '', password: '', name: '', role: 'AMBULANCE', vehicleId: '' }); setFormError(null); }}
          className="text-xs"
        >
          <UserPlus className="w-3.5 h-3.5 mr-1.5" />
          Add Operator
        </Button>
      </div>

      {/* Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-lg border bg-card p-5 space-y-4">
          <h4 className="text-sm font-semibold text-foreground">{editingId ? 'Edit Operator' : 'New Operator'}</h4>

          {formError && (
            <div className="p-2.5 rounded-md bg-destructive/10 text-destructive text-xs">{formError}</div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Operator ID (login username)</label>
              <input
                value={form.operatorId}
                onChange={(e) => setForm({ ...form, operatorId: e.target.value })}
                required
                disabled={!!editingId}
                placeholder="e.g. AMB-001"
                className="w-full px-3 py-2 rounded-md border bg-background text-sm font-mono disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Password {editingId && '(leave blank to keep)'}
              </label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required={!editingId}
                placeholder={editingId ? 'Unchanged' : 'Enter password'}
                className="w-full px-3 py-2 rounded-md border bg-background text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                placeholder="Operator full name"
                className="w-full px-3 py-2 rounded-md border bg-background text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Role</label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value, vehicleId: '' })}
                className="w-full px-3 py-2 rounded-md border bg-background text-sm"
              >
                <option value="AMBULANCE">Ambulance</option>
                <option value="FIRE_BRIGADE">Fire Brigade</option>
                <option value="POLICE">Police</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>
            {form.role !== 'ADMIN' && (
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-muted-foreground mb-1">Assign to Vehicle</label>
                <select
                  value={form.vehicleId}
                  onChange={(e) => setForm({ ...form, vehicleId: e.target.value })}
                  className="w-full px-3 py-2 rounded-md border bg-background text-sm"
                >
                  <option value="">-- Select vehicle --</option>
                  {roleVehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.callSign} ({v.status})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => { setShowForm(false); setEditingId(null); }}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {/* Operators list */}
      {loadingOps ? (
        <LoadingState message="Loading operators..." />
      ) : operators.length === 0 ? (
        <EmptyState message="No operators" description="Add operators to assign vehicle login credentials." />
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-secondary/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Operator ID</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Role</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Vehicle</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Active</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {operators.map((op) => (
                <tr key={op.id} className="hover:bg-accent/30 transition-colors">
                  <td className="px-4 py-3 font-mono font-semibold text-foreground">{op.operatorId}</td>
                  <td className="px-4 py-3 text-foreground">{op.name}</td>
                  <td className="px-4 py-3">
                    <StatusBadge variant={op.role === 'ADMIN' ? 'active' : op.role === 'AMBULANCE' ? 'en_route' : 'busy'}>
                      {op.role.replace('_', ' ')}
                    </StatusBadge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                    {(op.vehicle as any)?.vehicleNo || op.vehicleId?.slice(0, 8) || '-'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('w-2 h-2 rounded-full inline-block', op.isActive ? 'bg-status-success' : 'bg-status-critical')} />
                  </td>
                  <td className="px-4 py-3 flex gap-1.5">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => startEdit(op)}>
                      <Edit className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => handleDelete(op.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Dispatches Tab ─────────────────────────────────────────────────
const dStatusConfig: Record<string, { label: string; variant: string; icon: typeof Activity; pulse?: boolean }> = {
  ACTIVE: { label: 'Active', variant: 'active', icon: Activity },
  EN_ROUTE: { label: 'En Route', variant: 'en_route', icon: Navigation, pulse: true },
  ARRIVED: { label: 'Arrived', variant: 'arrived', icon: MapPin },
  COMPLETED: { label: 'Completed', variant: 'completed', icon: CheckCircle },
  FAILED_ASSIGNMENT: { label: 'Failed', variant: 'critical', icon: AlertTriangle },
  REASSIGNED: { label: 'Reassigned', variant: 'warning', icon: Activity },
};

function DispatchesTab({
  dispatches,
  ambulances,
  fireBrigades,
  policeUnits,
}: {
  dispatches: DispatchesResponse | null;
  ambulances: Ambulance[];
  fireBrigades: FireBrigade[];
  policeUnits: PoliceUnit[];
}) {
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');
  const [dispatchingId, setDispatchingId] = useState<string | null>(null);
  const [dispatchError, setDispatchError] = useState<string | null>(null);
  const { accidents, fireIncidents, fetchDispatches, fetchAmbulances, fetchAccidents } = useEmergencyStore();

  // Find undispatched accidents (no dispatch record)
  const dispatchedAccidentIds = new Set(
    dispatches?.accidentDispatches.map((d) => d.accidentId || d.accident?.id).filter(Boolean) ?? []
  );
  const undispatchedAccidents = accidents.filter((a) => !dispatchedAccidentIds.has(a.id) && !a.dispatch);

  const handleDispatchNow = async (accidentId: string) => {
    setDispatchingId(accidentId);
    setDispatchError(null);
    try {
      await dispatchApi.create({ accidentId });
      // Refresh data after successful dispatch
      await Promise.all([fetchDispatches(), fetchAmbulances(), fetchAccidents()]);
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Dispatch failed';
      setDispatchError(`${accidentId.slice(0, 8)}… : ${msg}`);
    } finally {
      setDispatchingId(null);
    }
  };

  if (!dispatches) return <EmptyState message="No dispatch data" description="Waiting for data from backend." />;

  // Combine all dispatch types into a unified list
  type UnifiedDispatch = {
    id: string;
    type: 'ACCIDENT' | 'FIRE' | 'POLICE';
    status: string;
    vehicleNo: string;
    vehicleStatus: string;
    incidentInfo: string;
    startTime: string;
    endtime: string | null;
  };

  const unified: UnifiedDispatch[] = [
    ...dispatches.accidentDispatches.map((d) => {
      const amb = ambulances.find((a) => a.id === d.ambulanceId) || d.ambulance;
      return {
        id: d.id,
        type: 'ACCIDENT' as const,
        status: d.status,
        vehicleNo: amb?.vehicleNo || 'Unknown',
        vehicleStatus: amb?.status || 'UNKNOWN',
        incidentInfo: `${d.accident?.emergencyType || 'Accident'} - ${d.accident?.severity || 'N/A'}`,
        startTime: d.startTime,
        endtime: d.endtime,
      };
    }),
    ...dispatches.fireDispatches.map((d) => {
      const fb = fireBrigades.find((f) => f.id === d.fireBrigadeId) || d.fireBrigade;
      return {
        id: d.id,
        type: 'FIRE' as const,
        status: d.status,
        vehicleNo: fb?.vehicleNo || 'Unknown',
        vehicleStatus: fb?.status || 'UNKNOWN',
        incidentInfo: `Fire - ${d.fireIncident?.severity || 'N/A'}`,
        startTime: d.startTime,
        endtime: d.endtime,
      };
    }),
    ...dispatches.policeDispatches.map((d) => {
      const pu = policeUnits.find((p) => p.id === d.policeUnitId) || d.policeUnit;
      return {
        id: d.id,
        type: 'POLICE' as const,
        status: d.status,
        vehicleNo: pu?.vehicleNo || 'Unknown',
        vehicleStatus: pu?.status || 'UNKNOWN',
        incidentInfo: `Crime - ${d.sosEvent?.severity || 'N/A'}`,
        startTime: d.startTime,
        endtime: d.endtime,
      };
    }),
  ].sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

  const filtered = unified.filter((d) => {
    if (filter === 'active') return d.status !== 'COMPLETED';
    if (filter === 'completed') return d.status === 'COMPLETED';
    return true;
  });

  const typeIcons: Record<string, typeof Truck> = { ACCIDENT: Truck, FIRE: Flame, POLICE: Shield };
  const typeColors: Record<string, string> = { ACCIDENT: 'text-blue-400', FIRE: 'text-orange-400', POLICE: 'text-purple-400' };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">All Dispatches</h3>
          <p className="text-xs text-muted-foreground">
            {unified.filter((d) => d.status !== 'COMPLETED').length} active, {unified.filter((d) => d.status === 'COMPLETED').length} completed
          </p>
        </div>
        <div className="flex gap-1">
          {(['all', 'active', 'completed'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-colors',
                filter === f ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* ── Undispatched Incidents ── */}
      {undispatchedAccidents.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <h4 className="text-sm font-semibold text-foreground">
              Undispatched Accidents ({undispatchedAccidents.length})
            </h4>
          </div>
          {dispatchError && (
            <div className="p-2 rounded-md bg-destructive/10 text-destructive text-xs">{dispatchError}</div>
          )}
          <div className="space-y-2">
            {undispatchedAccidents.map((a) => (
              <div key={a.id} className="flex items-center justify-between p-3 rounded-md bg-secondary/50">
                <div className="flex items-center gap-3">
                  <Truck className="w-4 h-4 text-blue-400" />
                  <div>
                    <p className="text-xs font-mono font-semibold text-foreground">{a.id.slice(0, 8)}…</p>
                    <p className="text-[11px] text-muted-foreground">
                      {a.emergencyType} · {a.severity} · {new Date(a.createdAt).toLocaleTimeString('en-US', { hour12: false })}
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  className="text-xs"
                  disabled={dispatchingId === a.id}
                  onClick={() => handleDispatchNow(a.id)}
                >
                  <Siren className="w-3.5 h-3.5 mr-1.5" />
                  {dispatchingId === a.id ? 'Dispatching...' : 'Dispatch Now'}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState message="No dispatches" description={`No ${filter} dispatches found.`} />
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-secondary/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Type</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Vehicle</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Incident</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Dispatch Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Vehicle Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Started</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Duration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((d) => {
                const cfg = dStatusConfig[d.status] || dStatusConfig.ACTIVE;
                const TypeIcon = typeIcons[d.type] || Truck;
                const elapsed = d.endtime
                  ? Math.round((new Date(d.endtime).getTime() - new Date(d.startTime).getTime()) / 60000)
                  : Math.round((Date.now() - new Date(d.startTime).getTime()) / 60000);

                return (
                  <tr key={d.id} className="hover:bg-accent/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <TypeIcon className={cn('w-4 h-4', typeColors[d.type])} />
                        <span className="text-xs font-semibold uppercase">{d.type}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono font-semibold text-foreground">{d.vehicleNo}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{d.incidentInfo}</td>
                    <td className="px-4 py-3">
                      <StatusBadge variant={cfg.variant as any} pulse={cfg.pulse}>
                        {cfg.label}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge variant={d.vehicleStatus.toLowerCase() as any}>
                        {d.vehicleStatus.replace('_', ' ')}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                      {new Date(d.startTime).toLocaleTimeString('en-US', { hour12: false })}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        'text-xs font-mono',
                        d.endtime ? 'text-muted-foreground' : 'text-amber-400'
                      )}>
                        {elapsed}m {d.endtime ? '' : '(ongoing)'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
