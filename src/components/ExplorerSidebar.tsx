import { useState, useCallback, memo, useEffect } from 'react'
import useAppStore from '../store/appStore'
import type { Connection, DatabaseNode } from '../types'

const api = window.electronAPI

const IconDatabase = ({ tone = 'currentColor' }: { tone?: string }) => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke={tone} strokeWidth="1.2">
    <ellipse cx="8" cy="3.6" rx="5.5" ry="2.1" />
    <path d="M2.5 3.6v3.3c0 1.16 2.46 2.1 5.5 2.1s5.5-.94 5.5-2.1V3.6" />
    <path d="M2.5 6.9v3.3c0 1.16 2.46 2.1 5.5 2.1s5.5-.94 5.5-2.1V6.9" />
  </svg>
)

const IconGrid = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
    <rect x="2" y="2" width="12" height="12" rx="1.6" />
    <path d="M2 6h12M2 10h12M6 2v12M10 2v12" />
  </svg>
)

const IconEye = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
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

function AddTableModal({
  connection,
  databaseName,
  schemaName,
  onClose,
  onCreated,
}: {
  connection: Connection
  databaseName?: string
  schemaName?: string
  onClose: () => void
  onCreated: () => Promise<void>
}) {
  const [tableName, setTableName] = useState('')
  const [columnsSql, setColumnsSql] = useState(
    connection.dbType === 'postgresql'
      ? 'id SERIAL PRIMARY KEY,\nname TEXT NOT NULL,\ncreated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
      : connection.dbType === 'mysql'
        ? 'id INT AUTO_INCREMENT PRIMARY KEY,\nname VARCHAR(255) NOT NULL,\ncreated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
        : 'id INTEGER PRIMARY KEY AUTOINCREMENT,\nname TEXT NOT NULL,\ncreated_at TEXT DEFAULT CURRENT_TIMESTAMP'
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = useCallback(async () => {
    setSaving(true)
    setError(null)
    const result = await api.createTable(connection.id, tableName, columnsSql, databaseName, schemaName)
    if (result.error) {
      setError(result.error)
      setSaving(false)
      return
    }
    await onCreated()
    setSaving(false)
    onClose()
  }, [columnsSql, connection.id, databaseName, onClose, onCreated, schemaName, tableName])

  return (
    <div className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/55 p-6 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-xl rounded-[28px] border border-[#1b2735] bg-[#0f141b] shadow-[0_30px_80px_rgba(0,0,0,0.4)]" onClick={event => event.stopPropagation()}>
        <div className="border-b border-[#1b2735] px-6 py-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Add Table</div>
          <h3 className="mt-2 text-xl font-semibold text-slate-50">Create a new table</h3>
          <p className="mt-1 text-sm text-slate-500">
            {databaseName ? `Database: ${databaseName}` : 'Current connection'}
            {schemaName ? ` • Schema: ${schemaName}` : ''}
          </p>
        </div>

        <div className="grid gap-5 px-6 py-6">
          <label className="flex flex-col gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Table Name</span>
            <input
              value={tableName}
              onChange={event => setTableName(event.target.value)}
              placeholder="new_table"
              autoComplete="off"
              className="h-11 rounded-2xl border border-[#1b2735] bg-[#0b1118] px-4 text-sm text-slate-100 outline-none transition focus:border-[#005FB8]"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Columns</span>
            <textarea
              value={columnsSql}
              onChange={event => setColumnsSql(event.target.value)}
              rows={8}
              className="min-h-[190px] rounded-2xl border border-[#1b2735] bg-[#0b1118] px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-[#005FB8]"
            />
          </label>

          {error && (
            <div className="rounded-2xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-[#1b2735] px-6 py-5">
          <button type="button" onClick={onClose} className="rounded-2xl border border-[#1b2735] bg-[#121821] px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:border-[#2d4f70]">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={saving}
            className="rounded-2xl bg-[#005FB8] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0a6ccb] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Creating...' : 'Create Table'}
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
  onTableContextMenu: (event: React.MouseEvent, payload: { connection: Connection; databaseName?: string; schemaName?: string }) => void
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
    <div className="space-y-1 pt-2">
      {tables.map(table => {
        const scopedName = databaseName ? `${databaseName}.${table.name}` : table.name
        const key = `${connection.id}::${scopedName}`
        const isView = table.type === 'view'

        return (
          <button
            key={scopedName}
            type="button"
            className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition ${
              activeTableKey === key
                ? 'bg-[#102235] text-[#79bbff]'
                : 'text-slate-400 hover:bg-[#121821] hover:text-slate-200'
            }`}
            onClick={() => selectTable(connection, table.name, databaseName)}
            onContextMenu={event => onTableContextMenu(event, {
              connection,
              databaseName,
              schemaName: table.schema,
            })}
          >
            <span className="inline-flex h-4 w-4 items-center justify-center">{isView ? <IconEye /> : <IconGrid />}</span>
            <span className="min-w-0 flex-1 truncate">{table.name}</span>
          </button>
        )
      })}
      <button type="button" className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-[#79bbff] transition hover:bg-[#102235]" onClick={() => openQuery(connection)}>
        <span className="inline-flex h-4 w-4 items-center justify-center"><IconBolt /></span>
        <span>New Query</span>
      </button>
    </div>
  )
})

const DatabaseItem = memo(function DatabaseItem({
  connection,
  database,
  onTableContextMenu,
}: {
  connection: Connection
  database: DatabaseNode
  onTableContextMenu: (event: React.MouseEvent, payload: { connection: Connection; databaseName?: string; schemaName?: string }) => void
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
    <div className="pt-2">
      <button type="button" className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-slate-400 transition hover:bg-[#121821] hover:text-slate-200" onClick={handleToggle}>
        <span className="inline-flex h-3 w-3 items-center justify-center text-slate-500"><IconChevron open={expanded} /></span>
        <span className="inline-flex h-4 w-4 items-center justify-center text-[#79bbff]"><IconDatabase tone="#79bbff" /></span>
        <span className="min-w-0 flex-1 truncate">{database.name}</span>
        <span className="rounded-full bg-[#102235] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#79bbff]">DB</span>
      </button>
      {expanded && (
        <div>
          {loading ? (
            <div className="px-3 py-2 text-xs italic text-slate-500">Loading tables...</div>
          ) : !database.tables || database.tables.length === 0 ? (
            <div className="px-3 py-2 text-xs italic text-slate-500">No tables found</div>
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
  onContextMenu,
  onTableContextMenu,
}: {
  connection: Connection
  expanded: boolean
  onToggle: (id: string) => void
  onContextMenu: (event: React.MouseEvent, connectionId: string) => void
  onTableContextMenu: (event: React.MouseEvent, payload: { connection: Connection; databaseName?: string; schemaName?: string }) => void
}) {
  const closeConnection = useAppStore(s => s.closeConnection)
  const openQuery = useAppStore(s => s.openQuery)

  return (
    <section className="rounded-[22px] border border-[#1b2735] bg-[#121821] p-2 shadow-[0_18px_45px_rgba(0,0,0,0.22)]">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-sm text-slate-200 transition hover:bg-[#0f141b]"
          onClick={() => onToggle(connection.id)}
          onContextMenu={event => onContextMenu(event, connection.id)}
        >
          <span className="inline-flex h-3 w-3 items-center justify-center text-slate-500"><IconChevron open={expanded} /></span>
          <span className="inline-flex h-4 w-4 items-center justify-center text-[#79bbff]"><IconDatabase tone="#79bbff" /></span>
          <span className="min-w-0 flex-1 truncate font-medium">{connection.name}</span>
        </button>
        <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-500 transition hover:bg-[#0f141b] hover:text-[#79bbff]" onClick={() => openQuery(connection)} title="New Query">
          <IconBolt />
        </button>
        <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-500 transition hover:bg-[#0f141b] hover:text-rose-400" onClick={() => closeConnection(connection.id)} title="Disconnect">
          <IconClose />
        </button>
      </div>

      {expanded && (
        <div>
          {connection.databases && connection.databases.length > 0 ? (
            connection.databases.map(database => (
              <DatabaseItem key={`${connection.id}::${database.name}`} connection={connection} database={database} onTableContextMenu={onTableContextMenu} />
            ))
          ) : connection.tables.length === 0 ? (
            <div className="px-3 py-2 text-xs italic text-slate-500">No tables found</div>
          ) : (
            <TableList connection={connection} tables={connection.tables} onTableContextMenu={onTableContextMenu} />
          )}
        </div>
      )}
    </section>
  )
})

export default function ExplorerSidebar() {
  const connections = useAppStore(s => s.connections)
  const savedConnections = useAppStore(s => s.savedConnections)
  const restoreSavedConnections = useAppStore(s => s.restoreSavedConnections)
  const openConnectModal = useAppStore(s => s.openConnectModal)
  const openEditConnectionModal = useAppStore(s => s.openEditConnectionModal)
  const refreshConnectionTables = useAppStore(s => s.refreshConnectionTables)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; connectionId: string } | null>(null)
  const [tableContextMenu, setTableContextMenu] = useState<{ x: number; y: number; connection: Connection; databaseName?: string; schemaName?: string } | null>(null)
  const [createTableTarget, setCreateTableTarget] = useState<{ connection: Connection; databaseName?: string; schemaName?: string } | null>(null)

  useEffect(() => {
    void restoreSavedConnections()
  }, [restoreSavedConnections])

  useEffect(() => {
    const closeMenu = () => {
      setContextMenu(null)
      setTableContextMenu(null)
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setContextMenu(null)
        setTableContextMenu(null)
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

  const handleContextMenu = useCallback((event: React.MouseEvent, connectionId: string) => {
    event.preventDefault()
    setTableContextMenu(null)
    setContextMenu({
      x: Math.min(event.clientX, window.innerWidth - 196),
      y: Math.min(event.clientY, window.innerHeight - 72),
      connectionId,
    })
  }, [])

  const handleTableContextMenu = useCallback((event: React.MouseEvent, payload: { connection: Connection; databaseName?: string; schemaName?: string }) => {
    event.preventDefault()
    event.stopPropagation()
    setContextMenu(null)
    setTableContextMenu({
      x: Math.min(event.clientX, window.innerWidth - 196),
      y: Math.min(event.clientY, window.innerHeight - 72),
      ...payload,
    })
  }, [])

  return (
    <aside className="flex w-[270px] min-w-[270px] flex-col overflow-hidden border-r border-[#1b2735] bg-[#0f141b]">

      <div className="px-5 pt-2">
        <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Active hierarchy</div>
        <div className="mt-2 text-xs text-slate-500">{connections.length} connected · {savedConnections.length} saved</div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {connections.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-[#244466] bg-[#121821] px-5 py-8 text-center">
            <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-3xl bg-[#102235] text-[#79bbff]">
              <IconDatabase tone="#79bbff" />
            </div>
            <div className="mt-4 text-base font-semibold text-slate-100">No connections yet</div>
            <div className="mt-2 text-sm leading-6 text-slate-500">Create a new connection to start exploring your databases.</div>
          </div>
        ) : (
          connections.map(connection => (
            <ConnectionItem
              key={connection.id}
              connection={connection}
              expanded={!!expanded[connection.id]}
              onToggle={handleToggle}
              onContextMenu={handleContextMenu}
              onTableContextMenu={handleTableContextMenu}
            />
          ))
        )}
      </div>

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
        </div>
      )}

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
              setCreateTableTarget({
                connection: tableContextMenu.connection,
                databaseName: tableContextMenu.databaseName,
                schemaName: tableContextMenu.schemaName,
              })
              setTableContextMenu(null)
            }}
          >
            <IconPlus />
            <span>Add Table</span>
          </button>
        </div>
      )}

      {createTableTarget && (
        <AddTableModal
          connection={createTableTarget.connection}
          databaseName={createTableTarget.databaseName}
          schemaName={createTableTarget.schemaName}
          onClose={() => setCreateTableTarget(null)}
          onCreated={async () => {
            await refreshConnectionTables(createTableTarget.connection.id, createTableTarget.databaseName)
          }}
        />
      )}
    </aside>
  )
}
