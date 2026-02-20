import { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { useEmergencyStore } from '@/stores/emergencyStore';

export function IncidentChart() {
  const { accidents, fireIncidents, sosEvents } = useEmergencyStore();

  const chartData = useMemo(() => {
    const buckets: Record<string, { hour: string; accident: number; fire: number; sos: number }> = {};
    const hours = Array.from({ length: 12 }, (_, i) => {
      const h = (i * 2).toString().padStart(2, '0') + ':00';
      buckets[h] = { hour: h, accident: 0, fire: 0, sos: 0 };
      return h;
    });

    const bucket = (iso: string) => {
      const d = new Date(iso);
      const h = Math.floor(d.getHours() / 2) * 2;
      return h.toString().padStart(2, '0') + ':00';
    };

    accidents.forEach((a) => { const k = bucket(a.createdAt); if (buckets[k]) buckets[k].accident++; });
    fireIncidents.forEach((f) => { const k = bucket(f.createdAt); if (buckets[k]) buckets[k].fire++; });
    sosEvents.forEach((s) => { const k = bucket(s.createdAt); if (buckets[k]) buckets[k].sos++; });

    return hours.map((h) => buckets[h]);
  }, [accidents, fireIncidents, sosEvents]);

  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="text-sm font-semibold text-foreground mb-4">Incidents by Type (Today)</h3>
      <ResponsiveContainer width="100%" height={250}>
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="accidentGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(38, 92%, 50%)" stopOpacity={0.3} />
              <stop offset="100%" stopColor="hsl(38, 92%, 50%)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="fireGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(0, 72%, 51%)" stopOpacity={0.3} />
              <stop offset="100%" stopColor="hsl(0, 72%, 51%)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="sosGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(262, 83%, 58%)" stopOpacity={0.3} />
              <stop offset="100%" stopColor="hsl(262, 83%, 58%)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 14%, 16%)" />
          <XAxis dataKey="hour" tick={{ fontSize: 11, fill: 'hsl(215, 12%, 50%)' }} axisLine={false} />
          <YAxis tick={{ fontSize: 11, fill: 'hsl(215, 12%, 50%)' }} axisLine={false} allowDecimals={false} />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(220, 18%, 10%)',
              border: '1px solid hsl(220, 14%, 16%)',
              borderRadius: '8px',
              fontSize: '12px',
              color: 'hsl(210, 20%, 90%)',
            }}
          />
          <Area type="monotone" dataKey="accident" stroke="hsl(38, 92%, 50%)" fill="url(#accidentGrad)" strokeWidth={2} />
          <Area type="monotone" dataKey="fire" stroke="hsl(0, 72%, 51%)" fill="url(#fireGrad)" strokeWidth={2} />
          <Area type="monotone" dataKey="sos" stroke="hsl(262, 83%, 58%)" fill="url(#sosGrad)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
      <div className="flex items-center gap-4 mt-3 justify-center">
        {[
          { label: 'Accident', color: 'bg-status-warning' },
          { label: 'Fire', color: 'bg-status-critical' },
          { label: 'SOS', color: 'bg-status-pending' },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${item.color}`} />
            <span className="text-[11px] text-muted-foreground">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function StatusDistributionChart() {
  const { sosEvents, accidents, fireIncidents } = useEmergencyStore();

  const data = useMemo(() => {
    const pending = sosEvents.filter((s) => s.status === 'PENDING').length;
    const confirmed = sosEvents.filter((s) => s.status === 'CONFIRMED').length
      + accidents.filter((a) => a.queueEntry?.status === 'CONFIRMED').length;
    const escalated = sosEvents.filter((s) => s.status === 'ESCALATED').length;
    const rejected = sosEvents.filter((s) => s.status === 'REJECTED').length;
    const resolved = accidents.filter((a) => a.dispatch?.endtime).length
      + fireIncidents.filter((f) => f.fireDispatch?.length).length;
    return [
      { name: 'Pending', value: pending, fill: 'hsl(38, 92%, 50%)' },
      { name: 'Confirmed', value: confirmed, fill: 'hsl(210, 100%, 52%)' },
      { name: 'Escalated', value: escalated, fill: 'hsl(262, 83%, 58%)' },
      { name: 'Resolved', value: resolved, fill: 'hsl(142, 71%, 45%)' },
      { name: 'Rejected', value: rejected, fill: 'hsl(0, 72%, 51%)' },
    ].filter((d) => d.value > 0);
  }, [sosEvents, accidents, fireIncidents]);

  if (data.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-4">
        <h3 className="text-sm font-semibold text-foreground mb-4">Status Distribution</h3>
        <p className="text-xs text-muted-foreground text-center py-10">No status data yet</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="text-sm font-semibold text-foreground mb-4">Status Distribution</h3>
      <ResponsiveContainer width="100%" height={250}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={90}
            paddingAngle={3}
            dataKey="value"
            stroke="none"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(220, 18%, 10%)',
              border: '1px solid hsl(220, 14%, 16%)',
              borderRadius: '8px',
              fontSize: '12px',
              color: 'hsl(210, 20%, 90%)',
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap items-center gap-3 mt-2 justify-center">
        {data.map((item) => (
          <div key={item.name} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.fill }} />
            <span className="text-[11px] text-muted-foreground">{item.name}</span>
            <span className="text-[11px] font-mono text-foreground">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
