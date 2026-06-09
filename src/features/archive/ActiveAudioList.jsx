import { FileAudio } from 'lucide-react'

export default function ActiveAudioList({ rows, points, selectedSlot }) {
  if (!rows.length) return null

  const isExiting = rows.every((row) => row.exiting)

  return (
    <section className={`control-block active-audio-panel ${isExiting ? 'exiting' : ''}`}>
      <div className="section-title"><FileAudio size={15} /> Active Audio</div>
      <div className="active-audio-list">
        {rows.map((row) => (
          <div key={row.stableKey} className={`active-audio-row ${row.exiting ? 'exiting' : ''}`}>
            <div className="active-audio-head">
              <div className="active-audio-pulse" style={{ '--level': row.level }} />
              <div>
                <div className="active-audio-label">
                  {row.label || `Audio Point ${String(points.findIndex((point) => point.id === row.id) + 1).padStart(2, '0')}`}
                </div>
                <div className="active-audio-meta">
                  {row.audioPath || row.cluster || selectedSlot}
                </div>
              </div>
              <div className="active-audio-level">{row.levelPercent}%</div>
            </div>
            <div className="active-audio-meter">
              <div
                className="active-audio-meter-fill"
                style={{ width: `${Math.max(4, row.levelPercent)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
