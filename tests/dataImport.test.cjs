const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getColumns,
  parseDatasetContent,
  suggestMapping,
} = require('../src/dataImport.cjs');

test('parses quoted CSV fields and embedded newlines', () => {
  const rows = parseDatasetContent(
    'profiles.csv',
    'handle,name,bio\nada,"Ada, Countess","first line\nsecond line"\n',
  );
  assert.deepEqual(rows, [{
    handle: 'ada',
    name: 'Ada, Countess',
    bio: 'first line\nsecond line',
  }]);
});

test('parses JSON arrays, records envelopes, and JSONL', () => {
  assert.deepEqual(parseDatasetContent('a.json', '[{"username":"ada"}]'), [{ username: 'ada' }]);
  assert.deepEqual(parseDatasetContent('b.json', '{"records":[{"username":"grace"}]}'), [{ username: 'grace' }]);
  assert.deepEqual(parseDatasetContent('c.jsonl', '{"phone":"+1"}\n{"phone":"+2"}'), [{ phone: '+1' }, { phone: '+2' }]);
});

test('discovers columns and suggests canonical mappings', () => {
  const columns = getColumns([{ handle: 'ada', full_name: 'Ada' }, { network: 'X' }]);
  const mapping = suggestMapping([
    { key: 'username' },
    { key: 'display_name' },
    { key: 'platform' },
  ], columns);
  assert.deepEqual(mapping, {
    username: 'handle',
    display_name: 'full_name',
    platform: 'network',
  });
});

test('rejects malformed or empty imports', () => {
  assert.throws(() => parseDatasetContent('a.csv', 'only_header\n'), /header/);
  assert.throws(() => parseDatasetContent('a.txt', 'anything'), /CSV, JSON/);
  assert.throws(() => parseDatasetContent('a.jsonl', '{bad}'), /row 1/);
});
