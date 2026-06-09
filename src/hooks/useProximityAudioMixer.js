import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const METERS_PER_DEGREE_LAT = 111_320;

function distanceMeters(a, b) {
  const avgLat = ((a.lat + b.lat) / 2) * Math.PI / 180;
  const metersPerDegreeLng = METERS_PER_DEGREE_LAT * Math.cos(avgLat);
  const dx = (a.lng - b.lng) * metersPerDegreeLng;
  const dy = (a.lat - b.lat) * METERS_PER_DEGREE_LAT;
  return Math.sqrt(dx * dx + dy * dy);
}

export function useProximityAudioMixer(sources, {
  maxActive = 4,
  radiusMeters = 75,
  maxVolume = 0.42,
  fadeSpeed = 0.075,
} = {}) {
  const entriesRef = useRef(new Map());
  const positionRef = useRef(null);
  const sourceRef = useRef([]);
  const blockedRef = useRef(false);
  const frameRef = useRef(null);
  const frameCountRef = useRef(0);
  const [activeLevels, setActiveLevels] = useState({});

  const stableSources = useMemo(
    () => sources.filter((source) => source?.src && Number.isFinite(source.lat) && Number.isFinite(source.lng)),
    [sources],
  );

  useEffect(() => {
    sourceRef.current = stableSources;

    const nextIds = new Set(stableSources.map((source) => source.id));
    entriesRef.current.forEach((entry, id) => {
      if (!nextIds.has(id)) {
        entry.audio.pause();
        entry.audio.src = '';
        entriesRef.current.delete(id);
      }
    });

    stableSources.forEach((source) => {
      const existing = entriesRef.current.get(source.id);
      if (existing?.src === source.src) return;

      if (existing) {
        existing.audio.pause();
        existing.audio.src = '';
      }

      const audio = new Audio(source.src);
      audio.loop = true;
      audio.preload = 'auto';
      audio.crossOrigin = 'anonymous';
      audio.volume = 0;

      entriesRef.current.set(source.id, {
        audio,
        src: source.src,
        currentVolume: 0,
        targetVolume: 0,
        pendingPlay: false,
      });
    });
  }, [stableSources]);

  const playEntry = useCallback((entry) => {
    if (!entry || !entry.audio.paused || entry.pendingPlay || blockedRef.current) return;
    entry.pendingPlay = true;
    const result = entry.audio.play();
    if (result?.catch) {
      result
        .catch(() => {
          blockedRef.current = true;
        })
        .finally(() => {
          entry.pendingPlay = false;
        });
    } else {
      entry.pendingPlay = false;
    }
  }, []);

  const warmEntry = useCallback(async (entry) => {
    if (!entry || entry.pendingPlay) return false;

    entry.pendingPlay = true;
    entry.audio.volume = 0;

    try {
      await entry.audio.play();
      entry.audio.pause();
      return true;
    } catch {
      blockedRef.current = true;
      return false;
    } finally {
      entry.audio.volume = Math.max(0, Math.min(maxVolume, entry.currentVolume));
      entry.pendingPlay = false;
    }
  }, [maxVolume]);

  const applyPosition = useCallback((position) => {
    positionRef.current = position;
    entriesRef.current.forEach((entry) => { entry.targetVolume = 0; });

    if (!position) return;
    const volumeScale = Math.max(0, Math.min(1, position.volumeScale ?? 1));

    const nearest = sourceRef.current
      .map((source) => ({ source, distance: distanceMeters(position, source) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, maxActive);

    nearest.forEach(({ source, distance }, index) => {
      const entry = entriesRef.current.get(source.id);
      if (!entry || distance > radiusMeters) return;

      const proximity = 1 - (distance / radiusMeters);
      const rankTrim = 1 - (index * 0.08);
      entry.targetVolume = Math.min(maxVolume, maxVolume * volumeScale * Math.pow(proximity, 1.35) * rankTrim);
      playEntry(entry);
    });
  }, [maxActive, maxVolume, playEntry, radiusMeters]);

  useEffect(() => {
    const tick = () => {
      entriesRef.current.forEach((entry) => {
        entry.currentVolume += (entry.targetVolume - entry.currentVolume) * fadeSpeed;
        if (entry.currentVolume < 0.002 && entry.targetVolume === 0) {
          entry.currentVolume = 0;
          if (!entry.audio.paused) entry.audio.pause();
        }
        entry.audio.volume = Math.max(0, Math.min(maxVolume, entry.currentVolume));
      });

      frameCountRef.current += 1;
      if (frameCountRef.current % 4 === 0) {
        const nextLevels = {};
        entriesRef.current.forEach((entry, id) => {
          const level = maxVolume > 0 ? entry.currentVolume / maxVolume : 0;
          if (level > 0.01) nextLevels[id] = Number(level.toFixed(3));
        });
        setActiveLevels(nextLevels);
      }

      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [fadeSpeed, maxVolume]);

  useEffect(() => () => {
    entriesRef.current.forEach((entry) => {
      entry.audio.pause();
      entry.audio.src = '';
    });
    entriesRef.current.clear();
  }, []);

  const unlock = useCallback(async (options = {}) => {
    blockedRef.current = false;

    if (options.warm) {
      const entries = Array.from(entriesRef.current.values());
      const results = await Promise.all(entries.map((entry) => warmEntry(entry)));
      if (entries.length > 0) blockedRef.current = !results.some(Boolean);
    }

    applyPosition(positionRef.current);
    return !blockedRef.current;
  }, [applyPosition, warmEntry]);

  const moveTo = useCallback((lat, lng, options = {}) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    applyPosition({ lat, lng, volumeScale: options.volumeScale ?? 1 });
  }, [applyPosition]);

  const solo = useCallback((id, options = {}) => {
    const volumeScale = Math.max(0, Math.min(1, options.volumeScale ?? 1));
    positionRef.current = null;
    entriesRef.current.forEach((entry, entryId) => {
      entry.targetVolume = entryId === id ? maxVolume * volumeScale : 0;
      if (entryId === id) playEntry(entry);
    });
  }, [maxVolume, playEntry]);

  const fadeOut = useCallback(() => {
    applyPosition(null);
  }, [applyPosition]);

  return { moveTo, solo, fadeOut, unlock, activeLevels };
}
