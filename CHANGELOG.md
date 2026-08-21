# Changelog

## [Unreleased]

### Added

- Native Map workspace backed by the shared Social Mapping GeoJSON API.
- Place, radius, keyword, and source controls with interactive map and result/archive views.
- Provider degradation warnings, source and accuracy badges, provenance details, and associated identity/phone metadata.
- Social Mapping readiness in the Integrations workspace and platform startup checks.
- Unit coverage for canonical map query construction and GeoJSON normalization.

### Changed

- Core platform readiness now permits operation without X credentials; X availability remains a separate integration status.
- X credential updates recreate both profile search and Social Mapping services.
- Corrected package license metadata to GPL-3.0-only.

### Accuracy

- Phone records are displayed only as associations and never as phone/device location evidence.
- The UI distinguishes exact coordinates, place centroids, and unknown dataset accuracy.
