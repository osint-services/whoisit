const MAP_ARCHIVE_KEY = 'whoisit:map-archive';

function buildMapSearchPath({ place, radiusMiles, keyword = '', sources = 'datasets,x', limit = 100 }) {
  const normalizedPlace = String(place || '').trim();
  if (!normalizedPlace) throw new Error('Enter a place to search.');
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
    place: normalizedPlace,
    radius_miles: String(radius),
    sources: selected.join(','),
    limit: String(limit),
  });
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

module.exports = { MAP_ARCHIVE_KEY, buildMapSearchPath, normalizeMapCollection };
