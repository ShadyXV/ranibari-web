import { join } from 'node:path'
import {
  formatBytes,
  getPocketBaseDataDir,
  parseArgs,
  readPocketBaseArchive,
  writeJson,
} from './lib/pocketbase-export.mjs'

const args = parseArgs()
const mediaBaseUrl = args['media-base-url'] || process.env.VITE_MEDIA_BASE_URL || ''
const archive = readPocketBaseArchive(getPocketBaseDataDir(args))

const manifest = {
  version: 1,
  generatedAt: new Date().toISOString(),
  mediaBaseUrl,
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
  timeslots: archive.manifestTimeslots,
}

const output = args.output || join('public', 'data', 'archive-manifest.json')
writeJson(output, manifest)

console.log(`Wrote ${output}`)
console.log(`Points: ${manifest.points.length}`)
console.log(`Timeslots: ${manifest.timeslots.length}`)
console.log(`Media planned: ${formatBytes(archive.stats.plannedUploadBytes)}`)
if (!mediaBaseUrl) {
  console.log('No mediaBaseUrl set. This is expected before UploadThing upload; media:upload writes absolute file URLs.')
}
