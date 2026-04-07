import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import CallAnalytics from './CallAnalytics.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <CallAnalytics />
  </StrictMode>,
)
