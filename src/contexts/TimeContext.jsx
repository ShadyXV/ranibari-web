import { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { timeStates } from '../data/OverlayData.js';

const TimeContext = createContext();

function getRealTimeState() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 9) return 'dawn';
  if (hour >= 9 && hour < 17) return 'day';
  if (hour >= 17 && hour < 21) return 'dusk';
  return 'night';
}

export function TimeProvider({ children }) {
  const [timeMode, setTimeMode] = useState('realtime');
  const [manualTime, setManualTime] = useState('dusk');
  const [realtimeState, setRealtimeState] = useState(getRealTimeState);

  useEffect(() => {
    const interval = window.setInterval(() => setRealtimeState(getRealTimeState()), 60000);
    return () => window.clearInterval(interval);
  }, []);

  const activeTimeId = timeMode === 'realtime' ? realtimeState : manualTime;
  const activeTime = useMemo(() => timeStates[activeTimeId], [activeTimeId]);

  const value = {
    timeMode,
    setTimeMode,
    manualTime,
    setManualTime,
    realtimeState,
    activeTimeId,
    activeTime,
    timeStates,
  };

  return <TimeContext.Provider value={value}>{children}</TimeContext.Provider>;
}

export function useTime() {
  const context = useContext(TimeContext);
  if (context === undefined) {
    throw new Error('useTime must be used within a TimeProvider');
  }
  return context;
}
