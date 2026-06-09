import ArchivePage from './features/archive/ArchivePage.jsx'
import { MapDataProvider } from './contexts/MapDataContext.jsx'

export default function App() {
  return (
    <MapDataProvider>
      <ArchivePage />
    </MapDataProvider>
  )
}
