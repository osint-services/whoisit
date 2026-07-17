import * as React from 'react';
import { createRoot } from 'react-dom/client';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  AppBar,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Divider,
  Grid,
  IconButton,
  Link,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  CloudDone,
  ContentCopy,
  Dataset,
  DeleteOutline,
  ExpandMore,
  History,
  Key,
  PersonSearch,
  PhoneEnabled,
  Refresh,
  Search,
  Storage,
  UploadFile,
} from '@mui/icons-material';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';

const {
  getColumns,
  parseDatasetContent,
  suggestMapping,
} = require('./dataImport.cjs');
const {
  normalizeSearchQuery,
  resolveSearchType,
  sourceEnabled,
} = require('./searchMode.cjs');

const API_BASE = 'http://127.0.0.1:80';
const HISTORY_KEY = 'whoisit:search-history';
const tabs = [
  { label: 'Search', icon: <Search fontSize="small" /> },
  { label: 'Datasets', icon: <Dataset fontSize="small" /> },
  { label: 'Integrations', icon: <Key fontSize="small" /> },
  { label: 'History', icon: <History fontSize="small" /> },
];

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#7dd3c7' },
    secondary: { main: '#91b8ff' },
    background: { default: '#09111f', paper: '#111c2d' },
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: '"Inter", "Segoe UI", system-ui, sans-serif',
    h4: { fontWeight: 700, letterSpacing: '-0.03em' },
    h5: { fontWeight: 650, letterSpacing: '-0.02em' },
    h6: { fontWeight: 650 },
    button: { fontWeight: 700, letterSpacing: '0.02em' },
  },
  components: {
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiButton: { defaultProps: { disableElevation: true } },
  },
});

async function requestJson(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const detail = data?.detail;
    const message = typeof detail === 'string'
      ? detail
      : detail?.message
        ? `${detail.message}${detail.twilio_code ? ` (Twilio code ${detail.twilio_code})` : ''}`
        : `Request failed with HTTP ${response.status}`;
    throw new Error(message);
  }
  return data;
}

const humanize = (value) => String(value)
  .replaceAll('_', ' ')
  .replace(/\b\w/g, (character) => character.toUpperCase());

const present = (value) => value !== null && value !== undefined && value !== '';

function usePlatformStatus() {
  const [status, setStatus] = React.useState({
    ready: false,
    checking: true,
    message: 'Checking platform services…',
  });
  const refresh = React.useCallback(async () => {
    setStatus((current) => ({ ...current, checking: true }));
    if (!window.electronAPI?.ensurePlatform) {
      setStatus({ ready: true, checking: false, message: 'Connected through direct API calls.' });
      return;
    }
    const result = await window.electronAPI.ensurePlatform();
    setStatus({
      ready: Boolean(result?.ready),
      checking: false,
      message: result?.message || 'Platform status unknown.',
    });
  }, []);
  React.useEffect(() => { refresh(); }, [refresh]);
  return { status, refresh };
}

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  } catch {
    return [];
  }
}

function DetailItem({ label, value, href }) {
  const display = !present(value) ? 'Not provided' : typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value);
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
        {href && present(value)
          ? <Link href={href} target="_blank" rel="noreferrer">{display}</Link>
          : display}
      </Typography>
    </Box>
  );
}

function Provenance({ record, liveLabel }) {
  const isDataset = record?.source_type === 'dataset';
  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
        <Chip
          icon={isDataset ? <Storage /> : <CloudDone />}
          label={isDataset ? record.dataset_name || 'Imported dataset' : liveLabel}
          color={isDataset ? 'secondary' : 'primary'}
          size="small"
        />
        {present(record?.source) && <Chip label={`Source: ${record.source}`} size="small" variant="outlined" />}
        {present(record?.observed_at) && <Chip label={`Observed ${new Date(record.observed_at).toLocaleString()}`} size="small" variant="outlined" />}
        {present(record?.confidence) && <Chip label={`${Math.round(record.confidence * 100)}% confidence`} size="small" variant="outlined" />}
      </Stack>
    </Paper>
  );
}

function RawDetails({ value }) {
  if (!value) return null;
  return (
    <Accordion variant="outlined" disableGutters>
      <AccordionSummary expandIcon={<ExpandMore />}>
        <Typography variant="subtitle2">Raw source record</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Box component="pre" sx={{ bgcolor: '#08101c', borderRadius: 1, fontSize: 12, m: 0, overflow: 'auto', p: 2, whiteSpace: 'pre-wrap' }}>
          {JSON.stringify(value, null, 2)}
        </Box>
      </AccordionDetails>
    </Accordion>
  );
}

function CopyButton({ value }) {
  const [copied, setCopied] = React.useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(JSON.stringify(value, null, 2));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };
  return (
    <Tooltip title={copied ? 'Copied' : 'Copy record as JSON'}>
      <IconButton size="small" onClick={copy}><ContentCopy fontSize="small" /></IconButton>
    </Tooltip>
  );
}

