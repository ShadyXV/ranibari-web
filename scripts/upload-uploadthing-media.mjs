import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { UTApi, UTFile } from 'uploadthing/server'
import {
  formatBytes,
  getPocketBaseDataDir,
  loadLocalEnv,
  parseArgs,
  readPocketBaseArchive,
  writeJson,
} from './lib/pocketbase-export.mjs'

loadLocalEnv()

const args = parseArgs()
const confirm = Boolean(args.confirm)
const limitGb = Number(args['limit-gb'] ?? 2)
const limitBytes = limitGb * 1024 * 1024 * 1024
const archive = readPocketBaseArchive(getPocketBaseDataDir(args))

if (archive.stats.missingFiles.length) {
  throw new Error(`Missing referenced HQ/audio files:\n${archive.stats.missingFiles.join('\n')}`)
}

if (archive.stats.plannedUploadBytes > limitBytes) {
  throw new Error(`Planned upload ${formatBytes(archive.stats.plannedUploadBytes)} exceeds ${limitGb} GB.`)
}

function mediaItems() {
  const items = []
  for (const timeslot of archive.timeslots) {
    if (timeslot.sourceFiles.hq?.exists) {
      items.push({
        customId: `ranibari-${timeslot.id}-video-hq`,
        timeslotId: timeslot.id,
        field: 'videoHqUrl',
        pathField: 'videoHqPath',
        name: `${timeslot.id}_video_hq.mp4`,
        type: 'video/mp4',
        source: timeslot.sourceFiles.hq,
      })
    }

    if (timeslot.sourceFiles.audio?.exists) {
      items.push({
        customId: `ranibari-${timeslot.id}-audio`,
        timeslotId: timeslot.id,
        field: 'audioUrl',
        pathField: 'audioPath',
        name: `${timeslot.id}_audio.aac`,
        type: 'audio/aac',
        source: timeslot.sourceFiles.audio,
      })
    }
  }
  return items
}

function publicUploadThingUrl(identifier) {
  const appId = process.env.UPLOADTHING_APP_ID
  if (!appId || !identifier) return null
  return `https://${appId}.ufs.sh/f/${identifier}`
}

async function findExistingUpload(utapi, customId) {
  let offset = 0
  const limit = 500

  while (true) {
    const result = await utapi.listFiles({ limit, offset })
    const existing = result.files.find((file) => file.customId === customId)
    if (existing) return existing
    if (!result.hasMore) return null
    offset += limit
  }
}

async function withoutUploadThingDeprecatedUrlWarnings(action) {
  const originalWarn = console.warn
  console.warn = (...messages) => {
    const message = messages.map(String).join(' ')
    const isUploadThingUrlWarning =
      message.includes('[uploadthing][deprecated]') &&
      (message.includes('`file.url` is deprecated') || message.includes('`file.appUrl` is deprecated'))

    if (!isUploadThingUrlWarning) originalWarn(...messages)
  }

  try {
    return await action()
  } finally {
    console.warn = originalWarn
  }
}

function writeManifest(uploadedByTimeslot) {
  const timeslots = archive.manifestTimeslots.map((timeslot) => ({
    ...timeslot,
    videoHqUrl: uploadedByTimeslot[timeslot.id]?.videoHqUrl || null,
    audioUrl: uploadedByTimeslot[timeslot.id]?.audioUrl || null,
  }))

  writeJson(join('public', 'data', 'archive-manifest.json'), {
    version: 1,
    generatedAt: new Date().toISOString(),
    mediaProvider: 'uploadthing',
    stats: {
      points: archive.stats.points,
      timeslots: archive.stats.timeslots,
      hqVideos: archive.stats.hqVideos,
      audioFiles: archive.stats.audioFiles,
      rawVideosExcluded: archive.stats.rawVideosExcluded,
      pointImagesSkipped: archive.stats.pointImagesSkipped,
      plannedUploadBytes: archive.stats.plannedUploadBytes,
    },
    points: archive.manifestPoints,
    timeslots,
  })
}

const items = mediaItems()
const report = {
  generatedAt: new Date().toISOString(),
  provider: 'uploadthing',
  dryRun: !confirm,
  limitGb,
  stats: archive.stats,
  uploads: [],
}

console.log('Ranibari UploadThing media upload')
console.log(`Mode: ${confirm ? 'write' : 'dry run'}`)
console.log(`Planned upload: ${formatBytes(archive.stats.plannedUploadBytes)} / ${limitGb} GB`)
console.log(`Files: ${items.length}`)

if (!confirm) {
  for (const item of items) {
    report.uploads.push({
      customId: item.customId,
      field: item.field,
      source: item.source.path,
      bytes: item.source.bytes,
      skipped: 'dry-run',
    })
  }
  writeJson(join('.migration', 'uploadthing-dry-run-report.json'), report)
  console.log('Dry run only. Add -- --confirm to upload to UploadThing.')
  console.log('Report: .migration/uploadthing-dry-run-report.json')
  process.exit(0)
}

if (!process.env.UPLOADTHING_TOKEN) {
  throw new Error('Missing UPLOADTHING_TOKEN in .env.local or shell environment.')
}

const utapi = new UTApi({ token: process.env.UPLOADTHING_TOKEN })
const uploadedByTimeslot = {}

for (const item of items) {
  if (!uploadedByTimeslot[item.timeslotId]) uploadedByTimeslot[item.timeslotId] = {}

  const existingUpload = await findExistingUpload(utapi, item.customId)
  if (existingUpload) {
    const existingUrl =
      publicUploadThingUrl(item.customId) || publicUploadThingUrl(existingUpload.key)
    if (!existingUrl) {
      throw new Error(
        `Found existing UploadThing file for ${item.customId}, but UPLOADTHING_APP_ID is missing. ` +
        'Set it so the script can construct the public ufs.sh URL.',
      )
    }

    uploadedByTimeslot[item.timeslotId][item.field] = existingUrl
    report.uploads.push({
      customId: item.customId,
      field: item.field,
      source: item.source.path,
      bytes: item.source.bytes,
      key: existingUpload.key,
      url: existingUrl,
      skipped: 'already-uploaded',
    })
    console.log(`Reuse ${item.customId}`)
    continue
  }

  const file = new UTFile(
    [readFileSync(item.source.path)],
    item.name,
    {
      type: item.type,
      customId: item.customId,
    },
  )

  const result = await withoutUploadThingDeprecatedUrlWarnings(() =>
    utapi.uploadFiles(file, {
      contentDisposition: 'inline',
    }),
  )

  if (result.error) {
    throw new Error(`Upload failed for ${item.customId}: ${result.error.message}`)
  }

  const url =
    result.data?.ufsUrl || publicUploadThingUrl(result.data?.key) || publicUploadThingUrl(item.customId)
  if (!url) {
    throw new Error(`UploadThing did not return a URL for ${item.customId}`)
  }

  uploadedByTimeslot[item.timeslotId][item.field] = url
  report.uploads.push({
    customId: item.customId,
    field: item.field,
    source: item.source.path,
    bytes: item.source.bytes,
    key: result.data.key,
    url,
    uploaded: true,
  })
  console.log(`Uploaded ${item.customId} (${formatBytes(item.source.bytes)})`)
}

writeManifest(uploadedByTimeslot)
writeJson(join('.migration', 'uploadthing-upload-report.json'), report)

console.log('Wrote public/data/archive-manifest.json with UploadThing URLs')
console.log('Report: .migration/uploadthing-upload-report.json')
