import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { RiskZone } from '@/types';

interface RiskHeatmapLayerProps {
  map: L.Map | null;
  zones: RiskZone[];
  visible: boolean;
}

/**
 * Renders coloured circles on the Leaflet map for each risk zone.
 * Uses radius proportional to riskScore and colour gradient (green → yellow → red).
 */
export function RiskHeatmapLayer({ map, zones, visible }: RiskHeatmapLayerProps) {
  const layerGroup = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!map) return;

    // Initialise layer group once
    if (!layerGroup.current) {
      layerGroup.current = L.layerGroup();
    }

    // Clear previous
    layerGroup.current.clearLayers();

    if (!visible || zones.length === 0) {
      layerGroup.current.remove();
      return;
    }

    const maxScore = Math.max(...zones.map((z) => z.riskScore), 1);

    for (const zone of zones) {
      const intensity = zone.riskScore / maxScore; // 0..1
      const radius = 200 + intensity * 600; // 200m – 800m
      const color = intensityToColor(intensity);

      const circle = L.circle([zone.centerLat, zone.centerLng], {
        radius,
        color,
        fillColor: color,
        fillOpacity: 0.25 + intensity * 0.25,
        weight: 1.5,
        className: 'risk-zone-circle',
      });

      circle.bindPopup(`
        <div style="font-family:monospace;font-size:12px;min-width:180px">
          <b>Risk Zone</b><br/>
          Score: <b>${zone.riskScore.toFixed(1)}</b>/100<br/>
          Incidents: ${zone.incidentCount}<br/>
          Avg density: ${zone.avgDensity}<br/>
          Peak hour: ${zone.peakHour != null ? `${zone.peakHour}:00` : 'N/A'}<br/>
          <span style="color:${color}">${zone.reasons.join(', ')}</span>
        </div>
      `);

      layerGroup.current.addLayer(circle);
    }

    layerGroup.current.addTo(map);

    return () => {
      layerGroup.current?.remove();
    };
  }, [map, zones, visible]);

  return null; // renders into map imperatively
}

function intensityToColor(t: number): string {
  // green (0) → yellow (0.5) → red (1)
  const r = Math.round(t < 0.5 ? t * 2 * 255 : 255);
  const g = Math.round(t < 0.5 ? 255 : (1 - (t - 0.5) * 2) * 255);
  return `rgb(${r},${g},60)`;
}
