import { useMemo, useState } from 'react'
import useAppStore from './store/appStore'
import type { SubTab } from './types'
import Sidebar from './components/ExplorerSidebar'
import DataGrid from './components/DataGrid'
import QueryEditor from './components/QueryEditor'
import StructureView from './components/StructureView'
import CreateTableView from './components/CreateTableView'
import StatusBar from './components/StatusBar'
import ConnectModal from './components/ConnectSheet'
import { AiOutlineApi  } from "react-icons/ai";
import { CiViewTable } from "react-icons/ci";

const IconMark = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <rect x="2" y="2" width="14" height="14" rx="3.5" fill="#005FB8" />
    <path d="M5 6.2h4.2v4.2H5zM9.8 7.8H13v4.2H9.8zM7.4 10.2h3.2V13H7.4z" fill="#fff" />
  </svg>
)

const IconSearch = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
    <circle cx="7" cy="7" r="4.5" />
    <path d="m10.5 10.5 3 3" />
  </svg>
)

const IconRefresh = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13.5 3.5v4h-4" />
    <path d="M13.2 7.2A5.5 5.5 0 1 1 11.8 4" />
  </svg>
)

const IconHistory = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2.5 8A5.5 5.5 0 1 0 4 4.1" />
    <path d="M2.5 2.8v2.7h2.7" />
    <path d="M8 5.1v3.2l2 1.2" />
  </svg>
)

const IconSettings = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="m6.8 1.9-.5 1.6a4.8 4.8 0 0 0-1.2.7L3.6 3.6 2 5.2l.6 1.5a4.8 4.8 0 0 0-.7 1.2l-1.6.5v2.2l1.6.5c.2.4.4.8.7 1.2L2 13.8l1.6 1.6 1.5-.6c.4.3.8.5 1.2.7l.5 1.6H9l.5-1.6c.4-.2.8-.4 1.2-.7l1.5.6 1.6-1.6-.6-1.5c.3-.4.5-.8.7-1.2l1.6-.5V8.9l-1.6-.5a4.8 4.8 0 0 0-.7-1.2l.6-1.5-1.6-1.6-1.5.6a4.8 4.8 0 0 0-1.2-.7L9 1.9H6.8Z" />
    <circle cx="8" cy="8" r="2.1" />
  </svg>
)

const IconRun = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M4 3.2v9.6l8-4.8-8-4.8Z" fill="currentColor" />
  </svg>
)

const IconAdd = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <path d="M9 3.5v11M3.5 9h11" />
  </svg>
)

const IconTableTab = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.1">
    <rect x="1.3" y="1.3" width="9.4" height="9.4" rx="1.2" />
    <path d="M1.3 4.5h9.4M4.5 1.3v9.4" />
  </svg>
)

const IconQueryTab = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 1.5h4.7L10 4.8v5A1.2 1.2 0 0 1 8.8 11H3.2A1.2 1.2 0 0 1 2 9.8V1.5Z" />
    <path d="M6.7 1.5v3.3H10" />
  </svg>
)

const IconCreateTableTab = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1.3" y="1.3" width="9.4" height="9.4" rx="1.2" />
    <path d="M1.3 4.5h9.4M6 1.8v8.4M3.3 7h5.4" />
  </svg>
)

const TAB_ICONS: Record<string, JSX.Element> = {
  table: <IconTableTab />,
  query: <IconQueryTab />,
  'create-table': <IconCreateTableTab />,
}

