import { useState, useCallback, memo } from 'react'
import useAppStore from '../store/appStore'
import type { Connection, DatabaseNode } from '../types'

// ── Icons ─────────────────────────────────────────────────────────────────────
const IconDB = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
    <ellipse cx="8" cy="4" rx="6" ry="2.5" opacity=".7"/>
    <path d="M2 4v3c0 1.38 2.69 2.5 6 2.5S14 8.38 14 7V4c0 1.38-2.69 2.5-6 2.5S2 5.38 2 4z" opacity=".85"/>
    <path d="M2 7v3c0 1.38 2.69 2.5 6 2.5S14 11.38 14 10V7c0 1.38-2.69 2.5-6 2.5S2 8.38 2 7z"/>
    <path d="M2 10v2c0 1.38 2.69 2.5 6 2.5S14 13.38 14 12v-2c0 1.38-2.69 2.5-6 2.5S2 11.38 2 10z" opacity=".7"/>
  </svg>
)
const IconTable = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" opacity=".75">
    <rect x="1" y="1" width="14" height="3" rx="1"/>
    <rect x="1" y="6" width="6" height="3" rx=".5"/>
    <rect x="9" y="6" width="6" height="3" rx=".5"/>
    <rect x="1" y="11" width="6" height="3" rx=".5"/>
    <rect x="9" y="11" width="6" height="3" rx=".5"/>
  </svg>
)
const IconView = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" opacity=".75">
    <path d="M8 3C4.5 3 1.5 5.5 0 8c1.5 2.5 4.5 5 8 5s6.5-2.5 8-5c-1.5-2.5-4.5-5-8-5zm0 8a3 3 0 110-6 3 3 0 010 6zm0-5a2 2 0 100 4 2 2 0 000-4z"/>
  </svg>
)
const IconChevron = ({ open }: { open: boolean }) => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"
    style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>
    <path d="M3 2l4 3-4 3z"/>
  </svg>
)
const IconClose = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <path d="M2 2l6 6M8 2l-6 6"/>
  </svg>
)

// ── TableList ─────────────────────────────────────────────────────────────────
const TableList = memo(function TableList({
  connection,
  tables,
  databaseName,
}: {
  connection: Connection
  tables: Connection['tables']
  databaseName?: string
}) {
  const selectTable  = useAppStore(s => s.selectTable)
  const openQuery    = useAppStore(s => s.openQuery)
  const activeTabId  = useAppStore(s => s.activeTabId)
  const tabs         = useAppStore(s => s.tabs)

  const activeTableKey = (() => {
    const activeTab = tabs.find(t => t.id === activeTabId)
    if (!activeTab || activeTab.type !== 'table') return null
    const scopedName = activeTab.database ? `${activeTab.database}.${activeTab.tableName}` : activeTab.tableName
    return `${activeTab.connectionId}::${scopedName}`
  })()

  return (
    <div>
      {tables.map(t => {
        const scopedName = databaseName ? `${databaseName}.${t.name}` : t.name
        const key    = `${connection.id}::${scopedName}`
        const isView = t.type === 'view'
        return (
          <div
            key={t.name}
            className={`tree-item tbl-item ${activeTableKey === key ? 'active' : ''}`}
            onClick={() => selectTable(connection, t.name, databaseName)}
          >
            {isView ? <IconView /> : <IconTable />}
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {t.name}
            </span>
            {isView && <span style={{ fontSize: 10, color: 'var(--purple)', opacity: 0.8 }}>VIEW</span>}
          </div>
        )
      })}
      <div
        className="tree-item tbl-item"
        style={{ color: 'var(--accent)', opacity: 0.75, marginTop: 2 }}
        onClick={() => openQuery(connection)}
      >
        <span style={{ fontSize: 11 }}>▶</span>
        <span style={{ fontSize: 11.5 }}>New Query</span>
      </div>
    </div>
  )
})

const DatabaseItem = memo(function DatabaseItem({
  connection,
  database,
}: {
  connection: Connection
  database: DatabaseNode
}) {
  const loadDatabaseTables = useAppStore(s => s.loadDatabaseTables)
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)

  const toggle = useCallback(async () => {
    const nextExpanded = !expanded
    setExpanded(nextExpanded)
    if (nextExpanded && database.tables === null && !loading) {
      setLoading(true)
      await loadDatabaseTables(connection.id, database.name)
      setLoading(false)
    }
  }, [connection.id, database.name, database.tables, expanded, loadDatabaseTables, loading])

  return (
    <div style={{ marginLeft: 12 }}>
      <div className="tree-item tbl-item" onClick={toggle}>
        <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}><IconChevron open={expanded} /></span>
        <span style={{ color: 'var(--accent)', flexShrink: 0 }}><IconDB /></span>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {database.name}
        </span>
      </div>
      {expanded && (
        <div className="fade-in">
          {loading ? (
            <div style={{ padding: '6px 28px', fontSize: 11.5, color: 'var(--text-muted)', fontStyle: 'italic' }}>Loading tables...</div>
          ) : !database.tables || database.tables.length === 0 ? (
            <div style={{ padding: '6px 28px', fontSize: 11.5, color: 'var(--text-muted)', fontStyle: 'italic' }}>No tables found</div>
          ) : (
            <TableList connection={connection} tables={database.tables} databaseName={database.name} />
          )}
        </div>
      )}
    </div>
  )
})

