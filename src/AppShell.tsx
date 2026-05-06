import { useEffect, useMemo, useState } from 'react'
import useAppStore from './store/appStore'
import type { SubTab } from './types'
import Sidebar from './components/ExplorerSidebar'
import DataGrid from './components/DataGrid'
import QueryEditor from './components/QueryEditor'
import StructureView from './components/StructureView'
import CreateTableView from './components/CreateTableView'
import ServerMonitorView from './components/ServerMonitorView'
import StatusBar from './components/StatusBar'
import ConnectModal from './components/ConnectSheet'
import AuthView from './components/AuthView'

const Ic = ({ d, size = 16, sw = 1.6, children }: { d?: string; size?: number; sw?: number; children?: React.ReactNode }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
    {children || (d ? <path d={d} /> : null)}
  </svg>
)

const IconTable = (p: { size?: number; sw?: number }) => (
  <Ic {...p}><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></Ic>
)
const IconQuery = (p: { size?: number; sw?: number }) => (
  <Ic {...p}><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="m9 14 2 2 4-4"/></Ic>
)
const IconCreateTable = (p: { size?: number; sw?: number }) => (
  <Ic {...p}><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M12 9v12"/><path d="M16 15h4M18 13v4"/></Ic>
)
const IconClose = (p: { size?: number; sw?: number }) => (
  <Ic {...p}><path d="M18 6 6 18M6 6l12 12"/></Ic>
)
const IconPlus = (p: { size?: number; sw?: number }) => (
  <Ic {...p}><path d="M12 5v14M5 12h14"/></Ic>
)
const IconSearch = (p: { size?: number; sw?: number }) => (
  <Ic {...p}><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></Ic>
)
const IconSun = (p: { size?: number; sw?: number }) => (
  <Ic {...p}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></Ic>
)
const IconMoon = (p: { size?: number; sw?: number }) => (
  <Ic {...p}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></Ic>
)
const IconPlay = (p: { size?: number; sw?: number }) => (
  <Ic {...p}><polygon points="6 4 20 12 6 20 6 4" fill="currentColor" /></Ic>
)
const IconLogout = (p: { size?: number; sw?: number }) => (
  <Ic {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></Ic>
)
const IconDB = (p: { size?: number; sw?: number }) => (
  <Ic {...p}><ellipse cx="12" cy="5" rx="8" ry="2.5"/><path d="M4 5v6c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5V5"/><path d="M4 11v6c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5v-6"/></Ic>
)
const IconServer = (p: { size?: number; sw?: number }) => (
  <Ic {...p}><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></Ic>
)

const TAB_ICONS: Record<string, JSX.Element> = {
  table: <IconTable size={12} sw={1.7} />,
  query: <IconQuery size={12} sw={1.7} />,
  'create-table': <IconCreateTable size={12} sw={1.7} />,
  'server-monitor': <IconServer size={12} sw={1.7} />,
}

type Theme = 'light' | 'dark'

function TitleBar() {
  const api = window.electronAPI
  const isMac = api?.platform === 'darwin'
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    if (!api?.windowIsMaximized) return
    void api.windowIsMaximized().then(setMaximized)
    const off = api.onWindowMaximizeChange?.(setMaximized)
    return () => { off?.() }
  }, [api])

  const btnStyle: React.CSSProperties = {
    width: 46,
    height: '100%',
    border: 0,
    background: 'transparent',
    color: 'var(--side-tx-2)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'background 0.12s ease, color 0.12s ease',
    // @ts-expect-error -- electron drag region
    WebkitAppRegion: 'no-drag',
  }

  return (
    <div
      style={{
        height: 36,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        background: 'var(--side-bg)',
        borderBottom: '1px solid var(--side-border)',
        color: 'var(--side-tx-1)',
        // @ts-expect-error -- electron drag region
        WebkitAppRegion: 'drag',
        userSelect: 'none',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          padding: isMac ? '0 14px 0 84px' : '0 14px',
          flex: 1,
          minWidth: 0,
        }}
      >
        <div
          style={{
            width: 20,
            height: 20,
            borderRadius: 5,
            background: 'var(--accent)',
            color: '#fff',
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: '-0.04em',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          C
        </div>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--side-tx-1)', letterSpacing: '-0.01em' }}>
          CatDB <span style={{ color: 'var(--side-tx-3)', fontWeight: 500 }}>· Workspace</span>
        </span>
      </div>

      {!isMac && (
        <div style={{ display: 'flex', alignItems: 'stretch', height: '100%' }}>
          <button
            type="button"
            title="Minimize"
            onClick={() => api?.windowMinimize?.()}
            style={btnStyle}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--side-hover)'; e.currentTarget.style.color = 'var(--side-tx-1)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--side-tx-2)' }}
          >
            <svg width="11" height="11" viewBox="0 0 11 11"><path d="M0 5.5h11" stroke="currentColor" strokeWidth="1.1" /></svg>
          </button>
          <button
            type="button"
            title={maximized ? 'Restore' : 'Maximize'}
            onClick={() => api?.windowMaximizeToggle?.().then(setMaximized)}
            style={btnStyle}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--side-hover)'; e.currentTarget.style.color = 'var(--side-tx-1)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--side-tx-2)' }}
          >
            {maximized ? (
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.1">
                <rect x="2.5" y="0.5" width="8" height="8" />
                <rect x="0.5" y="2.5" width="8" height="8" fill="var(--side-bg)" />
              </svg>
            ) : (
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.1">
                <rect x="0.5" y="0.5" width="10" height="10" />
              </svg>
            )}
          </button>
          <button
            type="button"
            title="Close"
            onClick={() => api?.windowClose?.()}
            style={btnStyle}
            onMouseEnter={e => { e.currentTarget.style.background = '#e81123'; e.currentTarget.style.color = '#fff' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--side-tx-2)' }}
          >
            <svg width="11" height="11" viewBox="0 0 11 11"><path d="M0 0l11 11M11 0L0 11" stroke="currentColor" strokeWidth="1.1" /></svg>
          </button>
        </div>
      )}
    </div>
  )
}

