import React, { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { CircleMarker, MapContainer as LeafletMap, TileLayer, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import {
  Compass,
  Loader2,
  RefreshCw,
  RotateCw,
  Route,
  Waves,
} from 'lucide-react'

import { useMapData } from '../../contexts/MapDataContext.jsx'
import { useTime } from '../../contexts/TimeContext.jsx'
import { useProximityAudioMixer } from '../../hooks/useProximityAudioMixer.js'
import { getPointMediaArchive } from '../../lib/archiveRepository.js'
import { publicAssetUrl } from '../../lib/publicAssetUrl.js'
import ActiveAudioList from './ActiveAudioList.jsx'
import ArchiveControls, { ARCHIVE_SLOTS } from './ArchiveControls.jsx'
import MediaDrawer from './MediaDrawer.jsx'

let terrainModulePromise
function loadTerrainModule() {
  if (!terrainModulePromise) {
    terrainModulePromise = import('../../components/TerrainTextureMap.jsx')
  }
  return terrainModulePromise
}

const TerrainTextureMap = lazy(loadTerrainModule)

function preloadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = resolve
    image.onerror = () => reject(new Error(`Failed to load terrain texture ${src}`))
    image.src = src
  })
}

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

const CLUSTER_COLORS = {
  entrance: '#f59e0b',
  trail: '#3b82f6',
  temple: '#ec4899',
  water: '#06b6d4',
  canopy: '#10b981',
  general: '#6b7280',
}

const ACTIVE_SOUND_GOLD = '#e7c66a'
const DEMO_AUDIO_RADIUS_METERS = 40

