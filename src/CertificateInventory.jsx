import * as React from 'react';
import { Alert, Button, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';

const endpoint = '/datasets/certificate-inventory';

function DomainSnapshot({ domain, requestJson }) {
  const [snapshot, setSnapshot] = React.useState(null);
  const [known, setKnown] = React.useState('');
  const [busy, setBusy] = React.useState(true);
  const [error, setError] = React.useState('');
  const path = endpoint + '/' + encodeURIComponent(domain);

  React.useEffect(() => {
    let active = true;
    requestJson(path).then(data => { if (active) setSnapshot(data); })
      .catch(e => { if (active) setError(e.message); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [path, requestJson]);

  async function refresh() {
    setBusy(true);
    setError('');
    try { setSnapshot(await requestJson(path + '/refresh', { method: 'POST' })); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  const baseline = new Set(known.toLowerCase().split(/\s+/).filter(Boolean).map(n => n.replace(/\.$/, '')));
  return <Stack spacing={2}>
    <Button disabled={busy} onClick={refresh}>{busy ? 'Loading…' : 'Refresh certificates'}</Button>
    {error && <Alert severity="error">{error}</Alert>}
    {snapshot && <>
      <Typography>Source: {snapshot.source} · Last attempt: {snapshot.attempted_at || 'None'} · Last successful snapshot: {snapshot.completed_at || 'None'}</Typography>
      {['provider_failure', 'invalid_response'].includes(snapshot.last_outcome) &&
        <Alert severity="warning">Refresh failed ({snapshot.last_outcome}). {snapshot.completed_at ? 'Showing the last successful snapshot.' : 'No successful snapshot is available.'}</Alert>}
      {snapshot.last_outcome === 'never_refreshed' && <Typography>No refresh yet.</Typography>}
      {snapshot.observations?.length === 0 && <Typography>The last successful lookup returned no in-scope names.</Typography>}
      {Boolean(snapshot.observations?.length) && <>
        <Typography>Certificate history records issuance. Current service availability is unknown.</Typography>
        <TextField multiline label="Known inventory names (one per line, exact match)" value={known} onChange={e => setKnown(e.target.value)} />
        {snapshot.observations.map(r => <Paper key={JSON.stringify([r.certificate_id, r.name])} sx={{ p: 2 }}>
          <Typography variant="h6">{r.name}</Typography>
          <Typography>{r.name.startsWith('*.') ? 'Wildcard' : 'Hostname'} · {baseline.size ? (baseline.has(r.name) ? 'In supplied inventory' : 'Absent from supplied inventory') : 'No comparison supplied'}</Typography>
          <Typography>Certificate {r.certificate_id} · {r.source} · Retrieved {r.retrieved_at}</Typography>
          <Typography>Validity: {r.not_before || 'Unknown'} to {r.not_after || 'Unknown'} · Logged: {r.logged_at || 'Unknown'}</Typography>
        </Paper>)}
      </>}
    </>}
  </Stack>;
}

export default function CertificateInventory({ requestJson }) {
  const [domains, setDomains] = React.useState(null);
  const [domain, setDomain] = React.useState('');
  const [error, setError] = React.useState('');
  React.useEffect(() => {
    let active = true;
    requestJson(endpoint).then(data => {
      if (active) { setDomains(data.domains); setDomain(data.domains[0] || ''); }
    }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [requestJson]);
  return <Stack spacing={2}>
    <Typography variant="h4">Certificate inventory</Typography>
    {error && <Alert severity="error">{error}</Alert>}
    {!domains && !error && <Typography>Loading domains…</Typography>}
    {domains?.length === 0 && <Typography>No owned domains configured. Set CERTIFICATE_INVENTORY_DOMAINS in the platform configuration.</Typography>}
    {domain && <>
      <TextField select label="Configured domain" value={domain} onChange={e => setDomain(e.target.value)}>
        {domains.map(d => <MenuItem key={d} value={d}>{d}</MenuItem>)}
      </TextField>
      <DomainSnapshot key={domain} domain={domain} requestJson={requestJson} />
    </>}
  </Stack>;
}
