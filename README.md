# Ranibari Static Web

Standalone GitHub Pages frontend for the Ranibari Community Forest video archive. The app reads point/timeslot data from a static JSON manifest and plays 720p video/audio from UploadThing.

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

The included workflow builds with Vite and publishes `dist/` to GitHub Pages. No UploadThing secret is needed in GitHub Actions because `public/data/archive-manifest.json` stores the public file URLs after upload.

For a custom domain, set `VITE_BASE_PATH=/` in the workflow or repository variables.

## Loading Behavior

The app shows a boot screen until the terrain manifest, all terrain JSON tiles, and the lazy 3D terrain module are loaded. Videos and audio are not preloaded.
