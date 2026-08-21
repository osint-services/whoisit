const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildMapSearchPath,
  getMapTarget,
  normalizeMapCollection,
} = require('../src/mapSearch.cjs');

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
  assert.throws(() => buildMapSearchPath({ latitude: 51.5, radiusMiles: 10, sources: 'datasets' }), /Latitude and longitude/);
  assert.throws(() => buildMapSearchPath({ place: 'London', latitude: 51.5, longitude: -0.1, radiusMiles: 10, sources: 'datasets' }), /either place or coordinates/);
});

test('builds a coordinate search for a result handoff', () => {
  const path = buildMapSearchPath({
    latitude: 51.5074,
    longitude: -0.1278,
    radiusMiles: 25,
    sources: 'datasets',
  });
  const url = new URL(path, 'http://localhost');
  assert.equal(url.searchParams.get('place'), null);
  assert.equal(url.searchParams.get('latitude'), '51.5074');
  assert.equal(url.searchParams.get('longitude'), '-0.1278');
  assert.equal(url.searchParams.get('sources'), 'datasets');
});

test('extracts direct profile coordinates for map navigation', () => {
  assert.deepEqual(getMapTarget({
    id: 'profile-1',
    record_type: 'profile',
    username: 'mapped_user',
    latitude: 38.8816,
    longitude: -77.091,
    location_accuracy: 'exact',
    location_source: 'provider_coordinates',
  }), {
    latitude: 38.8816,
    longitude: -77.091,
    label: 'mapped_user',
    recordId: 'profile-1',
    locationAccuracy: 'exact',
    locationSource: 'provider_coordinates',
    association: 'record',
  });
});

test('uses an associated entity location for phone records', () => {
  const target = getMapTarget({
    id: 'phone-1',
    record_type: 'phone',
    phone_number: '+12025550111',
    latitude: 1,
    longitude: 2,
    entity: {
      id: 'entity-1',
      name: 'London Map Demo',
      latitude: 51.5074,
      longitude: -0.1278,
      location_accuracy: 'exact',
      location_source: 'synthetic_fixture',
    },
  });
  assert.equal(target.recordId, 'entity-1');
  assert.equal(target.association, 'associated_entity');
  assert.equal(target.latitude, 51.5074);
  assert.equal(target.label, 'London Map Demo');
  assert.equal(getMapTarget({ record_type: 'phone', latitude: 1, longitude: 2 }), null);
  assert.equal(getMapTarget({ record_type: 'profile', latitude: null, longitude: null }), null);
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
