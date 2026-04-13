import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import CallAnalytics from './CallAnalytics.jsx'
import PerformanceReport from './PerformanceReport.jsx'
import AnalyticsCharts from './AnalyticsCharts.jsx'

function App() {
  const [tab, setTab] = useState('calls');
  const [hsToken, setHsToken] = useState(() => localStorage.getItem('hs_token') || '');

  return (
    <div style={{ fontFamily: "'Inter', -apple-system, sans-serif", height: '100vh', display: 'flex', flexDirection: 'column', background: '#f8fafc' }}>
      {/* Tab bar */}
      <div style={{ display: 'flex', background: '#1f2937', flexShrink: 0 }}>
        {[['calls', 'Call Database'], ['report', 'Performance Report'], ['analytics', 'Analytics']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            padding: '10px 24px', fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none',
            background: tab === key ? '#4f46e5' : 'transparent',
            color: tab === key ? 'white' : '#9ca3af',
            borderBottom: tab === key ? '2px solid #818cf8' : '2px solid transparent',
          }}>{label}</button>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px' }}>
          <input
            type="password"
            placeholder="HubSpot token (pat-...)"
            value={hsToken}
            onChange={e => { setHsToken(e.target.value); localStorage.setItem('hs_token', e.target.value); }}
            style={{ border: '1px solid #374151', background: '#111827', color: '#d1d5db', borderRadius: 6, padding: '5px 10px', fontSize: 12, width: 180 }}
          />
          <span style={{ fontSize: 11, color: hsToken ? '#4ade80' : '#6b7280' }}>{hsToken ? '●' : '○'}</span>
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {tab === 'calls' && <CallAnalytics />}
        {tab === 'report' && <PerformanceReport />}
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
