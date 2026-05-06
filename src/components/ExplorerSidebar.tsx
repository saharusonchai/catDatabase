import { useState, useCallback, memo, useEffect } from 'react'
import useAppStore from '../store/appStore'
import type { Connection, ConnectionConfig, DatabaseNode, ExportScopeRequest, ImportScopeRequest, SavedConnection } from '../types'

const api = window.electronAPI

const SIDEBAR_WIDTH_KEY = 'catdb_sidebar_width'
const SIDEBAR_DEFAULT_WIDTH = 248
const SIDEBAR_MIN_WIDTH = 220
const SIDEBAR_MAX_WIDTH = 520

const clampSidebarWidth = (width: number) => (
  Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width))
)

const loadSidebarWidth = () => {
  if (typeof window === 'undefined') return SIDEBAR_DEFAULT_WIDTH
  const saved = Number(window.localStorage.getItem(SIDEBAR_WIDTH_KEY))
  return Number.isFinite(saved) ? clampSidebarWidth(saved) : SIDEBAR_DEFAULT_WIDTH
}

const Ic = ({ size = 14, sw = 1.6, children }: { size?: number; sw?: number; children: React.ReactNode }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
)

const IconDB = (p: { size?: number; sw?: number }) => (
  <Ic {...p}><ellipse cx="12" cy="5" rx="8" ry="2.5" /><path d="M4 5v6c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5V5" /><path d="M4 11v6c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5v-6" /></Ic>
)
const IconTable = (p: { size?: number; sw?: number }) => (
  <Ic {...p}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M3 15h18M9 3v18M15 3v18" /></Ic>
)
const IconEye = (p: { size?: number; sw?: number }) => (
  <Ic {...p}><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></Ic>
)
const IconChevD = ({ open, size = 11, sw = 2.2 }: { open: boolean; size?: number; sw?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={sw}
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.12s ease' }}
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
)
const IconQuery = (p: { size?: number; sw?: number }) => (
  <Ic {...p}><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6" /><path d="m9 14 2 2 4-4" /></Ic>
)
const IconClose = (p: { size?: number; sw?: number }) => (
  <Ic {...p}><path d="M18 6 6 18M6 6l12 12" /></Ic>
)
const IconEdit = (p: { size?: number; sw?: number }) => (
  <Ic {...p}><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" /></Ic>
)
const IconPlus = (p: { size?: number; sw?: number }) => (
  <Ic {...p}><path d="M12 5v14M5 12h14" /></Ic>
)
const IconTrash = (p: { size?: number; sw?: number }) => (
  <Ic {...p}><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /></Ic>
)
const IconExport = (p: { size?: number; sw?: number }) => (
  <Ic {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></Ic>
)
const IconImport = (p: { size?: number; sw?: number }) => (
  <Ic {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></Ic>
)
const IconBolt = (p: { size?: number; sw?: number }) => (
  <Ic {...p}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></Ic>
)
const IconServer = (p: { size?: number; sw?: number }) => (
  <Ic {...p}><rect x="2" y="2" width="20" height="8" rx="2" /><rect x="2" y="14" width="20" height="8" rx="2" /><line x1="6" y1="6" x2="6.01" y2="6" /><line x1="6" y1="18" x2="6.01" y2="18" /></Ic>
)

const sameConnectionConfig = (left?: ConnectionConfig, right?: ConnectionConfig) => {
  if (!left || !right) return false
  return left.dbType === right.dbType &&
    left.host === right.host &&
    left.port === right.port &&
    left.database === right.database &&
    left.username === right.username &&
    left.name === right.name
}

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
        <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700, color: 'var(--red)', letterSpacing: '-0.01em' }}>
          Delete {itemType === 'view' ? 'view' : 'table'} "{tableName}"?
        </h3>
        <p style={{ color: 'var(--tx-2)', margin: '0 0 22px', fontSize: 13, lineHeight: 1.55 }}>
          This action cannot be undone.
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn"
            style={{ background: 'var(--red)', color: '#fff', borderColor: 'var(--red)' }}
            onClick={onConfirm}
          >
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
    <div style={{ paddingBottom: 4 }}>
      {tables.map(table => {
        const scopedName = databaseName ? `${databaseName}.${table.name}` : table.name
        const key = `${connection.id}::${scopedName}`
        const isView = table.type === 'view'
        const isActive = activeTableKey === key

        return (
          <button
            key={scopedName}
            type="button"
            onClick={() => selectTable(connection, table.name, databaseName)}
            onContextMenu={event => onTableContextMenu(event, {
              connection,
              tableName: table.name,
              databaseName,
              schemaName: table.schema,
              itemType: table.type,
            })}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: databaseName ? '6px 10px 6px 44px' : '6px 10px 6px 28px',
              borderRadius: 8,
              border: 0,
              background: isActive ? 'var(--side-active)' : 'transparent',
              color: isActive ? 'var(--accent-fg)' : 'var(--side-tx-2)',
              cursor: 'pointer',
              textAlign: 'left',
              fontSize: 12,
              fontWeight: isActive ? 600 : 400,
              fontFamily: 'var(--mono)',
              transition: 'background 0.12s ease',
            }}
            onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--side-hover)' }}
            onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
          >
            <span style={{ display: 'inline-flex', color: isActive ? 'var(--accent-fg)' : (isView ? 'var(--purple)' : 'var(--side-tx-3)'), flexShrink: 0 }}>
              {isView ? <IconEye size={11} sw={1.6} /> : <IconTable size={11} sw={1.6} />}
            </span>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{table.name}</span>
            {isView && !isActive && (
              <span
                style={{
                  flexShrink: 0,
                  padding: '1px 6px',
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  borderRadius: 4,
                  color: 'var(--purple)',
                  background: 'rgba(108, 92, 246, 0.10)',
                }}
              >
                view
              </span>
            )}
          </button>
        )
      })}

      <button
        type="button"
        onClick={() => openQuery(connection, { database: databaseName })}
        style={{
          marginTop: 2,
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: databaseName ? '6px 10px 6px 44px' : '6px 10px 6px 28px',
          borderRadius: 8,
          border: 0,
          background: 'transparent',
          color: 'var(--side-tx-3)',
          cursor: 'pointer',
          textAlign: 'left',
          fontSize: 12,
          fontFamily: 'var(--mono)',
          transition: 'all 0.12s ease',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = 'var(--side-hover)'
          e.currentTarget.style.color = 'var(--accent-fg)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = 'transparent'
          e.currentTarget.style.color = 'var(--side-tx-3)'
        }}
      >
        <span style={{ display: 'inline-flex', flexShrink: 0 }}><IconBolt size={11} sw={1.6} /></span>
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
    <div>
      <button
        type="button"
        onClick={handleToggle}
        onContextMenu={event => onDatabaseContextMenu(event, { connection, databaseName: database.name })}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 10px 6px 28px',
          borderRadius: 8,
          border: 0,
          background: 'transparent',
          color: 'var(--side-tx-2)',
          cursor: 'pointer',
          textAlign: 'left',
          fontSize: 11.5,
          fontWeight: 500,
          fontFamily: 'var(--mono)',
          transition: 'background 0.12s ease',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--side-hover)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
      >
        <span style={{ color: 'var(--side-tx-3)', display: 'inline-flex', flexShrink: 0 }}>
          <IconChevD open={expanded} size={9} sw={2.4} />
        </span>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{database.name}</span>
        {database.tables && (
          <span style={{ fontSize: 10, color: 'var(--side-tx-3)' }}>{database.tables.length}</span>
        )}
      </button>

      {expanded && (
        <div>
          {loading ? (
            <div style={{ padding: '6px 10px 6px 44px', fontSize: 11, fontStyle: 'italic', color: 'var(--side-tx-3)' }}>
              Loading tables…
            </div>
          ) : !database.tables || database.tables.length === 0 ? (
            <div style={{ padding: '6px 10px 6px 44px', fontSize: 11, fontStyle: 'italic', color: 'var(--side-tx-3)' }}>
              No tables found
            </div>
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
  const dot = 'var(--green)'

  return (
    <div style={{ marginBottom: 2 }}>
      <div
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '0 4px 0 0',
          borderRadius: 10,
          transition: 'background 0.12s ease',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--side-hover)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
      >
        <button
          type="button"
          onClick={() => onToggle(connection.id)}
          onContextMenu={event => onConnectionContextMenu(event, {
            connectionId: connection.id,
            connection,
            includeAddTable: !connection.databases || connection.databases.length === 0,
          })}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            padding: '8px 10px',
            border: 0,
            background: 'transparent',
            cursor: 'pointer',
            textAlign: 'left',
            color: 'var(--side-tx-1)',
            minWidth: 0,
          }}
        >
          <span style={{ color: 'var(--side-tx-3)', display: 'inline-flex', flexShrink: 0 }}>
            <IconChevD open={expanded} size={11} sw={2.2} />
          </span>
          <span style={{ width: 6, height: 6, borderRadius: 99, background: dot, flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {connection.name}
          </span>
        </button>
        <button
          type="button"
          onClick={() => openQuery(connection)}
          title="New Query"
          style={{
            width: 24,
            height: 24,
            borderRadius: 6,
            border: 0,
            background: 'transparent',
            color: 'var(--side-tx-3)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flexShrink: 0,
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent-fg)'; e.currentTarget.style.background = 'var(--surface)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--side-tx-3)'; e.currentTarget.style.background = 'transparent' }}
        >
          <IconBolt size={11} sw={1.7} />
        </button>
        <button
          type="button"
          onClick={() => closeConnection(connection.id)}
          title="Disconnect"
          style={{
            width: 24,
            height: 24,
            borderRadius: 6,
            border: 0,
            background: 'transparent',
            color: 'var(--side-tx-3)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flexShrink: 0,
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--red)'; e.currentTarget.style.background = 'var(--surface)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--side-tx-3)'; e.currentTarget.style.background = 'transparent' }}
        >
          <IconClose size={10} sw={2} />
        </button>
      </div>

      {expanded && (
        <div>
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
            <div style={{ padding: '6px 10px 6px 28px', fontSize: 11, fontStyle: 'italic', color: 'var(--side-tx-3)' }}>
              No tables found
            </div>
          ) : (
            <TableList connection={connection} tables={connection.tables} onTableContextMenu={onTableContextMenu} />
          )}
        </div>
      )}
    </div>
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
    <button
      type="button"
      disabled={activating}
      onClick={handleActivate}
      onContextMenu={event => onContextMenu(event, saved)}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        padding: '8px 10px',
        borderRadius: 10,
        border: 0,
        background: 'transparent',
        cursor: 'pointer',
        textAlign: 'left',
        color: 'var(--side-tx-2)',
        transition: 'background 0.12s ease, color 0.12s ease',
      }}
      onMouseEnter={e => { if (!activating) { e.currentTarget.style.background = 'var(--side-hover)'; e.currentTarget.style.color = 'var(--side-tx-1)' } }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--side-tx-2)' }}
    >
      <span style={{ color: 'var(--side-tx-3)', display: 'inline-flex', flexShrink: 0 }}>
        <IconChevD open={false} size={11} sw={2.2} />
      </span>
      <span style={{ width: 6, height: 6, borderRadius: 99, background: 'var(--tx-4)', flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: 12.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {activating ? 'Connecting…' : saved.label}
      </span>
    </button>
  )
})

