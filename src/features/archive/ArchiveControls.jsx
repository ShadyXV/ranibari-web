import { Clock3, Eye, Layers3, Map as MapIcon, Mountain, Settings2 } from 'lucide-react'

export const ARCHIVE_SLOTS = ['dawn', 'day', 'dusk', 'night']

export default function ArchiveControls({
  selectedSlot,
  onSlotChange,
  mapMode,
  onMapModeChange,
  terrainRender,
  onTerrainRenderChange,
  showAllPoints,
  onShowAllPointsChange,
  showInfluenceSphere,
  onShowInfluenceSphereChange,
}) {
  return (
    <>
      <section className="control-block">
        <div className="section-title"><Settings2 size={15} /> Archive Settings</div>
        <label>
          <span className="section-title" style={{ marginBottom: 8 }}><Clock3 size={13} /> Time Slot</span>
          <select
            className="select-field"
            value={selectedSlot}
            onChange={(event) => onSlotChange(event.target.value)}
          >
            {ARCHIVE_SLOTS.map((slot) => (
              <option key={slot} value={slot}>{slot}</option>
            ))}
          </select>
        </label>

        <label className="toggle-row">
          <span>{showAllPoints ? <Eye size={13} /> : <Layers3 size={13} />} {showAllPoints ? 'Show all points' : 'Media only'}</span>
          <input
            type="checkbox"
            checked={showAllPoints}
            onChange={() => onShowAllPointsChange((value) => !value)}
          />
        </label>
      </section>

      <section className="control-block">
        <div className="section-title"><MapIcon size={15} /> Archive View</div>
        <div className="segmented-grid two-up">
          <button
            type="button"
            className={`segmented ${mapMode === '2d' ? 'active' : ''}`}
            onClick={() => onMapModeChange('2d')}
          >
            2D
          </button>
          <button
            type="button"
            className={`segmented ${mapMode === '3d' ? 'active' : ''}`}
            onClick={() => onMapModeChange('3d')}
          >
            3D
          </button>
        </div>
      </section>

      {mapMode === '3d' && (
        <section className="control-block">
          <div className="section-title"><Mountain size={15} /> Terrain</div>
          <div className="segmented-grid two-up">
            <button
              type="button"
              className={`segmented ${terrainRender === 'contours' ? 'active' : ''}`}
              onClick={() => onTerrainRenderChange('contours')}
            >
              Contours
            </button>
            <button
              type="button"
              className={`segmented ${terrainRender === 'grid' ? 'active' : ''}`}
              onClick={() => onTerrainRenderChange('grid')}
            >
              Grid
            </button>
          </div>
          <label className="toggle-row">
            <span>Sphere of influence</span>
            <input
              type="checkbox"
              checked={showInfluenceSphere}
              onChange={() => onShowInfluenceSphereChange((value) => !value)}
            />
          </label>
        </section>
      )}
    </>
  )
}
