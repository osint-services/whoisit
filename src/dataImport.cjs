const MAX_ROWS = 10000;

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        value += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      row.push(value);
      value = '';
    } else if (character === '\n') {
      row.push(value.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      value = '';
    } else {
      value += character;
    }
  }

  if (quoted) {
    throw new Error('CSV contains an unterminated quoted value.');
  }
  if (value || row.length) {
    row.push(value.replace(/\r$/, ''));
    rows.push(row);
  }
  if (rows.length < 2) {
    throw new Error('CSV must contain a header and at least one data row.');
  }

  const headers = rows[0].map((header) => header.trim());
  if (headers.some((header) => !header)) {
    throw new Error('Every CSV column must have a header.');
  }
  if (new Set(headers).size !== headers.length) {
    throw new Error('CSV column headers must be unique.');
  }

  return rows
    .slice(1)
    .filter((cells) => cells.some((cell) => cell.trim()))
    .map((cells) => Object.fromEntries(
      headers.map((header, index) => [header, cells[index] ?? '']),
    ));
}

function parseDatasetContent(filename, text) {
  const extension = filename.toLowerCase().split('.').pop();
  let rows;

  if (extension === 'csv') {
    rows = parseCsv(text);
  } else if (['jsonl', 'ndjson'].includes(extension)) {
    rows = text
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .map((line, index) => {
        try {
          return JSON.parse(line);
        } catch {
          throw new Error(`JSONL row ${index + 1} is not valid JSON.`);
        }
      });
  } else if (extension === 'json') {
    const parsed = JSON.parse(text);
    rows = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.records)
        ? parsed.records
        : [parsed];
  } else {
    throw new Error('Choose a CSV, JSON, JSONL, or NDJSON file.');
  }

  if (!rows.length) {
    throw new Error('The file does not contain any records.');
  }
  if (rows.length > MAX_ROWS) {
    throw new Error(`A single import can contain at most ${MAX_ROWS.toLocaleString()} records.`);
  }
  if (rows.some((row) => !row || Array.isArray(row) || typeof row !== 'object')) {
    throw new Error('Every imported record must be an object with named fields.');
  }

  return rows;
}

function getColumns(rows) {
  return [...new Set(rows.flatMap((row) => Object.keys(row)))];
}

const aliases = {
  username: ['username', 'user_name', 'handle', 'screen_name'],
  platform: ['platform', 'network', 'site', 'service'],
  profile_url: ['profile_url', 'profile_uri', 'url', 'account_url'],
  display_name: ['display_name', 'full_name', 'name'],
  bio: ['bio', 'description', 'about'],
  website: ['website', 'web', 'external_url'],
  followers_count: ['followers_count', 'followers'],
  following_count: ['following_count', 'following', 'friends_count'],
  post_count: ['post_count', 'posts', 'statuses_count'],
  phone_number: ['phone_number', 'phone', 'number', 'e164'],
  caller_name: ['caller_name', 'subscriber_name', 'name'],
  country_code: ['country_code', 'country'],
  carrier_name: ['carrier_name', 'carrier'],
  line_type: ['line_type', 'phone_type', 'kind'],
};

const comparable = (value) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

function suggestMapping(fields, columns) {
  const mapping = {};
  fields.forEach((field) => {
    const candidates = aliases[field.key] || [field.key];
    const match = columns.find((column) => (
      candidates.some((candidate) => comparable(candidate) === comparable(column))
    ));
    if (match) {
      mapping[field.key] = match;
    }
  });
  return mapping;
}

module.exports = {
  getColumns,
  parseCsv,
  parseDatasetContent,
  suggestMapping,
};
