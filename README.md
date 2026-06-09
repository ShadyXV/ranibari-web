# Ranibari Web

An interactive art demo for exploring Ranibari Community Forest through sound, terrain, and video.

The project begins with a simple invitation: listen first. Visitors move through a 3D terrain and discover small sound points from the forest before opening the videos attached to those places. It is a proof of concept for a slower, more immersive archive experience where the landscape is not just a backdrop, but the way into the material.

This first version is intentionally small. It focuses on one day of collected field recordings and videos, using a compact static dataset that can be hosted on GitHub Pages. The long-term direction is to expand the same format across different times of day, seasons, weather conditions, and richer media: higher fidelity imagery, layered audio, 360 video panoramas, and other spatial materials that let people feel their way through the forest before diving deeper into each recording.

Technically, this is a standalone Vite + React frontend. It reads point and timeslot data from a static JSON manifest and plays 720p video/audio from UploadThing.

## Current Demo

- 3D terrain-first interface for exploring the forest spatially.
- Sound-led interaction, with video available after selecting a point.
- Static manifest data designed for lightweight hosting.
- Manual GitHub Pages deployment for controlled demo publishing.
- A foundation for future seasonal, time-based, and immersive media layers.

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Detailed UploadThing setup is in [docs/uploadthing-setup.md](docs/uploadthing-setup.md).

## Data Model

`public/data/archive-manifest.json`:

- `points[]`: `id`, `lat`, `lng`, `label`, `cluster`, `gridIndex`, `priority`, `notes`
- `timeslots[]`: `id`, `pointId`, `slot`, `collectedAt`, `weather`, `videoHqPath`, `audioPath`, `sourcePocketBaseId`

UploadThing media:

- `timeslots/{timeslotId}/video_hq.mp4`
- `timeslots/{timeslotId}/audio.aac`

Point images and raw iPhone videos are not migrated.

## Export + Upload

The scripts read PocketBase from `../park-map-demo/pocketbase/pb_data` by default.

```bash
npm run migrate:audit
npm run data:export
npm run media:upload
npm run media:upload -- --confirm
```

`npm run media:upload` is a dry run unless `-- --confirm` is supplied. For real uploads, set:

- `UPLOADTHING_TOKEN`

## GitHub Pages

The included workflow builds with Vite and publishes `dist/` to GitHub Pages only when run manually from the GitHub Actions tab. It does not deploy automatically on pushes to `main`.

In the repository settings, set Pages to deploy from GitHub Actions. Then run the `Deploy GitHub Pages` workflow manually when you want to publish the current branch.

No UploadThing secret is needed in GitHub Actions because `public/data/archive-manifest.json` stores the public file URLs after upload.

For a custom domain, set `VITE_BASE_PATH=/` in the workflow or repository variables.

## Loading Behavior

The app shows a boot screen until the terrain manifest, all terrain JSON tiles, and the lazy 3D terrain module are loaded. Videos and audio are not preloaded.
