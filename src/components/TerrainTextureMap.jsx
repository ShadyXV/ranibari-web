import React, { useMemo, useRef, useEffect } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Sky, Stars, Line, useTexture, Billboard } from '@react-three/drei';
import * as THREE from 'three';
import { Player } from './Player.jsx';
import { routes } from '../data/OverlayData.js';
import { publicAssetUrl } from '../lib/publicAssetUrl.js';

const WORLD_SCALE = 1.0;
const DENSE_RES = 160;
const CONTOUR_LEVEL_COUNT = 18;
const CONTOUR_SAMPLE_STEP = 2;
const METERS_PER_DEGREE_LAT = 111_320;
const ACTIVE_SOUND_GOLD = '#e7c66a';
const ACTIVE_SOUND_GOLD_HIGHLIGHT = '#fff0bd';

function easeOutQuart(t) {
  return 1 - Math.pow(1 - t, 4);
}

// --- Value noise / FBM for vertex displacement ---
function hash2d(x, y) {
  const h = (Math.sin(x * 127.1 + y * 311.7) * 43758.5453) % 1;
  return h < 0 ? h + 1 : h;
}
function valueNoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const xt = xf * xf * (3 - 2 * xf);
  const yt = yf * yf * (3 - 2 * yf);
  return hash2d(xi, yi)   * (1-xt)*(1-yt) + hash2d(xi+1, yi)   * xt*(1-yt)
       + hash2d(xi, yi+1) * (1-xt)*yt     + hash2d(xi+1, yi+1) * xt*yt;
}
function fbm(x, y, octaves = 5) {
  let v = 0, a = 1, total = 0;
  for (let i = 0; i < octaves; i++) {
    v += valueNoise(x, y) * a;
    total += a;
    a *= 0.5; x *= 2; y *= 2;
  }
  return v / total; // 0..1
}

function sampleElevation(matrix, x, y) {
  if (!matrix || matrix.length === 0) return 0;
  const h = matrix.length;
  const w = matrix[0].length;
  const x0 = Math.max(0, Math.min(w - 2, Math.floor(x)));
  const x1 = x0 + 1;
  const y0 = Math.max(0, Math.min(h - 2, Math.floor(y)));
  const y1 = y0 + 1;
  const dx = x - x0;
  const dy = y - y0;
  const v00 = matrix[y0][x0] || 0;
  const v10 = matrix[y0][x1] || 0;
  const v01 = matrix[y1][x0] || 0;
  const v11 = matrix[y1][x1] || 0;
  return v00 * (1 - dx) * (1 - dy) + v10 * dx * (1 - dy) + v01 * (1 - dx) * dy + v11 * dx * dy;
}

function distToSegSq(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const lenSq = dx * dx + dz * dz;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lenSq));
  const ex = px - ax - t * dx, ez = pz - az - t * dz;
  return ex * ex + ez * ez;
}

function blurMatrix(matrix, radius = 1) {
  const h = matrix.length;
  const w = matrix[0].length;
  const result = Array(h).fill(0).map(() => new Float32Array(w));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0, count = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < w && ny >= 0 && ny < h) { sum += matrix[ny][nx]; count++; }
        }
      }
      result[y][x] = sum / count;
    }
  }
  return result;
}

function gridToWorld(col, row, segmentsX, segmentsY, worldW, worldH) {
  return {
    x: (col / segmentsX) * worldW - worldW / 2,
    z: (row / segmentsY) * worldH - worldH / 2,
  };
}

