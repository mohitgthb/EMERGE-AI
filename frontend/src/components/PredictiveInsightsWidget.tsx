import { useState, useEffect, useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { RiskZoneCard } from '@/components/RiskZoneCard';
import { StandbySuggestionPanel } from '@/components/StandbySuggestionPanel';
import { RiskHeatmapLayer } from '@/components/RiskHeatmapLayer';
import { predictiveApi } from '@/services/api';
import { getSocket, SOCKET_EVENTS } from '@/services/socket';
import L from 'leaflet';
import { useTheme } from 'next-themes';
import type { RiskZone, StandbySuggestion } from '@/types';
import {
  Brain, RefreshCcw, Eye, EyeOff, AlertTriangle, TrendingUp, MapPin,
} from 'lucide-react';

interface PredictiveInsightsWidgetProps {
  className?: string;
}

export function PredictiveInsightsWidget({ className }: PredictiveInsightsWidgetProps) {
  const [zones, setZones] = useState<RiskZone[]>([]);
  const [topZones, setTopZones] = useState<RiskZone[]>([]);
  const [suggestions, setSuggestions] = useState<StandbySuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [heatmapVisible, setHeatmapVisible] = useState(true);
  const [expanded, setExpanded] = useState(true);

  // Map ref for heatmap layer
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const { theme } = useTheme();

  const tileUrl =
    theme === 'light'
      ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await predictiveApi.riskData();
      setZones(data.zones || []);
      setTopZones(data.topZones || []);
      setSuggestions(data.suggestions || []);
      setLastUpdated(data.timestamp);
    } catch (err) {
      console.error('[Predictive] Fetch failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRecalculate = async () => {
    setLoading(true);
    try {
      const data = await predictiveApi.recalculate();
      setZones(data.zones || []);
      setTopZones(data.topZones || []);
      setSuggestions(data.suggestions || []);
      setLastUpdated(data.timestamp);
    } catch (err) {
      console.error('[Predictive] Recalculate failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const refreshSuggestions = async () => {
    try {
      const s = await predictiveApi.suggestions();
      setSuggestions(s);
    } catch (err) {
      console.error('[Predictive] Refresh suggestions failed:', err);
    }
  };

  // Initialise map
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    const map = L.map(mapRef.current, {
      center: [18.5204, 73.8567], // Pune default
      zoom: 13,
      zoomControl: true,
    });
    tileRef.current = L.tileLayer(tileUrl, {
      attribution: '&copy; OSM &copy; CARTO',
      maxZoom: 19,
    }).addTo(map);
    mapInstance.current = map;

    return () => {
      map.remove();
      mapInstance.current = null;
      tileRef.current = null;
    };
  }, []);

  // Update tile URL on theme change
  useEffect(() => {
    tileRef.current?.setUrl(tileUrl);
  }, [tileUrl]);

  // Fit map bounds when zones change
  useEffect(() => {
    const map = mapInstance.current;
    if (!map || zones.length === 0) return;
    const bounds = L.latLngBounds(zones.map((z) => [z.centerLat, z.centerLng] as [number, number]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
  }, [zones]);

  // Initial fetch & socket listeners
  useEffect(() => {
    fetchData();

    const socket = getSocket();

    const handleZoneUpdate = (data: any) => {
      if (data.allZones) setZones(data.allZones);
      if (data.zones) setTopZones(data.zones);
      setLastUpdated(data.timestamp);
    };

    const handleSuggestionUpdate = (data: any) => {
      if (data.suggestions) setSuggestions(data.suggestions);
    };

    socket.on(SOCKET_EVENTS.RISK_ZONE_UPDATED, handleZoneUpdate);
    socket.on(SOCKET_EVENTS.STANDBY_SUGGESTION, handleSuggestionUpdate);

    return () => {
      socket.off(SOCKET_EVENTS.RISK_ZONE_UPDATED, handleZoneUpdate);
      socket.off(SOCKET_EVENTS.STANDBY_SUGGESTION, handleSuggestionUpdate);
    };
  }, [fetchData]);

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-primary" />
          <div>
            <h3 className="text-sm font-bold text-foreground">Predictive Emergency Readiness</h3>
            <p className="text-[10px] text-muted-foreground font-mono">
              {lastUpdated ? `Updated: ${new Date(lastUpdated).toLocaleTimeString('en-US', { hour12: false })}` : 'Loading...'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs"
            onClick={() => setHeatmapVisible(!heatmapVisible)}
          >
            {heatmapVisible ? <EyeOff className="w-3.5 h-3.5 mr-1" /> : <Eye className="w-3.5 h-3.5 mr-1" />}
            Heatmap
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            disabled={loading}
            onClick={handleRecalculate}
          >
            <RefreshCcw className={cn('w-3.5 h-3.5 mr-1', loading && 'animate-spin')} />
            {loading ? 'Calculating...' : 'Recalculate'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? 'Collapse' : 'Expand'}
          </Button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-3 gap-3">
        <MiniKPI icon={AlertTriangle} label="Risk Zones" value={zones.length} color="text-amber-400" />
        <MiniKPI icon={TrendingUp} label="Top Score" value={topZones[0]?.riskScore?.toFixed(1) ?? '—'} color="text-red-400" />
        <MiniKPI icon={MapPin} label="Suggestions" value={suggestions.length} color="text-blue-400" />
      </div>

      {expanded && (
        <>
          {/* Heatmap */}
          <div className="rounded-lg border border-border overflow-hidden" style={{ height: '350px' }}>
            <div ref={mapRef} className="w-full h-full" />
          </div>
          <RiskHeatmapLayer map={mapInstance.current} zones={zones} visible={heatmapVisible} />

          {/* Top Risk Zones */}
          {topZones.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Top Risk Zones</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {topZones.slice(0, 3).map((zone, i) => (
                  <RiskZoneCard key={zone.id || zone.gridKey} zone={zone} rank={i + 1} />
                ))}
              </div>
            </div>
          )}

          {/* Standby Suggestions */}
          <StandbySuggestionPanel suggestions={suggestions} onUpdate={refreshSuggestions} />
        </>
      )}

      {!expanded && topZones.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Top zone: score {topZones[0]?.riskScore?.toFixed(1)} — {topZones[0]?.reasons?.join(', ')}
        </p>
      )}
    </div>
  );
}

function MiniKPI({ icon: Icon, label, value, color }: { icon: typeof Brain; label: string; value: string | number; color: string }) {
  return (
    <div className="rounded-lg border bg-card p-3 flex items-center gap-3">
      <Icon className={cn('w-4 h-4', color)} />
      <div>
        <p className="text-lg font-bold font-mono text-foreground">{value}</p>
        <p className="text-[10px] text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}