function HeaderBar() {
  const openQuery = useAppStore(s => s.openQuery)
  const openConnectModal = useAppStore(s => s.openConnectModal)
  const connections = useAppStore(s => s.connections)
  const tabs = useAppStore(s => s.tabs)
  const activeTabId = useAppStore(s => s.activeTabId)
  const [search, setSearch] = useState('')

  const activeTab = tabs.find(tab => tab.id === activeTabId) ?? null
  const activeConnection = activeTab
    ? connections.find(connection => connection.id === activeTab.connectionId) ?? null
    : connections[0] ?? null

  return (
    <header className="border-b border-[#1b2735] bg-[#0d1117]">
      <div className="flex h-[74px] items-center gap-5 px-7">
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[#1e3851] bg-[#102235] text-[#005FB8] shadow-[inset_0_0_0_1px_rgba(0,95,184,0.18)]">
            <IconMark />
          </span>
          <div className="min-w-0">
            <div className="truncate text-[15px] font-bold tracking-[-0.02em] text-slate-100">CatDB Workspace</div>
            <div className="text-xs text-slate-500">
              {activeConnection ? activeConnection.filePath : 'Connect a source to begin'}
            </div>
          </div>
        </div>

        <div className="ml-4 flex min-w-0 flex-1 items-center gap-3">
          <button
            type="button"
            onClick={openConnectModal}
            className="inline-flex min-h-[22px] min-w-[110px] flex-col items-center justify-center gap-1 rounded-lg border border-[#1d3851] bg-[#102235] px-3 py-1 text-sm font-semibold text-[#79bbff] transition hover:border-[#005FB8] hover:bg-[#121b25]"
          >
            <span className="inline-flex h-5 w-5 items-center justify-center">
              <AiOutlineApi size={24} />
            </span>
            <span>Connection</span>
          </button>
          <button
            type="button"
            disabled={!activeConnection}
            onClick={() => activeConnection && openQuery(activeConnection)}
            className="inline-flex min-h-[22px] min-w-[110px] flex-col items-center justify-center gap-1 rounded-lg border border-[#1d3851] bg-[#102235] px-3 py-1 text-sm font-semibold text-[#79bbff] transition hover:border-[#005FB8] hover:bg-[#121b25] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="inline-flex h-5 w-5 items-center justify-center">
              <CiViewTable  size={24} />
            </span>
            <span>New Query</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button type="button" className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-slate-500 transition hover:bg-[#121821] hover:text-slate-200">
            <IconSettings />
          </button>
          <button
            type="button"
            disabled={!activeConnection}
            onClick={() => activeConnection && openQuery(activeConnection)}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#005FB8] px-4 text-sm font-semibold text-white transition hover:bg-[#0b6ac4] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <IconRun />
            <span>Run SQL</span>
          </button>
        </div>
      </div>
    </header>
  )
}

function TabBar() {
  const tabs = useAppStore(s => s.tabs)
  const activeTabId = useAppStore(s => s.activeTabId)
  const setActiveTab = useAppStore(s => s.setActiveTab)
  const closeTab = useAppStore(s => s.closeTab)
  const closeAllTabs = useAppStore(s => s.closeAllTabs)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)

  if (tabs.length === 0) return null

  return (
    <div className="relative border-b border-[#1b2735] bg-[#0f141b] px-4 pt-3">
      <div className="flex overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            onContextMenu={event => {
              event.preventDefault()
              setActiveTab(tab.id)
              setContextMenu({
                x: Math.min(event.clientX, window.innerWidth - 190),
                y: Math.min(event.clientY, window.innerHeight - 72),
              })
            }}
            className={`group mr-2 inline-flex h-11 shrink-0 items-center gap-2 rounded-t-2xl border border-b-0 px-4 text-[12.5px] transition ${
              tab.id === activeTabId
                ? 'border-[#1b2735] bg-[#151d26] text-slate-100'
                : 'border-transparent bg-transparent text-slate-500 hover:bg-[#121821] hover:text-slate-200'
            }`}
          >
            <span className={`inline-flex h-4 w-4 items-center justify-center ${tab.id === activeTabId ? 'text-[#79bbff]' : 'text-slate-500'}`}>
              {TAB_ICONS[tab.type]}
            </span>
            <span className="max-w-[240px] truncate">{tab.label}</span>
            <span
              className="inline-flex h-5 w-5 items-center justify-center rounded-full text-slate-500 opacity-0 transition group-hover:opacity-100 hover:bg-white/10 hover:text-slate-100"
              onClick={event => {
                event.stopPropagation()
                closeTab(tab.id)
              }}
            >
              ×
            </span>
          </button>
        ))}
      </div>
      {contextMenu && (
        <div
          className="fixed z-[1200] min-w-[180px] overflow-hidden rounded-2xl border border-[#1b2735] bg-[#0f161f] p-1.5 shadow-[0_20px_50px_rgba(0,0,0,0.35)]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={event => event.stopPropagation()}
          onContextMenu={event => event.preventDefault()}
        >
          <button
            className="flex w-full items-center rounded-xl px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-[#16202c]"
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
    <div className="flex gap-2 border-b border-[#1b2735] bg-[#111821] px-5">
      {(['data', 'structure'] as const).map(tab => (
        <button
          key={tab}
          type="button"
          onClick={() => setSubTab(tabId, tab)}
          className={`mb-[-1px] border-b-2 px-2 py-3 text-[12px] font-semibold uppercase tracking-[0.08em] transition ${
            subTab === tab
              ? 'border-[#005FB8] text-[#79bbff]'
              : 'border-transparent text-slate-500 hover:text-slate-200'
          }`}
        >
          {tab}
        </button>
      ))}
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
    <div className="h-full overflow-auto bg-[#0b0f14] p-8">
      <div className="grid gap-5 xl:grid-cols-3">
        {[
          { title: 'Active Connections', value: connections.length, note: 'Connections currently attached to this workspace.', accent: 'bg-emerald-400' },
          { title: 'Open Tabs', value: tabs.length, note: 'Tables and query editors opened in the current session.', accent: 'bg-[#005FB8]' },
          { title: 'Saved Connections', value: savedConnections.length, note: 'Available for reconnect the next time you open the app.', accent: 'bg-[#005FB8]' },
        ].map(card => (
          <div key={card.title} className="rounded-[28px] border border-[#1b2735] bg-[#121821] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.22)]">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">{card.title}</div>
                <div className="mt-3 text-[44px] font-bold leading-none tracking-[-0.05em] text-[#79bbff]">{card.value}</div>
                <div className="mt-3 max-w-[280px] text-sm leading-6 text-slate-500">{card.note}</div>
              </div>
              <span className={`mt-1 inline-flex h-2.5 w-2.5 rounded-full ${card.accent}`} />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-10 flex items-center justify-between">
        <div>
          <div className="text-lg font-bold tracking-[-0.03em] text-slate-100">Saved Connections</div>
          <div className="mt-1 text-sm text-slate-500">Open a saved source quickly without rebuilding the connection details.</div>
        </div>
        <div className="text-sm font-medium text-slate-500">{savedConnections.length} available</div>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-4">
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
              className="rounded-[24px] border border-[#1b2735] bg-[#121821] p-5 text-left shadow-[0_24px_60px_rgba(0,0,0,0.22)] transition hover:-translate-y-0.5 hover:border-[#244466]"
            >
              <div className="flex items-start justify-between">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#102235] text-[#79bbff]">
                  <IconMark />
                </span>
                <span className="rounded-full bg-[#102235] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#79bbff]">
                  {type}
                </span>
              </div>
              <div className="mt-5 text-[17px] font-bold tracking-[-0.03em] text-slate-100">{label}</div>
              <div className="mt-2 text-sm leading-6 text-slate-500">{host}</div>
              <div className="mt-6 border-t border-[#1b2735] pt-4 text-xs uppercase tracking-[0.12em] text-slate-600">
                Last access
                <div className="mt-2 text-sm font-semibold normal-case tracking-normal text-slate-400">
                  {new Date(card.lastUsed).toLocaleString()}
                </div>
              </div>
            </button>
          )
        })}

        <button
          type="button"
          onClick={openConnectModal}
          className="flex min-h-[250px] flex-col items-center justify-center rounded-[24px] border border-dashed border-[#244466] bg-[#0f141b] text-center transition hover:border-[#005FB8] hover:bg-[#121821]"
        >
          <span className="inline-flex h-16 w-16 items-center justify-center rounded-3xl bg-[#121821] text-[36px] text-[#79bbff] shadow-[0_12px_30px_rgba(0,0,0,0.24)]">
            +
          </span>
          <div className="mt-5 text-lg font-bold text-slate-100">New Connection</div>
          <div className="mt-2 max-w-[180px] text-sm leading-6 text-slate-500">
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

  const subTab: SubTab = subTabs[activeTab.id] ?? 'data'

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#0f141b]">
      <SubTabBar tabId={activeTab.id} />
      <div className="flex min-h-0 flex-1 overflow-hidden">
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
    <div className="flex h-9 items-center justify-end gap-2 border-t border-[#1b2735] bg-[#131a22] px-4 text-[11px] text-slate-400">
      <span className="mr-1">{gridFooter.summary}</span>
      <button className="btn btn-ghost" style={{ padding: '3px 8px' }} disabled={!gridFooter.canPrev} onClick={() => gridFooter.onPrev?.()}>
        Prev
      </button>
      <span>{gridFooter.pageLabel}</span>
      <button className="btn btn-ghost" style={{ padding: '3px 8px' }} disabled={!gridFooter.canNext} onClick={() => gridFooter.onNext?.()}>
        Next
      </button>
      <select
        value={gridFooter.limit}
        onChange={event => gridFooter.onLimitChange?.(Number(event.target.value))}
        style={{ background: '#0b1118', border: '1px solid #1b2735', color: '#8592a3', padding: '3px 4px', borderRadius: 4, fontSize: 11.5, outline: 'none' }}
      >
        {[50, 100, 250, 500, 1000].map(n => <option key={n} value={n}>{n} rows</option>)}
      </select>
    </div>
  )
}

export default function AppShell() {
  const showConnectModal = useAppStore(s => s.showConnectModal)

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#0b0f14] text-slate-100">
      <HeaderBar />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <TabBar />
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <MainContent />
          </div>
        </main>
      </div>
      <DataGridFooterBar />
      <StatusBar />
      {showConnectModal && <ConnectModal />}
    </div>
  )
}
