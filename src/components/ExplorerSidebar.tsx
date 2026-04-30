import { useState, useCallback, memo, useEffect } from 'react'
import useAppStore from '../store/appStore'
import type { Connection, DatabaseNode, SavedConnection } from '../types'

const IconDatabase = ({ tone = 'currentColor' }: { tone?: string }) => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke={tone} strokeWidth="1.2">
    <ellipse cx="8" cy="3.6" rx="5.5" ry="2.1" />
    <path d="M2.5 3.6v3.3c0 1.16 2.46 2.1 5.5 2.1s5.5-.94 5.5-2.1V3.6" />
    <path d="M2.5 6.9v3.3c0 1.16 2.46 2.1 5.5 2.1s5.5-.94 5.5-2.1V6.9" />
  </svg>
)

const IconGrid = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
    <rect x="2" y="2" width="12" height="12" rx="1.6" />
    <path d="M2 6h12M2 10h12M6 2v12M10 2v12" />
  </svg>
)

const IconEye = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1.2 8s2.45-4 6.8-4 6.8 4 6.8 4-2.45 4-6.8 4-6.8-4-6.8-4Z" />
    <circle cx="8" cy="8" r="2.1" />
  </svg>
)

const IconChevron = ({ open }: { open: boolean }) => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.16s ease' }}>
    <path d="M3 1.8 6.8 5 3 8.2" />
  </svg>
)

const IconBolt = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8.8 1.5 3.6 8h3l-.4 6.5L11.8 8h-3.1l.1-6.5Z" />
  </svg>
)

const IconClose = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
    <path d="M2 2l6 6M8 2 2 8" />
  </svg>
)

const IconEdit = () => (
  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 10h2l5.2-5.2-2-2L2 8v2Z" />
    <path d="m6.1 2.8 2 2" />
  </svg>
)

const IconPlus = () => (
  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
    <path d="M6 2v8M2 6h8" />
  </svg>
)

const IconTrash = () => (
  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2.5 3h7" />
    <path d="M4.1 3V2.2c0-.4.3-.7.7-.7h2.4c.4 0 .7.3.7.7V3" />
    <path d="M3.3 3.8l.4 5.1c0 .6.4 1.1 1 1.1h2.6c.6 0 1-.5 1-1.1l.4-5.1" />
    <path d="M5.1 5.2v2.8M6.9 5.2v2.8" />
  </svg>
)

const getSavedConnectionId = (config: SavedConnection['config']) =>
  `${config.dbType}:${config.host}:${config.port}:${config.database}:${config.username}`

function DeleteTableConfirm({
  tableName,
  itemType,
  onConfirm,
  onClose,
}: {
  tableName: string
  itemType: 'table' | 'view'
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal fade-in" style={{ minWidth: 360 }} onClick={event => event.stopPropagation()}>
        <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600, color: 'var(--red)' }}>
          Delete {itemType === 'view' ? 'view' : 'table'} "{tableName}"?
        </h3>
        <p style={{ color: 'var(--text-secondary)', margin: '0 0 20px', fontSize: 13 }}>
          This action cannot be undone.
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-danger" style={{ background: 'var(--red)', color: '#fff' }} onClick={onConfirm}>
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

