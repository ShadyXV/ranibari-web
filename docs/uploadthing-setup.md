# UploadThing Setup

This project uses GitHub Pages for the app, static JSON for archive data, and UploadThing for video/audio files.

## 1. Create An UploadThing App

1. Open [UploadThing](https://uploadthing.com/).
2. Sign in and create an app.
3. Confirm the app has enough storage for the current media set. The current planned upload is about `1.17 GB` decimal (`1.09 GiB`), under the free `2GB App` storage limit listed by UploadThing.
4. Confirm files are publicly accessible by URL. UploadThing documents public URL access as the default behavior for uploaded files.
5. Open the app's API keys/settings area and copy the UploadThing token.
6. Copy the UploadThing app id from the public file URL shape: `https://<app-id>.ufs.sh/f/<file-id>`.

## 2. Local Environment

Create `.env.local`:

```bash
UPLOADTHING_TOKEN=your_uploadthing_token
UPLOADTHING_APP_ID=your_uploadthing_app_id
PB_DATA_DIR=../park-map-demo/pocketbase/pb_data
```

`VITE_MEDIA_BASE_URL` is not required when using UploadThing because the upload script writes absolute returned UploadThing URLs into `public/data/archive-manifest.json`.

Never put `UPLOADTHING_TOKEN` into frontend code or GitHub Pages variables. `UPLOADTHING_APP_ID` is not secret, but it only needs to live locally for the migration script.

## 3. Audit The Media Size

```bash
npm run migrate:audit -- --limit-gb=2
```

Expected current result:

- 112 points
- 48 timeslots
- 30 HQ videos
- 30 audio files
- about 1.17 GB planned upload
- raw iPhone video excluded
- point images skipped

## 4. Export The Manifest

This writes metadata without uploaded file URLs:

```bash
npm run data:export
```

## 5. Dry-Run Upload

```bash
npm run media:upload
```

This does not contact UploadThing or upload files. It writes `.migration/uploadthing-dry-run-report.json`.

## 6. Upload Media

```bash
npm run media:upload -- --confirm
```

The script uploads only:

- referenced 720p/HQ videos
- referenced audio files

The script then rewrites `public/data/archive-manifest.json` with the returned UploadThing URLs:

- `timeslots[].videoHqUrl`
- `timeslots[].audioUrl`

If you rerun the upload after an interrupted run, the script checks UploadThing by deterministic `customId` and reuses existing files. That reuse path needs `UPLOADTHING_APP_ID` so it can construct the public `ufs.sh` URL without using deprecated UploadThing URL fields.

## 7. Test Locally

```bash
npm run build
npm run preview
```

The app should load terrain first, then show the archive. Videos and audio are fetched from UploadThing only when selected or played.

## 8. GitHub Pages

No UploadThing secrets are needed in GitHub Actions. Commit and push the generated `public/data/archive-manifest.json` after upload. The manifest contains public file URLs; the secret token stays local.