export default function ExplorerSidebar() {
  const connections = useAppStore(s => s.connections)
  const savedConnections = useAppStore(s => s.savedConnections)
  const restoreSavedConnections = useAppStore(s => s.restoreSavedConnections)
  const openConnectModal = useAppStore(s => s.openConnectModal)
  const openEditConnectionModal = useAppStore(s => s.openEditConnectionModal)
  const openEditSavedConnectionModal = useAppStore(s => s.openEditSavedConnectionModal)
  const deleteSavedConnection = useAppStore(s => s.deleteSavedConnection)
  const reorderSavedConnections = useAppStore(s => s.reorderSavedConnections)
  const openCreateTable = useAppStore(s => s.openCreateTable)
  const openEditTable = useAppStore(s => s.openEditTable)
  const deleteTable = useAppStore(s => s.deleteTable)
  const activateSavedConnection = useAppStore(s => s.activateSavedConnection)
  const refreshConnectionTables = useAppStore(s => s.refreshConnectionTables)
  const setStatus = useAppStore(s => s.setStatus)
  const openQuery = useAppStore(s => s.openQuery)
  const openServerMonitor = useAppStore(s => s.openServerMonitor)
  const authUser = useAppStore(s => s.authUser)
  const tabs = useAppStore(s => s.tabs)
  const activeTabId = useAppStore(s => s.activeTabId)

  const activeConnection = connections[0] ?? null
  const activeSavedConnectionId = activeConnection?.savedConnectionId
    ?? savedConnections.find(saved => sameConnectionConfig(saved.config, activeConnection?.config))?.id
    ?? null
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
  const [expandedTransferMenu, setExpandedTransferMenu] = useState<'export' | 'import' | null>(null)
  const [draggedSavedId, setDraggedSavedId] = useState<string | null>(null)
  const [dragOverSaved, setDragOverSaved] = useState<{ id: string; position: 'before' | 'after' } | null>(null)
  const [sidebarWidth, setSidebarWidth] = useState(loadSidebarWidth)
  const [sidebarResize, setSidebarResize] = useState<{ pointerId: number; startX: number; startWidth: number } | null>(null)
  const [resizeHandleHovered, setResizeHandleHovered] = useState(false)

  useEffect(() => {
    void restoreSavedConnections()
  }, [restoreSavedConnections])

  useEffect(() => {
    if (!sidebarResize) return

    const previousCursor = document.body.style.cursor
    const previousUserSelect = document.body.style.userSelect
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== sidebarResize.pointerId) return
      const nextWidth = clampSidebarWidth(sidebarResize.startWidth + event.clientX - sidebarResize.startX)
      setSidebarWidth(nextWidth)
      window.localStorage.setItem(SIDEBAR_WIDTH_KEY, String(nextWidth))
    }

    const stopResize = (event: PointerEvent) => {
      if (event.pointerId !== sidebarResize.pointerId) return
      setSidebarResize(null)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', stopResize)
    window.addEventListener('pointercancel', stopResize)
    return () => {
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousUserSelect
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', stopResize)
      window.removeEventListener('pointercancel', stopResize)
    }
  }, [sidebarResize])

  useEffect(() => {
    const closeMenu = () => {
      setContextMenu(null)
      setSavedContextMenu(null)
      setDatabaseContextMenu(null)
      setTableContextMenu(null)
      setDeleteTarget(null)
      setExpandedTransferMenu(null)
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu()
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

  const handleSidebarResizeStart = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    setSidebarResize({
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: sidebarWidth,
    })
  }, [sidebarWidth])

  const resetSidebarWidth = useCallback(() => {
    setSidebarWidth(SIDEBAR_DEFAULT_WIDTH)
    window.localStorage.setItem(SIDEBAR_WIDTH_KEY, String(SIDEBAR_DEFAULT_WIDTH))
  }, [])

  const handleActivateSaved = useCallback(async (id: string) => {
    setActivatingSavedId(id)
    try {
      const connection = await activateSavedConnection(id)
      if (connection) setExpanded({ [connection.id]: true })
    } finally {
      setActivatingSavedId(null)
    }
  }, [activateSavedConnection])

  const handleConnectionContextMenu = useCallback((event: React.MouseEvent, payload: { connectionId: string; connection: Connection; includeAddTable?: boolean }) => {
    event.preventDefault()
    setSavedContextMenu(null)
    setDatabaseContextMenu(null)
    setTableContextMenu(null)
    setExpandedTransferMenu(null)
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
    setExpandedTransferMenu(null)
    setSavedContextMenu({
      x: Math.min(event.clientX, window.innerWidth - 196),
      y: Math.min(event.clientY, window.innerHeight - 128),
      saved,
    })
  }, [])

  const clearSavedDragState = useCallback(() => {
    setDraggedSavedId(null)
    setDragOverSaved(null)
  }, [])

  const handleSavedDragStart = useCallback((event: React.DragEvent<HTMLDivElement>, id: string) => {
    setDraggedSavedId(id)
    setDragOverSaved(null)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', id)
  }, [])

  const handleSavedDragOver = useCallback((event: React.DragEvent<HTMLDivElement>, id: string) => {
    const sourceId = draggedSavedId || event.dataTransfer.getData('text/plain')
    if (!sourceId || sourceId === id) return

    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'

    const rect = event.currentTarget.getBoundingClientRect()
    const position = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
    setDragOverSaved(current => (
      current?.id === id && current.position === position
        ? current
        : { id, position }
    ))
  }, [draggedSavedId])

  const handleSavedDrop = useCallback((event: React.DragEvent<HTMLDivElement>, targetId: string) => {
    event.preventDefault()

    const sourceId = draggedSavedId || event.dataTransfer.getData('text/plain')
    if (!sourceId || sourceId === targetId) {
      clearSavedDragState()
      return
    }

    const orderedIds = savedConnections.map(saved => saved.id)
    const withoutSource = orderedIds.filter(id => id !== sourceId)
    const targetIndex = withoutSource.indexOf(targetId)
    if (targetIndex < 0) {
      clearSavedDragState()
      return
    }

    const insertIndex = dragOverSaved?.position === 'after' ? targetIndex + 1 : targetIndex
    const nextIds = [...withoutSource]
    nextIds.splice(insertIndex, 0, sourceId)
    reorderSavedConnections(nextIds)
    clearSavedDragState()
  }, [clearSavedDragState, draggedSavedId, dragOverSaved?.position, reorderSavedConnections, savedConnections])

  const handleDatabaseContextMenu = useCallback((event: React.MouseEvent, payload: { connection: Connection; databaseName?: string; schemaName?: string }) => {
    event.preventDefault()
    event.stopPropagation()
    setContextMenu(null)
    setSavedContextMenu(null)
    setTableContextMenu(null)
    setExpandedTransferMenu(null)
    setDatabaseContextMenu({
      x: Math.min(event.clientX, window.innerWidth - 196),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 344)),
      ...payload,
    })
  }, [])

  const handleTableContextMenu = useCallback((event: React.MouseEvent, payload: { connection: Connection; tableName: string; databaseName?: string; schemaName?: string; itemType: 'table' | 'view' }) => {
    event.preventDefault()
    event.stopPropagation()
    setContextMenu(null)
    setSavedContextMenu(null)
    setDatabaseContextMenu(null)
    setExpandedTransferMenu(null)
    setTableContextMenu({
      x: Math.min(event.clientX, window.innerWidth - 196),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 384)),
      ...payload,
    })
  }, [])

  const handleExportScope = useCallback(async (connection: Connection, request: ExportScopeRequest) => {
    setDatabaseContextMenu(null)
    setTableContextMenu(null)
    setExpandedTransferMenu(null)
    setStatus({ message: 'Preparing export...' })
    const result = await api.exportScope(connection.id, request)
    if (result.canceled) {
      setStatus({ message: 'Export canceled' })
      return
    }
    if (result.error) {
      setStatus({ message: result.error, error: true })
      return
    }
    const detail = request.mode === 'data'
      ? ` (${result.tableCount ?? 0} table${result.tableCount === 1 ? '' : 's'}, ${result.rowCount ?? 0} rows)`
      : ` (${result.tableCount ?? 0} table${result.tableCount === 1 ? '' : 's'})`
    setStatus({ message: `Exported${detail}: ${result.filePath}` })
  }, [setStatus])

  const handleImportScope = useCallback(async (connection: Connection, request: ImportScopeRequest) => {
    setDatabaseContextMenu(null)
    setTableContextMenu(null)
    setExpandedTransferMenu(null)
    setStatus({ message: 'Preparing import...' })
    const result = await api.importScope(connection.id, request)
    if (result.canceled) {
      setStatus({ message: 'Import canceled' })
      return
    }
    if (result.error) {
      setStatus({ message: result.error, error: true })
      return
    }
    await refreshConnectionTables(connection.id, request.scope.databaseName)
    const detail = ` (${result.tableCount ?? 0} table${result.tableCount === 1 ? '' : 's'}, ${result.created ?? 0} created, ${result.inserted ?? 0} rows inserted`
    const failures = result.failed ? `, ${result.failed} failed` : ''
    setStatus({
      message: `Imported${detail}${failures}): ${result.filePath}${result.warning ? ` - ${result.warning}` : ''}`,
      error: Boolean(result.failed),
    })
  }, [refreshConnectionTables, setStatus])

  const renderTransferButtons = (
    connection: Connection,
    scope: ExportScopeRequest['scope'] & ImportScopeRequest['scope'],
  ) => (
    <>
      <div style={{ marginTop: 4, paddingTop: 4, borderTop: '1px solid var(--border-faint)' }} />
      <button
        className="ctx-item"
        onClick={() => setExpandedTransferMenu(current => current === 'export' ? null : 'export')}
      >
        <IconExport size={14} sw={1.6} />
        <span style={{ flex: 1, textAlign: 'left' }}>Export</span>
        <span style={{ color: 'var(--tx-3)' }}><IconChevD open={expandedTransferMenu === 'export'} size={10} sw={2} /></span>
      </button>
      {expandedTransferMenu === 'export' && (
        <div style={{ marginLeft: 14, paddingLeft: 8, borderLeft: '1px solid var(--border-faint)' }}>
          <button className="ctx-item ctx-item-sub" onClick={() => void handleExportScope(connection, { mode: 'schema', scope })}>
            <IconExport size={12} sw={1.6} /><span>Schema Only</span>
          </button>
          <button className="ctx-item ctx-item-sub" onClick={() => void handleExportScope(connection, { mode: 'data', scope })}>
            <IconExport size={12} sw={1.6} /><span>Schema + Data</span>
          </button>
          <button className="ctx-item ctx-item-sub" onClick={() => void handleExportScope(connection, { mode: 'ai', scope })}>
            <IconExport size={12} sw={1.6} /><span>AI Context</span>
          </button>
        </div>
      )}
      <button
        className="ctx-item"
        onClick={() => setExpandedTransferMenu(current => current === 'import' ? null : 'import')}
      >
        <IconImport size={14} sw={1.6} />
        <span style={{ flex: 1, textAlign: 'left' }}>Import</span>
        <span style={{ color: 'var(--tx-3)' }}><IconChevD open={expandedTransferMenu === 'import'} size={10} sw={2} /></span>
      </button>
      {expandedTransferMenu === 'import' && (
        <div style={{ marginLeft: 14, paddingLeft: 8, borderLeft: '1px solid var(--border-faint)' }}>
          <button className="ctx-item ctx-item-sub" onClick={() => void handleImportScope(connection, { mode: 'schema', scope })}>
            <IconImport size={12} sw={1.6} /><span>Schema Only</span>
          </button>
          <button className="ctx-item ctx-item-sub" onClick={() => void handleImportScope(connection, { mode: 'data', scope })}>
            <IconImport size={12} sw={1.6} /><span>Data Only</span>
          </button>
          <button className="ctx-item ctx-item-sub" onClick={() => void handleImportScope(connection, { mode: 'schema-data', scope })}>
            <IconImport size={12} sw={1.6} /><span>Schema + Data</span>
          </button>
        </div>
      )}
    </>
  )

  const initials = (authUser?.username ?? 'CD').slice(0, 2).toUpperCase()

  const totalSources = savedConnections.length || connections.length

  const activeTab = tabs.find(t => t.id === activeTabId) ?? null
  const activeConn = activeTab
    ? connections.find(c => c.id === activeTab.connectionId) ?? null
    : connections[0] ?? null

  return (
    <aside
      style={{
        position: 'relative',
        width: sidebarWidth,
        minWidth: SIDEBAR_MIN_WIDTH,
        maxWidth: SIDEBAR_MAX_WIDTH,
        flexShrink: 0,
        background: 'var(--side-bg)',
        borderRight: '1px solid var(--side-border)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        padding: '24px 16px',
        transition: sidebarResize ? 'none' : 'width 0.12s ease',
      }}
    >
      <button
        type="button"
        aria-label="Resize sidebar"
        title="Drag to resize sidebar. Double-click to reset."
        onPointerDown={handleSidebarResizeStart}
        onDoubleClick={resetSidebarWidth}
        onMouseEnter={() => setResizeHandleHovered(true)}
        onMouseLeave={() => setResizeHandleHovered(false)}
        style={{
          position: 'absolute',
          top: 0,
          right: -5,
          zIndex: 20,
          width: 10,
          height: '100%',
          padding: 0,
          border: 0,
          background: 'transparent',
          cursor: 'col-resize',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 4,
            width: 2,
            borderRadius: 999,
            background: sidebarResize || resizeHandleHovered ? 'var(--accent)' : 'transparent',
            boxShadow: sidebarResize || resizeHandleHovered ? '0 0 0 2px var(--accent-soft)' : 'none',
            transition: 'background 0.12s ease, box-shadow 0.12s ease',
          }}
        />
      </button>

      {/* brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '0 4px 24px' }}>
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            background: 'var(--accent)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontWeight: 800,
            fontSize: 13,
            letterSpacing: '-0.04em',
          }}
        >
          C
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--side-tx-1)', letterSpacing: '-0.02em' }}>
            CatDB <span style={{ color: 'var(--side-tx-3)', fontWeight: 500, fontSize: 11 }}>PRO</span>
          </div>
        </div>
      </div>

      {/* quick actions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 22 }}>
        <button
          type="button"
          onClick={openConnectModal}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 12px',
            borderRadius: 10,
            background: 'var(--accent)',
            color: '#fff',
            border: 0,
            cursor: 'pointer',
            textAlign: 'left',
            fontSize: 12.5,
            fontWeight: 600,
            transition: 'background 0.12s ease',
            boxShadow: 'var(--shadow-sm)',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent-2)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'var(--accent)' }}
        >
          <span style={{ display: 'inline-flex' }}><IconPlus size={13} sw={2.2} /></span>
          <span>Connect DB</span>
        </button>
        <button
          type="button"
          disabled={!activeConn}
          onClick={() => activeConn && openQuery(activeConn, { database: activeTab?.database })}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 12px',
            borderRadius: 10,
            background: 'var(--inset)',
            color: 'var(--side-tx-1)',
            border: 0,
            cursor: activeConn ? 'pointer' : 'not-allowed',
            textAlign: 'left',
            fontSize: 12.5,
            fontWeight: 600,
            opacity: activeConn ? 1 : 0.5,
            transition: 'background 0.12s ease',
          }}
          onMouseEnter={e => { if (activeConn) e.currentTarget.style.background = 'var(--side-hover)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'var(--inset)' }}
        >
          <span style={{ display: 'inline-flex', color: 'var(--accent-fg)' }}><IconQuery size={13} sw={1.8} /></span>
          <span>New Query</span>
          <span
            style={{
              marginLeft: 'auto',
              fontSize: 10,
              color: 'var(--side-tx-3)',
              fontFamily: 'var(--mono)',
              padding: '1px 6px',
              background: 'var(--surface)',
              borderRadius: 4,
              fontWeight: 500,
            }}
          >
            ⌘N
          </span>
        </button>
        <button
          type="button"
          onClick={() => openServerMonitor(activeConn ?? null)}
          title="Open Server Monitor"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 12px',
            borderRadius: 10,
            background: 'var(--inset)',
            color: 'var(--side-tx-1)',
            border: 0,
            cursor: 'pointer',
            textAlign: 'left',
            fontSize: 12.5,
            fontWeight: 600,
            transition: 'background 0.12s ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--side-hover)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'var(--inset)' }}
        >
          <span style={{ display: 'inline-flex', color: 'var(--accent-fg)' }}><IconServer size={13} sw={1.7} /></span>
          <span>Server Monitor</span>
        </button>
      </div>

      {/* sources label */}
      <div
        style={{
          padding: '0 12px 8px',
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--side-tx-3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span>Sources</span>
        <span style={{ fontSize: 10, color: 'var(--side-tx-3)', fontFamily: 'var(--mono)' }}>{totalSources}</span>
      </div>

      {/* tree */}
      <div style={{ flex: 1, overflowY: 'auto', margin: '0 -4px' }}>
        {savedConnections.length === 0 && connections.length === 0 ? (
          <div
            style={{
              margin: '8px 4px',
              padding: '20px 14px',
              borderRadius: 12,
              border: '1.5px dashed var(--border-strong)',
              background: 'var(--side-bg-2)',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                margin: '0 auto 10px',
                borderRadius: 10,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--accent-soft)',
                color: 'var(--accent-fg)',
              }}
            >
              <IconDB size={18} sw={1.7} />
            </div>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--side-tx-1)', marginBottom: 4 }}>No connections yet</div>
            <div style={{ fontSize: 11, color: 'var(--side-tx-3)', lineHeight: 1.5 }}>
              Add a source to start exploring your databases.
            </div>
          </div>
        ) : (
          <>
            {savedConnections.map(saved => {
              const activeSavedConnection = activeSavedConnectionId === saved.id ? activeConnection : null
              const isDragging = draggedSavedId === saved.id
              const dropPosition = dragOverSaved?.id === saved.id ? dragOverSaved.position : null

              return (
                <div
                  key={saved.id}
                  draggable
                  onDragStart={event => handleSavedDragStart(event, saved.id)}
                  onDragOver={event => handleSavedDragOver(event, saved.id)}
                  onDrop={event => handleSavedDrop(event, saved.id)}
                  onDragEnd={clearSavedDragState}
                  style={{
                    position: 'relative',
                    opacity: isDragging ? 0.45 : 1,
                    transform: isDragging ? 'scale(0.985)' : 'scale(1)',
                    transition: 'opacity 0.12s ease, transform 0.12s ease',
                    cursor: 'grab',
                  }}
                >
                  {dropPosition && (
                    <div
                      style={{
                        position: 'absolute',
                        left: 8,
                        right: 8,
                        top: dropPosition === 'before' ? -2 : undefined,
                        bottom: dropPosition === 'after' ? -2 : undefined,
                        height: 2,
                        borderRadius: 999,
                        background: 'var(--accent)',
                        boxShadow: '0 0 0 2px var(--accent-soft)',
                        pointerEvents: 'none',
                        zIndex: 2,
                      }}
                    />
                  )}
                  {activeSavedConnection ? (
                    <ConnectionItem
                      connection={activeSavedConnection}
                      expanded={!!expanded[activeSavedConnection.id]}
                      onToggle={handleToggle}
                      onConnectionContextMenu={handleConnectionContextMenu}
                      onDatabaseContextMenu={handleDatabaseContextMenu}
                      onTableContextMenu={handleTableContextMenu}
                    />
                  ) : (
                    <SavedConnectionItem
                      saved={saved}
                      activating={activatingSavedId === saved.id}
                      onActivate={handleActivateSaved}
                      onContextMenu={handleSavedConnectionContextMenu}
                    />
                  )}
                </div>
              )
            })}
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
          </>
        )}
      </div>

      {/* user card */}
      <div
        style={{
          marginTop: 16,
          padding: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          borderRadius: 12,
          background: 'var(--side-bg-2)',
          border: '1px solid var(--side-border)',
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 999,
            background: 'var(--accent)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          {initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--side-tx-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {authUser?.username ?? 'Guest'}
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--side-tx-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {authUser?.email ?? 'Not signed in'}
          </div>
        </div>
      </div>

      {/* Context menus — keep current behaviour, restyle wrapper */}
      <style>{`
        .ctx-menu {
          position: fixed;
          z-index: 1200;
          min-width: 200px;
          overflow: hidden;
          border-radius: 12px;
          background: var(--surface);
          padding: 6px;
          box-shadow: var(--shadow-lg);
        }
        .ctx-heading {
          padding: 6px 10px 4px;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--tx-3);
        }
        .ctx-item {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 10px;
          border: 0;
          background: transparent;
          color: var(--tx-1);
          cursor: pointer;
          text-align: left;
          font-size: 12.5px;
          font-family: var(--font);
          border-radius: 8px;
          transition: background 0.12s ease;
        }
        .ctx-item:hover { background: var(--hover); }
        .ctx-item-sub { font-size: 12px; color: var(--tx-2); padding: 6px 10px; }
        .ctx-item-danger { color: var(--red); }
        .ctx-item-danger:hover { background: var(--red-soft); }
      `}</style>

      {savedContextMenu && (
        <div
          className="ctx-menu"
          style={{ left: savedContextMenu.x, top: savedContextMenu.y }}
          onClick={event => event.stopPropagation()}
          onContextMenu={event => event.preventDefault()}
        >
          <div className="ctx-heading">Saved Tab</div>
          <button className="ctx-item" onClick={() => { openEditSavedConnectionModal(savedContextMenu.saved.id); setSavedContextMenu(null) }}>
            <IconEdit size={13} sw={1.6} /><span>Edit</span>
          </button>
          <button className="ctx-item ctx-item-danger" onClick={() => { deleteSavedConnection(savedContextMenu.saved.id); setSavedContextMenu(null) }}>
            <IconTrash size={13} sw={1.6} /><span>Delete</span>
          </button>
        </div>
      )}

      {contextMenu && (
        <div
          className="ctx-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={event => event.stopPropagation()}
          onContextMenu={event => event.preventDefault()}
        >
          <div className="ctx-heading">Connection</div>
          <button className="ctx-item" onClick={() => { openEditConnectionModal(contextMenu.connectionId); setContextMenu(null) }}>
            <IconEdit size={13} sw={1.6} /><span>Edit</span>
          </button>
          {contextMenu.includeAddTable && (
            <button className="ctx-item" onClick={() => { openCreateTable(contextMenu.connection); setContextMenu(null) }}>
              <IconPlus size={13} sw={1.8} /><span>Add Table</span>
            </button>
          )}
        </div>
      )}

      {databaseContextMenu && (
        <div
          className="ctx-menu"
          style={{ left: databaseContextMenu.x, top: databaseContextMenu.y }}
          onClick={event => event.stopPropagation()}
          onContextMenu={event => event.preventDefault()}
        >
          <div className="ctx-heading">Database</div>
          <button className="ctx-item" onClick={() => { openCreateTable(databaseContextMenu.connection, databaseContextMenu.databaseName, databaseContextMenu.schemaName); setDatabaseContextMenu(null) }}>
            <IconPlus size={13} sw={1.8} /><span>Add Table</span>
          </button>
          {renderTransferButtons(databaseContextMenu.connection, {
            type: 'database',
            databaseName: databaseContextMenu.databaseName,
            schemaName: databaseContextMenu.schemaName,
          })}
        </div>
      )}

      {tableContextMenu && (
        <div
          className="ctx-menu"
          style={{ left: tableContextMenu.x, top: tableContextMenu.y }}
          onClick={event => event.stopPropagation()}
          onContextMenu={event => event.preventDefault()}
        >
          <div className="ctx-heading">Table</div>
          <button className="ctx-item" onClick={() => { openEditTable(tableContextMenu.connection, tableContextMenu.tableName, tableContextMenu.databaseName, tableContextMenu.schemaName); setTableContextMenu(null) }}>
            <IconEdit size={13} sw={1.6} /><span>Edit Table</span>
          </button>
          <button
            className="ctx-item ctx-item-danger"
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
            <IconTrash size={13} sw={1.6} /><span>{tableContextMenu.itemType === 'view' ? 'Delete View' : 'Delete Table'}</span>
          </button>
          {renderTransferButtons(tableContextMenu.connection, {
            type: 'table',
            databaseName: tableContextMenu.databaseName,
            schemaName: tableContextMenu.schemaName,
            tableName: tableContextMenu.tableName,
            itemType: tableContextMenu.itemType,
          })}
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
