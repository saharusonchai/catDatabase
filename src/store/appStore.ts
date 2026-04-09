import { create } from 'zustand'
import type { Connection, Tab, StatusInfo, SubTab, IpcConnectionResult, ConnectionConfig, SavedConnection, DatabaseNode, TableItem } from '../types'

const api = window.electronAPI

// ── localStorage persistence ──────────────────────────────────────────────────
const STORAGE_KEY = 'catdb_saved_connections'

function loadSaved(): SavedConnection[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] }
}

function loadLegacySavedConnections(): SavedConnection[] {
  return loadSaved()
}

function getSavedConnectionId(config: ConnectionConfig): string {
  return `${config.dbType}:${config.host}:${config.port}:${config.database}:${config.username}`
}

function upsertSaved(list: SavedConnection[], config: ConnectionConfig, label: string): SavedConnection[] {
  const fingerprint = getSavedConnectionId(config)
  const existing = list.find(s => s.id === fingerprint)
  const entry: SavedConnection = { id: fingerprint, label, config, lastUsed: Date.now() }
  const next = existing
    ? list.map(s => s.id === fingerprint ? entry : s)
    : [entry, ...list]
  return next.slice(0, 20) // keep max 20
}

function getConnectionFingerprint(input: Pick<ConnectionConfig, 'dbType' | 'host' | 'port' | 'database' | 'username'>) {
  return `${input.dbType}:${input.host}:${input.port}:${input.database}:${input.username}`
}

// ── Store shape ───────────────────────────────────────────────────────────────

interface AppState {
  connections: Connection[]
  tabs: Tab[]
  activeTabId: string | null
  subTabs: Record<string, SubTab>
  status: StatusInfo
  showConnectModal: boolean
  editingConnectionId: string | null
  editingConnectionConfig: ConnectionConfig | null
  savedConnections: SavedConnection[]
  hasLoadedSavedConnections: boolean
  hasRestoredSavedConnections: boolean
}

interface AppActions {
  /** Internal: resolve IPC result → typed Connection and add to store */
  _addConnection:  (conn: IpcConnectionResult | null) => Promise<Connection | null>
  loadSavedConnections: () => Promise<void>
  loadDatabaseTables: (connectionId: string, databaseName: string) => Promise<TableItem[]>
  refreshConnectionTables: (connectionId: string, databaseName?: string) => Promise<void>
  openDatabase:    () => Promise<Connection | null>
  createDatabase:  () => Promise<Connection | null>
  openDemo:        () => Promise<Connection | null>
  connectRemote:   (config: ConnectionConfig) => Promise<Connection | null>
  restoreSavedConnections: () => Promise<void>
  openEditConnectionModal: (connectionId: string) => void
  closeConnection: (id: string) => Promise<void>
  openConnectModal:    () => void
  closeConnectModal:   () => void
  deleteSavedConnection: (id: string) => void
  openTab:         (tabDef: Tab) => void
  closeTab:        (tabId: string) => void
  closeAllTabs:    () => void
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
  editingConnectionId: null,
  editingConnectionConfig: null,
  savedConnections: [],
  hasLoadedSavedConnections: false,
  hasRestoredSavedConnections: false,

  // ── Connection actions ────────────────────────────────────────────────────
  loadSavedConnections: async () => {
    if (get().hasLoadedSavedConnections) return

    const result = await api.getSavedConnections()
    let saved = Array.isArray(result) ? result : []

    if (!Array.isArray(result) && result.error) {
      set({ status: { message: result.error, error: true } })
    }

    if (saved.length === 0) {
      const legacy = loadLegacySavedConnections()
      if (legacy.length > 0) {
        const persistResult = await api.setSavedConnections(legacy)
        if (persistResult.error) {
          set({ status: { message: persistResult.error, error: true } })
        } else {
          localStorage.removeItem(STORAGE_KEY)
          saved = legacy
        }
      }
    }

    set({
      savedConnections: saved,
      hasLoadedSavedConnections: true,
    })
  },

