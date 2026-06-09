import { Info, Loader2, MapPin, X } from 'lucide-react'
import { useEffect, useState } from 'react'

export default function MediaDrawer({ open, point, pointIndex, selectedSlot, onClose }) {
  const timeslot = point?.slots?.[selectedSlot] ?? null
  const videoUrl = timeslot?.video_hq ?? null
  const [videoReady, setVideoReady] = useState(false)

  useEffect(() => {
    setVideoReady(false)
  }, [videoUrl])

  return (
    <aside className={`drawer ${open ? 'open' : ''}`} aria-hidden={!open}>
      <div className="drawer-content">
        {!point ? (
          <div className="loading-state">Loading selected point</div>
        ) : (
          <>
            <header className="drawer-header">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <p className="drawer-kicker"><MapPin size={14} /> Location Node</p>
                <button type="button" className="icon-button" onClick={onClose} aria-label="Close media drawer">
                  <X size={16} />
                </button>
              </div>
              <h1 className="drawer-title">{point.label || `Point ${String(pointIndex + 1).padStart(2, '0')}`}</h1>
              <p>{Number(point.lat).toFixed(6)} N, {Number(point.lng).toFixed(6)} E</p>
            </header>

            <div className="drawer-body custom-scrollbar">
              <section className="drawer-section media-section">
                <div className="video-frame">
                  {videoUrl ? (
                    <>
                      {!videoReady && (
                        <div className="video-loading">
                          <Loader2 size={24} className="spin" />
                        </div>
                      )}
                      <video
                        key={`${timeslot.id}-${videoUrl}`}
                        className={videoReady ? 'ready' : ''}
                        src={videoUrl}
                        controls={videoReady}
                        autoPlay
                        playsInline
                        preload="auto"
                        onLoadedData={() => setVideoReady(true)}
                        onCanPlay={() => setVideoReady(true)}
                      />
                    </>
                  ) : (
                    <div className="empty-media">No video for {selectedSlot}</div>
                  )}
                </div>
              </section>

              {point.notes && (
                <section className="drawer-section">
                  <div className="section-title"><Info size={14} /> Field Observations</div>
                  <p className="note">{point.notes}</p>
                </section>
              )}
            </div>
          </>
        )}
      </div>
    </aside>
  )
}
