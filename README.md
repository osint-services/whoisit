# Who Is It?

Who Is It? is the Electron investigation workspace for the OSINT Services Platform.

## Experience

The application is organized into four work areas:

- **Username** searches public username availability and imported profile datasets together, then opens expanded X metadata or stored source records in a detail pane.
- **Phone** combines Twilio caller-name lookup with exact E.164 matches from imported phone datasets.
- **Datasets** imports CSV, JSON, JSONL, or NDJSON, previews rows, auto-maps familiar column names, and lets the user review or override every canonical field.
- **History** stores the last 50 searches locally and can rerun them. History never leaves the device.

Provider failures are isolated by source. For example, a Twilio error appears in the phone workspace while matching imported records remain usable.

## Run and test

Start the parent platform stack first, then:

```bash
npm install
npm start
```

Useful commands:

```bash
npm test          # CSV/JSON/JSONL parser tests
npm run package   # unpacked desktop application
npm run make      # distributable artifacts
```

Development tools are closed by default. Set `WHOISIT_DEVTOOLS=1` before `npm start` when you want Electron DevTools to open automatically.

## Data imports

Files are parsed locally in the renderer and sent through nginx to `/datasets/import` as mapped JSON rows. Imports are limited to 10 MB and 10,000 records. The UI requires:

- `Username` or `Profile URL` for profile datasets; or
- `Phone number` in E.164 format for phone datasets.

Imported results show dataset provenance, source, observation time, confidence, normalized metadata, and the original row. Dataset files may contain sensitive or licensed data; users are responsible for access, retention, and permitted use.

## Service integration

The application talks to `http://127.0.0.1:80`:

- `/scan/{username}`
- `/focus?url=...`
- `/phone_search?phone_number=...`
- `/datasets/...`

The main process checks all four services and can invoke the parent repository's `scripts/start.sh` when the stack is unavailable.
