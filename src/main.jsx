import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import CallAnalytics from './CallAnalytics.jsx'
import AnalyticsCharts from './AnalyticsCharts.jsx'

function App() {
  const [tab, setTab] = useState('calls');

  return (
    <div style={{ fontFamily: "'Inter', -apple-system, sans-serif", height: '100vh', display: 'flex', flexDirection: 'column', background: '#f8fafc' }}>
      {/* Tab bar */}
      <div style={{ display: 'flex', background: '#1f2937', flexShrink: 0 }}>
        {[['calls', 'Call Database'], ['analytics', 'Analytics']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            padding: '10px 24px', fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none',
            background: tab === key ? '#4f46e5' : 'transparent',
            color: tab === key ? 'white' : '#9ca3af',
            borderBottom: tab === key ? '2px solid #818cf8' : '2px solid transparent',
          }}>{label}</button>
        ))}
        <div style={{ flex: 1 }} />
      </div>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {tab === 'calls' && <CallAnalytics />}
        {tab === 'analytics' && <AnalyticsCharts />}
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