function interpolateContourPoint(level, a, b) {
  const denom = b.h - a.h;
  const t = Math.abs(denom) < 0.00001 ? 0.5 : (level - a.h) / denom;
  return {
    x: a.x + (b.x - a.x) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

function buildContourSegments(displacedH, segmentsX, segmentsY, worldW, worldH, minDisp, maxDisp) {
  const range = maxDisp - minDisp;
  if (!displacedH || range <= 0) return [];

  const segments = [];
  const firstLevel = minDisp + range * 0.08;
  const levelStep = (range * 0.84) / CONTOUR_LEVEL_COUNT;

  for (let levelIndex = 1; levelIndex <= CONTOUR_LEVEL_COUNT; levelIndex++) {
    const level = firstLevel + levelStep * levelIndex;

    for (let row = 0; row < segmentsY; row += CONTOUR_SAMPLE_STEP) {
      const nextRow = Math.min(row + CONTOUR_SAMPLE_STEP, segmentsY);
      for (let col = 0; col < segmentsX; col += CONTOUR_SAMPLE_STEP) {
        const nextCol = Math.min(col + CONTOUR_SAMPLE_STEP, segmentsX);
        const p00w = gridToWorld(col, row, segmentsX, segmentsY, worldW, worldH);
        const p10w = gridToWorld(nextCol, row, segmentsX, segmentsY, worldW, worldH);
        const p11w = gridToWorld(nextCol, nextRow, segmentsX, segmentsY, worldW, worldH);
        const p01w = gridToWorld(col, nextRow, segmentsX, segmentsY, worldW, worldH);
        const p00 = { ...p00w, h: displacedH[row * (segmentsX + 1) + col] };
        const p10 = { ...p10w, h: displacedH[row * (segmentsX + 1) + nextCol] };
        const p11 = { ...p11w, h: displacedH[nextRow * (segmentsX + 1) + nextCol] };
        const p01 = { ...p01w, h: displacedH[nextRow * (segmentsX + 1) + col] };
        const intersections = [];

        if ((p00.h < level && p10.h >= level) || (p10.h < level && p00.h >= level)) intersections.push(interpolateContourPoint(level, p00, p10));
        if ((p10.h < level && p11.h >= level) || (p11.h < level && p10.h >= level)) intersections.push(interpolateContourPoint(level, p10, p11));
        if ((p11.h < level && p01.h >= level) || (p01.h < level && p11.h >= level)) intersections.push(interpolateContourPoint(level, p11, p01));
        if ((p01.h < level && p00.h >= level) || (p00.h < level && p01.h >= level)) intersections.push(interpolateContourPoint(level, p01, p00));

        if (intersections.length === 2) {
          segments.push([intersections[0].x, level + 1.2, intersections[0].z, intersections[1].x, level + 1.2, intersections[1].z]);
        } else if (intersections.length === 4) {
          segments.push([intersections[0].x, level + 1.2, intersections[0].z, intersections[1].x, level + 1.2, intersections[1].z]);
          segments.push([intersections[2].x, level + 1.2, intersections[2].z, intersections[3].x, level + 1.2, intersections[3].z]);
        }
      }
    }
  }

  return segments;
}

// Smoothly moves OrbitControls target to a new focus point
function CameraFocuser({ focusTarget, controlsRef }) {
  const targetVec = useRef(new THREE.Vector3());
  const active = useRef(false);

  useEffect(() => {
    if (focusTarget) {
      targetVec.current.set(...focusTarget);
      active.current = true;
    } else {
      active.current = false;
    }
  }, [focusTarget]);

  useFrame(() => {
    if (!active.current || !controlsRef.current) return;
    const ctrl = controlsRef.current;
    ctrl.target.lerp(targetVec.current, 0.08);
    ctrl.update();
    if (ctrl.target.distanceTo(targetVec.current) < 0.1) active.current = false;
  });

  return null;
}

function getPathLength(path) {
  if (!path || path.length < 2) return 0;

  let length = 0;
  for (let index = 0; index < path.length - 1; index++) {
    length += path[index].distanceTo(path[index + 1]);
  }
  return length;
}

function samplePath(path, distance) {
  if (!path?.length) return null;
  if (path.length === 1) return path[0].clone();

  let remaining = distance;
  for (let index = 0; index < path.length - 1; index++) {
    const start = path[index];
    const end = path[index + 1];
    const segmentLength = start.distanceTo(end);
    if (segmentLength <= 0.0001) continue;

    if (remaining <= segmentLength) {
      return start.clone().lerp(end, remaining / segmentLength);
    }
    remaining -= segmentLength;
  }

  return path[path.length - 1].clone();
}

function cinematicEase(t) {
  if (t < 0.72) {
    return 0.72 * Math.pow(t / 0.72, 2.15);
  }

  const landingT = (t - 0.72) / 0.28;
  return 0.72 + 0.28 * (1 - Math.pow(1 - landingT, 2.6));
}

function modeTransitionEase(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function CameraFlyToMarker({ flyTo, data, controlsRef, onComplete }) {
  const { camera } = useThree();
  const flightRef = useRef(null);

  useEffect(() => {
    if (!flyTo || !data || !controlsRef.current) return;

    const projected = data.project(flyTo.lat, flyTo.lng);
    const sizeScale = flyTo.sizeScale || 1;
    const markerHeight = flyTo.markerHeight ?? 2.5 * sizeScale;
    const targetYOffset = flyTo.targetYOffset ?? Math.max(7, markerHeight * 0.74);
    const target = new THREE.Vector3(
      projected.wx,
      projected.wy + targetYOffset,
      projected.wz,
    );

    const approach = camera.position.clone().sub(target);
    approach.y = 0;
    if (approach.lengthSq() < 1) approach.set(1, 0, 1);
    approach.normalize();

    const finalDistance = flyTo.cameraDistance ?? Math.max(26, sizeScale * 7.4);
    const finalHeight = flyTo.cameraHeight ?? Math.max(18, sizeScale * 5.8);
    const endPosition = target.clone()
      .add(approach.multiplyScalar(finalDistance))
      .add(new THREE.Vector3(0, finalHeight, 0));

    flightRef.current = {
      elapsed: 0,
      duration: flyTo.duration ?? 3.35,
      startPosition: camera.position.clone(),
      startTarget: controlsRef.current.target.clone(),
      endPosition,
      endTarget: target,
      completed: false,
    };
  }, [camera, controlsRef, data, flyTo]);

  useEffect(() => () => {
    flightRef.current = null;
  }, []);

  useFrame((_, delta) => {
    const flight = flightRef.current;
    const controls = controlsRef.current;
    if (!flight || !controls) return;

    flight.elapsed = Math.min(flight.duration, flight.elapsed + delta);
    const progress = cinematicEase(flight.elapsed / flight.duration);

    camera.position.lerpVectors(flight.startPosition, flight.endPosition, progress);
    controls.target.lerpVectors(flight.startTarget, flight.endTarget, progress);
    camera.up.set(0, 1, 0);
    controls.update();

    if (flight.elapsed >= flight.duration && !flight.completed) {
      flight.completed = true;
      camera.position.copy(flight.endPosition);
      controls.target.copy(flight.endTarget);
      controls.update();
      flightRef.current = null;
      if (onComplete) onComplete();
    }
  });

  return null;
}

function CameraDirector({ mode, data, controlsRef }) {
  const { camera } = useThree();
  const routeDistanceRef = useRef(0);
  const orbitStateRef = useRef({ angle: 0, radius: null, height: null });
  const previousModeRef = useRef(mode);
  const transitionRef = useRef(null);

  const sceneMetrics = useMemo(() => {
    if (!data?.projectedBoundary?.length) return null;

    const bounds = new THREE.Box3().setFromPoints(data.projectedBoundary);
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const radius = Math.max(size.x, size.z) * 0.72;
    return { center, size, radius };
  }, [data]);

  const routePath = useMemo(() => {
    if (!data?.roadPaths?.length) return null;

    return data.roadPaths.reduce((best, path) => (
      getPathLength(path) > getPathLength(best) ? path : best
    ), data.roadPaths[0]);
  }, [data]);

  const routeLength = useMemo(() => getPathLength(routePath), [routePath]);

  useEffect(() => {
    if (previousModeRef.current !== mode) {
      routeDistanceRef.current = 0;
      previousModeRef.current = mode;
      if (mode === 'orbit' && sceneMetrics) {
        const offset = camera.position.clone().sub(sceneMetrics.center);
        const horizontalRadius = Math.hypot(offset.x, offset.z);
        orbitStateRef.current = {
          angle: horizontalRadius > 0.001 ? Math.atan2(offset.z, offset.x) : 0,
          radius: Math.max(1, horizontalRadius),
          height: offset.y,
        };
      }
      if (mode !== 'free' && controlsRef.current) {
        transitionRef.current = {
          elapsed: 0,
          duration: 3.8,
          startPosition: camera.position.clone(),
          startTarget: controlsRef.current.target.clone(),
          startUp: camera.up.clone(),
        };
      } else {
        transitionRef.current = null;
      }
    }
    if (mode === 'free') {
      camera.up.set(0, 1, 0);
    }
  }, [camera, controlsRef, mode, sceneMetrics]);

  useFrame((_, delta) => {
    if (!controlsRef.current || !sceneMetrics || mode === 'free') return;

    const controls = controlsRef.current;
    const { center, radius } = sceneMetrics;
    let desiredPosition = null;
    let desiredTarget = center;
    let desiredUp = new THREE.Vector3(0, 1, 0);

    if (mode === 'top') {
      const height = Math.max(95, radius * 2.35);
      desiredPosition = new THREE.Vector3(center.x, center.y + height, center.z + 0.01);
      desiredUp = new THREE.Vector3(0, 0, -1);
    }

    if (mode === 'orbit') {
      const orbit = orbitStateRef.current;
      if (orbit.radius === null || orbit.height === null) {
        const offset = camera.position.clone().sub(center);
        const horizontalRadius = Math.hypot(offset.x, offset.z);
        orbit.angle = horizontalRadius > 0.001 ? Math.atan2(offset.z, offset.x) : 0;
        orbit.radius = Math.max(1, horizontalRadius);
        orbit.height = offset.y;
      }

      orbit.angle += delta * 0.13;
      orbit.radius = THREE.MathUtils.lerp(orbit.radius, Math.max(75, radius * 1.45), 0.01);
      orbit.height = THREE.MathUtils.lerp(orbit.height, Math.max(38, radius * 0.52), 0.01);
      const position = new THREE.Vector3(
        center.x + Math.cos(orbit.angle) * orbit.radius,
        center.y + orbit.height,
        center.z + Math.sin(orbit.angle) * orbit.radius,
      );
      desiredPosition = position;
    }

    if (mode === 'route' && routePath?.length && routeLength > 0) {
      routeDistanceRef.current = (routeDistanceRef.current + delta * 7.5) % routeLength;
      const current = samplePath(routePath, routeDistanceRef.current);
      const ahead = samplePath(routePath, (routeDistanceRef.current + 26) % routeLength);
      if (current && ahead) {
        const direction = ahead.clone().sub(current);
        if (direction.lengthSq() < 0.001) direction.set(0, 0, -1);
        direction.normalize();

        const target = current.clone().lerp(ahead, 0.62);
        const position = current.clone()
          .add(direction.clone().multiplyScalar(-136))
          .add(new THREE.Vector3(0, 96, 0));

        desiredPosition = position;
        desiredTarget = target;
      }
    }

    if (!desiredPosition) return;

    const transition = transitionRef.current;
    if (transition) {
      transition.elapsed = Math.min(transition.duration, transition.elapsed + delta);
      const eased = modeTransitionEase(transition.elapsed / transition.duration);
      camera.position.lerpVectors(transition.startPosition, desiredPosition, eased);
      controls.target.lerpVectors(transition.startTarget, desiredTarget, eased);
      camera.up.lerpVectors(transition.startUp, desiredUp, eased).normalize();

      if (transition.elapsed >= transition.duration) {
        transitionRef.current = null;
      }
    } else {
      const positionLerp = mode === 'top' ? 0.02 : mode === 'orbit' ? 0.0125 : 0.01125;
      const targetLerp = mode === 'top' ? 0.03 : mode === 'orbit' ? 0.02 : 0.02125;
      camera.position.lerp(desiredPosition, positionLerp);
      controls.target.lerp(desiredTarget, targetLerp);
      camera.up.copy(desiredUp);
    }

    controls.update();
  });

  return null;
}

function TerrainTextureMesh({
  geometry,
  textureMeta,
  textureOpacity,
  textureType,
  displayMode,
  terrainTheme,
  showContours,
  contourSegments,
  projectedBoundary,
  roadPaths,
  markers,
  onMeshClick,
  onMeshPointerMove,
  onMeshPointerLeave,
  onMeshPointerDown,
}) {
  const meshRef = useRef();

  // Load both textures unconditionally (hooks can't be conditional)
  const satTexture = useTexture(publicAssetUrl('terrain_data/satellite_texture/texture.png'));
  const topoTexture = useTexture(publicAssetUrl('terrain_data/option3_texture/texture.png'));
  const texture = textureType === 'satellite' ? satTexture : topoTexture;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;

  if (!geometry) return null;

  const handleClick = (e) => {
    if (!onMeshClick) return;
    e.stopPropagation();
    // e.point is the 3D hit point; convert back to lat/lng via UV
    // We pass the raw 3D point and let the caller decode it
    onMeshClick(e.point);
  };

  const handlePointerMove = (e) => {
    if (!onMeshPointerMove) return;
    e.stopPropagation();
    onMeshPointerMove(e.point);
  };

  const handlePointerLeave = (e) => {
    if (!onMeshPointerLeave) return;
    e.stopPropagation();
    onMeshPointerLeave();
  };

  const handlePointerDown = () => {
    if (onMeshPointerDown) onMeshPointerDown();
  };

  const terrainEvents = {
    onClick: handleClick,
    onPointerMove: handlePointerMove,
    onPointerOut: handlePointerLeave,
    onPointerDown: handlePointerDown,
  };

  const markerEvents = {
    onClick: handleClick,
    onPointerMove: handlePointerMove,
    onPointerDown: handlePointerDown,
  };

  const showTexture = displayMode === 'satellite' && textureMeta;
  const showGradient = displayMode === 'gradient';
  const showGrid = displayMode === 'grid';
  const isCinematic = terrainTheme === 'cinematic';

  return (
    <group>
      {/* Main terrain mesh */}
      {isCinematic && (
        <mesh ref={meshRef} geometry={geometry} {...terrainEvents}>
          <meshStandardMaterial
            color="#071116"
            emissive="#031f22"
            emissiveIntensity={0.18}
            side={THREE.DoubleSide}
            roughness={0.96}
            metalness={0.02}
          />
        </mesh>
      )}
      {!isCinematic && showTexture && (
        <mesh ref={meshRef} geometry={geometry} {...terrainEvents}>
          <meshStandardMaterial
            map={texture}
            side={THREE.DoubleSide}
            roughness={0.9}
            metalness={0.0}
            transparent
            opacity={textureOpacity}
          />
        </mesh>
      )}
      {!isCinematic && showGradient && (
        <mesh ref={meshRef} geometry={geometry} {...terrainEvents}>
          <meshStandardMaterial vertexColors side={THREE.DoubleSide} roughness={0.85} metalness={0.05} />
        </mesh>
      )}
      {!isCinematic && showGrid && (
        <group>
          <mesh geometry={geometry} {...terrainEvents}>
            <meshStandardMaterial color="#0f172a" side={THREE.DoubleSide} roughness={0.9} />
          </mesh>
          <mesh geometry={geometry}>
            <meshBasicMaterial color="#22d3ee" wireframe transparent opacity={0.4} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
          </mesh>
        </group>
      )}

      {/* Boundary & routes */}
      {isCinematic && showContours && <ContourSegments segments={contourSegments} />}
      {isCinematic ? (
        <CinematicOverlays projectedBoundary={projectedBoundary} roadPaths={roadPaths} />
      ) : (
        <>
          {projectedBoundary.length > 0 && <Line points={projectedBoundary.map(p => [p.x, p.y, p.z])} color="white" lineWidth={2} opacity={0.5} transparent />}
          {roadPaths.map((path, i) => <Line key={i} points={path} color="#fbbf24" lineWidth={4} />)}
        </>
      )}

      {/* Sound beacons */}
      {markers && markers.map((m) => (
        <SoundBeacon key={m.id} marker={m} terrainEvents={markerEvents} terrainTheme={terrainTheme} />
      ))}
    </group>
  );
}

function ContourSegments({ segments }) {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array((segments || []).flat());
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geo;
  }, [segments]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  if (!segments?.length) return null;

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color="#6ee7df" transparent opacity={0.18} depthWrite={false} />
    </lineSegments>
  );
}

function CinematicOverlays({ projectedBoundary, roadPaths }) {
  const roadColor = '#889393';

  return (
    <>
      {projectedBoundary.length > 0 && (
        <SimpleBoundaryLine points={projectedBoundary} color="#d8ffff" opacity={0.34} />
      )}

      {roadPaths.map((path, i) => {
        return (
          <group key={i}>
            <RoadRibbon path={path} width={6.8} color={roadColor} yOffset={1.8} />
            <RoadJoints path={path} radius={3.4} color={roadColor} yOffset={1.84} />
          </group>
        );
      })}
    </>
  );
}

function SimpleBoundaryLine({ points, color, opacity }) {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(points.flatMap((point) => [point.x, point.y + 1.1, point.z]));
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geo;
  }, [points]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <line geometry={geometry}>
      <lineBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
    </line>
  );
}