function MapClickHandler({ onMapClick }) {
  useMapEvents({
    click(event) {
      onMapClick(event.latlng.lat, event.latlng.lng)
    },
  })
  return null
}

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
        <div className="boot-kicker"><Waves size={15} /> Ranibari Live</div>
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
              <span>{status.moduleReady ? '3D engine ready' : 'loading 3D engine'}</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default function ArchivePage() {
  const { activeTime, activeTimeId } = useTime()
  const { parkCropPolygon } = useMapData()

  const [mapMode, setMapMode] = useState('3d')
  const [terrainRender, setTerrainRender] = useState('contours')
  const [tiles, setTiles] = useState([])
  const [terrainLoading, setTerrainLoading] = useState(true)
  const [terrainError, setTerrainError] = useState(null)
  const [terrainBootStatus, setTerrainBootStatus] = useState({
    message: 'Requesting terrain manifest',
    loadedTiles: 0,
    totalTiles: 0,
    moduleReady: false,
  })
  const [archiveLoading, setArchiveLoading] = useState(true)
  const [archiveError, setArchiveError] = useState(null)
  const [points, setPoints] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [selectedSlot, setSelectedSlot] = useState(() => (
    ARCHIVE_SLOTS.includes(activeTimeId) ? activeTimeId : 'day'
  ))
  const [showAllPoints, setShowAllPoints] = useState(false)
  const [focusLatLng, setFocusLatLng] = useState(null)
  const [influenceLatLng, setInfluenceLatLng] = useState(null)
  const [showInfluenceSphere, setShowInfluenceSphere] = useState(true)
  const [cameraMode, setCameraMode] = useState('free')
  const [visibleAudioRows, setVisibleAudioRows] = useState([])

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
          message: 'Loading terrain textures',
        }))
        await Promise.all([
          preloadImage(publicAssetUrl('terrain_data/satellite_texture/texture.png')),
          preloadImage(publicAssetUrl('terrain_data/option3_texture/texture.png')),
        ])
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
    setArchiveLoading(true)
    setArchiveError(null)
    try {
      setPoints(await getPointMediaArchive())
    } catch (error) {
      console.error(error)
      setArchiveError(error.message || 'Archive manifest is unavailable.')
      setPoints([])
    } finally {
      setArchiveLoading(false)
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

    if (showAllPoints) return normalized
    return normalized.filter((point) => hasSelectedMedia(point, selectedSlot))
  }, [points, selectedSlot, showAllPoints])

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
        const timeslot = slotMedia(point, selectedSlot)
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
  ), [selectedSlot, visiblePoints])

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

  useEffect(() => {
    if (mapMode !== '3d') fadeOutSpatialAudio()
  }, [fadeOutSpatialAudio, mapMode])

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
    if (!showAllPoints && !visiblePoints.some((point) => point.id === selectedId)) {
      clearSelectedPoint()
    }
  }, [clearSelectedPoint, selectedId, showAllPoints, visiblePoints])

  useEffect(() => {
    if (selectedPoint && mapMode === '3d') {
      setFocusLatLng([Number(selectedPoint.lat), Number(selectedPoint.lng)])
    }
  }, [mapMode, selectedPoint])

  const handleMeshPointerMove = useCallback((lat, lng) => {
    if (mapMode !== '3d') return
    if (!isInsidePolygon(lat, lng, parkCropPolygon)) {
      setInfluenceLatLng(null)
      if (!selectedId) fadeOutSpatialAudio()
      return
    }

    setInfluenceLatLng([lat, lng])
    if (selectedId) return
    moveSpatialAudioTo(lat, lng)
  }, [fadeOutSpatialAudio, mapMode, moveSpatialAudioTo, parkCropPolygon, selectedId])

  const handleMeshPointerLeave = useCallback(() => {
    setInfluenceLatLng(null)
    if (!selectedId) fadeOutSpatialAudio()
  }, [fadeOutSpatialAudio, selectedId])

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
      .filter((source) => source.level > 0.015)
      .sort((a, b) => b.level - a.level)
      .slice(0, 4)
  ), [pointAudioSources, spatialAudioLevels])

  useEffect(() => {
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

    return () => window.clearTimeout(timer)
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
      const timeslot = slotMedia(point, selectedSlot)
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
        hasAudio: hasAudio || (showAllPoints && hasMedia),
        nearestAudio: point.id === strongestAudioId,
        audioLevel: spatialAudioLevels[point.id] || 0,
      }
    })
  ), [selectedId, selectedSlot, showAllPoints, spatialAudioLevels, strongestAudioId, visiblePoints])

  const totalMediaPoints = useMemo(
    () => points.filter((point) => hasSelectedMedia(point, selectedSlot)).length,
    [points, selectedSlot],
  )

  const appStyle = useMemo(
    () => ({ '--accent': activeTime.accent, '--route': activeTime.route, '--haze': activeTime.haze }),
    [activeTime],
  )

  const panelOpen = Boolean(selectedId && selectedPoint)

  if (terrainLoading || terrainError) {
    return (
      <TerrainBootScreen
        status={terrainBootStatus}
        error={terrainError}
      />
    )
  }

  return (
    <div className={`app-shell time-${activeTimeId}`} style={appStyle}>
      <div className="layout">
        <aside className="sidebar-panel">
          <div className="sidebar-content">
            <div className="sidebar-scroll custom-scrollbar">
              <header className="sidebar-header">
                <p className="sidebar-kicker"><Waves size={14} /> Ranibari Live</p>
                <h1>Video Archive</h1>
                <p>Field video and derived audio served from UploadThing.</p>
              </header>

              <ArchiveControls
                selectedSlot={selectedSlot}
                onSlotChange={setSelectedSlot}
                mapMode={mapMode}
                onMapModeChange={setMapMode}
                terrainRender={terrainRender}
                onTerrainRenderChange={setTerrainRender}
                showAllPoints={showAllPoints}
                onShowAllPointsChange={setShowAllPoints}
                showInfluenceSphere={showInfluenceSphere}
                onShowInfluenceSphereChange={setShowInfluenceSphere}
              />

              <section className="control-block">
                <div className="section-title"><RefreshCw size={15} /> Static Archive</div>
                <div className="archive-stat">
                  <span>{archiveLoading ? 'Loading' : `${visiblePoints.length}/${points.length} shown`}</span>
                  <button
                    type="button"
                    onClick={loadArchive}
                    disabled={archiveLoading}
                    className="icon-button"
                    title="Refresh archive"
                    aria-label="Refresh archive"
                  >
                    <RefreshCw size={14} className={archiveLoading ? 'spin' : ''} />
                  </button>
                </div>
                <p className="note">
                  {archiveError
                    ? archiveError
                    : `${totalMediaPoints} points have 720p video or derived audio for ${selectedSlot}.`}
                </p>
              </section>

              {mapMode === '3d' && (
                <ActiveAudioList rows={visibleAudioRows} points={points} selectedSlot={selectedSlot} />
              )}
            </div>
            <div className="sidebar-footer">
              <p className="note">Raw iPhone video and point images are intentionally excluded from this web build.</p>
            </div>
          </div>
        </aside>

        <main className="main-stage">
          {mapMode === '3d' && (
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
            </div>
          )}

          {mapMode === '2d' ? (
            <LeafletMap key="archive-2d" center={[27.7305, 85.321]} zoom={18} className="stage-fill" zoomControl={false}>
              <TileLayer
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                maxZoom={19}
                attribution="Tiles &copy; Esri"
              />
              <MapClickHandler onMapClick={clearSelectedPoint} />
              {visiblePoints.map((point) => {
                const selected = point.id === selectedId
                const hasMedia = hasSelectedMedia(point, selectedSlot)
                return (
                  <CircleMarker
                    key={point.id}
                    center={[point.lat, point.lng]}
                    radius={selected ? 10 : 6}
                    pathOptions={{
                      color: selected ? ACTIVE_SOUND_GOLD : 'transparent',
                      weight: 3,
                      fillColor: selected
                        ? ACTIVE_SOUND_GOLD
                        : hasMedia
                          ? (CLUSTER_COLORS[point.cluster] || '#43f2dc')
                          : '#52636b',
                      fillOpacity: hasMedia ? (selected ? 1 : 0.68) : 0.28,
                    }}
                    eventHandlers={{
                      click: (event) => {
                        L.DomEvent.stopPropagation(event)
                        selectPoint(point.id)
                      },
                    }}
                  />
                )
              })}
            </LeafletMap>
          ) : (
            <Suspense fallback={(
              <div className="loading-state">
                <div className="loading-card"><Loader2 size={32} className="spin" /></div>
              </div>
            )}>
              <TerrainTextureMap
                tiles={tiles}
                textureMeta={null}
                textureOpacity={1}
                textureType="satellite"
                displayMode="grid"
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
                terrainTheme={terrainRender === 'contours' ? 'cinematic' : undefined}
                showContours={terrainRender === 'contours'}
                rawMarkers={rawMarkers}
                focusLatLng={focusLatLng}
                influenceLatLng={showInfluenceSphere ? influenceLatLng : null}
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
          )}
        </main>
      </div>

      <MediaDrawer
        open={panelOpen}
        point={selectedPoint}
        pointIndex={selectedPointIndex}
        selectedSlot={selectedSlot}
        onClose={clearSelectedPoint}
      />
    </div>
  )
}