function ProfileDetail({ profile, loading, error }) {
  if (loading) return <Stack alignItems="center" sx={{ py: 8 }}><CircularProgress /><Typography sx={{ mt: 2 }} color="text.secondary">Loading public profile…</Typography></Stack>;
  if (error) return <Alert severity="warning">{error}</Alert>;
  if (!profile) return <EmptyState title="Select a result" body="Choose a live result to inspect it, or an imported match to see the stored record." />;
  return (
    <Stack spacing={2.5}>
      {profile.profile_banner_url && (
        <Box component="img" src={profile.profile_banner_url} alt="" sx={{ borderRadius: 2, height: 150, objectFit: 'cover', width: '100%' }} />
      )}
      <Stack direction="row" spacing={2} alignItems="center">
        <Avatar src={profile.profile_image_url} sx={{ height: 72, width: 72 }} />
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Typography variant="h5">{profile.name || profile.username || 'Unknown profile'}</Typography>
          <Typography color="text.secondary">{profile.username ? `@${profile.username}` : profile.platform}</Typography>
        </Box>
        <CopyButton value={profile} />
      </Stack>
      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
        {present(profile.verified) && <Chip color={profile.verified ? 'primary' : 'default'} label={profile.verified ? 'Verified' : 'Not verified'} />}
        {present(profile.protected) && <Chip color={profile.protected ? 'warning' : 'success'} label={profile.protected ? 'Protected' : 'Public'} />}
        {profile.verified_type && <Chip label={humanize(profile.verified_type)} />}
      </Stack>
      <Provenance record={profile} liveLabel="Live X API" />
      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{profile.bio || 'No bio provided.'}</Typography>
      <Divider />
      <Grid container spacing={2}>
        {[
          ['Platform', profile.platform || 'X'],
          ['User ID', profile.id],
          ['Location', profile.location],
          ['Created', profile.created_at],
          ['Website', profile.website, profile.website],
          ['Profile URL', profile.profile_uri, profile.profile_uri],
          ['Pinned post', profile.pinned_tweet_id],
          ['Latest post', profile.most_recent_tweet_id],
        ].map(([label, value, href]) => (
          <Grid item xs={12} sm={6} md={4} key={label}><DetailItem label={label} value={value} href={href} /></Grid>
        ))}
      </Grid>
      {profile.metrics && Object.keys(profile.metrics).length > 0 && (
        <Box>
          <Typography variant="subtitle2" gutterBottom>Public metrics</Typography>
          <Grid container spacing={1}>
            {Object.entries(profile.metrics).map(([key, value]) => (
              <Grid item xs={6} md={4} key={key}>
                <Paper variant="outlined" sx={{ p: 1.5 }}>
                  <Typography variant="h6">{typeof value === 'number' ? new Intl.NumberFormat().format(value) : value}</Typography>
                  <Typography variant="caption" color="text.secondary">{humanize(key)}</Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </Box>
      )}
      <RawDetails value={profile.raw || (profile.entities || profile.withheld ? { entities: profile.entities, withheld: profile.withheld } : null)} />
    </Stack>
  );
}

function PhoneDetail({ phone }) {
  if (!phone) return <EmptyState title="Select a result" body="Live lookup and matching imported records will appear together here." />;
  return (
    <Stack spacing={2.5}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Box>
          <Typography variant="h5">{phone.caller_name || 'Unknown caller'}</Typography>
          <Typography color="text.secondary">{phone.phone_number}</Typography>
        </Box>
        <CopyButton value={phone} />
      </Stack>
      <Stack direction="row" spacing={1}>
        {present(phone.valid) && <Chip color={phone.valid ? 'success' : 'error'} label={phone.valid ? 'Valid number' : 'Invalid number'} />}
        {phone.line_type && <Chip label={humanize(phone.line_type)} />}
        {phone.caller_type && <Chip label={humanize(phone.caller_type)} />}
      </Stack>
      <Provenance record={phone} liveLabel="Live Twilio Lookup" />
      <Grid container spacing={2}>
        {[
          ['E.164 number', phone.phone_number],
          ['National format', phone.national_format],
          ['Country', phone.country_code],
          ['Caller name', phone.caller_name],
          ['Caller type', phone.caller_type],
          ['Carrier', phone.carrier_name],
          ['Line type', phone.line_type],
          ['Location', phone.location],
        ].map(([label, value]) => (
          <Grid item xs={12} sm={6} key={label}><DetailItem label={label} value={value} /></Grid>
        ))}
      </Grid>
      <RawDetails value={phone.raw} />
    </Stack>
  );
}

function EmptyState({ title, body }) {
  return (
    <Stack alignItems="center" textAlign="center" sx={{ color: 'text.secondary', px: 2, py: 7 }}>
      <Search sx={{ fontSize: 40, mb: 1, opacity: 0.5 }} />
      <Typography variant="h6" color="text.primary">{title}</Typography>
      <Typography variant="body2" sx={{ maxWidth: 420 }}>{body}</Typography>
    </Stack>
  );
}

function ResultRow({ title, subtitle, source, selected, onClick, action, children }) {
  return (
    <Card
      variant="outlined"
      onClick={onClick}
      sx={{
        borderColor: selected ? 'primary.main' : 'divider',
        bgcolor: selected ? 'rgba(125, 211, 199, 0.08)' : 'transparent',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <CardContent sx={{ '&:last-child': { pb: 2 }, p: 2 }}>
        <Stack direction="row" justifyContent="space-between" spacing={1}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle1" noWrap>{title}</Typography>
            <Typography variant="body2" color="text.secondary" noWrap>{subtitle}</Typography>
          </Box>
          <Chip size="small" label={source} color={source === 'Dataset' ? 'secondary' : 'primary'} variant="outlined" />
        </Stack>
        {children && <Box sx={{ mt: 1.5 }}>{children}</Box>}
        {action && <Box sx={{ mt: 1.5 }}>{action}</Box>}
      </CardContent>
    </Card>
  );
}

function SearchShell({ title, description, input, controls, button, context, error, notices, results, detail }) {
  return (
    <Stack spacing={2.5}>
      <Box>
        <Typography variant="h4">{title}</Typography>
        <Typography color="text.secondary">{description}</Typography>
      </Box>
      <Paper sx={{ p: 2.5 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>{input}{controls}{button}</Stack>
        {context && <Box sx={{ mt: 1.5 }}>{context}</Box>}
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
        {notices?.map((notice) => <Alert key={notice} severity="warning" sx={{ mt: 2 }}>{notice}</Alert>)}
      </Paper>
      <Grid container spacing={2.5} alignItems="stretch">
        <Grid item xs={12} md={4}>
          <Paper sx={{ height: '100%', minHeight: 470, p: 2 }}>
            <Typography variant="overline" color="text.secondary">Results</Typography>
            <Stack spacing={1.25} sx={{ mt: 1 }}>{results}</Stack>
          </Paper>
        </Grid>
        <Grid item xs={12} md={8}>
          <Paper sx={{ height: '100%', minHeight: 470, p: 2.5 }}>{detail}</Paper>
        </Grid>
      </Grid>
    </Stack>
  );
}

function DatasetWorkspace({ datasets, reloadDatasets }) {
  const [recordType, setRecordType] = React.useState('profile');
  const [schema, setSchema] = React.useState(null);
  const [fileState, setFileState] = React.useState(null);
  const [mapping, setMapping] = React.useState({});
  const [name, setName] = React.useState('');
  const [error, setError] = React.useState('');
  const [result, setResult] = React.useState(null);
  const [importing, setImporting] = React.useState(false);

  React.useEffect(() => {
    requestJson(`/datasets/schema/${recordType}`)
      .then(setSchema)
      .catch((reason) => setError(reason.message));
  }, [recordType]);

  React.useEffect(() => {
    if (schema && fileState) setMapping(suggestMapping(schema.fields, fileState.columns));
  }, [schema, fileState]);

  const chooseFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');
    setResult(null);
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('Import files are limited to 10 MB.');
      const rows = parseDatasetContent(file.name, await file.text());
      setFileState({ filename: file.name, rows, columns: getColumns(rows) });
      setName(file.name.replace(/\.(csv|jsonl?|ndjson)$/i, ''));
    } catch (reason) {
      setFileState(null);
      setError(reason.message);
    }
  };

  const importData = async () => {
    if (!fileState || !name.trim()) {
      setError('Choose a file and provide a dataset name.');
      return;
    }
    const identifier = recordType === 'profile'
      ? mapping.username || mapping.profile_url
      : mapping.phone_number;
    if (!identifier) {
      setError(recordType === 'profile' ? 'Map Username or Profile URL before importing.' : 'Map Phone number before importing.');
      return;
    }
    setImporting(true);
    setError('');
    try {
      const imported = await requestJson('/datasets/import', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          record_type: recordType,
          filename: fileState.filename,
          mapping,
          rows: fileState.rows,
        }),
      });
      setResult(imported);
      await reloadDatasets();
    } catch (reason) {
      setError(reason.message);
    } finally {
      setImporting(false);
    }
  };

  const removeDataset = async (id) => {
    if (!window.confirm('Delete this dataset and all of its records?')) return;
    await requestJson(`/datasets/${id}`, { method: 'DELETE' });
    await reloadDatasets();
  };

  return (
    <Stack spacing={2.5}>
      <Box>
        <Typography variant="h4">Datasets</Typography>
        <Typography color="text.secondary">Add private, licensed, or curated records as searchable local sources. Raw source rows remain available for audit.</Typography>
      </Box>
      <Grid container spacing={2.5}>
        <Grid item xs={12} lg={8}>
          <Paper sx={{ p: 2.5 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
              <Box>
                <Typography variant="h6">Import records</Typography>
                <Typography variant="body2" color="text.secondary">CSV, JSON, JSONL, or NDJSON · up to 10,000 rows / 10 MB</Typography>
              </Box>
              <Button component="label" variant="outlined" startIcon={<UploadFile />}>
                Choose file
                <input hidden type="file" accept=".csv,.json,.jsonl,.ndjson" onChange={chooseFile} />
              </Button>
            </Stack>
            <Stack spacing={2}>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <TextField select fullWidth label="Record type" value={recordType} onChange={(event) => { setRecordType(event.target.value); setMapping({}); }}>
                    <MenuItem value="profile">Profiles</MenuItem>
                    <MenuItem value="phone">Phone records</MenuItem>
                  </TextField>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField fullWidth label="Dataset name" value={name} onChange={(event) => setName(event.target.value)} />
                </Grid>
              </Grid>
              {fileState && (
                <>
                  <Alert severity="info">{fileState.filename}: {fileState.rows.length.toLocaleString()} rows, {fileState.columns.length} columns</Alert>
                  <Box>
                    <Typography variant="subtitle2" gutterBottom>Map source columns</Typography>
                    <Grid container spacing={1.5}>
                      {schema?.fields.map((field) => (
                        <Grid item xs={12} sm={6} key={field.key}>
                          <TextField
                            select
                            fullWidth
                            size="small"
                            label={`${field.label}${field.required ? ' *' : ''}`}
                            helperText={field.description}
                            value={mapping[field.key] || ''}
                            onChange={(event) => setMapping((current) => ({ ...current, [field.key]: event.target.value }))}
                          >
                            <MenuItem value="">Not mapped</MenuItem>
                            {fileState.columns.map((column) => <MenuItem key={column} value={column}>{column}</MenuItem>)}
                          </TextField>
                        </Grid>
                      ))}
                    </Grid>
                  </Box>
                  <Accordion variant="outlined">
                    <AccordionSummary expandIcon={<ExpandMore />}><Typography variant="subtitle2">Preview first five records</Typography></AccordionSummary>
                    <AccordionDetails><Box component="pre" sx={{ fontSize: 12, m: 0, overflow: 'auto' }}>{JSON.stringify(fileState.rows.slice(0, 5), null, 2)}</Box></AccordionDetails>
                  </Accordion>
                  <Button variant="contained" onClick={importData} disabled={importing} startIcon={importing ? <CircularProgress size={18} /> : <Storage />}>
                    {importing ? 'Importing…' : 'Import dataset'}
                  </Button>
                </>
              )}
              {error && <Alert severity="error">{error}</Alert>}
              {result && (
                <Alert severity={result.rejected ? 'warning' : 'success'}>
                  Imported {result.imported.toLocaleString()} records. Rejected {result.rejected.toLocaleString()}.
                  {result.rejected_rows?.length > 0 && ` First issue: row ${result.rejected_rows[0].row_number}: ${result.rejected_rows[0].reason}`}
                </Alert>
              )}
            </Stack>
          </Paper>
        </Grid>
        <Grid item xs={12} lg={4}>
          <Paper sx={{ p: 2.5 }}>
            <Typography variant="h6">Available sources</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{datasets.length} imported dataset{datasets.length === 1 ? '' : 's'}</Typography>
            <Stack spacing={1.25}>
              {datasets.map((dataset) => (
                <Card variant="outlined" key={dataset.id}>
                  <CardContent sx={{ '&:last-child': { pb: 2 }, p: 2 }}>
                    <Stack direction="row" justifyContent="space-between">
                      <Box>
                        <Typography variant="subtitle1">{dataset.name}</Typography>
                        <Typography variant="body2" color="text.secondary">{humanize(dataset.record_type)} · {dataset.row_count.toLocaleString()} records</Typography>
                        <Typography variant="caption" color="text.secondary">{new Date(dataset.imported_at).toLocaleString()}</Typography>
                      </Box>
                      <Tooltip title="Delete dataset"><IconButton size="small" onClick={() => removeDataset(dataset.id)}><DeleteOutline fontSize="small" /></IconButton></Tooltip>
                    </Stack>
                    {dataset.rejected_count > 0 && <Chip sx={{ mt: 1 }} size="small" color="warning" label={`${dataset.rejected_count} rejected`} />}
                  </CardContent>
                </Card>
              ))}
              {!datasets.length && <EmptyState title="No imported datasets" body="Choose a file to add your first local data source." />}
            </Stack>
          </Paper>
        </Grid>
      </Grid>
    </Stack>
  );
}

function IntegrationCard({ integration }) {
  const ready = integration.configured && integration.reachable;
  const statusLabel = ready
    ? 'Connected'
    : integration.configured
      ? 'Configured · service unavailable'
      : integration.reachable
        ? 'Service reachable · credential source unknown'
        : 'Not connected';
  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" spacing={2}>
          <Box>
            <Typography variant="h6">{integration.name}</Typography>
            <Typography variant="body2" color="text.secondary">{integration.client}</Typography>
          </Box>
          <Chip
            label={statusLabel}
            color={ready ? 'success' : integration.configured ? 'warning' : 'default'}
            variant={ready ? 'filled' : 'outlined'}
            size="small"
          />
        </Stack>
        <Divider sx={{ my: 2 }} />
        <Grid container spacing={2}>
          <Grid item xs={6}>
            <DetailItem label="Credentials" value={integration.configured ? 'Saved in platform .env' : 'Not saved'} />
          </Grid>
          <Grid item xs={6}>
            <DetailItem
              label="Service"
              value={integration.reachable ? 'Reachable' : integration.statusCode ? `HTTP ${integration.statusCode}` : 'Unavailable'}
            />
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  );
}

function IntegrationsWorkspace({ onPlatformRefresh }) {
  const [status, setStatus] = React.useState(null);
  const [credentials, setCredentials] = React.useState({
    TWEEPY_BEARER_TOKEN: '',
    TWILIO_ACCOUNT_SID: '',
    TWILIO_AUTH_TOKEN: '',
  });
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState(null);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      if (!window.electronAPI?.getIntegrations) {
        throw new Error('Integration settings are available in the Electron application.');
      }
      setStatus(await window.electronAPI.getIntegrations());
    } catch (reason) {
      setMessage({ severity: 'error', text: reason.message });
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { refresh(); }, [refresh]);

  const updateCredential = (key) => (event) => {
    setCredentials((current) => ({ ...current, [key]: event.target.value }));
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const result = await window.electronAPI.saveIntegrations(credentials);
      setStatus(result.status);
      setCredentials({
        TWEEPY_BEARER_TOKEN: '',
        TWILIO_ACCOUNT_SID: '',
        TWILIO_AUTH_TOKEN: '',
      });
      setMessage({
        severity: result.saved && result.restarted ? 'success' : result.saved ? 'warning' : 'info',
        text: result.message,
      });
      await onPlatformRefresh();
    } catch (reason) {
      setMessage({ severity: 'error', text: reason.message });
    } finally {
      setSaving(false);
    }
  };

  const hasNewValues = Object.values(credentials).some((value) => value.trim());

  return (
    <Stack spacing={2.5}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'end' }} spacing={2}>
        <Box>
          <Typography variant="h4">Integrations</Typography>
          <Typography color="text.secondary">See which data providers are configured and update the credentials used by the local platform.</Typography>
        </Box>
        <Button variant="outlined" onClick={refresh} disabled={loading} startIcon={loading ? <CircularProgress size={18} /> : <Refresh />}>
          Refresh status
        </Button>
      </Stack>

      {message && <Alert severity={message.severity}>{message.text}</Alert>}

      <Grid container spacing={2}>
        {(status?.integrations || []).map((integration) => (
          <Grid item xs={12} md={4} key={integration.id}>
            <IntegrationCard integration={integration} />
          </Grid>
        ))}
        {loading && !status && (
          <Grid item xs={12}><Paper sx={{ p: 5, textAlign: 'center' }}><CircularProgress /></Paper></Grid>
        )}
      </Grid>

      <Paper sx={{ p: 2.5 }}>
        <Typography variant="h6">Provider credentials</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
          Existing values are never sent to or displayed by the UI. Leave a field blank to keep its current value.
          New values are stored in the ignored platform <code>.env</code> file with owner-only permissions.
        </Typography>
        <Grid container spacing={2.5}>
          <Grid item xs={12}>
            <Typography variant="subtitle1">X API via Tweepy</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Used for expanded public profile inspection.
            </Typography>
            <TextField
              fullWidth
              type="password"
              autoComplete="new-password"
              label="X API bearer token"
              placeholder={status?.integrations?.find((item) => item.id === 'x')?.configured ? 'Configured — enter a value only to replace it' : 'Enter bearer token'}
              value={credentials.TWEEPY_BEARER_TOKEN}
              onChange={updateCredential('TWEEPY_BEARER_TOKEN')}
            />
          </Grid>
          <Grid item xs={12}><Divider /></Grid>
          <Grid item xs={12}>
            <Typography variant="subtitle1">Twilio Lookup</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Used for live caller-name and phone metadata lookup.
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  type="password"
                  autoComplete="new-password"
                  label="Twilio Account SID"
                  placeholder="AC…"
                  value={credentials.TWILIO_ACCOUNT_SID}
                  onChange={updateCredential('TWILIO_ACCOUNT_SID')}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  type="password"
                  autoComplete="new-password"
                  label="Twilio Auth Token"
                  placeholder="Leave blank to keep the saved token"
                  value={credentials.TWILIO_AUTH_TOKEN}
                  onChange={updateCredential('TWILIO_AUTH_TOKEN')}
                />
              </Grid>
            </Grid>
          </Grid>
        </Grid>
        <Alert severity="info" sx={{ my: 2 }}>
          “Connected” means the credential is configured and its local API service passes readiness. It does not make a billable provider request.
        </Alert>
        <Button variant="contained" onClick={save} disabled={saving || !hasNewValues} startIcon={saving ? <CircularProgress size={18} /> : <Key />}>
          {saving ? 'Saving and applying…' : 'Save and apply credentials'}
        </Button>
      </Paper>
    </Stack>
  );
}

