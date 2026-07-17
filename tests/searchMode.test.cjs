const test = require('node:test');
const assert = require('node:assert/strict');

const {
  looksLikePhone,
  normalizeSearchQuery,
  resolveSearchType,
  sourceEnabled,
} = require('../src/searchMode.cjs');

test('auto mode conservatively detects formatted phone numbers', () => {
  assert.equal(looksLikePhone('+1 202-555-0101'), true);
  assert.equal(looksLikePhone('(202) 555-0101'), true);
  assert.equal(looksLikePhone('2025550101'), false);
  assert.equal(looksLikePhone('demo_user_2026'), false);
  assert.equal(resolveSearchType('+12025550101'), 'phone');
  assert.equal(resolveSearchType('demo_ada_1843'), 'profile');
});

test('explicit modes override auto detection and normalize profile handles', () => {
  assert.equal(resolveSearchType('+12025550101', 'profile'), 'profile');
  assert.equal(resolveSearchType('demo_ada_1843', 'phone'), 'phone');
  assert.equal(normalizeSearchQuery(' @demo_ada_1843 ', 'profile'), 'demo_ada_1843');
  assert.equal(normalizeSearchQuery(' +1 202-555-0101 ', 'phone'), '+1 202-555-0101');
});

test('source filters enable only the requested providers', () => {
  assert.equal(sourceEnabled('all', 'live'), true);
  assert.equal(sourceEnabled('all', 'datasets'), true);
  assert.equal(sourceEnabled('live', 'live'), true);
  assert.equal(sourceEnabled('live', 'datasets'), false);
  assert.equal(sourceEnabled('datasets', 'live'), false);
});
