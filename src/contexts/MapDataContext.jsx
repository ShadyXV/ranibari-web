import { createContext, useContext, useState } from 'react';
import * as StaticData from '../data/OverlayData.js';

const MapDataContext = createContext();

/**
 * Simple state holder for map data.
 * Deepens the interface by allowing components to depend on a context
 * rather than hard-coded static file imports.
 */
export function MapDataProvider({ children }) {
  // We keep this in state so that it could theoretically be updated
  // or swapped for an alternative "experiment" data set in this test project.
  const [data] = useState({
    projectLocationCenter: StaticData.projectLocationCenter,
    highDetailOverlay: StaticData.highDetailOverlay,
    mapStyles: StaticData.mapStyles,
    pointsOfInterest: StaticData.pointsOfInterest,
    routes: StaticData.routes,
    sensoryZones: StaticData.sensoryZones,
    parkCropPolygon: StaticData.parkCropPolygon,
  });

  return (
    <MapDataContext.Provider value={data}>
      {children}
    </MapDataContext.Provider>
  );
}

export function useMapData() {
  const context = useContext(MapDataContext);
  if (context === undefined) {
    throw new Error('useMapData must be used within a MapDataProvider');
  }
  return context;
}