function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('catdb-theme') : null
    return (saved === 'light' || saved === 'dark') ? saved : 'light'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('catdb-theme', theme)
  }, [theme])

  const toggle = () => setTheme(t => (t === 'light' ? 'dark' : 'light'))
  return [theme, toggle]
}

function LogoutConfirm({ username, onCancel, onConfirm }: { username: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal fade-in" style={{ minWidth: 400, maxWidth: 460 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <span
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: 'var(--red-soft)',
              color: 'var(--red)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <IconLogout size={18} sw={1.8} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--tx-1)', letterSpacing: '-0.01em' }}>
              ออกจากระบบ?
            </h3>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--tx-2)', lineHeight: 1.55 }}>
              คุณกำลังจะออกจากระบบในชื่อ <span style={{ fontWeight: 600, color: 'var(--tx-1)' }}>{username}</span>
              {' '}และจะต้องเข้าสู่ระบบใหม่เพื่อใช้งานต่อ
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 22 }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '0 16px',
              height: 36,
              borderRadius: 999,
              border: 0,
              background: 'transparent',
              color: 'var(--tx-2)',
              fontSize: 12.5,
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.12s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--hover)'; e.currentTarget.style.color = 'var(--tx-1)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--tx-2)' }}
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '0 16px',
              height: 36,
              borderRadius: 999,
              border: 0,
              background: 'var(--red)',
              color: '#fff',
              fontSize: 12.5,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background 0.12s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#c54a45' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--red)' }}
          >
            <IconLogout size={12} sw={2} />
            <span>ออกจากระบบ</span>
          </button>
        </div>
      </div>
    </div>
  )
}

