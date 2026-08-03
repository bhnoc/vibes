import { useEffect, useState, memo, Suspense, lazy, useMemo, useRef, useCallback } from 'react'
import { useWebSocket } from './hooks/useWebSocket'
import { usePacketProcessor } from './hooks/usePacketProcessor'
import { usePacketStore } from './stores/packetStore'
import { useNetworkStore } from './stores/networkStore'
import { getApiBaseUrl } from './utils/websocketUtils'
import './index.css'
import { logger } from './utils/logger'
import { useWebSocketPinning } from './hooks/useWebSocketPinning'
import { useThemeStore } from './stores/themeStore'
import { startTelemetry, useTelemetryStore } from './telemetry/nocTelemetry'

import { RendererSelector } from './components/RendererSelector'
import { CaptureContext } from './components/MinimalGraph'
import { SettingsPanel } from './components/SettingsPanel'
import { UnifiedDebugPanel } from './components/UnifiedDebugPanel'
import { PerformanceTestData } from './components/PerformanceTestData'
import { ThemeLegend } from './components/ThemeLegend'

import {
  NocTopBar,
  NocRail,
  NocSidebar,
  NocStatusBar,
  TelemetryDock,
  CanvasStage,
  FlowsView,
  HostsView,
  AlertsView,
  CommandPalette,
  PerformanceTestWindow,
  ConsoleView,
  Command,
  CaptureMode,
} from './components/noc'

const IPDebugPage = lazy(() => import('./components/IPDebugPage').then((m) => ({ default: m.IPDebugPage })))

/**
 * The VIBES console shell.
 *
 * Layout is the Black Hat NOC console shell — 56px icon rail, 240px sidebar,
 * 56px top bar, 28px status bar — with one addition the design system never had
 * to describe: a full-bleed capture map as the content column, and a telemetry
 * dock on the right that reads the same stream as numbers.
 *
 * The shell is a grid rather than a stack of fixed-position panels. That matters
 * for the map: it needs to know its own size to draw at the right scale, and a
 * grid cell can tell it, where a viewport-sized absolute layer cannot.
 */

const CAPTURE_LABELS: Record<CaptureMode, string> = {
  real: 'Live interface',
  simulated: 'Simulation generator',
  zeek: 'Zeek sensor stream',
  waiting: 'No source selected',
}

const LoadingFallback = () => (
  <div style={{ display: 'grid', placeItems: 'center', height: '100%', font: 'var(--type-body)', color: 'var(--muted-foreground)' }}>
    Loading inspector.
  </div>
)

