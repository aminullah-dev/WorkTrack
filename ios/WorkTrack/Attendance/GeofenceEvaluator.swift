import Foundation

/// Where the worker is, relative to the company's sites.
///
/// The SERVER decides whether a punch counts — `checkGeofence` in
/// backend/functions/src/services/geo.ts never trusts a client's claim. This
/// exists only so the app can tell somebody they are 300 metres from the gate
/// BEFORE they punch, instead of after.
///
/// It therefore has to agree with the server, and mirrors it exactly: distance
/// by haversine, GPS accuracy credited toward the radius, and inside ANY fence
/// counts — not merely the nearest one, because a compound and a building
/// inside it are both normally mapped and the smaller one can be nearer.
enum GeofenceEvaluator {
    struct Evaluation: Equatable {
        /// False when the company drew no fences: then anywhere is fine.
        let fencesConfigured: Bool
        let insideFence: Bool
        let nearest: Geofence?
        let distanceMeters: Double?
    }

    private static let earthRadiusMeters = 6_371_000.0

    static func haversineMeters(
        _ lat1: Double, _ lng1: Double, _ lat2: Double, _ lng2: Double
    ) -> Double {
        let toRad = { (d: Double) in d * .pi / 180 }
        let dLat = toRad(lat2 - lat1)
        let dLng = toRad(lng2 - lng1)
        let a = pow(sin(dLat / 2), 2)
            + cos(toRad(lat1)) * cos(toRad(lat2)) * pow(sin(dLng / 2), 2)
        return 2 * earthRadiusMeters * atan2(sqrt(a), sqrt(1 - a))
    }

    static func evaluate(
        latitude: Double,
        longitude: Double,
        accuracyMeters: Double,
        fences: [Geofence]
    ) -> Evaluation {
        let active = fences.filter(\.isActive)
        guard !active.isEmpty else {
            return Evaluation(
                fencesConfigured: false, insideFence: false, nearest: nil, distanceMeters: nil
            )
        }

        var nearest: Geofence?
        var nearestDistance = Double.infinity
        var inside: Geofence?
        var insideDistance = Double.infinity

        for fence in active {
            let distance = haversineMeters(latitude, longitude, fence.latitude, fence.longitude)
            if distance < nearestDistance {
                nearestDistance = distance
                nearest = fence
            }
            if distance - accuracyMeters <= fence.radiusMeters && distance < insideDistance {
                insideDistance = distance
                inside = fence
            }
        }

        let isInside = inside != nil
        return Evaluation(
            fencesConfigured: true,
            insideFence: isInside,
            nearest: isInside ? inside : nearest,
            distanceMeters: (isInside ? insideDistance : nearestDistance).rounded()
        )
    }
}
