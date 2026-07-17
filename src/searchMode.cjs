const SEARCH_TYPES = new Set(['auto', 'profile', 'phone']);
const SOURCE_SCOPES = new Set(['all', 'live', 'datasets']);

function looksLikePhone(value) {
  const query = String(value ?? '').trim();
  const digits = query.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return false;
  return query.startsWith('+') || /[()\s-]/.test(query);
}

function resolveSearchType(value, selectedType = 'auto') {
  if (!SEARCH_TYPES.has(selectedType)) throw new Error('Unknown search type.');
  if (selectedType !== 'auto') return selectedType;
  return looksLikePhone(value) ? 'phone' : 'profile';
}

function normalizeSearchQuery(value, searchType) {
  const query = String(value ?? '').trim();
  return searchType === 'profile' ? query.replace(/^@/, '') : query;
}

function sourceEnabled(scope, source) {
  if (!SOURCE_SCOPES.has(scope)) throw new Error('Unknown source filter.');
  return scope === 'all' || scope === source;
}

module.exports = {
  looksLikePhone,
  normalizeSearchQuery,
  resolveSearchType,
  sourceEnabled,
};
