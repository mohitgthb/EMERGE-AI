const { distanceKm } = require("../utils/geo");

const OSRM_BASE_URL = process.env.OSRM_BASE_URL || "http://router.project-osrm.org";

/**
 * Returns a route from (fromLat,fromLng) to (toLat,toLng).
 * Prefers OSRM. Falls back to straight-line distance if OSRM fails/unreachable.
 */
exports.getRoute = async ({ fromLat, fromLng, toLat, toLng }) => {
  const fetchFn =
    typeof globalThis.fetch === "function"
      ? globalThis.fetch
      : (() => {
          try {
            // undici provides fetch for Node < 18
            // eslint-disable-next-line global-require
            return require("undici").fetch;
          } catch {
            throw new Error(
              "fetch is not available. Use Node 18+ or install the 'undici' package."
            );
          }
        })();

  // OSRM expects lon,lat format
  const url = `${OSRM_BASE_URL}/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson&steps=false`;

  try {
    const resp = await fetchFn(url, { method: "GET" });
    if (!resp.ok) throw new Error(`OSRM HTTP ${resp.status}`);

    const data = await resp.json();
    const r = data?.routes?.[0];
    if (!r) throw new Error("No route returned from OSRM");

    return {
      provider: "OSRM",
      distanceKm: r.distance / 1000,
      durationSec: Math.round(r.duration),
      geometry: r.geometry, // GeoJSON LineString
    };
  } catch (e) {
    // Fallback: straight-line approximation
    console.warn(`Routing service failed: ${e.message}, using straight-line fallback`);
    return {
      provider: "STRAIGHT_LINE",
      distanceKm: distanceKm(fromLat, fromLng, toLat, toLng),
      durationSec: null,
      geometry: null,
      error: String(e?.message || e),
    };
  }
};
