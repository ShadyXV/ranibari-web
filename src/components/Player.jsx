import React, { useMemo, useRef, useState, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

export function Player({ getElevationAt, controlsRef }) {
  const { camera } = useThree();
  const [position] = useState(() => new THREE.Vector3(0, 0, 0));
  
  // Movement settings
  const SPEED = 80.0; // Meters per second

  // Keyboard state
  const [keys, setKeys] = useState({});
  useEffect(() => {
    const down = (e) => setKeys((k) => ({ ...k, [e.code]: true }));
    const up = (e) => setKeys((k) => ({ ...k, [e.code]: false }));
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  useFrame((state, delta) => {
    // 1. Calculate direction based on camera orientation
    const direction = new THREE.Vector3();
    const frontVector = new THREE.Vector3(0, 0, (keys['KeyS'] ? 1 : 0) - (keys['KeyW'] ? 1 : 0));
    const sideVector = new THREE.Vector3((keys['KeyA'] ? 1 : 0) - (keys['KeyD'] ? 1 : 0), 0, 0);

    const cameraQuat = new THREE.Quaternion();
    const cameraEuler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
    cameraEuler.x = 0; // Ignore vertical pitch for horizontal movement
    cameraEuler.z = 0;
    cameraQuat.setFromEuler(cameraEuler);

    direction
      .subVectors(frontVector, sideVector)
      .normalize()
      .multiplyScalar(SPEED * delta)
      .applyQuaternion(cameraQuat);

    // 2. Update horizontal position
    position.x += direction.x;
    position.z += direction.z;

    // 3. Snap to terrain height (Simple "no-physics" ground hugging)
    const groundHeight = getElevationAt(position.x, position.z);
    position.y = groundHeight + 1.0; // Offset ball slightly above ground

    // 4. Update OrbitControls target so camera follows
    if (controlsRef?.current) {
      // Smoothly interpolate camera focus point
      controlsRef.current.target.lerp(position, 0.1);
    }
  });

  return (
    <mesh position={position} castShadow>
      <sphereGeometry args={[1.5, 16, 16]} />
      <meshStandardMaterial color="#3b82f6" emissive="#3b82f6" emissiveIntensity={2} />
      <pointLight intensity={10} color="#3b82f6" distance={10} />
    </mesh>
  );
}
