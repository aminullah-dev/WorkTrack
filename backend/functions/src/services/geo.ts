import { tenant } from "../lib/firestore";

const EARTH_RADIUS_METERS = 6_371_000;

export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (deg: number): number => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface GeofenceCheck {
  fencesConfigured: boolean;
  insideFence: boolean;
  geofenceId: string | null;
  distanceMeters: number | null;
}

/**
 * Server-authoritative geofence validation; never trusts the client's
 * insideFence flag. GPS accuracy is credited toward the fence, mirroring
 * the client heuristic so both sides agree.
 */
export async function checkGeofence(
  cid: string,
  latitude: number,
  longitude: number,
  accuracyMeters: number,
): Promise<GeofenceCheck> {
  const snapshot = await tenant(cid, "geofences").where("active", "==", true).get();
  if (snapshot.empty) {
    return { fencesConfigured: false, insideFence: false, geofenceId: null, distanceMeters: null };
  }

  let nearestId: string | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  let nearestRadius = 0;
  for (const doc of snapshot.docs) {
    const fence = doc.data() as { latitude: number; longitude: number; radiusMeters: number };
    const distance = haversineMeters(latitude, longitude, fence.latitude, fence.longitude);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestId = doc.id;
      nearestRadius = fence.radiusMeters;
    }
  }

  return {
    fencesConfigured: true,
    insideFence: nearestDistance - accuracyMeters <= nearestRadius,
    geofenceId: nearestId,
    distanceMeters: Math.round(nearestDistance),
  };
}