export const App = memo(() => {
  // --- Capture state ---
  const [captureMode, setCaptureMode] = useState<CaptureMode>('simulated')
  const [zeekTcpAddr, setZeekTcpAddr] = useState<string>(':4777')
  const [interfaces, setInterfaces] = useState<{ name: string; description: string }[]>([])
  const [selectedInterface, setSelectedInterface] = useState<string>('')
  const [currentRenderer, setCurrentRenderer] = useState('canvas')
  const [initialLoad, setInitialLoad] = useState(true)
  // `fallback` records that the console started the generator itself because no
  // sensor answered, which is a different claim from an operator running a load
  // test and is surfaced as such.
  const [generator, setGenerator] = useState({ enabled: false, nodeCount: 0, connectionCount: 0, fallback: false })
  /** Set once the operator touches the generator, so the fallback stops overriding them. */
  const generatorOverride = useRef(false)

  // --- Console state ---
  const [view, setView] = useState<ConsoleView>(() => (window.location.hash.slice(1) as ConsoleView) || 'map')
  const [query, setQuery] = useState('')
  const [selectedHost, setSelectedHost] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [dockOpen, setDockOpen] = useState(true)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showDebug, setShowDebug] = useState(false)
  const [showLegend, setShowLegend] = useState(false)
  const [showPerfTest, setShowPerfTest] = useState(false)

  const { clearPackets } = usePacketStore()
  const { clearNetwork } = useNetworkStore()
  const { themeKey } = useThemeStore()

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', themeKey)
  }, [themeKey])

  // The telemetry engine folds the packet stream into a 1 Hz snapshot outside
  // React, so the dock's repaint rate is independent of the capture rate.
  useEffect(() => startTelemetry(), [])

  // --- WebSocket ---
  const wsUrl = useMemo(() => {
    if (captureMode === 'waiting') {
      logger.log('In waiting mode, not connecting to any WebSocket')
      return null
    }

    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    // Always connect back to whichever host:port served this page. Correct behind
    // the Vite dev proxy and when the Go backend serves the built app to a remote
    // client. Deliberately not VITE_BACKEND_HOST: that pins to localhost, which
    // would send every remote viewer to their own machine.
    const wsBase = `${proto}://${window.location.host}`

    if (captureMode === 'real') {
      return selectedInterface ? `${wsBase}/ws?interface=${selectedInterface}` : `${wsBase}/ws`
    }
    if (captureMode === 'zeek') {
      return `${wsBase}/ws?zeek_tcp=${encodeURIComponent(zeekTcpAddr.trim() || ':4777')}`
    }
    return `${wsBase}/ws`
  }, [captureMode, selectedInterface, zeekTcpAddr])

  // --- Hash routing ---
  useEffect(() => {
    const onHashChange = () => setView(((window.location.hash.slice(1) as ConsoleView) || 'map'))
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const goto = useCallback((next: ConsoleView) => {
    setView(next)
    window.location.hash = next
  }, [])

  usePacketProcessor()

  useEffect(() => {
    const { removeInactiveElements } = useNetworkStore.getState()
    const id = setInterval(removeInactiveElements, 5000)
    return () => clearInterval(id)
  }, [])

  // Honour an interface requested in the URL on first load.
  useEffect(() => {
    if (!initialLoad) return
    const wsParam = new URL(window.location.href).searchParams.get('ws')
    if (wsParam && wsParam.includes('interface=')) {
      const interfaceName = wsParam.split('interface=')[1].split('&')[0]
      logger.log(`Initial load detected interface request: ${interfaceName}`)
      setCaptureMode('real')
      setSelectedInterface(interfaceName)
    }
    setInitialLoad(false)
  }, [initialLoad])

  // --- Interface discovery ---
  useEffect(() => {
    if (captureMode !== 'real') return

    const setFallbackInterfaces = () => {
      setInterfaces([
        { name: 'any', description: 'All interfaces (recommended)' },
        { name: 'eth0', description: 'Ethernet adapter (fallback)' },
        { name: 'wlan0', description: 'Wireless adapter (fallback)' },
        { name: 'lo', description: 'Loopback interface (fallback)' },
      ])
    }

    const fetchInterfaces = async () => {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)
      try {
        const response = await fetch(`${getApiBaseUrl()}/api/interfaces`, {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        })
        clearTimeout(timeoutId)
        if (!response.ok) throw new Error(`API returned status ${response.status}`)

        const rawData = await response.json()
        if (!Array.isArray(rawData) || rawData.length === 0) {
          logger.warn('API returned an empty interface list, using fallbacks')
          setFallbackInterfaces()
          return
        }

        const formatted = rawData.map((iface: any) => ({
          name: iface.Name,
          description: iface.Description || iface.Name,
        }))
        if (!formatted.some((i) => i.name === 'any')) {
          formatted.unshift({ name: 'any', description: 'All interfaces (recommended)' })
        }
        setInterfaces(formatted)
      } catch (error) {
        clearTimeout(timeoutId)
        logger.error('Failed to fetch interfaces:', error)
        setFallbackInterfaces()
      }
    }

    fetchInterfaces()
  }, [captureMode])

  const { status, error, captureMode: actualCaptureMode, sendMessage } = useWebSocket(wsUrl)
  useWebSocketPinning(sendMessage)

  // Fall back to a browser-side generator when the socket is unavailable, so the
  // console is demonstrable on a laptop with no backend running. It yields to the
  // operator in both directions: it will not restart a generator they switched
  // off, and a connecting sensor will not stop a load test they started.
  useEffect(() => {
    const socketDown = status === 'error' || status === 'disconnected' || status === 'waiting'

    if (captureMode === 'simulated' && socketDown && !generator.enabled && !generatorOverride.current) {
      logger.log('No capture backend answered; starting the browser simulation fallback')
      setGenerator({ enabled: true, nodeCount: 150, connectionCount: 250, fallback: true })
    } else if (status === 'connected' && generator.enabled && generator.fallback) {
      logger.log('Capture backend connected; stopping the simulation fallback')
      setGenerator({ enabled: false, nodeCount: 0, connectionCount: 0, fallback: false })
    }
  }, [captureMode, status, generator.enabled, generator.fallback])

  const handleGeneratorChange = useCallback((enabled: boolean, nodeCount: number, connectionCount: number) => {
    generatorOverride.current = true
    setGenerator({ enabled, nodeCount, connectionCount, fallback: false })
  }, [])

  const userInitiatedChangeRef = useRef(false)

  useEffect(() => {
    const serverUiMode =
      actualCaptureMode === 'zeek_conn'
        ? 'zeek'
        : actualCaptureMode === 'unknown' || actualCaptureMode === 'waiting'
          ? null
          : (actualCaptureMode as 'simulated' | 'real')

    if (serverUiMode === null || serverUiMode === captureMode || userInitiatedChangeRef.current) return
    // Don't let a reconnect's "simulated" stomp an explicit Zeek selection.
    if (captureMode === 'zeek' && serverUiMode === 'simulated') return

    logger.log(`Server reported capture mode: ${actualCaptureMode}`)
    setCaptureMode(serverUiMode)
  }, [actualCaptureMode, captureMode])

  useEffect(() => {
    const title =
      actualCaptureMode === 'real'
        ? 'VIBES NOC — live capture'
        : actualCaptureMode === 'simulated'
          ? 'VIBES NOC — simulation'
          : actualCaptureMode === 'zeek_conn'
            ? 'VIBES NOC — Zeek conn'
            : 'VIBES NOC'
    document.title = title
  }, [actualCaptureMode])

  const resetStream = useCallback(() => {
    clearPackets()
    clearNetwork()
    useTelemetryStore.getState().reset()
  }, [clearPackets, clearNetwork])

  const handleCaptureModeChange = useCallback(
    (mode: 'simulated' | 'real' | 'zeek') => {
      if (userInitiatedChangeRef.current) return
      userInitiatedChangeRef.current = true
      setCaptureMode(mode)
      resetStream()
      setTimeout(() => {
        userInitiatedChangeRef.current = false
      }, 2000)
    },
    [resetStream],
  )

  const handleInterfaceSelect = useCallback(
    (iface: string) => {
      if (userInitiatedChangeRef.current) return
      userInitiatedChangeRef.current = true
      setSelectedInterface(iface)
      if (iface && captureMode !== 'real') setCaptureMode('real')
      resetStream()
      setTimeout(() => {
        userInitiatedChangeRef.current = false
      }, 2000)
    },
    [captureMode, resetStream],
  )

  useEffect(() => {
    if (status === 'error' && (captureMode === 'real' || captureMode === 'zeek') && !userInitiatedChangeRef.current) {
      logger.log('Capture failed, falling back to simulation')
      setCaptureMode('simulated')
      resetStream()
    }
  }, [status, captureMode, resetStream])

  // --- Keyboard ---
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const typing = !!target?.closest('input, textarea, [contenteditable="true"]')

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
        return
      }
      if (typing) return
      // Acknowledge is advertised in the status bar only while Alerts is active,
      // so it only fires there.
      if (view === 'alerts' && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        useTelemetryStore.getState().acknowledgeAll()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [view])

  const memoizedRenderer = useMemo(
    () => <RendererSelector defaultRenderer={currentRenderer as 'canvas' | 'minimal'} onChange={setCurrentRenderer} hideUI />,
    [currentRenderer],
  )

  const captureLabel = CAPTURE_LABELS[captureMode]
  const captureStatus: 'ok' | 'warning' | 'critical' = error ? 'critical' : status === 'connected' ? 'ok' : 'warning'

  const commands = useMemo<Command[]>(
    () => [
      ...([
        ['map', 'Go to live map', 'Radar'],
        ['flows', 'Go to flows', 'Waypoints'],
        ['hosts', 'Go to hosts', 'Server'],
        ['alerts', 'Go to detections', 'Siren'],
        ['inspector', 'Go to inspector', 'Bug'],
      ] as const).map(([key, label, icon]) => ({
        id: `nav:${key}`,
        label,
        icon,
        group: 'Navigate',
        run: () => goto(key as ConsoleView),
      })),
      { id: 'cap:real', label: 'Switch to live capture', icon: 'Radio', group: 'Capture', run: () => handleCaptureModeChange('real') },
      { id: 'cap:sim', label: 'Switch to simulated traffic', icon: 'FlaskConical', group: 'Capture', run: () => handleCaptureModeChange('simulated') },
      { id: 'cap:zeek', label: 'Switch to Zeek sensor', icon: 'Network', group: 'Capture', run: () => handleCaptureModeChange('zeek') },
      { id: 'cap:clear', label: 'Clear the current stream', hint: 'drops hosts, flows and detections', icon: 'Eraser', group: 'Capture', run: resetStream },
      { id: 'act:ack', label: 'Acknowledge all detections', icon: 'Check', group: 'Actions', run: () => useTelemetryStore.getState().acknowledgeAll() },
      { id: 'act:dock', label: dockOpen ? 'Hide telemetry dock' : 'Show telemetry dock', icon: 'PanelRight', group: 'Layout', run: () => setDockOpen((v) => !v) },
      { id: 'act:sidebar', label: sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar', icon: 'PanelLeft', group: 'Layout', run: () => setSidebarOpen((v) => !v) },
      { id: 'act:settings', label: 'Open capture settings', icon: 'Settings', group: 'Layout', run: () => setShowSettings(true) },
      { id: 'act:legend', label: 'Open theme legend', icon: 'Palette', group: 'Layout', run: () => setShowLegend(true) },
      { id: 'act:debug', label: 'Open diagnostics', icon: 'Terminal', group: 'Layout', run: () => setShowDebug(true) },
      { id: 'act:perf', label: 'Open performance test', icon: 'Activity', group: 'Layout', run: () => setShowPerfTest(true) },
    ],
    [goto, handleCaptureModeChange, resetStream, dockOpen, sidebarOpen],
  )

  const content = () => {
    switch (view) {
      case 'flows':
        return <FlowsView query={query} selectedHost={selectedHost} onSelectHost={(h) => setSelectedHost(h || null)} />
      case 'hosts':
        return <HostsView query={query} selectedHost={selectedHost} onSelectHost={(h) => setSelectedHost(h || null)} />
      case 'alerts':
        return <AlertsView query={query} selectedHost={selectedHost} onSelectHost={(h) => setSelectedHost(h || null)} />
      case 'inspector':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <div style={{ height: '100%', overflowY: 'auto' }}>
              <IPDebugPage />
            </div>
          </Suspense>
        )
      default:
        return (
          <CanvasStage captureLabel={captureLabel} paused={status !== 'connected' && !generator.enabled}>
            {memoizedRenderer}
          </CanvasStage>
        )
    }
  }

  return (
    <div
      className="app"
      style={{
        display: 'grid',
        gridTemplateColumns: `var(--vibes-rail-w) ${sidebarOpen ? 'var(--vibes-sidebar-w)' : '0px'} minmax(0,1fr) ${dockOpen ? 'var(--vibes-dock-w)' : '0px'}`,
        gridTemplateRows: 'var(--vibes-topbar-h) minmax(0,1fr) var(--vibes-statusbar-h)',
        gridTemplateAreas: `
          "topbar topbar topbar topbar"
          "rail sidebar content dock"
          "statusbar statusbar statusbar statusbar"
        `,
      }}
    >
      <CaptureContext.Provider
        value={{
          captureMode:
            actualCaptureMode === 'zeek_conn'
              ? 'zeek'
              : actualCaptureMode === 'real' || actualCaptureMode === 'simulated'
                ? actualCaptureMode
                : captureMode,
          captureInterface: selectedInterface,
        }}
      >
        <NocTopBar
          captureMode={captureMode}
          captureInterface={selectedInterface}
          status={status}
          error={error}
          onOpenPalette={() => setPaletteOpen(true)}
          onToggleSettings={() => setShowSettings((v) => !v)}
          settingsOpen={showSettings}
          onToggleDock={() => setDockOpen((v) => !v)}
          dockOpen={dockOpen}
        />

        <NocRail
          view={view}
          onView={goto}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
          onUtility={(k) => {
            if (k === 'legend') setShowLegend((v) => !v)
            if (k === 'debug') setShowDebug((v) => !v)
            if (k === 'perf') setShowPerfTest((v) => !v)
          }}
          legendOpen={showLegend}
          debugOpen={showDebug}
          perfOpen={showPerfTest}
        />

        {sidebarOpen ? (
          <NocSidebar view={view} onView={goto} query={query} onQuery={setQuery} captureLabel={captureLabel} captureStatus={captureStatus} />
        ) : null}

        <main style={{ gridArea: 'content', position: 'relative', minWidth: 0, minHeight: 0, overflow: 'hidden' }}>{content()}</main>

        {dockOpen ? <TelemetryDock onSelectHost={(h) => setSelectedHost(h || null)} selectedHost={selectedHost} /> : null}

        <NocStatusBar error={error} sourceLabel={captureLabel} view={view} />

        {/* Floating operator layers */}
        <SettingsPanel
          open={showSettings}
          captureMode={captureMode}
          onCaptureModeChange={handleCaptureModeChange}
          interfaces={interfaces}
          selectedInterface={selectedInterface}
          onInterfaceSelect={handleInterfaceSelect}
          zeekTcpAddr={zeekTcpAddr}
          onZeekTcpAddrChange={setZeekTcpAddr}
          wsPreviewUrl={wsUrl}
          onMinimize={() => setShowSettings(false)}
        />

        <PerformanceTestData enabled={generator.enabled} nodeCount={generator.nodeCount} connectionCount={generator.connectionCount} />

        <PerformanceTestWindow
          isOpen={showPerfTest}
          onMinimize={() => setShowPerfTest(false)}
          enabled={generator.enabled}
          nodeCount={generator.nodeCount}
          connectionCount={generator.connectionCount}
          fallback={generator.fallback}
          onTestModeChange={handleGeneratorChange}
        />

        {/* Load generation lives in the load generator panel only, so there is one
            switch that can put fabricated traffic on the map. */}
        <UnifiedDebugPanel
          isOpen={showDebug}
          onMinimize={() => setShowDebug(false)}
          onRendererChange={setCurrentRenderer}
          currentRenderer={currentRenderer}
        />

        <ThemeLegend isOpen={showLegend} onMinimize={() => setShowLegend(false)} />

        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />
      </CaptureContext.Provider>
    </div>
  )
})