function RoadRibbon({ path, width, color, yOffset = 0 }) {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    if (!path || path.length < 2) return geo;

    const halfWidth = width / 2;
    const positions = [];
    const indices = [];

    for (let index = 0; index < path.length - 1; index++) {
      const start = path[index];
      const end = path[index + 1];
      const tangent = new THREE.Vector3(end.x - start.x, 0, end.z - start.z);
      if (tangent.lengthSq() < 0.00001) tangent.set(1, 0, 0);
      tangent.normalize();

      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).multiplyScalar(halfWidth);
      const base = positions.length / 3;
      positions.push(
        start.x + normal.x, start.y + yOffset, start.z + normal.z,
        start.x - normal.x, start.y + yOffset, start.z - normal.z,
        end.x + normal.x, end.y + yOffset, end.z + normal.z,
        end.x - normal.x, end.y + yOffset, end.z - normal.z,
      );
      indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }

    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }, [path, width, yOffset]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  if (!path || path.length < 2) return null;

  return (
    <mesh geometry={geometry} renderOrder={2}>
      <meshBasicMaterial
        color={color}
        side={THREE.DoubleSide}
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-6}
        polygonOffsetUnits={-6}
      />
    </mesh>
  );
}

function RoadJoints({ path, radius, color, yOffset = 0 }) {
  if (!path?.length) return null;

  return (
    <>
      {path.map((point, index) => (
        <mesh key={index} position={[point.x, point.y + yOffset, point.z]} rotation-x={-Math.PI / 2} renderOrder={3}>
          <circleGeometry args={[radius, 24]} />
          <meshBasicMaterial
            color={color}
            side={THREE.DoubleSide}
            depthWrite={false}
            polygonOffset
            polygonOffsetFactor={-7}
            polygonOffsetUnits={-7}
          />
        </mesh>
      ))}
    </>
  );
}