function HeaderBar({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  const openQuery = useAppStore(s => s.openQuery)
  const connections = useAppStore(s => s.connections)
  const tabs = useAppStore(s => s.tabs)
  const activeTabId = useAppStore(s => s.activeTabId)
  const authUser = useAppStore(s => s.authUser)
  const logout = useAppStore(s => s.logout)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)

  const activeTab = tabs.find(tab => tab.id === activeTabId) ?? null
  const activeConnection = activeTab
    ? connections.find(connection => connection.id === activeTab.connectionId) ?? null
    : connections[0] ?? null

  const breadcrumbConn = activeConnection?.name ?? '—'
  const titleLabel = activeTab?.label ?? 'Main Workspace'
  const initials = (authUser?.username ?? 'CD').slice(0, 2).toUpperCase()

  return (
    <header
      style={{
        height: 72,
        flexShrink: 0,
        padding: '0 32px',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        background: 'var(--bg)',
      }}
    >
      <div style={{ minWidth: 0, flexShrink: 1 }}>
        <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--tx-3)', marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          Workspace <span style={{ color: 'var(--tx-4)', margin: '0 6px' }}>/</span> {breadcrumbConn}
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--tx-1)', letterSpacing: '-0.025em', lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 480 }}>
          {titleLabel}
        </div>
      </div>

      <div style={{ flex: 1 }} />

      <button
        type="button"
        onClick={onToggleTheme}
        title="Toggle theme"
        style={{
          width: 40,
          height: 40,
          borderRadius: 999,
          border: 0,
          background: 'var(--surface)',
          color: 'var(--tx-2)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        {theme === 'dark' ? <IconSun size={15} sw={1.7} /> : <IconMoon size={15} sw={1.7} />}
      </button>

      <button
        type="button"
        disabled={!activeConnection}
        onClick={() =>
          activeConnection &&
          openQuery(activeConnection, {
            database: activeTab?.database,
            tableName: activeTab?.type === 'table' ? activeTab.tableName : activeTab?.tableName,
          })
        }
        className="btn-pill-primary"
        style={{ flexShrink: 0, whiteSpace: 'nowrap' }}
      >
        <IconPlay size={11} sw={2} />
        <span>Run SQL</span>
      </button>

      {authUser && (
        <button
          type="button"
          onClick={() => setShowLogoutConfirm(true)}
          title={`Sign out ${authUser.username}`}
          style={{
            width: 40,
            height: 40,
            borderRadius: 999,
            border: 0,
            background: 'var(--red-soft)',
            color: 'var(--red)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: 'var(--shadow-sm)',
            transition: 'background 0.12s ease, color 0.12s ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--red)'; e.currentTarget.style.color = '#fff' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'var(--red-soft)'; e.currentTarget.style.color = 'var(--red)' }}
        >
          <IconLogout size={15} sw={1.7} />
        </button>
      )}

      {showLogoutConfirm && authUser && (
        <LogoutConfirm
          username={authUser.username}
          onCancel={() => setShowLogoutConfirm(false)}
          onConfirm={() => { setShowLogoutConfirm(false); void logout() }}
        />
      )}
    </header>
  )
}

function TabBar() {
  const tabs = useAppStore(s => s.tabs)
  const activeTabId = useAppStore(s => s.activeTabId)
  const setActiveTab = useAppStore(s => s.setActiveTab)
  const closeTab = useAppStore(s => s.closeTab)
  const closeAllTabs = useAppStore(s => s.closeAllTabs)
  const openQuery = useAppStore(s => s.openQuery)
  const connections = useAppStore(s => s.connections)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)

  if (tabs.length === 0) return null

  const activeTab = tabs.find(t => t.id === activeTabId) ?? null
  const activeConnection = activeTab
    ? connections.find(c => c.id === activeTab.connectionId) ?? null
    : connections[0] ?? null

  return (
    <div className="tab-bar-wrap">
      <div className="tab-bar">
        {tabs.map(tab => {
          const isActive = tab.id === activeTabId
          return (
            <div
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              onContextMenu={event => {
                event.preventDefault()
                setActiveTab(tab.id)
                setContextMenu({
                  x: Math.min(event.clientX, window.innerWidth - 190),
                  y: Math.min(event.clientY, window.innerHeight - 72),
                })
              }}
              className={`tab${isActive ? ' active' : ''}`}
            >
              <span className="tab-icon">{TAB_ICONS[tab.type]}</span>
              <span
                className="tab-label"
                style={{ fontFamily: tab.type === 'query' ? 'var(--mono)' : 'var(--font)' }}
              >
                {tab.label}
              </span>
              <button
                type="button"
                className="close-btn"
                onClick={event => {
                  event.stopPropagation()
                  closeTab(tab.id)
                }}
              >
                <IconClose size={11} sw={2} />
              </button>
            </div>
          )
        })}
        <button
          type="button"
          onClick={() => activeConnection && openQuery(activeConnection, { database: activeTab?.database })}
          title="New tab"
          style={{
            width: 32,
            height: 32,
            borderRadius: 999,
            border: 0,
            background: 'transparent',
            color: 'var(--tx-3)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flexShrink: 0,
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'var(--surface)'
            e.currentTarget.style.color = 'var(--tx-1)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = 'var(--tx-3)'
          }}
        >
          <IconPlus size={14} sw={2} />
        </button>
      </div>

      {contextMenu && (
        <div
          style={{
            position: 'fixed',
            left: contextMenu.x,
            top: contextMenu.y,
            zIndex: 1200,
            minWidth: 180,
            overflow: 'hidden',
            borderRadius: 12,
            background: 'var(--surface)',
            padding: 6,
            boxShadow: 'var(--shadow-lg)',
          }}
          onClick={event => event.stopPropagation()}
          onContextMenu={event => event.preventDefault()}
        >
          <button
            className="btn btn-ghost"
            style={{ width: '100%', justifyContent: 'flex-start' }}
            onClick={() => {
              closeAllTabs()
              setContextMenu(null)
            }}
          >
            Close All Tabs
          </button>
        </div>
      )}
    </div>
  )
}

