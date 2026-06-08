import ArchivePage from './features/archive/ArchivePage.jsx'
import { MapDataProvider } from './contexts/MapDataContext.jsx'
import { TimeProvider } from './contexts/TimeContext.jsx'

export default function App() {
  return (
    <MapDataProvider>
      <TimeProvider>
        <ArchivePage />
      </TimeProvider>
    </MapDataProvider>
  )
}
