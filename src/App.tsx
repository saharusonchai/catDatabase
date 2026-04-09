import useAppStore from './store/appStore'
import type { SubTab } from './types'
import Sidebar from './components/Sidebar'
import DataGrid from './components/DataGrid'
import QueryEditor from './components/QueryEditor'
import StructureView from './components/StructureView'
import StatusBar from './components/StatusBar'
import ConnectModal from './components/ConnectModal'

const TAB_ICONS: Record<string, string> = { table: '▦', query: '▶' }

// ── Welcome Screen ────────────────────────────────────────────────────────────
function WelcomeScreen() {
  const openDatabase     = useAppStore(s => s.openDatabase)
  const createDatabase   = useAppStore(s => s.createDatabase)
  const openDemo         = useAppStore(s => s.openDemo)
  const openConnectModal = useAppStore(s => s.openConnectModal)

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
      <div style={{ textAlign: 'center', maxWidth: 480 }}>
        <div style={{ fontSize: 64, marginBottom: 16, lineHeight: 1 }}>🐱</div>
        <h1 style={{ margin: '0 0 6px', fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: -0.5 }}>
          CatDB
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: '0 0 32px', lineHeight: 1.5 }}>
          Database Management Tool — SQLite, MySQL, PostgreSQL, MongoDB
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <button className="welcome-card" onClick={openConnectModal}
            style={{ textAlign: 'left', gridColumn: 'span 2', borderColor: 'var(--accent-dim)' }}>
            <div style={{ fontSize: 22, marginBottom: 8 }}>🔌</div>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4, color: 'var(--accent)' }}>New Remote Connection</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
              Connect to MySQL, PostgreSQL, or MongoDB with optional SSH tunnel
            </div>
          </button>
          <button className="welcome-card" onClick={openDatabase} style={{ textAlign: 'left' }}>
            <div style={{ fontSize: 22, marginBottom: 8 }}>📂</div>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4, color: 'var(--text-primary)' }}>Open SQLite File</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>Open an existing .db or .sqlite file</div>
          </button>
          <button className="welcome-card" onClick={createDatabase} style={{ textAlign: 'left' }}>
            <div style={{ fontSize: 22, marginBottom: 8 }}>✨</div>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4, color: 'var(--text-primary)' }}>New SQLite File</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>Create a fresh SQLite database file</div>
          </button>
          <button className="welcome-card" onClick={openDemo}
            style={{ gridColumn: 'span 2', textAlign: 'left' }}>
            <div style={{ fontSize: 22, marginBottom: 8 }}>🐾</div>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4, color: 'var(--text-primary)' }}>Load Demo Database</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
              Explore a pre-built cats database with sample tables and data
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Tab Bar ───────────────────────────────────────────────────────────────────
function TabBar() {
  const tabs         = useAppStore(s => s.tabs)
  const activeTabId  = useAppStore(s => s.activeTabId)
  const setActiveTab = useAppStore(s => s.setActiveTab)
  const closeTab     = useAppStore(s => s.closeTab)

  if (tabs.length === 0) return null
  return (
    <div className="tab-bar">
      {tabs.map(tab => (
        <div
          key={tab.id}
          className={`tab ${tab.id === activeTabId ? 'active' : ''}`}
          onClick={() => setActiveTab(tab.id)}
        >
          <span style={{ opacity: 0.6, fontSize: 11 }}>{TAB_ICONS[tab.type]}</span>
          <span>{tab.label}</span>
          <span className="close-btn" onClick={e => { e.stopPropagation(); closeTab(tab.id) }}>✕</span>
        </div>
      ))}
    </div>
  )
}

// ── Sub-tab Bar ───────────────────────────────────────────────────────────────
function SubTabBar({ tabId }: { tabId: string }) {
  const subTab    = useAppStore(s => s.subTabs[tabId] ?? 'data') as SubTab
  const setSubTab = useAppStore(s => s.setSubTab)

  return (
    <div className="sub-tab-bar">
      {(['data', 'structure'] as const).map(t => (
        <button
          key={t}
          className={`sub-tab ${subTab === t ? 'active' : ''}`}
          onClick={() => setSubTab(tabId, t)}
        >
          {t === 'data' ? '▦ Data' : '⊞ Structure'}
        </button>
      ))}
    </div>
  )
}

// ── Main Content ──────────────────────────────────────────────────────────────
function MainContent() {
  const tabs        = useAppStore(s => s.tabs)
  const activeTabId = useAppStore(s => s.activeTabId)
  const subTabs     = useAppStore(s => s.subTabs)
  const setStatus   = useAppStore(s => s.setStatus)

  const activeTab = tabs.find(t => t.id === activeTabId) ?? null

  if (tabs.length === 0) return <WelcomeScreen />
  if (!activeTab)        return null

  if (activeTab.type === 'query') {
    return (
      <QueryEditor
        key={activeTab.id}
        connectionId={activeTab.connectionId}
        connectionName={activeTab.connectionName}
        database={activeTab.database}
        onStatusChange={setStatus}
      />
    )
  }

  const subTab: SubTab = subTabs[activeTab.id] ?? 'data'

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <SubTabBar tabId={activeTab.id} />
      <div style={{ flex: 1, overflow: 'hidden' }}>
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

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const showConnectModal = useAppStore(s => s.showConnectModal)

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100vh', background: 'var(--bg-app)', overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
          <TabBar />
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <MainContent />
          </div>
        </div>
      </div>
      <StatusBar />
      {showConnectModal && <ConnectModal />}
    </div>
  )
}