function SubTabBar({ tabId }: { tabId: string }) {
  const subTab = useAppStore(s => s.subTabs[tabId] ?? 'data') as SubTab
  const setSubTab = useAppStore(s => s.setSubTab)

  return (
    <div className="sub-tab-bar">
      <div className="sub-tab-group">
        {(['data', 'structure'] as const).map(tab => (
          <button
            key={tab}
            type="button"
            className={`sub-tab${subTab === tab ? ' active' : ''}`}
            onClick={() => setSubTab(tabId, tab)}
          >
            {tab === 'data' ? 'Data' : 'Structure'}
          </button>
        ))}
      </div>
    </div>
  )
}

function Overview() {
  const openConnectModal = useAppStore(s => s.openConnectModal)
  const savedConnections = useAppStore(s => s.savedConnections)
  const connections = useAppStore(s => s.connections)
  const tabs = useAppStore(s => s.tabs)
  const openQuery = useAppStore(s => s.openQuery)

  const recentCards = useMemo(() => {
    const source = savedConnections.length > 0
      ? savedConnections
      : connections.map(connection => ({
          id: connection.id,
          label: connection.name,
          config: connection.config ?? {
            dbType: connection.dbType ?? 'sqlite',
            host: connection.filePath,
          },
          lastUsed: Date.now(),
        }))

    return source.slice(0, 3)
  }, [connections, savedConnections])

  return (
    <div style={{ flex: 1, minHeight: 0, padding: 24, overflow: 'auto', background: 'var(--surface)' }} className="fade-in">
      <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        {[
          { title: 'Active Connections', value: connections.length, note: 'Connections currently attached to this workspace.' },
          { title: 'Open Tabs', value: tabs.length, note: 'Tables and query editors open in the current session.' },
          { title: 'Saved Connections', value: savedConnections.length, note: 'Available to reconnect next time you open the app.' },
        ].map(card => (
          <div
            key={card.title}
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-lg)',
              padding: '20px 22px',
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--tx-3)' }}>
              {card.title}
            </div>
            <div style={{ marginTop: 12, fontSize: 36, fontWeight: 800, letterSpacing: '-0.04em', color: 'var(--accent-fg)', lineHeight: 1 }}>
              {card.value}
            </div>
            <div style={{ marginTop: 12, fontSize: 13, color: 'var(--tx-3)', lineHeight: 1.55 }}>
              {card.note}
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 28, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--tx-1)' }}>Saved Connections</div>
          <div style={{ marginTop: 4, fontSize: 13, color: 'var(--tx-3)' }}>Open a saved source quickly without rebuilding the connection.</div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--tx-3)' }}>{savedConnections.length} available</div>
      </div>

      <div style={{ marginTop: 18, display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        {recentCards.map(card => {
          const type = card.config.dbType.toUpperCase()
          const host = card.config.host || card.config.database || 'Local file'
          const label = card.label || card.config.name || 'Untitled Connection'

          return (
            <button
              key={card.id}
              type="button"
              onClick={() => {
                const active = connections.find(connection => connection.name === label)
                if (active) openQuery(active)
              }}
              className="welcome-card"
              style={{ textAlign: 'left', border: '1px solid var(--border)' }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <span
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'var(--accent-soft)',
                    color: 'var(--accent-fg)',
                  }}
                >
                  <IconDB size={18} sw={1.7} />
                </span>
                <span
                  style={{
                    padding: '3px 8px',
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.1em',
                    borderRadius: 999,
                    background: 'var(--inset)',
                    color: 'var(--tx-2)',
                  }}
                >
                  {type}
                </span>
              </div>
              <div style={{ marginTop: 16, fontSize: 14, fontWeight: 700, color: 'var(--tx-1)', letterSpacing: '-0.02em' }}>{label}</div>
              <div style={{ marginTop: 4, fontSize: 12, color: 'var(--tx-3)' }}>{host}</div>
              <div style={{ marginTop: 18, paddingTop: 12, borderTop: '1px solid var(--border-faint)', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--tx-4)' }}>
                Last access
              </div>
              <div style={{ marginTop: 4, fontSize: 12, color: 'var(--tx-2)' }}>
                {new Date(card.lastUsed).toLocaleString()}
              </div>
            </button>
          )
        })}

        <button
          type="button"
          onClick={openConnectModal}
          style={{
            minHeight: 220,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            border: '1.5px dashed var(--border-strong)',
            borderRadius: 'var(--r-lg)',
            background: 'var(--surface-2)',
            color: 'var(--tx-2)',
            cursor: 'pointer',
            transition: 'all 0.12s ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = 'var(--accent)'
            e.currentTarget.style.color = 'var(--accent-fg)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = 'var(--border-strong)'
            e.currentTarget.style.color = 'var(--tx-2)'
          }}
        >
          <span
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--accent-soft)',
              color: 'var(--accent-fg)',
            }}
          >
            <IconPlus size={22} sw={2} />
          </span>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--tx-1)' }}>New Connection</div>
          <div style={{ maxWidth: 200, fontSize: 12, lineHeight: 1.55, color: 'var(--tx-3)', textAlign: 'center' }}>
            Create a new source and bring it into the workspace.
          </div>
        </button>
      </div>
    </div>
  )
}

