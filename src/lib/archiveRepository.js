import { publicAssetUrl } from './publicAssetUrl.js'

const MANIFEST_URL = publicAssetUrl('data/archive-manifest.json')
const MEDIA_BASE_URL = (import.meta.env.VITE_MEDIA_BASE_URL || '').replace(/\/$/, '')
const SLOT_IDS = ['dawn', 'day', 'dusk', 'night']

function resolveMediaUrl(value, manifestMediaBaseUrl) {
  if (!value) return null
  if (/^https?:\/\//i.test(value)) return value

  const baseUrl = (MEDIA_BASE_URL || manifestMediaBaseUrl || '').replace(/\/$/, '')
  if (!baseUrl) return value
  return `${baseUrl}/${String(value).replace(/^\//, '')}`
}

export async function getPointMediaArchive() {
  const response = await fetch(MANIFEST_URL, { cache: 'no-cache' })
  if (!response.ok) {
    throw new Error(`Archive manifest unavailable: ${response.status}`)
  }

  const manifest = await response.json()
  const points = [...(manifest.points || [])].sort((a, b) => Number(a.gridIndex ?? 0) - Number(b.gridIndex ?? 0))
  const timeslots = (manifest.timeslots || []).map((timeslot) => ({
    ...timeslot,
    point: timeslot.pointId,
    video_hq: resolveMediaUrl(timeslot.videoHqUrl || timeslot.videoHqPath, manifest.mediaBaseUrl),
    audio: resolveMediaUrl(timeslot.audioUrl || timeslot.audioPath, manifest.mediaBaseUrl),
    audioPath: timeslot.audioPath || null,
    videoHqPath: timeslot.videoHqPath || null,
  }))

  const timeslotsByPointSlot = {}
  const sortedTimeslots = [...timeslots].sort((a, b) => {
    const pointCompare = String(a.pointId || '').localeCompare(String(b.pointId || ''))
    if (pointCompare) return pointCompare
    const slotCompare = String(a.slot || '').localeCompare(String(b.slot || ''))
    if (slotCompare) return slotCompare
    return String(b.collectedAt || '').localeCompare(String(a.collectedAt || ''))
  })

  for (const timeslot of sortedTimeslots) {
    if (!timeslotsByPointSlot[timeslot.pointId]) timeslotsByPointSlot[timeslot.pointId] = {}
    if (!timeslotsByPointSlot[timeslot.pointId][timeslot.slot]) {
      timeslotsByPointSlot[timeslot.pointId][timeslot.slot] = timeslot
    }
  }

  return points.map((point) => ({
    ...point,
    slots: Object.fromEntries(SLOT_IDS.map((slot) => [
      slot,
      timeslotsByPointSlot[point.id]?.[slot] ?? null,
    ])),
  }))
}
