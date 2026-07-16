import * as React from 'react';
import { createRoot } from 'react-dom/client';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Container,
  Grid,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { PersonSearch, PhoneEnabled, Search } from '@mui/icons-material';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';

const API_BASE = 'http://127.0.0.1:80';

function usePlatformStatus() {
  const [status, setStatus] = React.useState({ ready: false, started: false, checking: true, message: 'Checking whether the platform services are available...' });

  const refresh = React.useCallback(async () => {
    if (!window.electronAPI?.ensurePlatform) {
      setStatus({ ready: true, started: false, checking: false, message: 'Electron bridge is unavailable; using direct API calls.' });
      return;
    }

    setStatus((current) => ({ ...current, checking: true }));
    const result = await window.electronAPI.ensurePlatform();
    setStatus({ ready: Boolean(result?.ready), started: Boolean(result?.started), checking: false, message: result?.message || 'Platform status unknown.' });
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  return { status, refresh };
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = data?.detail;
    const message = typeof detail === 'string'
      ? detail
      : detail && typeof detail === 'object' && 'message' in detail
        ? detail.message
        : `Request failed with ${response.status}`;
    throw new Error(message || 'Request failed');
  }

  return data;
}

function ResultCard({ result, onInspect }) {
  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          {result.title || 'Unknown result'}
        </Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          {result.validation_uri || result.profile_uri || 'No URI available'}
        </Typography>
        <Typography variant="body2" sx={{ mb: 1 }}>
          Valid profile: <strong>{String(result.is_valid_profile)}</strong>
        </Typography>
        <Button size="small" onClick={() => onInspect(result.profile_uri)} startIcon={<Search />}>
          Inspect profile
        </Button>
      </CardContent>
    </Card>
  );
}

const theme = createTheme({
  palette: {
    mode: 'dark',
  },
});

function SearchPage() {
  const { status, refresh } = usePlatformStatus();
  const [username, setUsername] = React.useState('');
  const [searchResults, setSearchResults] = React.useState([]);
  const [searching, setSearching] = React.useState(false);
  const [profileDetails, setProfileDetails] = React.useState(null);
  const [profileError, setProfileError] = React.useState('');
  const [phoneNumber, setPhoneNumber] = React.useState('');
  const [phoneData, setPhoneData] = React.useState(null);
  const [phoneSearching, setPhoneSearching] = React.useState(false);
  const [error, setError] = React.useState('');

  const ensurePlatformReady = async () => {
    if (window.electronAPI?.ensurePlatform) {
      const result = await window.electronAPI.ensurePlatform();
      const nextStatus = {
        ready: Boolean(result?.ready),
        started: Boolean(result?.started),
        checking: false,
        message: result?.message || 'Platform status unknown.',
      };
      return nextStatus;
    }
    return { ready: true, started: false, checking: false, message: 'Ready to use.' };
  };

  const handleScan = async () => {
    if (!username.trim()) {
      setError('Enter a username to scan first.');
      return;
    }

    setError('');
    const readiness = await ensurePlatformReady();
    if (!readiness.ready) {
      setError(readiness.message || 'The platform could not be started.');
      return;
    }

    setSearching(true);
    setSearchResults([]);
    setProfileDetails(null);
    try {
      const data = await requestJson(`${API_BASE}/scan/${encodeURIComponent(username.trim())}`);
      setSearchResults(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || 'Unable to scan that username.');
    } finally {
      setSearching(false);
    }
  };

  const handleInspect = async (profileUrl) => {
    if (!profileUrl) {
      setProfileError('No profile URL available for that result.');
      return;
    }

    const readiness = await ensurePlatformReady();
    if (!readiness.ready) {
      setProfileError(readiness.message || 'The platform could not be started.');
      return;
    }

    setProfileError('');
    setProfileDetails(null);
    try {
      const data = await requestJson(`${API_BASE}/focus?url=${encodeURIComponent(profileUrl)}`);
      setProfileDetails(data);
    } catch (err) {
      setProfileError(err.message || 'Unable to inspect that profile.');
    }
  };

  const handlePhoneLookup = async () => {
    if (!phoneNumber.trim()) {
      setError('Enter a phone number in E.164 format.');
      return;
    }

    const readiness = await ensurePlatformReady();
    if (!readiness.ready) {
      setError(readiness.message || 'The platform could not be started.');
      return;
    }

    setError('');
    setPhoneSearching(true);
    setPhoneData(null);
    try {
      const data = await requestJson(`${API_BASE}/phone_search?phone_number=${encodeURIComponent(phoneNumber.trim())}`);
      setPhoneData(data);
    } catch (err) {
      setError(err.message || 'Unable to look up that number.');
    } finally {
      setPhoneSearching(false);
    }
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h3" gutterBottom>
            Who Is It?
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Search usernames, inspect public profiles, and resolve caller metadata from the platform services.
          </Typography>
        </Box>

        <Paper sx={{ p: 3 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
            <Typography variant="h6">Platform status</Typography>
            <Button size="small" variant="outlined" onClick={() => refresh()}>
              Refresh
            </Button>
          </Stack>
          <Alert severity={status.ready ? 'success' : 'warning'} sx={{ mb: 2 }}>
            {status.checking ? 'Checking whether the platform services are available...' : status.message}
          </Alert>
        </Paper>

        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Username scan
          </Typography>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mt: 1 }}>
            <TextField
              fullWidth
              label="Username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && handleScan()}
            />
            <Button
              variant="contained"
              onClick={handleScan}
              disabled={searching}
              startIcon={searching ? <CircularProgress size={18} color="inherit" /> : <PersonSearch />}
            >
              {searching ? 'Scanning...' : 'Scan'}
            </Button>
          </Stack>
          {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
          <Grid container spacing={2} sx={{ mt: 1 }}>
            {searchResults.map((result) => (
              <Grid item xs={12} md={6} key={`${result.title}-${result.validation_uri}`}>
                <ResultCard result={result} onInspect={handleInspect} />
              </Grid>
            ))}
          </Grid>
        </Paper>

        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Profile inspection
          </Typography>
          {profileError && <Alert severity="warning" sx={{ mb: 2 }}>{profileError}</Alert>}
          {profileDetails ? (
            <Box sx={{ mt: 1 }}>
              <Typography variant="body1" sx={{ mb: 1 }}>
                <strong>Name:</strong> {profileDetails.name || profileDetails.username || 'Unknown'}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>
                {profileDetails.bio || 'No description available.'}
              </Typography>
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary">
              Select an inspection action from a scan result to query the profile search service.
            </Typography>
          )}
        </Paper>

        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Phone lookup
          </Typography>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mt: 1 }}>
            <TextField
              fullWidth
              label="Phone number"
              value={phoneNumber}
              onChange={(event) => setPhoneNumber(event.target.value)}
              placeholder="+18135551212"
            />
            <Button
              variant="outlined"
              onClick={handlePhoneLookup}
              disabled={phoneSearching}
              startIcon={phoneSearching ? <CircularProgress size={18} /> : <PhoneEnabled />}
            >
              {phoneSearching ? 'Checking...' : 'Lookup'}
            </Button>
          </Stack>
          {phoneData && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="body1">
                <strong>Caller:</strong> {phoneData.caller_name || 'No caller name returned'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Valid: {String(phoneData.valid)} • {phoneData.country_code || 'Unknown country'}
              </Typography>
            </Box>
          )}
        </Paper>
      </Stack>
    </Container>
  );
}

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <SearchPage />
    </ThemeProvider>
  );
}

const root = createRoot(document.body);
root.render(<App />);