function MainContent() {
  const tabs = useAppStore(s => s.tabs)
  const activeTabId = useAppStore(s => s.activeTabId)
  const subTabs = useAppStore(s => s.subTabs)
  const setStatus = useAppStore(s => s.setStatus)

  const activeTab = tabs.find(tab => tab.id === activeTabId) ?? null

  if (tabs.length === 0) {
    return <Overview />
  }

  if (!activeTab) return null

  if (activeTab.type === 'query') {
    return (
      <QueryEditor
        key={activeTab.id}
        connectionId={activeTab.connectionId}
        connectionName={activeTab.connectionName}
        database={activeTab.database}
        tableName={activeTab.tableName}
        onStatusChange={setStatus}
      />
    )
  }

  if (activeTab.type === 'create-table') {
    return (
      <CreateTableView
        key={activeTab.id}
        connectionId={activeTab.connectionId}
        connectionName={activeTab.connectionName}
        database={activeTab.database}
        schemaName={activeTab.schemaName}
        tableName={activeTab.tableName}
        mode={activeTab.editorMode}
      />
    )
  }

  if (activeTab.type === 'server-monitor') {
    return (
      <ServerMonitorView
        key={activeTab.id}
        connectionId={activeTab.connectionId}
      />
    )
  }

  const subTab: SubTab = subTabs[activeTab.id] ?? 'data'

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--surface)' }}>
      <SubTabBar tabId={activeTab.id} />
      <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
        {subTab === 'data' ? (
          <DataGrid
            key={`${activeTab.connectionId}::${activeTab.database ?? ''}::${activeTab.tableName}`}
            connectionId={activeTab.connectionId}
            tableName={activeTab.tableName!}
            database={activeTab.database}
            onStatusChange={setStatus}
          />
        ) : (
          <StructureView
            key={`${activeTab.connectionId}::${activeTab.database ?? ''}::${activeTab.tableName}::struct`}
            connectionId={activeTab.connectionId}
            tableName={activeTab.tableName!}
            database={activeTab.database}
          />
        )}
      </div>
    </div>
  )
}

