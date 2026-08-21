const test = require('node:test');
const assert = require('node:assert/strict');

const { buildMapSearchPath, normalizeMapCollection } = require('../src/mapSearch.cjs');

test('builds the canonical map query with source controls', () => {
  const path = buildMapSearchPath({
    place: ' London ',
    radiusMiles: 15,
    keyword: 'museum',
    sources: 'datasets,x',
  });
  const url = new URL(path, 'http://localhost');
  assert.equal(url.pathname, '/map/search');
  assert.equal(url.searchParams.get('place'), 'London');
  assert.equal(url.searchParams.get('radius_miles'), '15');
  assert.equal(url.searchParams.get('query'), 'museum');
  assert.equal(url.searchParams.get('sources'), 'datasets,x');
});

test('rejects invalid map input', () => {
  assert.throws(() => buildMapSearchPath({ place: '', radiusMiles: 10, sources: 'datasets' }), /place/);
  assert.throws(() => buildMapSearchPath({ place: 'London', radiusMiles: 0, sources: 'datasets' }), /Radius/);
  assert.throws(() => buildMapSearchPath({ place: 'London', radiusMiles: 10, sources: 'phones' }), /Select datasets/);
});

test('keeps only valid GeoJSON point features', () => {
  const payload = normalizeMapCollection({
    type: 'FeatureCollection',
    features: [
      { id: 'valid', geometry: { type: 'Point', coordinates: [-0.1, 51.5] }, properties: {} },
      { id: 'invalid', geometry: null, properties: {} },
    ],
    providers: {},
  });
  assert.deepEqual(payload.features.map((item) => item.id), ['valid']);
  assert.throws(() => normalizeMapCollection({ features: [] }), /invalid GeoJSON/);
});
