# AGENTS.md

This is a standalone Vite + React frontend for the Ranibari static archive. It is intentionally separate from `park-map-demo`; do not treat it as a monorepo package.

## Commands

```bash
npm run dev
npm run build
npm run preview
npm run migrate:audit
npm run data:export
npm run media:upload
npm run media:upload -- --confirm
```

## Architecture

- GitHub Pages hosts the built frontend from `dist/`.
- Structured data lives in `public/data/archive-manifest.json`.
- UploadThing stores media files.
- `public/data/archive-manifest.json` stores returned public UploadThing URLs after upload.
- Point images, raw iPhone videos, PocketBase Studio, test collections, and orphaned PocketBase files are out of scope for v1.

## Migration

Scripts read PocketBase data from `PB_DATA_DIR`, defaulting to `../park-map-demo/pocketbase/pb_data`.

Always run `npm run migrate:audit` before uploading. The migration must fail if the planned upload exceeds `4.5 GB`.

UploadThing upload credentials use `UPLOADTHING_TOKEN`; never expose that in the browser or GitHub Pages variables.
