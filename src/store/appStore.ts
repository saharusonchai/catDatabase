import { create } from 'zustand'
import type { Connection, Tab, StatusInfo, SubTab, IpcConnectionResult, ConnectionConfig, SavedConnection, DatabaseNode, TableItem } from '../types'

const api = window.electronAPI

// ── localStorage persistence ──────────────────────────────────────────────────
const STORAGE_KEY = 'catdb_saved_connections'

function loadSaved(): SavedConnection[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] }
}

function persistSaved(list: SavedConnection[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
}

function upsertSaved(list: SavedConnection[], config: ConnectionConfig, label: string): SavedConnection[] {
  const fingerprint = `${config.dbType}:${config.host}:${config.port}:${config.database}:${config.username}`
  const existing = list.find(s => s.id === fingerprint)
  const entry: SavedConnection = { id: fingerprint, label, config, lastUsed: Date.now() }
  const next = existing
    ? list.map(s => s.id === fingerprint ? entry : s)
    : [entry, ...list]
  return next.slice(0, 20) // keep max 20
}

// ── Store shape ───────────────────────────────────────────────────────────────

interface AppState {
  connections: Connection[]
  tabs: Tab[]
  activeTabId: string | null
  subTabs: Record<string, SubTab>
  status: StatusInfo
  showConnectModal: boolean
  savedConnections: SavedConnection[]
}

interface AppActions {
  /** Internal: resolve IPC result → typed Connection and add to store */
  _addConnection:  (conn: IpcConnectionResult | null) => Promise<Connection | null>
  loadDatabaseTables: (connectionId: string, databaseName: string) => Promise<TableItem[]>
  openDatabase:    () => Promise<Connection | null>
  createDatabase:  () => Promise<Connection | null>
  openDemo:        () => Promise<Connection | null>
  connectRemote:   (config: ConnectionConfig) => Promise<Connection | null>
  closeConnection: (id: string) => Promise<void>
  openConnectModal:    () => void
  closeConnectModal:   () => void
  deleteSavedConnection: (id: string) => void
  openTab:         (tabDef: Tab) => void
  closeTab:        (tabId: string) => void
  setActiveTab:    (id: string) => void
  setSubTab:       (tabId: string, sub: SubTab) => void
  selectTable:     (connection: Connection, tableName: string, database?: string) => void
  openQuery:       (connection: Connection) => void
  setStatus:       (status: StatusInfo) => void
}

type AppStore = AppState & AppActions

// ── Store ─────────────────────────────────────────────────────────────────────

const useAppStore = create<AppStore>((set, get) => ({
  // ── Initial state ─────────────────────────────────────────────────────────
  connections: [],
  tabs: [],
  activeTabId: null,
  subTabs: {},
  status: { message: 'Ready' },
  showConnectModal: false,
  savedConnections: loadSaved(),

  // ── Connection actions ────────────────────────────────────────────────────
  _addConnection: async (conn) => {
    if (!conn) return null
    if (conn.error) {
      set({ status: { message: conn.error, error: true } })
      return null
    }
    // Return existing connection if already open
    const existing = get().connections.find(c => c.id === conn.id)
    if (existing) {
      set({ status: { message: `Already connected to ${conn.name}` } })
      return existing
    }
    const isHierarchicalRemote = conn.dbType === 'mysql' || conn.dbType === 'postgresql'
    let tables: TableItem[] = []
    let databases: DatabaseNode[] | undefined

    if (isHierarchicalRemote) {
      if (conn.database) {
        const tablesResult = await api.listTablesForDb(conn.id, conn.database)
        const initialTables = Array.isArray(tablesResult) ? tablesResult : []
        databases = [{ name: conn.database, tables: initialTables }]
      } else {
        const databasesResult = await api.listDatabases(conn.id)
        databases = Array.isArray(databasesResult) ? databasesResult : []
      }
    } else {
      const tablesResult = await api.listTables(conn.id)
      tables = Array.isArray(tablesResult) ? tablesResult : []
    }

    const newConn: Connection = { ...conn, tables, databases }
    set(state => ({
      connections: [...state.connections, newConn],
      status: { message: `Connected to ${conn.name}` },
    }))
    return newConn
  },

  loadDatabaseTables: async (connectionId, databaseName) => {
    const result = await api.listTablesForDb(connectionId, databaseName)
    const tables = Array.isArray(result) ? result : []
    set(state => ({
      connections: state.connections.map(conn => (
        conn.id !== connectionId
          ? conn
          : {
              ...conn,
              databases: (conn.databases ?? []).map(db => (
                db.name === databaseName ? { ...db, tables } : db
              )),
            }
      )),
    }))
    return tables
  },

  openDatabase: async () => {
    const conn = await api.openDatabase()
    return get()._addConnection(conn)
  },

  createDatabase: async () => {
    const conn = await api.createDatabase()
    return get()._addConnection(conn)
  },

  openDemo: async () => {
    const conn = await api.getDemo()
    return get()._addConnection(conn)
  },

  connectRemote: async (config) => {
    const conn = await api.connectRemote(config)
    const result = await get()._addConnection(conn)
    if (result) {
      const next = upsertSaved(get().savedConnections, config, result.name)
      persistSaved(next)
      set({ showConnectModal: false, savedConnections: next })
    }
    return result
  },

  openConnectModal:  () => set({ showConnectModal: true }),
  closeConnectModal: () => set({ showConnectModal: false }),

  deleteSavedConnection: (id) => {
    const next = get().savedConnections.filter(s => s.id !== id)
    persistSaved(next)
    set({ savedConnections: next })
  },

  closeConnection: async (id) => {
    await api.closeDatabase(id)
    set(state => {
      const remainingTabs = state.tabs.filter(t => t.connectionId !== id)
      const activeStillExists = remainingTabs.some(t => t.id === state.activeTabId)
      return {
        connections: state.connections.filter(c => c.id !== id),
        tabs: remainingTabs,
        activeTabId: activeStillExists
          ? state.activeTabId
          : remainingTabs[remainingTabs.length - 1]?.id ?? null,
        status: { message: 'Disconnected' },
      }
    })
  },

  // ── Tab actions ───────────────────────────────────────────────────────────
  openTab: (tabDef) => {
    set(state => {
      const exists = state.tabs.some(t => t.id === tabDef.id)
      if (exists) return { activeTabId: tabDef.id }
      return { tabs: [...state.tabs, tabDef], activeTabId: tabDef.id }
    })
  },

  closeTab: (tabId) => {
    set(state => {
      const idx = state.tabs.findIndex(t => t.id === tabId)
      const next = state.tabs.filter(t => t.id !== tabId)
      let newActiveId = state.activeTabId
      if (state.activeTabId === tabId) {
        newActiveId = next.length > 0
          ? (next[Math.max(0, idx - 1)]?.id ?? next[0].id)
          : null
      }
      return { tabs: next, activeTabId: newActiveId }
    })
  },

  setActiveTab: (id) => set({ activeTabId: id }),

  setSubTab: (tabId, sub) =>
    set(state => ({ subTabs: { ...state.subTabs, [tabId]: sub } })),

  // ── Convenience shortcuts ─────────────────────────────────────────────────
  selectTable: (connection, tableName, database) => {
    const scopedName = database ? `${database}.${tableName}` : tableName
    const tabId = `${connection.id}::${scopedName}`
    get().openTab({
      id: tabId,
      type: 'table',
      connectionId: connection.id,
      connectionName: connection.name,
      tableName,
      database,
      label: scopedName,
    })
    set(state => ({
      subTabs: { ...state.subTabs, [tabId]: state.subTabs[tabId] ?? 'data' },
    }))
  },

  openQuery: (connection) => {
    const tabId = `query::${connection.id}::${Date.now()}`
    get().openTab({
      id: tabId,
      type: 'query',
      connectionId: connection.id,
      connectionName: connection.name,
      label: `Query — ${connection.name}`,
    })
  },

  // ── Status ────────────────────────────────────────────────────────────────
  setStatus: (status) => set({ status }),
}))

export default useAppStore
