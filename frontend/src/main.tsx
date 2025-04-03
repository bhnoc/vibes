import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import './index.css'

// Create root outside of strict mode to avoid double renders 
// that can affect lazy loading and React.memo optimization
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <App />
) 