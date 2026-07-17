const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getConfiguredIntegrations,
  parseEnv,
  updateEnvContent,
  validateCredentialUpdates,
} = require('../src/integrationConfig.cjs');

test('detects configured integrations without exposing values', () => {
  const state = getConfiguredIntegrations(
    'TWEEPY_BEARER_TOKEN=real-bearer-token-that-is-long\n'
    + 'TWILIO_ACCOUNT_SID=AC1234567890123456\n'
    + 'TWILIO_AUTH_TOKEN=1234567890123456\n',
  );
  assert.deepEqual(state, { x: true, twilio: true });
  assert.equal('TWEEPY_BEARER_TOKEN' in state, false);
});

test('treats example placeholders as unconfigured', () => {
  assert.deepEqual(
    getConfiguredIntegrations(
      'TWEEPY_BEARER_TOKEN=your_tweepy_bearer_token\n'
      + 'TWILIO_ACCOUNT_SID=your_twilio_account_sid\n',
    ),
    { x: false, twilio: false },
  );
});

test('updates known values while preserving comments and unrelated settings', () => {
  const result = updateEnvContent(
    '# Existing configuration\nOTHER=value\nTWEEPY_BEARER_TOKEN=old-value-that-is-long\n',
    {
      TWEEPY_BEARER_TOKEN: 'new-value-that-is-long-enough',
      TWILIO_ACCOUNT_SID: 'AC1234567890123456',
    },
  );
  const parsed = parseEnv(result.content);
  assert.match(result.content, /# Existing configuration/);
  assert.equal(parsed.OTHER, 'value');
  assert.equal(parsed.TWEEPY_BEARER_TOKEN, 'new-value-that-is-long-enough');
  assert.equal(parsed.TWILIO_ACCOUNT_SID, 'AC1234567890123456');
  assert.deepEqual(result.updatedKeys, [
    'TWEEPY_BEARER_TOKEN',
    'TWILIO_ACCOUNT_SID',
  ]);
});

test('blank values keep existing credentials and malformed values are rejected', () => {
  assert.deepEqual(validateCredentialUpdates({ TWEEPY_BEARER_TOKEN: '' }), {});
  assert.throws(
    () => validateCredentialUpdates({ TWEEPY_BEARER_TOKEN: 'short' }),
    /incomplete/,
  );
  assert.throws(
    () => validateCredentialUpdates({ TWILIO_ACCOUNT_SID: 'SK1234567890123456' }),
    /start with AC/,
  );
  assert.throws(
    () => validateCredentialUpdates({ TWILIO_AUTH_TOKEN: 'valid-token-value\nINJECTED=x' }),
    /invalid characters/,
  );
});