function SpeciesBillboard({ imageSrc, color, radius, position }) {
  const billboardRef = useRef();
  const texture = useTexture(imageSrc);

  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    texture.needsUpdate = true;
  }, [texture]);

  const imageMaterial = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      map: { value: texture },
    },
    vertexShader: `
      varying vec2 vUv;

      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D map;
      varying vec2 vUv;

      void main() {
        vec2 centered = vUv - vec2(0.5);
        float circle = smoothstep(0.5, 0.485, length(centered));
        if (circle <= 0.01) discard;

        vec4 color = texture2D(map, vUv);
        gl_FragColor = vec4(color.rgb, color.a * circle);

        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  }), [texture]);

  useEffect(() => () => imageMaterial.dispose(), [imageMaterial]);

  useEffect(() => {
    if (!billboardRef.current) return;
    billboardRef.current.position.set(...position);
    billboardRef.current.scale.setScalar(radius);
  }, []);

  useFrame(() => {
    if (!billboardRef.current) return;
    billboardRef.current.position.lerp(new THREE.Vector3(...position), 0.09);
    const currentScale = billboardRef.current.scale.x;
    const nextScale = THREE.MathUtils.lerp(currentScale, radius, 0.09);
    billboardRef.current.scale.setScalar(nextScale);
  });

  return (
    <Billboard ref={billboardRef} renderOrder={20}>
      <mesh position={[0, 0, -0.02]} renderOrder={21}>
        <planeGeometry args={[2, 2]} />
        <primitive object={imageMaterial} attach="material" />
      </mesh>
      <mesh position={[0, 0, 0.04]} renderOrder={22}>
        <ringGeometry args={[1.02, 1.13, 64]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.95}
          depthTest={false}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
    </Billboard>
  );
}

function SoundBeacon({ marker, terrainEvents, terrainTheme }) {
  const groupRef = useRef();
  const rippleRefs = useRef([]);
  const lastRippleUpdateRef = useRef(0);
  const baseRef = useRef();
  const capRef = useRef();
  const audioLevel = marker.audioLevel || 0;
  const hasAudio = marker.hasAudio || audioLevel > 0;
  const showRipple = hasAudio || marker.showRipple;
  const passiveRipple = marker.showRipple && !hasAudio;
  const color = marker.selected || marker.nearestAudio ? ACTIVE_SOUND_GOLD : marker.color;
  const isCinematic = terrainTheme === 'cinematic';
  const sizeScale = marker.sizeScale || 1;
  const mastHeight = (isCinematic ? (marker.selected ? 9 : hasAudio ? 5.5 : 2.5) : (marker.selected ? 16 : hasAudio ? 10 : 6)) * sizeScale;
  const footprint = (isCinematic ? (marker.selected ? 3.2 : hasAudio ? 2.25 : 1.1) : (marker.selected ? 5.8 : hasAudio ? 4.4 : 2.8)) * sizeScale;
  const capRadius = (isCinematic ? (marker.selected ? 1.55 : hasAudio ? 0.92 : 0.5) : (marker.selected ? 2.8 : hasAudio ? 2.1 : 1.45)) * sizeScale;
  const rippleRadius = marker.rippleRadius ?? footprint * 1.24;
  const rippleOuterScale = marker.rippleOuterScale ?? (passiveRipple ? 2.65 : 2.1);
  const rippleOpacityBase = marker.rippleOpacity ?? (passiveRipple ? 0.42 : null);
  const rippleSpeedOverride = marker.rippleSpeed ?? null;
  const rippleFps = marker.rippleFps ?? 24;
  const imageRadius = marker.imageRadius ?? capRadius * (marker.imageScale ?? 3.05);
  const imageCenterY = mastHeight + capRadius * 2.25 + imageRadius;

  useEffect(() => () => {
    rippleRefs.current = [];
  }, []);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const active = Math.max(audioLevel, marker.selected ? 0.78 : 0);
    const isHovered = audioLevel > 0.08;
    const baseRippleMax = marker.selected
      ? (isCinematic ? 2.95 : 3.35)
      : isHovered
        ? (isCinematic ? 2.55 : 2.95)
        : (isCinematic ? 1.95 : 2.25);
    const rippleMax = passiveRipple ? rippleOuterScale : baseRippleMax * (marker.nearestAudio ? 1.3 : 1);
    const rippleOpacity = rippleOpacityBase ?? (marker.selected
      ? (isCinematic ? 0.54 : 0.68)
      : isHovered
        ? (isCinematic ? 0.38 + active * 0.18 : 0.46 + active * 0.18)
        : (isCinematic ? 0.12 : 0.16));
    const rippleSpeed = rippleSpeedOverride ?? (passiveRipple ? 0.16 : marker.selected ? 0.37 : isHovered ? 0.45 : 0.28);

    if (groupRef.current) {
      groupRef.current.position.y = marker.wy + 0.7;
    }

    if (baseRef.current) {
      baseRef.current.scale.setScalar(1 + active * (isCinematic ? 0.18 : 0.25));
      baseRef.current.material.opacity = hasAudio ? (isCinematic ? 0.09 + active * 0.16 : 0.16 + active * 0.18) : (isCinematic ? 0.04 : 0.08);
    }

    if (showRipple && t - lastRippleUpdateRef.current >= 1 / rippleFps) {
      lastRippleUpdateRef.current = t;
      rippleRefs.current.forEach((ring, index) => {
        if (!ring) return;
        const phaseOffset = index / 3;
        const phase = (t * rippleSpeed + phaseOffset) % 1;
        const spread = easeOutQuart(phase);
        const scale = 0.62 + spread * (rippleMax - 0.62);
        ring.scale.set(scale, scale, scale);
        ring.material.opacity = rippleOpacity * Math.pow(1 - phase, passiveRipple ? 1.15 : 1.45);
      });
    }

    if (capRef.current) {
      const capScale = marker.selected ? (isCinematic ? 1.25 : 1.4) : 1 + active * (isCinematic ? 0.35 : 0.45);
      capRef.current.scale.setScalar(capScale);
      capRef.current.material.emissiveIntensity = hasAudio ? (isCinematic ? 0.9 + active * 1.4 : 0.45 + active * 1.15) : 0.08;
    }
  });

  const mastTop = [0, mastHeight, 0];

  return (
    <group ref={groupRef} position={[marker.wx, marker.wy + 0.7, marker.wz]}>
      <mesh ref={baseRef} rotation-x={-Math.PI / 2} {...terrainEvents}>
        <circleGeometry args={[footprint, 48]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={hasAudio ? (isCinematic ? 0.09 : 0.16) : (isCinematic ? 0.04 : 0.08)}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {showRipple && (
        <>
          {[0, 1, 2].map((index) => (
            <mesh
              key={index}
              ref={(node) => { rippleRefs.current[index] = node; }}
              rotation-x={-Math.PI / 2}
              {...terrainEvents}
            >
              <ringGeometry args={[rippleRadius * 0.94, rippleRadius, 48]} />
              <meshBasicMaterial color={color} transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
            </mesh>
          ))}
        </>
      )}

      <Line points={[[0, 0, 0], mastTop]} color={color} lineWidth={marker.selected ? (isCinematic ? 2.4 : 4) : (isCinematic ? 1.3 : 2)} transparent opacity={hasAudio ? (isCinematic ? 0.64 : 0.82) : (isCinematic ? 0.2 : 0.34)} />

      {marker.selected && (
        <Line points={[[0, mastHeight + 1.1, 0], [0, mastHeight + (isCinematic ? 5 : 9), 0]]} color={ACTIVE_SOUND_GOLD_HIGHLIGHT} lineWidth={isCinematic ? 2 : 3} transparent opacity={0.9} />
      )}

      <mesh ref={capRef} position={mastTop} {...terrainEvents}>
        <octahedronGeometry args={[capRadius, 0]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={hasAudio ? 0.45 : 0.08}
          roughness={0.22}
          metalness={0.2}
        />
      </mesh>

      {marker.imageSrc && (
        <SpeciesBillboard
          imageSrc={marker.imageSrc}
          color={color}
          radius={imageRadius}
          position={[0, imageCenterY, 0]}
        />
      )}

      {marker.selected && (
        <mesh position={[0, mastHeight + (isCinematic ? 2.8 : 4.5), 0]} rotation-x={-Math.PI / 2}>
          <torusGeometry args={[isCinematic ? 2.4 : 4.4, isCinematic ? 0.055 : 0.16, 8, 96]} />
          <meshBasicMaterial color={ACTIVE_SOUND_GOLD_HIGHLIGHT} transparent opacity={0.85} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

function InfluenceSphere({ sphere }) {
  if (!sphere) return null;

  return (
    <group position={[sphere.x, sphere.y + sphere.radius * 0.48, sphere.z]}>
      <mesh renderOrder={6}>
        <sphereGeometry args={[sphere.radius, 48, 24]} />
        <meshBasicMaterial
          color="#e7c66a"
          transparent
          opacity={0.08}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} renderOrder={7}>
        <torusGeometry args={[sphere.radius, 0.08, 8, 128]} />
        <meshBasicMaterial color="#fff0bd" transparent opacity={0.24} depthWrite={false} />
      </mesh>
    </group>
  );
}

export default function TerrainTextureMap({ tiles, textureMeta, textureOpacity, textureType, displayMode, terrainTheme, showContours = false, exaggeration, parkBoundary, playMode, enableNoise, noiseAmplitude, noiseFrequency, enableSmoothing, blurRadius, enableRouteSmooth, roadHalfWidth, enableBoundarySmooth, boundaryHalfWidth, cameraPosition, cameraTarget, cameraMode = 'free', onCameraChange, markers, rawMarkers, onMeshClick, onMeshPointerMove, onMeshPointerLeave, onMeshPointerDown, focusLatLng, flyToMarker, onFlyToMarkerComplete, influenceLatLng, influenceRadiusMeters = 85 }) {
  const controlsRef = useRef();
  const isCinematic = terrainTheme === 'cinematic';

  const data = useMemo(() => {
    if (!tiles || tiles.length === 0 || !parkBoundary) return null;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const isOT = tiles[0].isOT;
    let rawMatrix;

    if (isOT) {
      const meta = tiles[0].meta;
      minX = meta.xllcorner; minY = meta.yllcorner;
      rawMatrix = tiles[0].elevations;
    } else {
      tiles.forEach(t => {
        minX = Math.min(minX, t.x); maxX = Math.max(maxX, t.x);
        minY = Math.min(minY, t.y); maxY = Math.max(maxY, t.y);
      });
      const gridW = (maxX - minX + 1) * 256;
      const gridH = (maxY - minY + 1) * 256;
      rawMatrix = Array(gridH).fill(0).map(() => new Float32Array(gridW));
      tiles.forEach(tile => {
        const startX = (tile.x - minX) * 256, startY = (tile.y - minY) * 256;
        for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) rawMatrix[startY + y][startX + x] = tile.elevations[y][x];
      });
    }

    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    parkBoundary.forEach(([lat, lng]) => {
      minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
      minLng = Math.min(minLng, lng); maxLng = Math.max(maxLng, lng);
    });

    const { zoom, cellsize } = tiles[0].meta || { zoom: tiles[0].z };
    let refLng, refLat, local_delta_lng, local_delta_lat;
    if (isOT) {
      refLng = minX; refLat = minY + (rawMatrix.length * cellsize);
      local_delta_lng = cellsize; local_delta_lat = -cellsize;
    } else {
      const n = Math.pow(2, zoom);
      refLng = (minX / n) * 360 - 180;
      const nLat = Math.PI - (2 * Math.PI * minY) / n;
      refLat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(nLat) - Math.exp(-nLat)));
      local_delta_lng = (360 / n) / 256;
      const nLatNext = Math.PI - (2 * Math.PI * (minY + 1)) / n;
      const nextLat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(nLatNext) - Math.exp(-nLatNext)));
      local_delta_lat = (nextLat - refLat) / 256;
    }

    const getXIdx = (lng) => (lng - refLng) / local_delta_lng;
    const getYIdx = (lat) => (lat - refLat) / local_delta_lat;
    const startX = Math.floor(Math.max(0, getXIdx(minLng) - (isOT ? 10 : 40)));
    const endX = Math.ceil(Math.min(rawMatrix[0].length - 1, getXIdx(maxLng) + (isOT ? 10 : 40)));
    const startY = Math.floor(Math.max(0, getYIdx(maxLat) - (isOT ? 10 : 40)));
    const endY = Math.ceil(Math.min(rawMatrix.length - 1, getYIdx(minLat) + (isOT ? 10 : 40)));

    const gridWidth = endX - startX + 1, gridHeight = endY - startY + 1;
    const resMeters = isOT ? (cellsize * 111320) : 4.7;
    const worldW = gridWidth * resMeters * WORLD_SCALE;
    const worldH = gridHeight * resMeters * WORLD_SCALE;

    const segmentsX = Math.min(DENSE_RES, gridWidth * 4), segmentsY = Math.min(DENSE_RES, gridHeight * 4);
    const denseMatrix = Array(segmentsY + 1).fill(0).map(() => new Float32Array(segmentsX + 1));
    for (let i = 0; i <= segmentsY; i++) {
      for (let j = 0; j <= segmentsX; j++) {
        const sx = startX + (j / segmentsX) * (gridWidth - 1);
        const sy = startY + (i / segmentsY) * (gridHeight - 1);
        denseMatrix[i][j] = sampleElevation(rawMatrix, sx, sy);
      }
    }

    let finalMatrix = enableSmoothing ? blurMatrix(denseMatrix, blurRadius) : denseMatrix;

    const carveRadius = 2; 
    const carvedMatrix = finalMatrix.map(row => new Float32Array(row));
    const isCarved = Array(segmentsY + 1).fill(0).map(() => new Uint8Array(segmentsX + 1));

    routes.forEach(r => {
      for (let k = 0; k < r.coordinates.length - 1; k++) {
        const [lat1, lng1] = r.coordinates[k];
        const [lat2, lng2] = r.coordinates[k+1];
        
        const u1 = (getXIdx(lng1) - startX) / (gridWidth - 1);
        const v1 = (getYIdx(lat1) - startY) / (gridHeight - 1);
        const u2 = (getXIdx(lng2) - startX) / (gridWidth - 1);
        const v2 = (getYIdx(lat2) - startY) / (gridHeight - 1);
        
        const col1 = u1 * segmentsX, row1 = v1 * segmentsY;
        const col2 = u2 * segmentsX, row2 = v2 * segmentsY;
        
        const dist = Math.max(Math.abs(col2 - col1), Math.abs(row2 - row1));
        const steps = Math.ceil(dist * 2);
        
        for (let s = 0; s <= steps; s++) {
          const t = steps === 0 ? 0 : s / steps;
          const col = Math.round(col1 + (col2 - col1) * t);
          const row = Math.round(row1 + (row2 - row1) * t);
          
          if (row >= 0 && row <= segmentsY && col >= 0 && col <= segmentsX) {
            const centerElev = finalMatrix[row][col];
            for (let dr = -carveRadius; dr <= carveRadius; dr++) {
              for (let dc = -carveRadius; dc <= carveRadius; dc++) {
                const rr = row + dr, cc = col + dc;
                if (rr >= 0 && rr <= segmentsY && cc >= 0 && cc <= segmentsX) {
                  if (dr*dr + dc*dc <= carveRadius*carveRadius) {
                    if (isCarved[rr][cc] === 0) {
                      carvedMatrix[rr][cc] = centerElev;
                      isCarved[rr][cc] = 1;
                    } else {
                      carvedMatrix[rr][cc] = (carvedMatrix[rr][cc] + centerElev) / 2;
                    }
                  }
                }
              }
            }
          }
        }
      }
    });

    finalMatrix = enableSmoothing ? blurMatrix(carvedMatrix, blurRadius) : carvedMatrix;

    if (enableRouteSmooth || enableBoundarySmooth) {
      const FEATHER = 2.0; 

      let routeWP = [];
      if (enableRouteSmooth) {
        routeWP = routes.map(r =>
          r.coordinates.map(([lat, lng]) => {
            const xp = getXIdx(lng), yp = getYIdx(lat);
            return [
              ((xp - startX) / (gridWidth - 1)) * worldW - worldW / 2,
              ((yp - startY) / (gridHeight - 1)) * worldH - worldH / 2,
            ];
          })
        );
      }

      let boundaryWP = [];
      if (enableBoundarySmooth) {
        const closedBound = [...parkBoundary];
        if (closedBound.length > 0) {
          const f = closedBound[0], l = closedBound[closedBound.length - 1];
          if (f[0] !== l[0] || f[1] !== l[1]) closedBound.push(f);
        }
        boundaryWP = closedBound.map(([lat, lng]) => {
          const xp = getXIdx(lng), yp = getYIdx(lat);
          return [
            ((xp - startX) / (gridWidth - 1)) * worldW - worldW / 2,
            ((yp - startY) / (gridHeight - 1)) * worldH - worldH / 2,
          ];
        });
      }

      const roadMaxSq  = enableRouteSmooth    ? (roadHalfWidth    + FEATHER) ** 2 : -1;
      const boundMaxSq = enableBoundarySmooth ? (boundaryHalfWidth + FEATHER) ** 2 : -1;

      const smoothedRef    = blurMatrix(finalMatrix, 2);
      const selectiveMatrix = finalMatrix.map(row => new Float32Array(row));

      for (let i = 0; i <= segmentsY; i++) {
        const wz = (i / segmentsY) * worldH - worldH / 2;
        for (let j = 0; j <= segmentsX; j++) {
          const wx = (j / segmentsX) * worldW - worldW / 2;
          let maxBlend = 0;

          if (enableRouteSmooth) {
            for (const rPts of routeWP) {
              if (rPts.length < 2) continue;
              let minSq = Infinity;
              for (let k = 0; k < rPts.length - 1; k++) {
                const sq = distToSegSq(wx, wz, rPts[k][0], rPts[k][1], rPts[k + 1][0], rPts[k + 1][1]);
                if (sq < minSq) { minSq = sq; if (sq === 0) break; }
              }
              if (minSq < roadMaxSq) {
                const d = Math.sqrt(minSq);
                const b = d < roadHalfWidth ? 1.0 : 1.0 - (d - roadHalfWidth) / FEATHER;
                if (b > maxBlend) maxBlend = b;
              }
            }
          }

          if (enableBoundarySmooth && boundaryWP.length >= 2) {
            let minSq = Infinity;
            for (let k = 0; k < boundaryWP.length - 1; k++) {
              const sq = distToSegSq(wx, wz, boundaryWP[k][0], boundaryWP[k][1], boundaryWP[k + 1][0], boundaryWP[k + 1][1]);
              if (sq < minSq) { minSq = sq; if (sq === 0) break; }
            }
            if (minSq < boundMaxSq) {
              const d = Math.sqrt(minSq);
              const b = d < boundaryHalfWidth ? 1.0 : 1.0 - (d - boundaryHalfWidth) / FEATHER;
              if (b > maxBlend) maxBlend = b;
            }
          }

          if (maxBlend > 0) {
            selectiveMatrix[i][j] = finalMatrix[i][j] * (1 - maxBlend) + smoothedRef[i][j] * maxBlend;
          }
        }
      }
      finalMatrix = selectiveMatrix;
    }

    let minHeight = Infinity, maxHeight = -Infinity;
    for (let i = 0; i <= segmentsY; i++) {
      for (let j = 0; j <= segmentsX; j++) {
        const h = finalMatrix[i][j];
        if (h < minHeight) minHeight = h;
        if (h > maxHeight) maxHeight = h;
      }
    }

    const displacedH = new Float32Array((segmentsY + 1) * (segmentsX + 1));
    let minDisp = Infinity, maxDisp = -Infinity;
    for (let i = 0; i <= segmentsY; i++) {
      for (let j = 0; j <= segmentsX; j++) {
        const base = (finalMatrix[i][j] - minHeight) * exaggeration;
        let h = base;
        if (enableNoise) {
          const nv = (fbm(j * noiseFrequency / segmentsX, i * noiseFrequency / segmentsY) - 0.5) * 2;
          h += nv * noiseAmplitude * exaggeration;
        }
        displacedH[i * (segmentsX + 1) + j] = h;
        if (h < minDisp) minDisp = h;
        if (h > maxDisp) maxDisp = h;
      }
    }
    const dispRange = maxDisp - minDisp;
    const contourSegments = buildContourSegments(displacedH, segmentsX, segmentsY, worldW, worldH, minDisp, maxDisp);

    const geo = new THREE.PlaneGeometry(worldW, worldH, segmentsX, segmentsY);
    geo.rotateX(-Math.PI / 2);
    const vertices = geo.attributes.position.array;
    const uvs = geo.attributes.uv.array;
    
    // Fallback vertex colors if texture fails
    const colors = new Float32Array(vertices.length);
    const color = new THREE.Color();

    for (let i = 0; i <= segmentsY; i++) {
      for (let j = 0; j <= segmentsX; j++) {
        const vIdx = i * (segmentsX + 1) + j;
        const idx = vIdx * 3;
        const h = displacedH[vIdx];
        vertices[idx + 1] = h;

        // Calculate UVs based on textureMeta bounds
        if (textureMeta) {
          // Calculate geographic lng/lat of this vertex
          const x_px = startX + (j / segmentsX) * (gridWidth - 1);
          const y_px = startY + (i / segmentsY) * (gridHeight - 1);
          
          const lng = refLng + x_px * local_delta_lng;
          const lat = refLat + y_px * local_delta_lat;
          
          const tBounds = textureMeta.bounds;
          const u = (lng - tBounds.west) / (tBounds.east - tBounds.west);
          // Three.js loads textures with flipY=true (default): UV v=1 → top of PNG (north edge),
          // v=0 → bottom of PNG (south edge). So north vertex must get v=1.
          const v = (lat - tBounds.south) / (tBounds.north - tBounds.south);
          
          uvs[vIdx * 2] = u;
          uvs[vIdx * 2 + 1] = v;
        } else {
          // Fallback color mapping
          const normalizedH = dispRange > 0 ? (h - minDisp) / dispRange : 0;
          if (normalizedH < 0.25) color.set('#10b981');
          else if (normalizedH < 0.5) color.set('#fbbf24');
          else if (normalizedH < 0.75) color.set('#f97316');
          else color.set('#ef4444');
          colors[idx] = color.r; colors[idx + 1] = color.g; colors[idx + 2] = color.b;
        }
      }
    }
    
    geo.attributes.position.needsUpdate = true;
    if (textureMeta) {
      geo.attributes.uv.needsUpdate = true;
    } else {
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }
    geo.computeVertexNormals();

    const getSmoothElevation = (worldX, worldZ) => {
      const u = (worldX + worldW / 2) / worldW;
      const v = (worldZ + worldH / 2) / worldH;
      const px = u * segmentsX;
      const py = v * segmentsY;
      let h = (sampleElevation(finalMatrix, px, py) - minHeight) * exaggeration;
      if (enableNoise) {
        const nv = (fbm(u * noiseFrequency, v * noiseFrequency) - 0.5) * 2;
        h += nv * noiseAmplitude * exaggeration;
      }
      return h;
    };

    const subdivideLine = (coords, maxPxDist = 0.5) => {
      if (!coords || coords.length < 2) return coords;
      const detailed = [];
      for (let i = 0; i < coords.length - 1; i++) {
        const [lat1, lng1] = coords[i];
        const [lat2, lng2] = coords[i+1];
        const x1 = getXIdx(lng1), y1 = getYIdx(lat1);
        const x2 = getXIdx(lng2), y2 = getYIdx(lat2);
        
        const dist = Math.sqrt((x2-x1)**2 + (y2-y1)**2);
        const steps = Math.ceil(dist / maxPxDist);
        
        for (let s = 0; s < steps; s++) {
          const t = s / steps;
          detailed.push([lat1 + (lat2 - lat1) * t, lng1 + (lng2 - lng1) * t]);
        }
      }
      detailed.push(coords[coords.length - 1]);
      return detailed;
    };

    const closedBoundary = [...parkBoundary];
    if (closedBoundary.length > 0) {
      const first = closedBoundary[0];
      const last = closedBoundary[closedBoundary.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        closedBoundary.push(first);
      }
    }

    const projectedBoundary = subdivideLine(closedBoundary, 0.1).map(([lat, lng]) => {
      const x_px = getXIdx(lng), y_px = getYIdx(lat);
      const worldX = ((x_px - startX) / (gridWidth - 1)) * worldW - (worldW / 2);
      const worldZ = ((y_px - startY) / (gridHeight - 1)) * worldH - (worldH / 2);
      const yOffset = 0.5 + (0.8 * exaggeration);
      return new THREE.Vector3(worldX, getSmoothElevation(worldX, worldZ) + yOffset, worldZ);
    });

    const roadPaths = routes.map(r => {
      const detailedCoords = subdivideLine(r.coordinates, 0.1); 
      return detailedCoords.map(([lat, lng]) => {
        const x_px = getXIdx(lng), y_px = getYIdx(lat);
        const worldX = ((x_px - startX) / (gridWidth - 1)) * worldW - (worldW / 2);
        const worldZ = ((y_px - startY) / (gridHeight - 1)) * worldH - (worldH / 2);
        const yOffset = 0.5 + (0.5 * exaggeration);
        return new THREE.Vector3(worldX, getSmoothElevation(worldX, worldZ) + yOffset, worldZ);
      });
    });

    // Expose project(lat,lng) → {wx, wy, wz} for placing markers
    const project = (lat, lng) => {
      const x_px = getXIdx(lng), y_px = getYIdx(lat);
      const wx = ((x_px - startX) / (gridWidth - 1)) * worldW - worldW / 2;
      const wz = ((y_px - startY) / (gridHeight - 1)) * worldH - worldH / 2;
      const wy = getSmoothElevation(wx, wz);
      return { wx, wy, wz };
    };

    // Expose unproject(wx, wz) → {lat, lng}
    const unproject = (wx, wz) => {
      const u = (wx + worldW / 2) / worldW;
      const v = (wz + worldH / 2) / worldH;
      const x_px = startX + u * (gridWidth - 1);
      const y_px = startY + v * (gridHeight - 1);
      const lng = refLng + x_px * local_delta_lng;
      const lat = refLat + y_px * local_delta_lat;
      return { lat, lng };
    };

    return { geometry: geo, contourSegments, projectedBoundary, roadPaths, getElevationAt: getSmoothElevation, project, unproject, worldW, worldH };
  }, [tiles, textureMeta, parkBoundary, exaggeration, enableNoise, noiseAmplitude, noiseFrequency, enableSmoothing, blurRadius, enableRouteSmooth, roadHalfWidth, enableBoundarySmooth, boundaryHalfWidth]);

  const targetVector = useMemo(() => new THREE.Vector3(...cameraTarget), [cameraTarget[0], cameraTarget[1], cameraTarget[2]]);

  // Convert focusLatLng → [wx, wy, wz] for the CameraFocuser
  const focus3D = useMemo(() => {
    if (!focusLatLng || !data) return null;
    const { wx, wy, wz } = data.project(focusLatLng[0], focusLatLng[1]);
    return [wx, wy, wz];
  }, [focusLatLng, data]);

  const projectedRawMarkers = useMemo(() => {
    if (!rawMarkers?.length || !data) return [];
    return rawMarkers.map((marker) => {
      const { wx, wy, wz } = data.project(marker.lat, marker.lng);
      return { ...marker, wx, wy, wz };
    });
  }, [data, rawMarkers]);

  // Merge explicit markers prop + projected raw markers from studio
  const allMarkers = useMemo(() => [
    ...(markers || []),
    ...projectedRawMarkers,
  ], [markers, projectedRawMarkers]);

  const influenceSphere = useMemo(() => {
    if (!influenceLatLng || !data) return null;

    const [lat, lng] = influenceLatLng;
    const center = data.project(lat, lng);
    const latOffset = influenceRadiusMeters / METERS_PER_DEGREE_LAT;
    const lngOffset = influenceRadiusMeters / (METERS_PER_DEGREE_LAT * Math.max(0.0001, Math.cos(lat * Math.PI / 180)));
    const north = data.project(lat + latOffset, lng);
    const east = data.project(lat, lng + lngOffset);
    const northDistance = Math.hypot(north.wx - center.wx, north.wz - center.wz);
    const eastDistance = Math.hypot(east.wx - center.wx, east.wz - center.wz);
    const radius = Math.max(northDistance, eastDistance);

    return { x: center.wx, y: center.wy, z: center.wz, radius };
  }, [data, influenceLatLng, influenceRadiusMeters]);

  return (
    <div className="h-full w-full bg-black">
      <Canvas
        shadows={{ type: THREE.PCFShadowMap }}
        onCreated={({ gl }) => {
          gl.setClearColor('#000000', 1);
        }}
      >
        <PerspectiveCamera makeDefault position={cameraPosition} fov={35} />
        <OrbitControls 
          ref={controlsRef} 
          makeDefault 
          minDistance={10} 
          maxDistance={3000} 
          target={targetVector}
          onChange={() => {
            if (controlsRef.current && onCameraChange) {
              const pos = controlsRef.current.object.position.toArray();
              const target = controlsRef.current.target.toArray();
              onCameraChange(pos, target);
            }
          }}
        />
        
        <ambientLight intensity={isCinematic ? 0.52 : displayMode === 'satellite' ? 2.5 : 0.3} />
        <spotLight position={[500, 1000, 500]} angle={0.15} penumbra={1} intensity={isCinematic ? 1.4 : displayMode === 'satellite' ? 0.8 : 4} castShadow />
        <directionalLight position={[-500, 500, 0]} intensity={isCinematic ? 0.75 : displayMode === 'satellite' ? 0.6 : 1.5} />
        
        {!isCinematic && <Sky sunPosition={[100, 10, 100]} turbidity={0.1} rayleigh={0.5} />}
        {!isCinematic && <Stars radius={500} depth={50} count={3000} factor={4} saturation={0} fade speed={1} />}
        
        <CameraFocuser focusTarget={cameraMode === 'free' ? focus3D : null} controlsRef={controlsRef} />
        <React.Suspense fallback={null}>
          {data && (
            <>
              <CameraDirector mode={cameraMode} data={data} controlsRef={controlsRef} />
              <CameraFlyToMarker
                flyTo={flyToMarker}
                data={data}
                controlsRef={controlsRef}
                onComplete={onFlyToMarkerComplete}
              />
              <TerrainTextureMesh
                geometry={data.geometry}
                textureMeta={textureMeta}
                textureOpacity={textureOpacity}
                textureType={textureType}
                displayMode={displayMode ?? (textureMeta ? 'satellite' : 'gradient')}
                terrainTheme={terrainTheme}
                showContours={showContours}
                contourSegments={data.contourSegments}
                projectedBoundary={data.projectedBoundary}
                roadPaths={data.roadPaths}
                markers={allMarkers}
                onMeshClick={onMeshClick ? (point) => {
                  const { lat, lng } = data.unproject(point.x, point.z);
                  onMeshClick(lat, lng);
                } : null}
                onMeshPointerMove={onMeshPointerMove ? (point) => {
                  const { lat, lng } = data.unproject(point.x, point.z);
                  onMeshPointerMove(lat, lng);
                } : null}
                onMeshPointerLeave={onMeshPointerLeave}
                onMeshPointerDown={onMeshPointerDown}
              />
              <InfluenceSphere sphere={influenceSphere} />
              {playMode && <Player getElevationAt={data.getElevationAt} controlsRef={controlsRef} />}
            </>
          )}
        </React.Suspense>
      </Canvas>
    </div>
  );
}