const TableList = memo(function TableList({
  connection,
  tables,
  databaseName,
  onTableContextMenu,
}: {
  connection: Connection
  tables: Connection['tables']
  databaseName?: string
  onTableContextMenu: (event: React.MouseEvent, payload: { connection: Connection; tableName: string; databaseName?: string; schemaName?: string; itemType: 'table' | 'view' }) => void
}) {
  const selectTable = useAppStore(s => s.selectTable)
  const openQuery = useAppStore(s => s.openQuery)
  const activeTabId = useAppStore(s => s.activeTabId)
  const tabs = useAppStore(s => s.tabs)

  const activeTableKey = (() => {
    const activeTab = tabs.find(t => t.id === activeTabId)
    if (!activeTab || activeTab.type !== 'table') return null
    const scopedName = activeTab.database ? `${activeTab.database}.${activeTab.tableName}` : activeTab.tableName
    return `${activeTab.connectionId}::${scopedName}`
  })()

  return (
    <div className="py-1">
      {tables.map(table => {
        const scopedName = databaseName ? `${databaseName}.${table.name}` : table.name
        const key = `${connection.id}::${scopedName}`
        const isView = table.type === 'view'
        const isActive = activeTableKey === key

        return (
          <button
            key={scopedName}
            type="button"
            className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors ${
              isActive
                ? 'bg-[#0e2035] text-[#79bbff]'
                : 'text-slate-400 hover:bg-[#131a24] hover:text-slate-200'
            }`}
            onClick={() => selectTable(connection, table.name, databaseName)}
            onContextMenu={event => onTableContextMenu(event, {
              connection,
              tableName: table.name,
              databaseName,
              schemaName: table.schema,
              itemType: table.type,
            })}
          >
            <span className={`inline-flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center ${isView ? 'text-violet-400' : 'text-slate-500'} ${isActive ? 'text-[#79bbff]' : ''}`}>
              {isView ? <IconEye /> : <IconGrid />}
            </span>
            <span className="min-w-0 flex-1 truncate">{table.name}</span>
            {isView && !isActive && (
              <span className="flex-shrink-0 rounded px-1 py-px text-[9px] font-medium uppercase tracking-wide text-violet-500" style={{ background: 'rgba(139,92,246,0.1)' }}>
                view
              </span>
            )}
          </button>
        )
      })}

      <button
        type="button"
        className="mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-slate-500 transition-colors hover:bg-[#131a24] hover:text-[#79bbff]"
        onClick={() => openQuery(connection, { database: databaseName })}
      >
        <span className="inline-flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center"><IconBolt /></span>
        <span>New Query</span>
      </button>
    </div>
  )
})

const DatabaseItem = memo(function DatabaseItem({
  connection,
  database,
  onDatabaseContextMenu,
  onTableContextMenu,
}: {
  connection: Connection
  database: DatabaseNode
  onDatabaseContextMenu: (event: React.MouseEvent, payload: { connection: Connection; databaseName?: string; schemaName?: string }) => void
  onTableContextMenu: (event: React.MouseEvent, payload: { connection: Connection; tableName: string; databaseName?: string; schemaName?: string; itemType: 'table' | 'view' }) => void
}) {
  const loadDatabaseTables = useAppStore(s => s.loadDatabaseTables)
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleToggle = useCallback(async () => {
    const nextExpanded = !expanded
    setExpanded(nextExpanded)
    if (nextExpanded && database.tables === null && !loading) {
      setLoading(true)
      await loadDatabaseTables(connection.id, database.name)
      setLoading(false)
    }
  }, [connection.id, database.name, database.tables, expanded, loadDatabaseTables, loading])

  return (
    <div className="mt-0.5">
      {/* Database row */}
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-slate-300 transition-colors hover:bg-[#131a24] hover:text-slate-100"
        onClick={handleToggle}
        onContextMenu={event => onDatabaseContextMenu(event, { connection, databaseName: database.name })}
      >
        <span className="inline-flex h-3 w-3 flex-shrink-0 items-center justify-center text-slate-600">
          <IconChevron open={expanded} />
        </span>
        <span className="inline-flex h-4 w-4 flex-shrink-0 items-center justify-center text-[#4a9edd]">
          <IconDatabase tone="#4a9edd" />
        </span>
        <span className="min-w-0 flex-1 truncate text-xs font-medium">{database.name}</span>
        {database.tables && (
          <span className="flex-shrink-0 text-[10px] tabular-nums text-slate-600">{database.tables.length}</span>
        )}
      </button>

      {/* Tables under this database — indented with guide line */}
      {expanded && (
        <div className="ml-3.5 border-l border-[#1c2d3f] pl-3">
          {loading ? (
            <div className="py-2 text-[11px] italic text-slate-600">Loading tables…</div>
          ) : !database.tables || database.tables.length === 0 ? (
            <div className="py-2 text-[11px] italic text-slate-600">No tables found</div>
          ) : (
            <TableList connection={connection} tables={database.tables} databaseName={database.name} onTableContextMenu={onTableContextMenu} />
          )}
        </div>
      )}
    </div>
  )
})

const ConnectionItem = memo(function ConnectionItem({
  connection,
  expanded,
  onToggle,
  onConnectionContextMenu,
  onDatabaseContextMenu,
  onTableContextMenu,
}: {
  connection: Connection
  expanded: boolean
  onToggle: (id: string) => void
  onConnectionContextMenu: (event: React.MouseEvent, payload: { connectionId: string; connection: Connection; includeAddTable?: boolean }) => void
  onDatabaseContextMenu: (event: React.MouseEvent, payload: { connection: Connection; databaseName?: string; schemaName?: string }) => void
  onTableContextMenu: (event: React.MouseEvent, payload: { connection: Connection; tableName: string; databaseName?: string; schemaName?: string; itemType: 'table' | 'view' }) => void
}) {
  const closeConnection = useAppStore(s => s.closeConnection)
  const openQuery = useAppStore(s => s.openQuery)

  return (
    <section className="overflow-hidden rounded-2xl border border-[#1b2735] bg-[#0d1117] shadow-[0_4px_16px_rgba(0,0,0,0.25)]">
      {/* ── Level 1: Connection header bar ── */}
      <div className="flex items-center gap-1.5 border-b border-[#1b2735] bg-[#131a24] px-2.5 py-2">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-[#0f141b]"
          onClick={() => onToggle(connection.id)}
          onContextMenu={event => onConnectionContextMenu(event, {
            connectionId: connection.id,
            connection,
            includeAddTable: !connection.databases || connection.databases.length === 0,
          })}
        >
          {/* Status dot + DB icon */}
          <span className="relative inline-flex h-4 w-4 flex-shrink-0 items-center justify-center text-[#79bbff]">
            <IconDatabase tone="#79bbff" />
            <span className="absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_4px_rgba(74,222,128,0.7)]" />
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-100">
            {connection.name}
          </span>
          <span className="flex-shrink-0 text-slate-600">
            <IconChevron open={expanded} />
          </span>
        </button>

        {/* Divider + action buttons */}
        <div className="flex items-center gap-0.5 border-l border-[#1b2735] pl-1.5">
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-[#0f141b] hover:text-[#79bbff]"
            onClick={() => openQuery(connection)}
            title="New Query"
          >
            <IconBolt />
          </button>
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-[#0f141b] hover:text-rose-400"
            onClick={() => closeConnection(connection.id)}
            title="Disconnect"
          >
            <IconClose />
          </button>
        </div>
      </div>

      {/* ── Level 2 & 3: Databases / Tables ── */}
      {expanded && (
        <div className="px-2.5 pb-2.5 pt-2">
          {connection.databases && connection.databases.length > 0 ? (
            connection.databases.map(database => (
              <DatabaseItem
                key={`${connection.id}::${database.name}`}
                connection={connection}
                database={database}
                onDatabaseContextMenu={onDatabaseContextMenu}
                onTableContextMenu={onTableContextMenu}
              />
            ))
          ) : connection.tables.length === 0 ? (
            <div className="py-3 text-center text-[11px] italic text-slate-600">No tables found</div>
          ) : (
            <TableList connection={connection} tables={connection.tables} onTableContextMenu={onTableContextMenu} />
          )}
        </div>
      )}
    </section>
  )
})

const SavedConnectionItem = memo(function SavedConnectionItem({
  saved,
  activating,
  onActivate,
  onContextMenu,
}: {
  saved: SavedConnection
  activating: boolean
  onActivate: (id: string) => Promise<void>
  onContextMenu: (event: React.MouseEvent, saved: SavedConnection) => void
}) {
  const handleActivate = useCallback(async () => {
    if (activating) return
    await onActivate(saved.id)
  }, [activating, onActivate, saved.id])

  return (
    <section className="overflow-hidden rounded-xl border border-[#1b2735] bg-[#0d1117] shadow-[0_4px_16px_rgba(0,0,0,0.18)]">
      <div className="flex items-center gap-1.5 bg-[#111820] px-2 py-1.5">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-[#0f141b]"
          disabled={activating}
          onClick={handleActivate}
          onContextMenu={event => onContextMenu(event, saved)}
        >
          <span className="relative inline-flex h-4 w-4 flex-shrink-0 items-center justify-center text-slate-500">
            <IconDatabase tone="#79bbff" />
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-200">
            {activating ? 'Connecting...' : saved.label}
          </span>
          <span className="flex-shrink-0 text-slate-600">
            <IconChevron open={false} />
          </span>
        </button>
      </div>
    </section>
  )
})

export default function ExplorerSidebar() {
  const connections = useAppStore(s => s.connections)
  const savedConnections = useAppStore(s => s.savedConnections)
  const restoreSavedConnections = useAppStore(s => s.restoreSavedConnections)
  const openEditConnectionModal = useAppStore(s => s.openEditConnectionModal)
  const openEditSavedConnectionModal = useAppStore(s => s.openEditSavedConnectionModal)
  const deleteSavedConnection = useAppStore(s => s.deleteSavedConnection)
  const openCreateTable = useAppStore(s => s.openCreateTable)
  const openEditTable = useAppStore(s => s.openEditTable)
  const deleteTable = useAppStore(s => s.deleteTable)
  const activateSavedConnection = useAppStore(s => s.activateSavedConnection)
  const activeSavedConnectionId = connections[0]?.config ? getSavedConnectionId(connections[0].config) : null
  const hasActiveSavedEntry = activeSavedConnectionId
    ? savedConnections.some(saved => saved.id === activeSavedConnectionId)
    : false
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; connectionId: string; connection: Connection; includeAddTable?: boolean } | null>(null)
  const [savedContextMenu, setSavedContextMenu] = useState<{ x: number; y: number; saved: SavedConnection } | null>(null)
  const [databaseContextMenu, setDatabaseContextMenu] = useState<{ x: number; y: number; connection: Connection; databaseName?: string; schemaName?: string } | null>(null)
  const [tableContextMenu, setTableContextMenu] = useState<{ x: number; y: number; connection: Connection; tableName: string; databaseName?: string; schemaName?: string; itemType: 'table' | 'view' } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ connection: Connection; tableName: string; databaseName?: string; schemaName?: string; itemType: 'table' | 'view' } | null>(null)
  const [activatingSavedId, setActivatingSavedId] = useState<string | null>(null)

  useEffect(() => {
    void restoreSavedConnections()
  }, [restoreSavedConnections])

  useEffect(() => {
    const closeMenu = () => {
      setContextMenu(null)
      setSavedContextMenu(null)
      setDatabaseContextMenu(null)
      setTableContextMenu(null)
      setDeleteTarget(null)
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setContextMenu(null)
        setSavedContextMenu(null)
        setDatabaseContextMenu(null)
        setTableContextMenu(null)
        setDeleteTarget(null)
      }
    }

    window.addEventListener('click', closeMenu)
    window.addEventListener('blur', closeMenu)
    window.addEventListener('keydown', handleEscape)
    return () => {
      window.removeEventListener('click', closeMenu)
      window.removeEventListener('blur', closeMenu)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [])

  const handleToggle = useCallback((id: string) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }))
  }, [])

  const handleActivateSaved = useCallback(async (id: string) => {
    setActivatingSavedId(id)
    try {
      const connection = await activateSavedConnection(id)
      if (connection) {
        setExpanded({ [connection.id]: true })
      }
    } finally {
      setActivatingSavedId(null)
    }
  }, [activateSavedConnection])

  const handleConnectionContextMenu = useCallback((event: React.MouseEvent, payload: { connectionId: string; connection: Connection; includeAddTable?: boolean }) => {
    event.preventDefault()
    setSavedContextMenu(null)
    setDatabaseContextMenu(null)
    setTableContextMenu(null)
    setContextMenu({
      x: Math.min(event.clientX, window.innerWidth - 196),
      y: Math.min(event.clientY, window.innerHeight - 120),
      ...payload,
    })
  }, [])

  const handleSavedConnectionContextMenu = useCallback((event: React.MouseEvent, saved: SavedConnection) => {
    event.preventDefault()
    event.stopPropagation()
    setContextMenu(null)
    setDatabaseContextMenu(null)
    setTableContextMenu(null)
    setSavedContextMenu({
      x: Math.min(event.clientX, window.innerWidth - 196),
      y: Math.min(event.clientY, window.innerHeight - 128),
      saved,
    })
  }, [])

  const handleDatabaseContextMenu = useCallback((event: React.MouseEvent, payload: { connection: Connection; databaseName?: string; schemaName?: string }) => {
    event.preventDefault()
    event.stopPropagation()
    setContextMenu(null)
    setSavedContextMenu(null)
    setTableContextMenu(null)
    setDatabaseContextMenu({
      x: Math.min(event.clientX, window.innerWidth - 196),
      y: Math.min(event.clientY, window.innerHeight - 88),
      ...payload,
    })
  }, [])

  const handleTableContextMenu = useCallback((event: React.MouseEvent, payload: { connection: Connection; tableName: string; databaseName?: string; schemaName?: string; itemType: 'table' | 'view' }) => {
    event.preventDefault()
    event.stopPropagation()
    setContextMenu(null)
    setSavedContextMenu(null)
    setDatabaseContextMenu(null)
    setTableContextMenu({
      x: Math.min(event.clientX, window.innerWidth - 196),
      y: Math.min(event.clientY, window.innerHeight - 128),
      ...payload,
    })
  }, [])

  return (
    <aside className="flex w-[270px] min-w-[270px] flex-col overflow-hidden border-r border-[#1b2735] bg-[#0f141b]">
      {/* Sidebar header */}
      <div className="border-b border-[#1b2735] px-4 py-3">
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-600">Connections</div>
        <div className="mt-0.5 text-[11px] text-slate-500">
          <span className="text-emerald-500">{connections.length}</span> active
          <span className="mx-1.5 text-slate-700">·</span>
          {savedConnections.length} saved
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        <div className="space-y-2">
        {savedConnections.length === 0 && connections.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#1e2d40] bg-[#0d1117] px-5 py-8 text-center">
            <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[#131a24] text-[#4a9edd]">
              <IconDatabase tone="#4a9edd" />
            </div>
            <div className="mt-3 text-sm font-semibold text-slate-200">No connections yet</div>
            <div className="mt-1.5 text-xs leading-5 text-slate-500">Create a new connection to start exploring your databases.</div>
          </div>
        ) : (
          savedConnections.map(saved => {
            const activeConnection = activeSavedConnectionId === saved.id ? connections[0] : null
            return activeConnection ? (
              <ConnectionItem
                key={saved.id}
                connection={activeConnection}
                expanded={!!expanded[activeConnection.id]}
                onToggle={handleToggle}
                onConnectionContextMenu={handleConnectionContextMenu}
                onDatabaseContextMenu={handleDatabaseContextMenu}
                onTableContextMenu={handleTableContextMenu}
              />
            ) : (
              <SavedConnectionItem
                key={saved.id}
                saved={saved}
                activating={activatingSavedId === saved.id}
                onActivate={handleActivateSaved}
                onContextMenu={handleSavedConnectionContextMenu}
              />
            )
          })
        )}
        {savedConnections.length === 0 && connections.map(connection => (
          <ConnectionItem
            key={connection.id}
            connection={connection}
            expanded={!!expanded[connection.id]}
            onToggle={handleToggle}
            onConnectionContextMenu={handleConnectionContextMenu}
            onDatabaseContextMenu={handleDatabaseContextMenu}
            onTableContextMenu={handleTableContextMenu}
          />
        ))}
        {savedConnections.length > 0 && connections[0] && !hasActiveSavedEntry && !activatingSavedId && (
          <ConnectionItem
            key={connections[0].id}
            connection={connections[0]}
            expanded={!!expanded[connections[0].id]}
            onToggle={handleToggle}
            onConnectionContextMenu={handleConnectionContextMenu}
            onDatabaseContextMenu={handleDatabaseContextMenu}
            onTableContextMenu={handleTableContextMenu}
          />
        )}
        </div>
      </div>

      {/* Context menu — Saved connection */}
      {savedContextMenu && (
        <div
          className="fixed z-[1200] min-w-[180px] overflow-hidden rounded-2xl border border-[#1b2735] bg-[#0f161f] p-1.5 shadow-[0_20px_50px_rgba(0,0,0,0.35)]"
          style={{ left: savedContextMenu.x, top: savedContextMenu.y }}
          onClick={event => event.stopPropagation()}
          onContextMenu={event => event.preventDefault()}
        >
          <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            Saved Tab
          </div>
          <button
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-[#16202c]"
            onClick={() => {
              openEditSavedConnectionModal(savedContextMenu.saved.id)
              setSavedContextMenu(null)
            }}
          >
            <IconEdit />
            <span>Edit</span>
          </button>
          <button
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-rose-300 transition hover:bg-[#2a1820] hover:text-rose-200"
            onClick={() => {
              deleteSavedConnection(savedContextMenu.saved.id)
              setSavedContextMenu(null)
            }}
          >
            <IconTrash />
            <span>Delete</span>
          </button>
        </div>
      )}

      {/* Context menu — Connection */}
      {contextMenu && (
        <div
          className="fixed z-[1200] min-w-[180px] overflow-hidden rounded-2xl border border-[#1b2735] bg-[#0f161f] p-1.5 shadow-[0_20px_50px_rgba(0,0,0,0.35)]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={event => event.stopPropagation()}
          onContextMenu={event => event.preventDefault()}
        >
          <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            Connection
          </div>
          <button
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-[#16202c]"
            onClick={() => {
              openEditConnectionModal(contextMenu.connectionId)
              setContextMenu(null)
            }}
          >
            <IconEdit />
            <span>Edit</span>
          </button>
          {contextMenu.includeAddTable && (
            <button
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-[#16202c]"
              onClick={() => {
                openCreateTable(contextMenu.connection)
                setContextMenu(null)
              }}
            >
              <IconPlus />
              <span>Add Table</span>
            </button>
          )}
        </div>
      )}

      {/* Context menu — Database */}
      {databaseContextMenu && (
        <div
          className="fixed z-[1200] min-w-[180px] overflow-hidden rounded-2xl border border-[#1b2735] bg-[#0f161f] p-1.5 shadow-[0_20px_50px_rgba(0,0,0,0.35)]"
          style={{ left: databaseContextMenu.x, top: databaseContextMenu.y }}
          onClick={event => event.stopPropagation()}
          onContextMenu={event => event.preventDefault()}
        >
          <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            Database
          </div>
          <button
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-[#16202c]"
            onClick={() => {
              openCreateTable(databaseContextMenu.connection, databaseContextMenu.databaseName, databaseContextMenu.schemaName)
              setDatabaseContextMenu(null)
            }}
          >
            <IconPlus />
            <span>Add Table</span>
          </button>
        </div>
      )}

      {/* Context menu — Table */}
      {tableContextMenu && (
        <div
          className="fixed z-[1200] min-w-[180px] overflow-hidden rounded-2xl border border-[#1b2735] bg-[#0f161f] p-1.5 shadow-[0_20px_50px_rgba(0,0,0,0.35)]"
          style={{ left: tableContextMenu.x, top: tableContextMenu.y }}
          onClick={event => event.stopPropagation()}
          onContextMenu={event => event.preventDefault()}
        >
          <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            Table
          </div>
          <button
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-[#16202c]"
            onClick={() => {
              openEditTable(tableContextMenu.connection, tableContextMenu.tableName, tableContextMenu.databaseName, tableContextMenu.schemaName)
              setTableContextMenu(null)
            }}
          >
            <IconEdit />
            <span>Edit Table</span>
          </button>
          <button
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-rose-300 transition hover:bg-[#2a1820] hover:text-rose-200"
            onClick={() => {
              setDeleteTarget({
                connection: tableContextMenu.connection,
                tableName: tableContextMenu.tableName,
                databaseName: tableContextMenu.databaseName,
                schemaName: tableContextMenu.schemaName,
                itemType: tableContextMenu.itemType,
              })
              setTableContextMenu(null)
            }}
          >
            <IconTrash />
            <span>{tableContextMenu.itemType === 'view' ? 'Delete View' : 'Delete Table'}</span>
          </button>
        </div>
      )}

      {deleteTarget && (
        <DeleteTableConfirm
          tableName={deleteTarget.schemaName ? `${deleteTarget.schemaName}.${deleteTarget.tableName}` : deleteTarget.tableName}
          itemType={deleteTarget.itemType}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => {
            void deleteTable(
              deleteTarget.connection,
              deleteTarget.tableName,
              deleteTarget.databaseName,
              deleteTarget.schemaName,
              deleteTarget.itemType,
            )
            setDeleteTarget(null)
          }}
        />
      )}
    </aside>
  )
}
