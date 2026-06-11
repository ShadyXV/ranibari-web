import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Compass,
  Info,
  Loader2,
  RotateCw,
  Route,
  Volume2,
  Waves,
  X,
} from 'lucide-react'

import { useMapData } from '../../contexts/MapDataContext.jsx'
import { timeStates } from '../../data/OverlayData.js'
import { useProximityAudioMixer } from '../../hooks/useProximityAudioMixer.js'
import { getPointMediaArchive } from '../../lib/archiveRepository.js'
import { publicAssetUrl } from '../../lib/publicAssetUrl.js'
import ActiveAudioList from './ActiveAudioList.jsx'
import MediaDrawer from './MediaDrawer.jsx'

let terrainModulePromise
function loadTerrainModule() {
  if (!terrainModulePromise) {
    terrainModulePromise = import('../../components/TerrainTextureMap.jsx')
  }
  return terrainModulePromise
}

const TerrainTextureMap = lazy(loadTerrainModule)

const DEMO_CONFIG = {
  exaggeration: 2,
  enableNoise: true,
  noiseAmplitude: 3.6,
  noiseFrequency: 8,
  enableSmoothing: false,
  blurRadius: 1,
  enableRouteSmooth: true,
  roadHalfWidth: 3.5,
  enableBoundarySmooth: true,
  boundaryHalfWidth: 5,
  cameraPosition: [-75.03332424589162, 412.2672575456475, 759.0711549747297],
  cameraTarget: [0, 0, 0],
}

const ACTIVE_SOUND_GOLD = '#e7c66a'
const DEMO_AUDIO_RADIUS_METERS = 40
const ACTIVE_AUDIO_VISIBLE_LEVEL = 0.08
const ACTIVE_AUDIO_HIDE_DELAY_MS = 1000
const HOVER_AUDIO_VOLUME_SCALE = 0.8
const SELECTED_SLOT = 'day'

function isInsidePolygon(lat, lng, polygon) {
  if (!Array.isArray(polygon) || polygon.length < 3) return false

  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [latI, lngI] = polygon[i]
    const [latJ, lngJ] = polygon[j]
    const crossesLng = lngI > lng !== lngJ > lng
    if (!crossesLng) continue

    const latAtLng = ((latJ - latI) * (lng - lngI)) / (lngJ - lngI) + latI
    if (lat < latAtLng) inside = !inside
  }

  return inside
}

function slotMedia(point, slot) {
  return point?.slots?.[slot] ?? null
}

function hasSelectedMedia(point, slot) {
  const timeslot = slotMedia(point, slot)
  return Boolean(timeslot?.video_hq || timeslot?.audio)
}