function App() {
  const { status, refresh } = usePlatformStatus();
  const [tab, setTab] = React.useState(0);
  const [query, setQuery] = React.useState('');
  const [searchType, setSearchType] = React.useState('auto');
  const [resolvedType, setResolvedType] = React.useState('profile');
  const [sourceScope, setSourceScope] = React.useState('all');
  const [usernameResults, setUsernameResults] = React.useState([]);
  const [phoneResults, setPhoneResults] = React.useState([]);
  const [selectedProfile, setSelectedProfile] = React.useState(null);
  const [selectedPhone, setSelectedPhone] = React.useState(null);
  const [profileLoading, setProfileLoading] = React.useState(false);
  const [searching, setSearching] = React.useState(false);
  const [searchError, setSearchError] = React.useState('');
  const [profileError, setProfileError] = React.useState('');
  const [notices, setNotices] = React.useState([]);
  const [history, setHistory] = React.useState(loadHistory);
  const [datasets, setDatasets] = React.useState([]);

  const reloadDatasets = React.useCallback(async () => {
    try { setDatasets(await requestJson('/datasets')); } catch { /* status surface handles availability */ }
  }, []);
  React.useEffect(() => { reloadDatasets(); }, [reloadDatasets]);

  const addHistory = (type, query, count) => {
    const next = [{ id: `${Date.now()}-${type}`, type, query, count, searchedAt: new Date().toISOString() }, ...history].slice(0, 50);
    setHistory(next);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  };

  const inspectProfile = async (profileUrl) => {
    setProfileLoading(true);
    setProfileError('');
    try {
      const profile = await requestJson(`/focus?url=${encodeURIComponent(profileUrl)}`);
      setSelectedProfile({ ...profile, source_type: 'live', platform: 'X', profile_uri: profileUrl });
    } catch (reason) {
      setProfileError(reason.message);
      setSelectedProfile(null);
    } finally {
      setProfileLoading(false);
    }
  };

  const runProfile = async (searchQuery, scope) => {
    setSearching(true);
    setSearchError('');
    setProfileError('');
    setNotices([]);
    setSelectedProfile(null);
    const requests = [];
    const requestTypes = [];
    if (sourceEnabled(scope, 'live')) {
      requests.push(requestJson(`/scan/${encodeURIComponent(searchQuery)}`));
      requestTypes.push('live');
    }
    if (sourceEnabled(scope, 'datasets')) {
      requests.push(requestJson(`/datasets/search/profiles?query=${encodeURIComponent(searchQuery)}&fuzzy=true`));
      requestTypes.push('datasets');
    }
    const settled = await Promise.allSettled(requests);
    const byType = Object.fromEntries(requestTypes.map((type, index) => [type, settled[index]]));
    const live = byType.live;
    const local = byType.datasets;
    const next = [
      ...(live?.status === 'fulfilled' && Array.isArray(live.value)
        ? live.value.map((record) => ({ ...record, result_kind: 'scan' }))
        : []),
      ...(local?.status === 'fulfilled'
        ? local.value.records.map((record) => ({ ...record, result_kind: 'dataset' }))
        : []),
    ];
    setUsernameResults(next);
    setNotices([
      ...(live?.status === 'rejected' ? [`Live profile scan: ${live.reason.message}`] : []),
      ...(local?.status === 'rejected' ? [`Imported datasets: ${local.reason.message}`] : []),
    ]);
    addHistory('profile', searchQuery, next.length);
    setSearching(false);
  };

  const runPhone = async (searchQuery, scope) => {
    setSearching(true);
    setSearchError('');
    setProfileError('');
    setNotices([]);
    setSelectedPhone(null);
    const requests = [];
    const requestTypes = [];
    if (sourceEnabled(scope, 'live')) {
      requests.push(requestJson(`/phone_search?phone_number=${encodeURIComponent(searchQuery)}`));
      requestTypes.push('live');
    }
    if (sourceEnabled(scope, 'datasets')) {
      requests.push(requestJson(`/datasets/search/phones?phone_number=${encodeURIComponent(searchQuery)}`));
      requestTypes.push('datasets');
    }
    const settled = await Promise.allSettled(requests);
    const byType = Object.fromEntries(requestTypes.map((type, index) => [type, settled[index]]));
    const live = byType.live;
    const local = byType.datasets;
    const next = [
      ...(live?.status === 'fulfilled' ? [{ ...live.value, source_type: 'live', result_kind: 'live' }] : []),
      ...(local?.status === 'fulfilled' ? local.value.records.map((record) => ({ ...record, result_kind: 'dataset' })) : []),
    ];
    setPhoneResults(next);
    setSelectedPhone(next[0] || null);
    setNotices([
      ...(live?.status === 'rejected' ? [`Live phone lookup: ${live.reason.message}`] : []),
      ...(local?.status === 'rejected' ? [`Imported datasets: ${local.reason.message}`] : []),
    ]);
    addHistory('phone', searchQuery, next.length);
    setSearching(false);
  };

  const runSearch = async (override, typeOverride, scopeOverride) => {
    const rawQuery = String(override ?? query).trim();
    const selectedType = typeOverride ?? searchType;
    const scope = scopeOverride ?? sourceScope;
    if (!rawQuery) {
      setSearchError('Enter a username or phone number to search.');
      return;
    }
    const type = resolveSearchType(rawQuery, selectedType);
    const normalized = normalizeSearchQuery(rawQuery, type);
    setQuery(normalized);
    setResolvedType(type);
    setSearchError('');
    if (type === 'phone') {
      await runPhone(normalized, scope);
    } else {
      await runProfile(normalized, scope);
    }
  };

  const rerun = (item) => {
    const type = item.type === 'username' ? 'profile' : item.type;
    setTab(0);
    setSearchType(type);
    setQuery(item.query);
    runSearch(item.query, type, sourceScope);
  };

  const previewType = searchType === 'auto' && query.trim()
    ? resolveSearchType(query, 'auto')
    : resolvedType;

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AppBar position="sticky" color="transparent" elevation={0} sx={{ backdropFilter: 'blur(16px)', bgcolor: 'rgba(9,17,31,0.86)', borderBottom: 1, borderColor: 'divider' }}>
        <Toolbar>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h6">Who Is It?</Typography>
            <Typography variant="caption" color="text.secondary">Investigation workspace</Typography>
          </Box>
          <Tooltip title={status.message}>
            <Chip
              icon={status.checking ? <CircularProgress size={14} /> : <CloudDone />}
              label={status.checking ? 'Checking services' : status.ready ? 'Services online' : 'Service issue'}
              color={status.ready ? 'success' : 'warning'}
              variant="outlined"
              onClick={refresh}
            />
          </Tooltip>
          <Tooltip title="Refresh platform status"><IconButton onClick={refresh}><Refresh /></IconButton></Tooltip>
        </Toolbar>
        <Container maxWidth="xl">
          <Tabs value={tab} onChange={(_, value) => { setTab(value); setSearchError(''); setProfileError(''); setNotices([]); }} variant="scrollable" scrollButtons="auto">
            {tabs.map((item) => <Tab key={item.label} icon={item.icon} iconPosition="start" label={item.label} />)}
          </Tabs>
        </Container>
      </AppBar>
      <Container maxWidth="xl" sx={{ py: 3 }}>
        {tab === 0 && (
          <SearchShell
            title="Search"
            description="Investigate a username or phone number across connected APIs and imported datasets from one workspace."
            input={(
              <TextField
                fullWidth
                autoFocus
                label="Username or phone number"
                placeholder={searchType === 'phone' ? '+12025550101' : 'demo_ada_1843'}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && runSearch()}
              />
            )}
            controls={(
              <>
                <TextField
                  select
                  label="Search type"
                  value={searchType}
                  onChange={(event) => {
                    const nextType = event.target.value;
                    setSearchType(nextType);
                    if (nextType !== 'auto') setResolvedType(nextType);
                  }}
                  sx={{ minWidth: 150 }}
                >
                  <MenuItem value="auto">Auto detect</MenuItem>
                  <MenuItem value="profile">Profile</MenuItem>
                  <MenuItem value="phone">Phone</MenuItem>
                </TextField>
                <TextField
                  select
                  label="Sources"
                  value={sourceScope}
                  onChange={(event) => setSourceScope(event.target.value)}
                  sx={{ minWidth: 160 }}
                >
                  <MenuItem value="all">All sources</MenuItem>
                  <MenuItem value="live">Live APIs only</MenuItem>
                  <MenuItem value="datasets">Datasets only</MenuItem>
                </TextField>
              </>
            )}
            button={(
              <Button
                variant="contained"
                onClick={() => runSearch()}
                disabled={searching}
                startIcon={searching ? <CircularProgress size={18} /> : previewType === 'phone' ? <PhoneEnabled /> : <PersonSearch />}
                sx={{ minWidth: 150 }}
              >
                {searching ? 'Searching…' : 'Search'}
              </Button>
            )}
            context={(
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
                <Chip
                  size="small"
                  icon={previewType === 'phone' ? <PhoneEnabled /> : <PersonSearch />}
                  label={searchType === 'auto'
                    ? `Auto routes this search to ${previewType === 'phone' ? 'phone' : 'profile'} services`
                    : `${resolvedType === 'phone' ? 'Phone' : 'Profile'} search selected`}
                  variant="outlined"
                />
                <Typography variant="caption" color="text.secondary">
                  Source filters control which services are called, helping avoid unnecessary provider usage.
                </Typography>
              </Stack>
            )}
            error={searchError}
            notices={notices}
            results={resolvedType === 'phone'
              ? phoneResults.length
                ? phoneResults.map((record, index) => (
                  <ResultRow
                    key={record.id || `${record.source_type}-${index}`}
                    title={record.caller_name || 'Unknown caller'}
                    subtitle={record.phone_number}
                    source={record.source_type === 'dataset' ? 'Dataset' : 'Live API'}
                    selected={selectedPhone === record}
                    onClick={() => setSelectedPhone(record)}
                  >
                    <Grid container spacing={1}>
                      <Grid item xs={6}><DetailItem label="Carrier" value={record.carrier_name} /></Grid>
                      <Grid item xs={6}><DetailItem label="Line type" value={record.line_type} /></Grid>
                      <Grid item xs={6}><DetailItem label="Country" value={record.country_code} /></Grid>
                      <Grid item xs={6}><DetailItem label="Valid" value={record.valid} /></Grid>
                    </Grid>
                  </ResultRow>
                ))
                : <EmptyState title="No phone results yet" body="Search an E.164 number to query the selected phone sources." />
              : usernameResults.length
                ? usernameResults.map((record, index) => {
                  const local = record.result_kind === 'dataset';
                  return (
                    <ResultRow
                      key={record.id || record.validation_uri || index}
                      title={local ? record.name || `@${record.username}` : record.title || 'Public profile'}
                      subtitle={local ? `${record.platform || 'Imported'} · @${record.username}` : record.profile_uri || 'No public URL'}
                      source={local ? 'Dataset' : 'Live scan'}
                      selected={local && selectedProfile?.id === record.id}
                      onClick={local ? () => { setProfileError(''); setSelectedProfile(record); } : undefined}
                      action={!local && record.is_valid_profile
                        ? <Button size="small" startIcon={<Search />} onClick={() => inspectProfile(record.profile_uri)}>Inspect profile</Button>
                        : null}
                    >
                      {local ? (
                        <Stack spacing={1}>
                          {record.bio && (
                            <Typography variant="body2" color="text.secondary" sx={{ display: '-webkit-box', overflow: 'hidden', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2 }}>
                              {record.bio}
                            </Typography>
                          )}
                          <Grid container spacing={1}>
                            <Grid item xs={6}><DetailItem label="Dataset" value={record.dataset_name} /></Grid>
                            <Grid item xs={6}><DetailItem label="Location" value={record.location} /></Grid>
                            <Grid item xs={6}><DetailItem label="Verified" value={record.verified} /></Grid>
                            <Grid item xs={6}><DetailItem label="Confidence" value={present(record.confidence) ? `${Math.round(record.confidence * 100)}%` : null} /></Grid>
                          </Grid>
                          {record.observed_at && (
                            <Typography variant="caption" color="text.secondary">
                              Observed {new Date(record.observed_at).toLocaleString()}
                            </Typography>
                          )}
                        </Stack>
                      ) : (
                        <Stack spacing={1}>
                          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                            <Chip
                              size="small"
                              color={record.is_valid_profile ? 'success' : 'default'}
                              label={record.is_valid_profile ? 'Public account confirmed' : 'Not confirmed'}
                            />
                            {record.validation?.reason && <Chip size="small" variant="outlined" label={humanize(record.validation.reason)} />}
                          </Stack>
                          {record.validation?.msg && <Typography variant="body2">{record.validation.msg}</Typography>}
                          {record.validation?.desc && <Typography variant="caption" color="text.secondary">{record.validation.desc}</Typography>}
                          <DetailItem label="Public profile" value={record.profile_uri} href={record.profile_uri} />
                          <DetailItem label="Validation evidence" value={record.validation_uri} href={record.validation_uri} />
                          <Typography variant="caption" color="text.secondary">
                            This public scan evidence remains available even when expanded X API inspection has no credits.
                          </Typography>
                        </Stack>
                      )}
                    </ResultRow>
                  );
                })
                : <EmptyState title="No profile results yet" body="Search a username to query the selected profile sources." />}
            detail={resolvedType === 'phone'
              ? <PhoneDetail phone={selectedPhone} />
              : <ProfileDetail profile={selectedProfile} loading={profileLoading} error={profileError} />}
          />
        )}
        {tab === 1 && <DatasetWorkspace datasets={datasets} reloadDatasets={reloadDatasets} />}
        {tab === 2 && <IntegrationsWorkspace onPlatformRefresh={refresh} />}
        {tab === 3 && (
          <Stack spacing={2.5}>
            <Stack direction="row" justifyContent="space-between" alignItems="end">
              <Box><Typography variant="h4">Search history</Typography><Typography color="text.secondary">Recent searches stay on this device and can be rerun with one click.</Typography></Box>
              <Button color="inherit" onClick={() => { setHistory([]); localStorage.removeItem(HISTORY_KEY); }} disabled={!history.length}>Clear history</Button>
            </Stack>
            <Paper sx={{ p: 2.5 }}>
              <Stack spacing={1}>
                {history.map((item) => (
                  <Card variant="outlined" key={item.id}>
                    <CardContent sx={{ '&:last-child': { pb: 2 }, p: 2 }}>
                      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={1}>
                        <Box>
                          <Stack direction="row" spacing={1} alignItems="center"><Chip size="small" label={humanize(item.type)} /><Typography variant="subtitle1">{item.query}</Typography></Stack>
                          <Typography variant="body2" color="text.secondary">{item.count} results · {new Date(item.searchedAt).toLocaleString()}</Typography>
                        </Box>
                        <Button size="small" startIcon={<Search />} onClick={() => rerun(item)}>Run again</Button>
                      </Stack>
                    </CardContent>
                  </Card>
                ))}
                {!history.length && <EmptyState title="No search history" body="Username and phone searches will be recorded here." />}
              </Stack>
            </Paper>
          </Stack>
        )}
      </Container>
    </ThemeProvider>
  );
}

createRoot(document.getElementById('root')).render(<App />);