  _addConnection: async (conn) => {
    if (!conn) return null
    if (conn.error) {
      set({ status: { message: conn.error, error: true } })
      return null
    }
    // Return existing connection if already open
    const existing = get().connections.find(c => (
      c.id === conn.id ||
      (c.dbType === conn.dbType && c.filePath === conn.filePath && c.name === conn.name)
    ))
    if (existing) {
      set({ status: { message: `Already connected to ${conn.name}` } })
      return existing
    }
    const isHierarchicalRemote = conn.dbType === 'mysql' || conn.dbType === 'postgresql'
    let tables: TableItem[] = []
    let databases: DatabaseNode[] | undefined

    if (isHierarchicalRemote) {
      const databasesResult = await api.listDatabases(conn.id)
      databases = Array.isArray(databasesResult) ? databasesResult : []

      if (conn.database && databases) {
        const tablesResult = await api.listTablesForDb(conn.id, conn.database)
        const initialTables = Array.isArray(tablesResult) ? tablesResult : []
        databases = databases.map(db => (
          db.name === conn.database ? { ...db, tables: initialTables } : db
        ))
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

  refreshConnectionTables: async (connectionId, databaseName) => {
    const connection = get().connections.find(item => item.id === connectionId)
    if (!connection) return

    if (databaseName) {
      await get().loadDatabaseTables(connectionId, databaseName)
      return
    }

    const result = await api.listTables(connectionId)
    const tables = Array.isArray(result) ? result : []
    set(state => ({
      connections: state.connections.map(conn => (
        conn.id === connectionId ? { ...conn, tables } : conn
      )),
    }))
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
      const persistResult = await api.setSavedConnections(next)
      if (persistResult.error) {
        set({ status: { message: persistResult.error, error: true } })
      } else {
        set(state => ({
          showConnectModal: false,
          editingConnectionId: null,
          editingConnectionConfig: null,
          savedConnections: next,
          hasLoadedSavedConnections: true,
          connections: state.connections.map(connection => (
            connection.id === result.id ? { ...connection, config } : connection
          )),
        }))
      }
    }
    return result
  },

  restoreSavedConnections: async () => {
    if (get().hasRestoredSavedConnections) return
    set({ hasRestoredSavedConnections: true })
    await get().loadSavedConnections()

    const saved = get().savedConnections
    if (saved.length === 0) return

    for (const item of saved) {
      const cfg = item.config
      const fingerprint = getConnectionFingerprint(cfg)
      const duplicate = get().connections.some(connection => (
        connection.config
          ? getConnectionFingerprint(connection.config) === fingerprint
          : connection.dbType === cfg.dbType && connection.filePath === `${cfg.dbType}://${cfg.host}:${cfg.port}/${cfg.database || ''}`
      ))
      if (duplicate) continue
      await get().connectRemote(cfg)
    }
  },

  openEditConnectionModal: (connectionId) => {
    const connection = get().connections.find(item => item.id === connectionId)
    if (!connection?.config) return
    set({
      showConnectModal: true,
      editingConnectionId: connectionId,
      editingConnectionConfig: connection.config,
    })
  },

  openConnectModal:  () => set({ showConnectModal: true, editingConnectionId: null, editingConnectionConfig: null }),
  closeConnectModal: () => set({ showConnectModal: false, editingConnectionId: null, editingConnectionConfig: null }),

  deleteSavedConnection: (id) => {
    const next = get().savedConnections.filter(s => s.id !== id)
    void api.setSavedConnections(next)
    set({ savedConnections: next, hasLoadedSavedConnections: true })
  },

  closeConnection: async (id) => {
    const connection = get().connections.find(item => item.id === id)
    if (connection?.config) {
      const savedId = getSavedConnectionId(connection.config)
      const next = get().savedConnections.filter(item => item.id !== savedId)
      const persistResult = await api.setSavedConnections(next)
      if (persistResult.error) {
        set({ status: { message: persistResult.error, error: true } })
      } else {
        set({ savedConnections: next, hasLoadedSavedConnections: true })
      }
    }

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

  closeAllTabs: () => {
    set({ tabs: [], activeTabId: null, subTabs: {} })
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