function DataGridFooterBar() {
  const gridFooter = useAppStore(s => s.gridFooter)

  if (!gridFooter?.visible) return null

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 18px',
        borderTop: '1px solid var(--border-faint)',
        background: 'var(--surface)',
        fontSize: 11.5,
        color: 'var(--tx-2)',
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {gridFooter.selectionLabel && (
          <span style={{ marginRight: 4, color: 'var(--tx-1)' }}>{gridFooter.selectionLabel}</span>
        )}
        {gridFooter.actions?.map(action => (
          <button
            key={action.key}
            className={action.variant === 'primary' ? 'btn btn-primary' : action.variant === 'danger' ? 'btn btn-danger' : 'btn btn-ghost'}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 10px', height: 28 }}
            disabled={action.disabled}
            onClick={() => action.onClick?.()}
          >
            {action.icon}
            {action.label}
          </button>
        ))}
      </div>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ marginRight: 4 }}>{gridFooter.summary}</span>
        <button className="btn btn-ghost" style={{ padding: '0 10px', height: 28 }} disabled={!gridFooter.canPrev} onClick={() => gridFooter.onPrev?.()}>
          Prev
        </button>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{gridFooter.pageLabel}</span>
        <button className="btn btn-ghost" style={{ padding: '0 10px', height: 28 }} disabled={!gridFooter.canNext} onClick={() => gridFooter.onNext?.()}>
          Next
        </button>
        <select
          value={gridFooter.limit}
          onChange={event => gridFooter.onLimitChange?.(Number(event.target.value))}
          style={{
            background: 'var(--inset)',
            border: 0,
            color: 'var(--tx-2)',
            padding: '0 8px',
            height: 28,
            borderRadius: 8,
            fontSize: 11.5,
            outline: 'none',
            fontFamily: 'var(--font)',
          }}
        >
          {[50, 100, 250, 500, 1000].map(n => <option key={n} value={n}>{n} rows</option>)}
        </select>
      </div>
    </div>
  )
}

export default function AppShell() {
  const showConnectModal = useAppStore(s => s.showConnectModal)
  const authUser = useAppStore(s => s.authUser)
  const authLoading = useAppStore(s => s.authLoading)
  const loadCurrentUser = useAppStore(s => s.loadCurrentUser)
  const tabs = useAppStore(s => s.tabs)
  const [theme, toggleTheme] = useTheme()

  useEffect(() => {
    void loadCurrentUser()
  }, [loadCurrentUser])

  if (authLoading) {
    return (
      <div style={{ display: 'flex', height: '100vh', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)' }}>
        <TitleBar />
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--tx-2)',
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          Loading CatDB…
        </div>
      </div>
    )
  }

  if (!authUser) {
    return (
      <div style={{ display: 'flex', height: '100vh', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)' }}>
        <TitleBar />
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <AuthView />
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100vh', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)', color: 'var(--tx-1)' }}>
      <TitleBar />
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <Sidebar />
        <main style={{ display: 'flex', flex: 1, minWidth: 0, flexDirection: 'column', overflow: 'hidden' }}>
          <HeaderBar theme={theme} onToggleTheme={toggleTheme} />
          <TabBar />
          <div
            style={{
              flex: 1,
              minHeight: 0,
              margin: tabs.length > 0 ? '0 32px 24px' : '0 32px 24px',
              background: 'var(--surface)',
              borderRadius: 'var(--r-xl)',
              boxShadow: 'var(--shadow-md)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <MainContent />
            <DataGridFooterBar />
          </div>
        </main>
      </div>
      <StatusBar />
      {showConnectModal && <ConnectModal />}
    </div>
  )
}
