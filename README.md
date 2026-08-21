# Who Is It?

Who Is It? is the native Electron investigation workspace for the [OSINT Services Platform](https://github.com/osint-services/platform).

## Workspaces

- **Search** combines public profile, phone, and imported identity results. Provider failures stay isolated and source filters can avoid unnecessary live API calls. Results with explicit coordinate evidence include a **Go to map** action.
- **Map** calls the shared `/map/search` GeoJSON API directly. It provides place, radius, keyword, and source controls; an interactive Leaflet map; result and archive lists; provider warnings; source and accuracy badges; provenance; and associated profile/phone metadata.
- **Datasets** previews and maps CSV, JSON, JSONL, or NDJSON into sparse entity records, including optional explicit coordinate evidence.
- **Integrations** reports X/Tweepy, Twilio Lookup, local dataset, and Social Mapping readiness and supports protected credential replacement.
- **History** keeps recent profile and phone searches on the local device.

The Map workspace is native UI, not an embedded browser. The standalone [`social_mapping`](https://github.com/osint-services/social_mapping) client remains available for development and browser demos, and both clients consume the same API contract.

Selecting **Go to map** switches workspaces and performs a coordinate-origin search centered on that evidence. Profiles and entities can use their own validated coordinate pair. A phone result can navigate only through a separately geolocated associated entity; the phone record itself never supplies or implies a location. Free-text locations do not enable the action.

## Run and test

Start the parent platform stack first, then:

```bash
npm install
npm start
```

Useful commands:

```bash
npm test
npm run package
npm audit --omit=dev
```

Set `WHOISIT_DEVTOOLS=1` before `npm start` to open Electron DevTools.

## Map behavior and accuracy

The map searches by investigator-entered place, radius, optional keyword, and one or both initial sources:

- **Datasets** returns only imported entities or profiles with a valid explicit latitude/longitude pair.
- **X** returns recent posts only when X provides exact coordinates or a place bounding box. Place results use the bounding-box centroid and are labeled `place` accuracy.

When X is unconfigured or unavailable, dataset results remain usable and the Map workspace displays a provider warning. Phone rows may appear as associated entity metadata but never create or imply a phone/device location. Free-text profile locations are not treated as post coordinates.

Search-to-map handoffs query by latitude and longitude, bypass Nominatim, select the matching mapped record when available, and display whether the coordinates came from the record or an associated entity.

Nominatim resolves only the investigator's entered search origin, server-side. OpenStreetMap attribution appears on the map. A marker is evidence tied to a source record, not proof of a person's present location.

## Data imports

Files are parsed in the renderer and sent to `/datasets/import`. Imports are limited to 10 MB and 10,000 records. Every entity row requires a username, profile URL, or E.164 phone number. Optional coordinate fields are `latitude`, `longitude`, `location_accuracy`, and `location_source`; latitude and longitude must be a valid pair.

Imported results retain dataset provenance, source, observation time, confidence, and the original row. Import only data you are authorized to retain and use.

## Service integration

The app calls `http://127.0.0.1:80`:

- `/scan/{username}`
- `/focus?url=...`
- `/phone_search?phone_number=...`
- `/datasets/...`
- `/map/search`
- `/map/readyz`

Core platform readiness no longer requires an X credential. X integration status remains visible separately, while credential-free dataset search and mapping continue to work.

## License

GPL-3.0-only. See [LICENSE](LICENSE).
