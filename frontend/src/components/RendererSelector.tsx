import React, { useState } from 'react'
import { CanvasNetworkRenderer } from './CanvasNetworkRenderer'
import { MinimalGraph } from './MinimalGraph'

type RendererType = 'canvas' | 'minimal'

interface RendererSelectorProps {
  defaultRenderer?: RendererType
  onChange?: (renderer: RendererType) => void
  hideUI?: boolean
}

export const RendererSelector: React.FC<RendererSelectorProps> = ({ 
  defaultRenderer = 'canvas',
  onChange,
  hideUI = false
}) => {
  const [activeRenderer, setActiveRenderer] = useState<RendererType>(defaultRenderer)
  
  // Update activeRenderer when defaultRenderer changes
  React.useEffect(() => {
    if (defaultRenderer !== activeRenderer) {
      setActiveRenderer(defaultRenderer)
    }
  }, [defaultRenderer, activeRenderer])
  
  const handleRendererChange = (renderer: RendererType) => {
    setActiveRenderer(renderer)
    onChange?.(renderer)
  }

  const renderers = {
    canvas: {
      name: '🎨 Canvas (High Performance)',
      description: 'New Canvas-based renderer - handles 1000s of objects at 60fps',
      component: <CanvasNetworkRenderer />,
      performance: '⭐⭐⭐⭐⭐',
      status: '✅ Recommended'
    },
    minimal: {
      name: '⚡ Minimal DOM',
      description: 'Lightweight DOM renderer - good for < 100 objects', 
      component: <MinimalGraph />,
      performance: '⭐⭐⭐',
      status: '⚠️ Limited scale'
    }
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Renderer Selection UI */}
      {!hideUI && (
        <div style={{
          position: 'fixed',
          top: '10px',
          left: '220px',
          zIndex: 1001,
          background: 'rgba(0, 0, 0, 0.9)',
          border: '1px solid #00ff00',
          borderRadius: '4px',
          padding: '10px',
          fontFamily: 'monospace',
          fontSize: '12px',
          color: '#00ff00',
          maxWidth: '300px'
        }}>
          <div style={{ marginBottom: '8px', fontWeight: 'bold' }}>
            🖥️ Rendering Engine
          </div>
          
          {Object.entries(renderers).map(([key, renderer]) => (
            <div key={key} style={{ marginBottom: '4px' }}>
              <label style={{ 
                display: 'flex', 
                alignItems: 'center', 
                cursor: 'pointer',
                padding: '2px',
                backgroundColor: activeRenderer === key ? 'rgba(0, 255, 0, 0.2)' : 'transparent'
              }}>
                <input
                  type="radio"
                  name="renderer"
                  value={key}
                  checked={activeRenderer === key}
                  onChange={(e) => handleRendererChange(e.target.value as RendererType)}
                  style={{ marginRight: '8px' }}
                />
                <div>
                  <div style={{ fontWeight: 'bold' }}>{renderer.name}</div>
                  <div style={{ fontSize: '10px', color: '#aaa' }}>
                    {renderer.performance} | {renderer.status}
                  </div>
                  <div style={{ fontSize: '10px', color: '#888' }}>
                    {renderer.description}
                  </div>
                </div>
              </label>
            </div>
          ))}
          
          <div style={{ 
            marginTop: '8px', 
            padding: '4px', 
            backgroundColor: 'rgba(0, 100, 0, 0.3)',
            fontSize: '10px',
            borderRadius: '2px'
          }}>
            💡 Canvas renderer is optimized for Agar.io-scale performance
          </div>
        </div>
      )}

      {/* Active Renderer */}
      <div style={{ width: '100%', height: '100%' }}>
        {renderers[activeRenderer].component}
      </div>

      {/* Performance indicator */}
      <div style={{
        position: 'fixed',
        bottom: '10px',
        right: '10px',
        zIndex: 1001,
        background: 'rgba(0, 0, 0, 0.8)',
        border: '1px solid #00ff00',
        borderRadius: '4px',
        padding: '5px 10px',
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#00ff00'
      }}>
        Active: {renderers[activeRenderer].name}
      </div>
    </div>
  )
} 