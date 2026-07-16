# whoisit

A lightweight Electron UI for the platform services.

## What it does

The UI can:
- probe the platform services over HTTP,
- attempt to start the Docker Compose stack from the parent platform repository when needed, and
- call the platform endpoints for username scanning, profile inspection, and phone lookup.

## Running locally

1. Install the dependencies:
   `npm install`
2. Start the app:
   `npm start`

The UI calls the running platform services through the nginx proxy on port `80`:
- `/scan/{username}` for username scanning
- `/focus?url=...` for profile inspection
- `/phone_search?phone_number=...` for caller lookup

## UI screenshot

If you add a screenshot later, place it in the `docs/` directory and name it `ui-screenshot.png`.
