import { join } from 'node:path'
import {
  formatBytes,
  getPocketBaseDataDir,
  parseArgs,
  readPocketBaseArchive,
  writeJson,
} from './lib/pocketbase-export.mjs'

const args = parseArgs()
const limitGb = Number(args['limit-gb'] ?? 4.5)
const limitBytes = limitGb * 1024 * 1024 * 1024
const archive = readPocketBaseArchive(getPocketBaseDataDir(args))
const { stats } = archive

const report = {
  generatedAt: new Date().toISOString(),
  pbDataDir: archive.pbDataDir,
  limitGb,
  stats,
  readable: {
    hqVideos: formatBytes(stats.hqBytes),
    audio: formatBytes(stats.audioBytes),
    rawExcluded: formatBytes(stats.rawBytesExcluded),
    plannedUpload: formatBytes(stats.plannedUploadBytes),
  },
}

writeJson(join('.migration', 'audit-report.json'), report)

console.log('Ranibari PocketBase media audit')
console.log(`PocketBase data: ${archive.pbDataDir}`)
console.log(`Points: ${stats.points}`)
console.log(`Timeslots: ${stats.timeslots}`)
console.log(`HQ videos planned: ${stats.hqVideos} (${formatBytes(stats.hqBytes)})`)
console.log(`Audio planned: ${stats.audioFiles} (${formatBytes(stats.audioBytes)})`)
console.log(`Raw videos excluded: ${stats.rawVideosExcluded} (${formatBytes(stats.rawBytesExcluded)})`)
console.log(`Point images skipped: ${stats.pointImagesSkipped}`)
console.log(`Planned UploadThing media upload: ${formatBytes(stats.plannedUploadBytes)} / ${limitGb} GB`)
console.log(`Report: .migration/audit-report.json`)

if (stats.missingFiles.length) {
  console.error(`Missing referenced HQ/audio files: ${stats.missingFiles.length}`)
  process.exitCode = 1
}

if (stats.plannedUploadBytes > limitBytes) {
  console.error(`Planned upload exceeds ${limitGb} GB.`)
  process.exitCode = 1
}
