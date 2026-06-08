import { FileAudio, FileVideo, Info, MapPin, X } from 'lucide-react'
import WaveformPlayer from '../../components/WaveformPlayer.jsx'

export default function MediaDrawer({ open, point, pointIndex, selectedSlot, onClose }) {
  const timeslot = point?.slots?.[selectedSlot] ?? null
  const videoUrl = timeslot?.video_hq ?? null
  const audioUrl = timeslot?.audio ?? null

  return (
    <aside className={`drawer ${open ? 'open' : ''}`} aria-hidden={!open}>
      <div className="drawer-content">
        {!point ? (
          <div className="loading-state">Loading selected point</div>
        ) : (
          <>
            <header className="sidebar-header">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <p className="sidebar-kicker"><MapPin size={14} /> Location Node</p>
                <button type="button" className="icon-button" onClick={onClose} aria-label="Close media drawer">
                  <X size={16} />
                </button>
              </div>
              <h1 className="drawer-title">{point.label || `Point ${String(pointIndex + 1).padStart(2, '0')}`}</h1>
              <p>{Number(point.lat).toFixed(6)} N, {Number(point.lng).toFixed(6)} E</p>
            </header>

            <div className="drawer-body custom-scrollbar">
              <section className="drawer-section">
                <div className="section-title"><FileVideo size={14} /> 720p Video</div>
                <div className="video-frame">
                  {videoUrl ? (
                    <video key={`${timeslot.id}-${videoUrl}`} src={videoUrl} controls autoPlay playsInline />
                  ) : (
                    <div className="empty-media">No video for {selectedSlot}</div>
                  )}
                </div>
              </section>

              <section className="drawer-section">
                <div className="section-title"><FileAudio size={14} /> Derived Audio</div>
                {audioUrl ? (
                  <WaveformPlayer src={audioUrl} filename={timeslot.audioPath || 'audio.aac'} />
                ) : (
                  <div className="empty-media" style={{ minHeight: 96 }}>No audio for {selectedSlot}</div>
                )}
              </section>

              {point.notes && (
                <section className="drawer-section">
                  <div className="section-title"><Info size={14} /> Field Observations</div>
                  <p className="note">{point.notes}</p>
                </section>
              )}

              <section className="drawer-section">
                <div className="section-title"><Info size={14} /> Node Specification</div>
                <div className="spec-grid">
                  <div className="spec-cell">
                    <span>Classification</span>
                    <span>{point.cluster || 'general'}</span>
                  </div>
                  <div className="spec-cell">
                    <span>Priority</span>
                    <span>Level {point.priority || '3'}</span>
                  </div>
                </div>
              </section>
            </div>
          </>
        )}
      </div>
    </aside>
  )
}