// ── ConnectionItem ────────────────────────────────────────────────────────────
interface ConnectionItemProps {
  connection: Connection
  expanded: boolean
  onToggle: (id: string) => void
}

const ConnectionItem = memo(function ConnectionItem({ connection, expanded, onToggle }: ConnectionItemProps) {
  const closeConnection = useAppStore(s => s.closeConnection)
  const openQuery       = useAppStore(s => s.openQuery)

  return (
    <div style={{ marginBottom: 2 }}>
      <div className="tree-item" style={{ padding: '5px 8px', gap: 5 }} onClick={() => onToggle(connection.id)}>
        <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}><IconChevron open={expanded} /></span>
        <span style={{ color: 'var(--green)', flexShrink: 0 }}><IconDB /></span>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12.5, fontWeight: 500, color: 'var(--text-primary)' }}>
          {connection.name}
        </span>
        <span title="New Query" style={{ color: 'var(--text-muted)', flexShrink: 0, padding: '0 3px', fontSize: 11 }}
          onClick={e => { e.stopPropagation(); openQuery(connection) }}>▶</span>
        <span title="Disconnect" style={{ color: 'var(--text-muted)', flexShrink: 0, padding: '0 3px' }}
          onClick={e => { e.stopPropagation(); closeConnection(connection.id) }}>
          <IconClose />
        </span>
      </div>

      {expanded && (
        <div className="fade-in">
          {connection.databases && connection.databases.length > 0 ? (
            connection.databases.map(database => (
              <DatabaseItem
                key={`${connection.id}::${database.name}`}
                connection={connection}
                database={database}
              />
            ))
          ) : connection.tables.length === 0 ? (
            <div style={{ padding: '6px 28px', fontSize: 11.5, color: 'var(--text-muted)', fontStyle: 'italic' }}>No tables found</div>
          ) : (
            <TableList connection={connection} tables={connection.tables} />
          )}
        </div>
      )}
    </div>
  )
})

// ── Sidebar ───────────────────────────────────────────────────────────────────
export default function Sidebar() {
  const connections      = useAppStore(s => s.connections)
  const openDatabase     = useAppStore(s => s.openDatabase)
  const createDatabase   = useAppStore(s => s.createDatabase)
  const openDemo         = useAppStore(s => s.openDemo)
  const openConnectModal = useAppStore(s => s.openConnectModal)

  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const handleToggle = useCallback((id: string) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }))
  }, [])

  const handleOpenDatabase = useCallback(async () => {
    const conn = await openDatabase()
    if (conn) setExpanded(prev => ({ ...prev, [conn.id]: true }))
  }, [openDatabase])

  const handleCreateDatabase = useCallback(async () => {
    const conn = await createDatabase()
    if (conn) setExpanded(prev => ({ ...prev, [conn.id]: true }))
  }, [createDatabase])

  const handleOpenDemo = useCallback(async () => {
    const conn = await openDemo()
    if (conn) setExpanded(prev => ({ ...prev, [conn.id]: true }))
  }, [openDemo])

  return (
    <aside style={{
      width: 240, minWidth: 200, maxWidth: 320,
      background: 'var(--bg-sidebar)',
      borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      <div style={{ padding: '10px 12px 8px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 18 }}>🐱</span>
        <span style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text-primary)', letterSpacing: 0.3 }}>CatDB</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 4px' }}>
        {connections.length === 0 && (
          <div style={{ padding: '20px 12px', textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🗄️</div>
            <p style={{ color: 'var(--text-muted)', fontSize: 11.5, lineHeight: 1.5 }}>
              No connections open.<br />Open or create a database.
            </p>
          </div>
        )}
        {connections.map(conn => (
          <ConnectionItem
            key={conn.id}
            connection={conn}
            expanded={!!expanded[conn.id]}
            onToggle={handleToggle}
          />
        ))}
      </div>

      <div style={{ padding: '8px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={openConnectModal}>
          🔌 New Connection
        </button>
        <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center' }} onClick={handleOpenDatabase}>
          📂 Open SQLite File
        </button>
        <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center' }} onClick={handleCreateDatabase}>
          ✨ New SQLite File
        </button>
        <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center', fontSize: 11 }} onClick={handleOpenDemo}>
          🐾 Load Demo DB
        </button>
      </div>
    </aside>
  )
}