function TerrainBootScreen({ status, error }) {
  const tileProgress = status.totalTiles
    ? Math.round((status.loadedTiles / status.totalTiles) * 100)
    : 0
  const moduleProgress = status.moduleReady ? 100 : 0
  const overallProgress = error
    ? 100
    : Math.round(((tileProgress * 0.78) + (moduleProgress * 0.22)))

  return (
    <div className="boot-screen">
      <div className="boot-panel">
        <div className="boot-kicker"><Waves size={15} /> Ranibari Sonic Terrain</div>
        <h1>{error ? 'Terrain unavailable' : 'Preparing Terrain'}</h1>
        <p>
          {error || status.message}
        </p>
        {!error && (
          <>
            <div className="boot-progress" aria-label="Terrain loading progress">
              <div style={{ width: `${overallProgress}%` }} />
            </div>
            <div className="boot-steps">
              <span>{status.loadedTiles}/{status.totalTiles || 0} terrain tiles</span>
              <span>{status.moduleReady ? 'terrain ready' : 'loading terrain'}</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function ExperienceStartOverlay({ audioReady, loading, error, onStart }) {
  return (
    <div className="experience-start" role="dialog" aria-modal="true" aria-labelledby="experience-start-title">
      <div className="experience-start-panel">
        <div className="boot-kicker"><Waves size={15} /> Ranibari Sonic Terrain</div>
        <h1 id="experience-start-title">Listen first</h1>
        <p>
          Begin with sound enabled, then move across the terrain to hear each place before opening its video.
        </p>
        <button
          type="button"
          className="experience-start-button"
          onClick={onStart}
          disabled={!audioReady || loading}
        >
          {loading ? <Loader2 size={17} className="spin" /> : <Volume2 size={17} />}
          {audioReady ? 'Start listening' : 'Preparing sound'}
        </button>
        {error && <p className="experience-start-error">{error}</p>}
      </div>
    </div>
  )
}

export default function ArchivePage() {
  const { parkCropPolygon } = useMapData()

  const [tiles, setTiles] = useState([])
  const [terrainLoading, setTerrainLoading] = useState(true)
  const [terrainError, setTerrainError] = useState(null)
  const [terrainBootStatus, setTerrainBootStatus] = useState({
    message: 'Requesting terrain manifest',
    loadedTiles: 0,
    totalTiles: 0,
    moduleReady: false,
  })
  const [points, setPoints] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [focusLatLng, setFocusLatLng] = useState(null)
  const [influenceLatLng, setInfluenceLatLng] = useState(null)
  const [cameraMode, setCameraMode] = useState('free')
  const [projectInfoOpen, setProjectInfoOpen] = useState(false)
  const [visibleAudioRows, setVisibleAudioRows] = useState([])
  const [archiveLoaded, setArchiveLoaded] = useState(false)
  const [experienceStarted, setExperienceStarted] = useState(false)
  const [audioUnlocking, setAudioUnlocking] = useState(false)
  const [audioUnlockError, setAudioUnlockError] = useState(null)
  const audioRowsHideTimerRef = useRef(null)

  useEffect(() => {
    let cancelled = false

    async function loadTerrain() {
      setTerrainLoading(true)
      setTerrainError(null)
      setTiles([])
      setTerrainBootStatus({
        message: 'Requesting terrain manifest',
        loadedTiles: 0,
        totalTiles: 0,
        moduleReady: false,
      })
      try {
        const path = publicAssetUrl('terrain_data/hybrid_decoded').replace(/\/$/, '')
        const manifestResponse = await fetch(`${path}/index.json`)
        if (!manifestResponse.ok) throw new Error('Hybrid terrain data was not found.')
        const manifest = await manifestResponse.json()
        if (cancelled) return

        setTerrainBootStatus((status) => ({
          ...status,
          message: 'Loading terrain tiles',
          totalTiles: manifest.tiles.length,
        }))

        const loadedTiles = await Promise.all(
          manifest.tiles.map(async (tile) => {
            const response = await fetch(`${path}/${tile.file}`)
            if (!response.ok) throw new Error(`Failed to load tile ${tile.file}`)
            const loadedTile = { ...tile, ...await response.json() }
            if (!cancelled) {
              setTerrainBootStatus((status) => ({
                ...status,
                loadedTiles: Math.min(status.totalTiles, status.loadedTiles + 1),
              }))
            }
            return loadedTile
          }),
        )
        if (cancelled) return

        setTerrainBootStatus((status) => ({
          ...status,
          message: 'Loading 3D terrain engine',
        }))
        await loadTerrainModule()
        if (cancelled) return

        setTerrainBootStatus((status) => ({
          ...status,
          message: 'Terrain ready',
          loadedTiles: manifest.tiles.length,
          moduleReady: true,
        }))
        setTiles(loadedTiles)
      } catch (error) {
        console.error(error)
        if (!cancelled) setTerrainError(error.message)
      } finally {
        if (!cancelled) setTerrainLoading(false)
      }
    }

    loadTerrain()
    return () => {
      cancelled = true
    }
  }, [])

  const loadArchive = useCallback(async () => {
    setArchiveLoaded(false)
    try {
      setPoints(await getPointMediaArchive())
    } catch (error) {
      console.error(error)
      setPoints([])
    } finally {
      setArchiveLoaded(true)
    }
  }, [])

  useEffect(() => {
    loadArchive()
  }, [loadArchive])

  const visiblePoints = useMemo(() => {
    const normalized = points.map((point) => ({
      ...point,
      lat: Number(point.lat),
      lng: Number(point.lng),
    }))

    return normalized.filter((point) => hasSelectedMedia(point, SELECTED_SLOT))
  }, [points])

  const selectedPoint = useMemo(
    () => points.find((point) => point.id === selectedId) ?? null,
    [points, selectedId],
  )

  const selectedPointIndex = useMemo(
    () => points.findIndex((point) => point.id === selectedId),
    [points, selectedId],
  )

  const pointAudioSources = useMemo(() => (
    visiblePoints
      .map((point) => {
        const timeslot = slotMedia(point, SELECTED_SLOT)
        if (!timeslot?.audio) return null
        return {
          id: point.id,
          lat: Number(point.lat),
          lng: Number(point.lng),
          label: point.label,
          cluster: point.cluster,
          audioPath: timeslot.audioPath,
          src: timeslot.audio,
        }
      })
      .filter(Boolean)
  ), [visiblePoints])

  const {
    moveTo: moveSpatialAudioTo,
    solo: soloSpatialAudio,
    fadeOut: fadeOutSpatialAudio,
    unlock: unlockSpatialAudio,
    activeLevels: spatialAudioLevels,
  } = useProximityAudioMixer(pointAudioSources, {
    maxActive: 4,
    radiusMeters: DEMO_AUDIO_RADIUS_METERS,
    maxVolume: 0.38,
  })

  const clearSelectedPoint = useCallback(() => {
    setSelectedId(null)
    fadeOutSpatialAudio()
  }, [fadeOutSpatialAudio])

  const selectPoint = useCallback((id) => {
    unlockSpatialAudio()
    setSelectedId((currentId) => {
      if (currentId === id) {
        fadeOutSpatialAudio()
        return null
      }
      soloSpatialAudio(id)
      return id
    })
  }, [fadeOutSpatialAudio, soloSpatialAudio, unlockSpatialAudio])

  useEffect(() => {
    if (!selectedId) return
    if (!visiblePoints.some((point) => point.id === selectedId)) {
      clearSelectedPoint()
    }
  }, [clearSelectedPoint, selectedId, visiblePoints])

  useEffect(() => {
    if (selectedPoint) {
      setFocusLatLng([Number(selectedPoint.lat), Number(selectedPoint.lng)])
    }
  }, [selectedPoint])

  const handleMeshPointerMove = useCallback((lat, lng) => {
    if (!isInsidePolygon(lat, lng, parkCropPolygon)) {
      setInfluenceLatLng(null)
      if (selectedId) soloSpatialAudio(selectedId)
      else fadeOutSpatialAudio()
      return
    }

    setInfluenceLatLng([lat, lng])
    moveSpatialAudioTo(lat, lng, {
      volumeScale: selectedId ? HOVER_AUDIO_VOLUME_SCALE : 1,
    })
  }, [fadeOutSpatialAudio, moveSpatialAudioTo, parkCropPolygon, selectedId, soloSpatialAudio])

  const handleMeshPointerLeave = useCallback(() => {
    setInfluenceLatLng(null)
    if (selectedId) soloSpatialAudio(selectedId)
    else fadeOutSpatialAudio()
  }, [fadeOutSpatialAudio, selectedId, soloSpatialAudio])

  const handleStartExperience = useCallback(async () => {
    setAudioUnlocking(true)
    setAudioUnlockError(null)

    const unlocked = await unlockSpatialAudio({ warm: true })
    setAudioUnlocking(false)

    if (unlocked) {
      setExperienceStarted(true)
      return
    }

    setAudioUnlockError('Sound is still blocked. Try clicking Start listening again.')
  }, [unlockSpatialAudio])

  const activeAudioRows = useMemo(() => (
    pointAudioSources
      .map((source) => {
        const level = spatialAudioLevels[source.id] || 0
        return {
          ...source,
          level,
          levelPercent: Math.round(level * 100),
        }
      })
      .filter((source) => source.level > ACTIVE_AUDIO_VISIBLE_LEVEL)
      .sort((a, b) => b.level - a.level)
      .slice(0, 4)
  ), [pointAudioSources, spatialAudioLevels])

  useEffect(() => {
    window.clearTimeout(audioRowsHideTimerRef.current)

    if (!activeAudioRows.length) {
      setVisibleAudioRows((previousRows) => {
        if (!previousRows.length) return previousRows
        return previousRows.map((row) => ({ ...row, exiting: true }))
      })

      audioRowsHideTimerRef.current = window.setTimeout(() => {
        setVisibleAudioRows([])
      }, ACTIVE_AUDIO_HIDE_DELAY_MS)

      return () => window.clearTimeout(audioRowsHideTimerRef.current)
    }

    setVisibleAudioRows((previousRows) => {
      const activeIds = new Set(activeAudioRows.map((row) => row.id))
      const previousById = new Map(previousRows.map((row) => [row.id, row]))
      const activeRows = activeAudioRows.map((row, index) => ({
        ...row,
        rank: index,
        exiting: false,
        stableKey: previousById.get(row.id)?.stableKey || row.id,
      }))
      const exitingRows = previousRows
        .filter((row) => !activeIds.has(row.id))
        .map((row) => ({ ...row, exiting: true }))

      return [...activeRows, ...exitingRows].slice(0, 6)
    })

    const timer = window.setTimeout(() => {
      setVisibleAudioRows((previousRows) => previousRows.filter((row) => !row.exiting))
    }, 360)

    return () => {
      window.clearTimeout(timer)
      window.clearTimeout(audioRowsHideTimerRef.current)
    }
  }, [activeAudioRows])

  const strongestAudioId = useMemo(() => {
    let strongestId = null
    let strongestLevel = 0
    Object.entries(spatialAudioLevels).forEach(([id, level]) => {
      if (level > strongestLevel) {
        strongestId = id
        strongestLevel = level
      }
    })
    return strongestLevel > 0.08 ? strongestId : null
  }, [spatialAudioLevels])

  const rawMarkers = useMemo(() => (
    visiblePoints.map((point) => {
      const timeslot = slotMedia(point, SELECTED_SLOT)
      const hasAudio = Boolean(timeslot?.audio)
      const hasVideo = Boolean(timeslot?.video_hq)
      const hasMedia = hasAudio || hasVideo
      const selected = point.id === selectedId

      return {
        id: point.id,
        lat: point.lat,
        lng: point.lng,
        color: selected || point.id === strongestAudioId
          ? ACTIVE_SOUND_GOLD
          : hasMedia
            ? (hasVideo ? '#43f2dc' : '#7dd3fc')
            : '#52636b',
        selected,
        hasAudio,
        nearestAudio: point.id === strongestAudioId,
        audioLevel: spatialAudioLevels[point.id] || 0,
      }
    })
  ), [selectedId, spatialAudioLevels, strongestAudioId, visiblePoints])

  const appStyle = useMemo(
    () => ({ '--accent': timeStates.day.accent, '--route': timeStates.day.route, '--haze': timeStates.day.haze }),
    [],
  )

  const panelOpen = Boolean(selectedId && selectedPoint)
  const audioReadyForStart = archiveLoaded && pointAudioSources.length > 0

  if (terrainLoading || terrainError) {
    return (
      <TerrainBootScreen
        status={terrainBootStatus}
        error={terrainError}
      />
    )
  }

  return (
    <div className="app-shell time-day" style={appStyle}>
      <div className="layout">
        <main className="main-stage">
          <div className="camera-toolbar" aria-label="Camera controls">
            <button
              type="button"
              className={`camera-tool ${cameraMode === 'top' ? 'active' : ''}`}
              onClick={() => setCameraMode('top')}
              title="Top-down view"
              aria-label="Top-down view"
            >
              <Compass size={16} />
            </button>
            <button
              type="button"
              className={`camera-tool ${cameraMode === 'orbit' ? 'active' : ''}`}
              onClick={() => setCameraMode(cameraMode === 'orbit' ? 'free' : 'orbit')}
              title="Orbit park"
              aria-label="Orbit park"
            >
              <RotateCw size={16} />
            </button>
            <button
              type="button"
              className={`camera-tool ${cameraMode === 'route' ? 'active' : ''}`}
              onClick={() => setCameraMode(cameraMode === 'route' ? 'free' : 'route')}
              title="Follow route"
              aria-label="Follow route"
            >
              <Route size={16} />
            </button>
            <button
              type="button"
              className={`camera-tool ${projectInfoOpen ? 'active' : ''}`}
              onClick={() => setProjectInfoOpen(true)}
              title="Project info"
              aria-label="Project info"
            >
              <Info size={16} />
            </button>
          </div>

          {projectInfoOpen && (
            <div className="project-info-popover" role="dialog" aria-modal="true" aria-labelledby="project-info-title">
              <div className="project-info-panel">
                <div className="project-info-head">
                  <p className="drawer-kicker"><Info size={14} /> Project Info</p>
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => setProjectInfoOpen(false)}
                    aria-label="Close project info"
                  >
                    <X size={16} />
                  </button>
                </div>
                <h2 id="project-info-title">Ranibari Sonic Terrain</h2>
                <p>
                  A sound-first terrain study built from Ranibari field video and spatial audio.
                  The day recordings sit on a contoured terrain model, with nearby sound mixed
                  as the pointer moves across the forest.
                </p>
                <dl className="project-info-specs">
                  <div>
                    <dt>Host</dt>
                    <dd>GitHub Pages</dd>
                  </div>
                  <div>
                    <dt>Media</dt>
                    <dd>UploadThing public URLs</dd>
                  </div>
                  <div>
                    <dt>Mode</dt>
                    <dd>3D contour terrain</dd>
                  </div>
                  <div>
                    <dt>Slot</dt>
                    <dd>Day</dd>
                  </div>
                </dl>
              </div>
            </div>
          )}

          <div className="active-audio-float">
            <ActiveAudioList rows={visibleAudioRows} points={points} selectedSlot={SELECTED_SLOT} />
          </div>

          <Suspense fallback={(
            <div className="loading-state">
              <div className="loading-card"><Loader2 size={32} className="spin" /></div>
            </div>
          )}>
            <TerrainTextureMap
              tiles={tiles}
              exaggeration={DEMO_CONFIG.exaggeration}
              enableNoise={DEMO_CONFIG.enableNoise}
              noiseAmplitude={DEMO_CONFIG.noiseAmplitude}
              noiseFrequency={DEMO_CONFIG.noiseFrequency}
              enableSmoothing={DEMO_CONFIG.enableSmoothing}
              blurRadius={DEMO_CONFIG.blurRadius}
              enableRouteSmooth={DEMO_CONFIG.enableRouteSmooth}
              roadHalfWidth={DEMO_CONFIG.roadHalfWidth}
              enableBoundarySmooth={DEMO_CONFIG.enableBoundarySmooth}
              boundaryHalfWidth={DEMO_CONFIG.boundaryHalfWidth}
              parkBoundary={parkCropPolygon}
              cameraPosition={DEMO_CONFIG.cameraPosition}
              cameraTarget={DEMO_CONFIG.cameraTarget}
              cameraMode={cameraMode}
              onUserControlStart={() => setCameraMode('free')}
              terrainTheme="cinematic"
              showContours
              rawMarkers={rawMarkers}
              focusLatLng={focusLatLng}
              influenceLatLng={influenceLatLng}
              influenceRadiusMeters={DEMO_AUDIO_RADIUS_METERS}
              onMeshClick={(lat, lng) => {
                if (!visiblePoints.length) return
                if (!isInsidePolygon(lat, lng, parkCropPolygon)) {
                  clearSelectedPoint()
                  return
                }

                let nearest = visiblePoints[0]
                let minDistance = (nearest.lat - lat) ** 2 + (nearest.lng - lng) ** 2
                visiblePoints.forEach((point) => {
                  const distance = (point.lat - lat) ** 2 + (point.lng - lng) ** 2
                  if (distance < minDistance) {
                    minDistance = distance
                    nearest = point
                  }
                })
                if (minDistance < 0.0000005) selectPoint(nearest.id)
                else clearSelectedPoint()
              }}
              onMeshPointerMove={handleMeshPointerMove}
              onMeshPointerLeave={handleMeshPointerLeave}
              onMeshPointerDown={unlockSpatialAudio}
            />
          </Suspense>

          {!experienceStarted && (
            <ExperienceStartOverlay
              audioReady={audioReadyForStart}
              loading={audioUnlocking}
              error={audioUnlockError}
              onStart={handleStartExperience}
            />
          )}
        </main>
      </div>

      <MediaDrawer
        open={panelOpen}
        point={selectedPoint}
        pointIndex={selectedPointIndex}
        selectedSlot={SELECTED_SLOT}
        onClose={clearSelectedPoint}
      />
    </div>
  )
}
