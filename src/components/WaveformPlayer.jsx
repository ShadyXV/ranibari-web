import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Play, Pause, Volume2 } from 'lucide-react';

export default function WaveformPlayer({ src, filename }) {
  const audioRef = useRef(null);
  const canvasRef = useRef(null);
  const animFrameRef = useRef(null);
  const analyserRef = useRef(null);
  const audioCtxRef = useRef(null);
  const sourceRef = useRef(null);

  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);   // 0–1
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  // ── Setup Web Audio analyser ─────────────────────────────────────────
  const ensureCtx = useCallback(() => {
    if (audioCtxRef.current) return;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.82;
    const source = ctx.createMediaElementSource(audioRef.current);
    source.connect(analyser);
    analyser.connect(ctx.destination);
    audioCtxRef.current = ctx;
    analyserRef.current = analyser;
    sourceRef.current = source;
  }, []);

  // ── Canvas draw loop ─────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);

    if (analyser && playing) {
      const bufLen = analyser.frequencyBinCount;
      const data = new Uint8Array(bufLen);
      analyser.getByteFrequencyData(data);

      const barW = (W / bufLen) * 2.5;
      let x = 0;
      for (let i = 0; i < bufLen; i++) {
        const barH = (data[i] / 255) * H;
        const alpha = 0.35 + (data[i] / 255) * 0.65;
        ctx.fillStyle = `rgba(45,212,191,${alpha})`;
        ctx.beginPath();
        ctx.roundRect(x, H - barH, barW - 1, barH, 2);
        ctx.fill();
        x += barW + 1;
      }
    } else {
      // Static idle waveform
      const bars = 48;
      const barW = (W - bars) / bars;
      const prog = progress;
      for (let i = 0; i < bars; i++) {
        const norm = i / bars;
        const h = H * (0.18 + 0.55 * Math.sin(norm * Math.PI * 4 + 1) * Math.abs(Math.sin(norm * Math.PI)));
        const filled = norm <= prog;
        ctx.fillStyle = filled ? 'rgba(45,212,191,0.85)' : 'rgba(255,255,255,0.12)';
        ctx.beginPath();
        ctx.roundRect(i * (barW + 1), (H - h) / 2, barW, h, 2);
        ctx.fill();
      }
    }

    animFrameRef.current = requestAnimationFrame(draw);
  }, [playing, progress]);

  useEffect(() => {
    animFrameRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [draw]);

  // ── Audio element event sync ─────────────────────────────────────────
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onLoaded = () => setDuration(audio.duration);
    const onTime = () => {
      setCurrentTime(audio.currentTime);
      setProgress(audio.duration ? audio.currentTime / audio.duration : 0);
    };
    const onEnded = () => setPlaying(false);
    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('ended', onEnded);
    };
  }, [src]);

  // ── Playback toggle ──────────────────────────────────────────────────
  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    ensureCtx();
    if (audioCtxRef.current?.state === 'suspended') audioCtxRef.current.resume();
    if (playing) { audio.pause(); setPlaying(false); }
    else { audio.play(); setPlaying(true); }
  };

  // ── Seek on canvas click ─────────────────────────────────────────────
  const handleSeek = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const audio = audioRef.current;
    if (audio && audio.duration) {
      audio.currentTime = ratio * audio.duration;
    }
  };

  const fmt = (s) => {
    if (!isFinite(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  };

  return (
    <div style={{
      background: 'rgba(0,0,0,0.35)',
      border: '1px solid rgba(45,212,191,0.18)',
      borderRadius: '16px',
      padding: '16px',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
    }}>
      {/* Filename */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Volume2 size={13} style={{ color: '#2dd4bf', flexShrink: 0 }} />
        <span style={{
          fontSize: '11px', fontWeight: '700', color: 'rgba(255,255,255,0.75)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
          fontFamily: 'monospace',
        }}>{filename}</span>
      </div>

      {/* Waveform canvas */}
      <canvas
        ref={canvasRef}
        width={340}
        height={52}
        onClick={handleSeek}
        style={{ width: '100%', height: '52px', cursor: 'pointer', borderRadius: '8px' }}
      />

      {/* Controls row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button
          onClick={togglePlay}
          style={{
            width: '38px', height: '38px', borderRadius: '50%', border: 'none',
            background: playing
              ? 'rgba(45,212,191,0.15)'
              : 'linear-gradient(135deg,#2dd4bf,#0891b2)',
            color: playing ? '#2dd4bf' : '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', flexShrink: 0,
            boxShadow: playing ? 'none' : '0 4px 16px rgba(45,212,191,0.35)',
            transition: 'all 0.2s ease',
          }}
        >
          {playing ? <Pause size={16} /> : <Play size={16} style={{ marginLeft: 2 }} />}
        </button>

        {/* Progress bar */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const ratio = (e.clientX - rect.left) / rect.width;
              const audio = audioRef.current;
              if (audio && audio.duration) audio.currentTime = ratio * audio.duration;
            }}
            style={{
              height: '3px', borderRadius: '2px',
              background: 'rgba(255,255,255,0.1)',
              cursor: 'pointer', position: 'relative', overflow: 'hidden',
            }}
          >
            <div style={{
              position: 'absolute', left: 0, top: 0, bottom: 0,
              width: `${progress * 100}%`,
              background: 'linear-gradient(90deg,#2dd4bf,#0891b2)',
              borderRadius: '2px',
              transition: 'width 0.1s linear',
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.6)', fontFamily: 'monospace' }}>{fmt(currentTime)}</span>
            <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.45)', fontFamily: 'monospace' }}>{fmt(duration)}</span>
          </div>
        </div>
      </div>

      <audio ref={audioRef} src={src} preload="metadata" crossOrigin="anonymous" style={{ display: 'none' }} />
    </div>
  );
}
