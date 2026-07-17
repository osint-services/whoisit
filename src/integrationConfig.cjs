const INTEGRATION_KEYS = [
  'TWEEPY_BEARER_TOKEN',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
];

function getPlatformRootCandidates(appPath, pathModule) {
  const candidates = [appPath];
  let current = appPath;
  for (let depth = 0; depth < 8; depth += 1) {
    current = pathModule.resolve(current, '..');
    candidates.push(current);
  }
  return [...new Set(candidates)];
}

function parseEnv(content) {
  const values = {};
  content.split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=(.*)$/);
    if (!match) return;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  });
  return values;
}

function isConfigured(value) {
  if (!value) return false;
  const normalized = value.toLowerCase();
  return !normalized.includes('your_') && !normalized.includes('replace_me');
}

function getConfiguredIntegrations(content) {
  const values = parseEnv(content);
  return {
    x: isConfigured(values.TWEEPY_BEARER_TOKEN),
    twilio: (
      isConfigured(values.TWILIO_ACCOUNT_SID)
      && isConfigured(values.TWILIO_AUTH_TOKEN)
    ),
  };
}

function validateCredentialUpdates(updates) {
  const clean = {};
  INTEGRATION_KEYS.forEach((key) => {
    const raw = updates?.[key];
    if (raw === undefined || raw === null || String(raw).trim() === '') return;
    const value = String(raw).trim();
    if (/[\r\n\0]/.test(value)) {
      throw new Error(`${key} contains invalid characters.`);
    }
    clean[key] = value;
  });

  if (clean.TWEEPY_BEARER_TOKEN && clean.TWEEPY_BEARER_TOKEN.length < 20) {
    throw new Error('The X API bearer token appears to be incomplete.');
  }
  if (
    clean.TWILIO_ACCOUNT_SID
    && !/^AC[a-zA-Z0-9]{16,}$/.test(clean.TWILIO_ACCOUNT_SID)
  ) {
    throw new Error('The Twilio Account SID must start with AC.');
  }
  if (clean.TWILIO_AUTH_TOKEN && clean.TWILIO_AUTH_TOKEN.length < 16) {
    throw new Error('The Twilio Auth Token appears to be incomplete.');
  }
  return clean;
}

function updateEnvContent(content, updates) {
  const clean = validateCredentialUpdates(updates);
  const remaining = new Map(Object.entries(clean));
  const lines = content ? content.split(/\r?\n/) : [];
  const updated = lines.map((line) => {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=/);
    if (!match || !remaining.has(match[1])) return line;
    const key = match[1];
    const value = remaining.get(key);
    remaining.delete(key);
    return `${key}=${value}`;
  });

  if (remaining.size) {
    if (updated.length && updated[updated.length - 1] !== '') updated.push('');
    updated.push('# Saved by the Who Is It? integrations screen.');
    remaining.forEach((value, key) => updated.push(`${key}=${value}`));
  }

  return {
    content: `${updated.join('\n').replace(/\n+$/, '')}\n`,
    updatedKeys: Object.keys(clean),
  };
}

module.exports = {
  getConfiguredIntegrations,
  getPlatformRootCandidates,
  parseEnv,
  updateEnvContent,
  validateCredentialUpdates,
};
