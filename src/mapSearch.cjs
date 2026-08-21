const MAP_ARCHIVE_KEY = 'whoisit:map-archive';

function coordinatePair(latitudeValue, longitudeValue) {
  if (latitudeValue === null || latitudeValue === undefined || latitudeValue === '') return null;
  if (longitudeValue === null || longitudeValue === undefined || longitudeValue === '') return null;
  const latitude = Number(latitudeValue);
  const longitude = Number(longitudeValue);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return null;
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

function getMapTarget(record) {
  if (!record || typeof record !== 'object') return null;

  // Phone records never supply location evidence themselves. They can only
  // navigate through an explicitly geolocated associated entity.
  const direct = record.record_type === 'phone'
    ? null
    : coordinatePair(record.latitude, record.longitude);
  const entity = coordinatePair(record.entity?.latitude, record.entity?.longitude);
  const coordinates = direct || entity;
  if (!coordinates) return null;

  const evidence = direct ? record : record.entity;
  const recordId = evidence.id || record.id || null;
  const label = evidence.location
    || evidence.name
    || record.name
    || record.username
    || record.phone_number
    || `${coordinates.latitude.toFixed(5)}, ${coordinates.longitude.toFixed(5)}`;

  return {
    ...coordinates,
    label,
    recordId,
    locationAccuracy: evidence.location_accuracy || 'unknown',
    locationSource: evidence.location_source || 'unspecified',
    association: direct ? 'record' : 'associated_entity',
  };
}

function buildMapSearchPath({ place, latitude, longitude, radiusMiles, keyword = '', sources = 'datasets,x', limit = 100 }) {
  const normalizedPlace = String(place || '').trim();
  const coordinates = coordinatePair(latitude, longitude);
  const hasCoordinateInput = latitude !== undefined || longitude !== undefined;
  if (hasCoordinateInput && !coordinates) {
    throw new Error('Latitude and longitude must be supplied together as valid coordinates.');
  }
  if (!normalizedPlace && !coordinates) throw new Error('Enter a place or coordinates to search.');
  if (normalizedPlace && coordinates) throw new Error('Search by either place or coordinates, not both.');
  const radius = Number(radiusMiles);
  if (!Number.isFinite(radius) || radius <= 0 || radius > 1000) {
    throw new Error('Radius must be greater than 0 and no more than 1,000 miles.');
  }
  const allowed = new Set(['datasets', 'x']);
  const selected = String(sources).split(',').map((value) => value.trim()).filter(Boolean);
  if (!selected.length || selected.some((source) => !allowed.has(source))) {
    throw new Error('Select datasets, X, or both.');
  }
  const parameters = new URLSearchParams({
    radius_miles: String(radius),
    sources: selected.join(','),
    limit: String(limit),
  });
  if (coordinates) {
    parameters.set('latitude', String(coordinates.latitude));
    parameters.set('longitude', String(coordinates.longitude));
  } else {
    parameters.set('place', normalizedPlace);
  }
  if (String(keyword).trim()) parameters.set('query', String(keyword).trim());
  return `/map/search?${parameters}`;
}

function normalizeMapCollection(payload) {
  if (!payload || payload.type !== 'FeatureCollection' || !Array.isArray(payload.features)) {
    throw new Error('The map service returned an invalid GeoJSON response.');
  }
  const features = payload.features.filter((item) => (
    item?.geometry?.type === 'Point'
    && Array.isArray(item.geometry.coordinates)
    && item.geometry.coordinates.length >= 2
  ));
  return { ...payload, features };
}

module.exports = {
  MAP_ARCHIVE_KEY,
  buildMapSearchPath,
  getMapTarget,
  normalizeMapCollection,
};
