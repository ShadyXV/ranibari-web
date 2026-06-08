import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(__dirname, '..', '..')
const DEFAULT_PB_DATA_DIR = join(PROJECT_ROOT, '..', 'park-map-demo', 'pocketbase', 'pb_data')

export function loadLocalEnv() {
  for (const filename of ['.env.local', '.env']) {
    const path = join(PROJECT_ROOT, filename)
    if (!existsSync(path)) continue

    const lines = readFileSync(path, 'utf8').split(/\r?\n/)
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue
      const [rawKey, ...rawValue] = trimmed.split('=')
      const key = rawKey.trim()
      const value = rawValue.join('=').trim().replace(/^["']|["']$/g, '')
      if (!process.env[key]) process.env[key] = value
    }
  }
}

export function parseArgs(argv = process.argv.slice(2)) {
  const args = {}
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (!arg.startsWith('--')) continue

    const [key, inlineValue] = arg.slice(2).split('=')
    if (inlineValue !== undefined) {
      args[key] = inlineValue
    } else if (argv[index + 1] && !argv[index + 1].startsWith('--')) {
      args[key] = argv[index + 1]
      index += 1
    } else {
      args[key] = true
    }
  }
  return args
}

export function formatBytes(bytes) {
  if (!bytes) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

export function ensureDir(path) {
  mkdirSync(path, { recursive: true })
}

export function writeJson(path, value) {
  ensureDir(dirname(path))
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

function runSqlJson(dbPath, sql) {
  const output = execFileSync('sqlite3', ['-json', dbPath, sql], { encoding: 'utf8' }).trim()
  return output ? JSON.parse(output) : []
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function fileInfo(path) {
  if (!path || !existsSync(path)) {
    return { exists: false, bytes: 0, path }
  }
  return { exists: true, bytes: statSync(path).size, path }
}

function storageFile(pbDataDir, collectionId, recordId, filename) {
  if (!filename) return null
  return join(pbDataDir, 'storage', collectionId, recordId, filename)
}

function sumBytes(items) {
  return items.reduce((sum, item) => sum + (item?.bytes || 0), 0)
}

export function getPocketBaseDataDir(args = parseArgs()) {
  return args['pb-data-dir'] || process.env.PB_DATA_DIR || DEFAULT_PB_DATA_DIR
}

export function readPocketBaseArchive(pbDataDir = getPocketBaseDataDir()) {
  const dbPath = join(pbDataDir, 'data.db')
  if (!existsSync(dbPath)) {
    throw new Error(`PocketBase data.db not found: ${dbPath}`)
  }

  const collections = runSqlJson(dbPath, 'select name, id from _collections;')
  const collectionIds = Object.fromEntries(collections.map((collection) => [collection.name, collection.id]))
  const pointsCollectionId = collectionIds.points
  const timeslotsCollectionId = collectionIds.timeslots

  if (!pointsCollectionId || !timeslotsCollectionId) {
    throw new Error('Could not resolve PocketBase points/timeslots collection IDs.')
  }

  const rawPoints = runSqlJson(
    dbPath,
    'select id, lat, lng, label, cluster, gridIndex, priority, notes, images from points order by gridIndex;',
  )
  const rawTimeslots = runSqlJson(
    dbPath,
    'select id, point, slot, collectedAt, weather, video_raw, video_hq, audio from timeslots;',
  )

  const points = rawPoints.map((point) => {
    const images = parseJsonArray(point.images)
    return {
      id: point.id,
      lat: Number(point.lat),
      lng: Number(point.lng),
      label: point.label || '',
      cluster: point.cluster || 'general',
      gridIndex: Number.isFinite(Number(point.gridIndex)) ? Number(point.gridIndex) : null,
      priority: point.priority || '',
      notes: point.notes || '',
      _skippedImages: images,
    }
  })

  const timeslots = rawTimeslots.map((timeslot) => {
    const raw = fileInfo(storageFile(pbDataDir, timeslotsCollectionId, timeslot.id, timeslot.video_raw))
    const hq = fileInfo(storageFile(pbDataDir, timeslotsCollectionId, timeslot.id, timeslot.video_hq))
    const audio = fileInfo(storageFile(pbDataDir, timeslotsCollectionId, timeslot.id, timeslot.audio))

    return {
      id: timeslot.id,
      pointId: timeslot.point,
      slot: timeslot.slot || '',
      collectedAt: timeslot.collectedAt || null,
      weather: timeslot.weather || '',
      sourcePocketBaseId: timeslot.id,
      sourceFiles: {
        raw: timeslot.video_raw ? { filename: timeslot.video_raw, ...raw } : null,
        hq: timeslot.video_hq ? { filename: timeslot.video_hq, ...hq } : null,
        audio: timeslot.audio ? { filename: timeslot.audio, ...audio } : null,
      },
      mediaPaths: {
        videoHqPath: timeslot.video_hq ? `timeslots/${timeslot.id}/video_hq.mp4` : null,
        audioPath: timeslot.audio ? `timeslots/${timeslot.id}/audio.aac` : null,
      },
    }
  })

  const pointImageCount = points.reduce((sum, point) => sum + point._skippedImages.length, 0)
  const hqFiles = timeslots.map((timeslot) => timeslot.sourceFiles.hq).filter(Boolean)
  const audioFiles = timeslots.map((timeslot) => timeslot.sourceFiles.audio).filter(Boolean)
  const rawFiles = timeslots.map((timeslot) => timeslot.sourceFiles.raw).filter(Boolean)

  const stats = {
    points: points.length,
    timeslots: timeslots.length,
    hqVideos: hqFiles.filter((file) => file.exists).length,
    audioFiles: audioFiles.filter((file) => file.exists).length,
    rawVideosExcluded: rawFiles.filter((file) => file.exists).length,
    pointImagesSkipped: pointImageCount,
    hqBytes: sumBytes(hqFiles),
    audioBytes: sumBytes(audioFiles),
    rawBytesExcluded: sumBytes(rawFiles),
    plannedUploadBytes: sumBytes(hqFiles) + sumBytes(audioFiles),
    missingFiles: [
      ...hqFiles.filter((file) => !file.exists),
      ...audioFiles.filter((file) => !file.exists),
    ].map((file) => file.path),
  }

  return {
    pbDataDir,
    points,
    timeslots,
    stats,
    manifestPoints: points.map(({ _skippedImages, ...point }) => point),
    manifestTimeslots: timeslots.map((timeslot) => ({
      id: timeslot.id,
      pointId: timeslot.pointId,
      slot: timeslot.slot,
      collectedAt: timeslot.collectedAt,
      weather: timeslot.weather,
      videoHqPath: timeslot.mediaPaths.videoHqPath,
      audioPath: timeslot.mediaPaths.audioPath,
      sourcePocketBaseId: timeslot.sourcePocketBaseId,
    })),
  }
}
