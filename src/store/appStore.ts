import { create } from 'zustand'
import type { Connection, Tab, StatusInfo, SubTab, IpcConnectionResult, ConnectionConfig, SavedConnection, DatabaseNode, TableItem, GridFooterState, AuthPayload, AuthUser, QueryContext } from '../types'

const api = window.electronAPI

// ── localStorage persistence ──────────────────────────────────────────────────
const STORAGE_KEY = 'catdb_saved_connections'
const AUTH_TOKEN_KEY = 'catdb_auth_token'

function loadSaved(): SavedConnection[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] }
}

function loadLegacySavedConnections(): SavedConnection[] {
  return loadSaved()
}

function createSavedConnectionId(): string {
  return `saved_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function saveConnectionEntry(
  list: SavedConnection[],
  config: ConnectionConfig,
  label: string,
  replaceId?: string,
): SavedConnection[] {
  const now = Date.now()
  const entry: SavedConnection = {
    id: replaceId || createSavedConnectionId(),
    label,
    config,
    lastUsed: now,
  }

  const withoutPrevious = replaceId
    ? list.filter(item => item.id !== replaceId)
    : list
  const next = [entry, ...withoutPrevious]
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
  editingConnectionId: string | null
  editingConnectionConfig: ConnectionConfig | null
  savedConnections: SavedConnection[]
  hasLoadedSavedConnections: boolean
  hasRestoredSavedConnections: boolean
  gridFooter: GridFooterState | null
  authUser: AuthUser | null
  authToken: string | null
  authLoading: boolean
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
  connectRemote:   (config: ConnectionConfig, options?: { save?: boolean }) => Promise<Connection | null>
  activateSavedConnection: (id: string) => Promise<Connection | null>
  restoreSavedConnections: () => Promise<void>
  openEditConnectionModal: (connectionId: string) => void
  openEditSavedConnectionModal: (savedId: string) => void
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
  openCreateTable: (connection: Connection, database?: string, schemaName?: string) => void
  openEditTable:   (connection: Connection, tableName: string, database?: string, schemaName?: string) => void
  deleteTable:     (connection: Connection, tableName: string, database?: string, schemaName?: string, itemType?: 'table' | 'view') => Promise<RowMutationResult>
  openQuery:       (connection: Connection, context?: QueryContext) => void
  setStatus:       (status: StatusInfo) => void
  setGridFooter:   (footer: GridFooterState | null) => void
  loadCurrentUser: () => Promise<void>
  register:       (payload: AuthPayload) => Promise<boolean>
  login:          (payload: AuthPayload) => Promise<boolean>
  logout:         () => Promise<void>
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
  gridFooter: null,
  authUser: null,
  authToken: localStorage.getItem(AUTH_TOKEN_KEY),
  authLoading: true,

  // ── Connection actions ────────────────────────────────────────────────────
  loadSavedConnections: async () => {
    if (get().hasLoadedSavedConnections) return

    const token = get().authToken
    const result = await api.getSavedConnections(token)
    let saved = Array.isArray(result) ? result : []

    if (!Array.isArray(result) && result.error) {
      set({ status: { message: result.error, error: true } })
    }

    if (saved.length === 0) {
      const legacy = loadLegacySavedConnections()
      if (legacy.length > 0) {
        const persistResult = await api.setSavedConnections(token, legacy)
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

  connectRemote: async (config, options = {}) => {
    const openConnectionIds = get().connections.map(connection => connection.id)
    if (openConnectionIds.length > 0) {
      await Promise.all(openConnectionIds.map(id => api.closeDatabase(id)))
      set({ connections: [], tabs: [], activeTabId: null, subTabs: {}, gridFooter: null })
    }

    const conn = await api.connectRemote(config)
    const result = await get()._addConnection(conn)
    if (result) {
      if (options.save === false) return result

      const editingId = get().editingConnectionId
      const replaceSavedId = editingId?.startsWith('saved:')
        ? editingId.slice('saved:'.length)
        : undefined
      const next = saveConnectionEntry(get().savedConnections, config, result.name, replaceSavedId)
      const persistResult = await api.setSavedConnections(get().authToken, next)
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
            connection.id === result.id ? { ...connection, config, savedConnectionId: next[0]?.id } : connection
          )),
        }))
      }
    }
    return result
  },

  activateSavedConnection: async (id) => {
    const saved = get().savedConnections.find(item => item.id === id)
    if (!saved) {
      set({ status: { message: 'Saved connection not found', error: true } })
      return null
    }

    const result = await get().connectRemote(saved.config, { save: false })
    if (result) {
      set(state => ({
        connections: state.connections.map(connection => (
          connection.id === result.id ? { ...connection, savedConnectionId: id } : connection
        )),
      }))
    }
    return result
  },

  restoreSavedConnections: async () => {
    if (get().hasRestoredSavedConnections) return
    set({ hasRestoredSavedConnections: true })
    await get().loadSavedConnections()
  },

  openEditConnectionModal: (connectionId) => {
    const connection = get().connections.find(item => item.id === connectionId)
    if (!connection?.config) return
    set({
      showConnectModal: true,
      editingConnectionId: connection.savedConnectionId ? `saved:${connection.savedConnectionId}` : connectionId,
      editingConnectionConfig: connection.config,
    })
  },

  openEditSavedConnectionModal: (savedId) => {
    const saved = get().savedConnections.find(item => item.id === savedId)
    if (!saved?.config) return
    set({
      showConnectModal: true,
      editingConnectionId: `saved:${savedId}`,
      editingConnectionConfig: saved.config,
    })
  },

  openConnectModal:  () => set({ showConnectModal: true, editingConnectionId: null, editingConnectionConfig: null }),
  closeConnectModal: () => set({ showConnectModal: false, editingConnectionId: null, editingConnectionConfig: null }),

  deleteSavedConnection: (id) => {
    const next = get().savedConnections.filter(s => s.id !== id)
    void api.setSavedConnections(get().authToken, next)
    set({ savedConnections: next, hasLoadedSavedConnections: true })
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

  openCreateTable: (connection, database, schemaName) => {
    const scopeLabel = database ? `${database}.` : ''
    const schemaLabel = schemaName ? ` (${schemaName})` : ''
    const tabId = `create-table::${connection.id}::${database ?? ''}::${schemaName ?? ''}`
    get().openTab({
      id: tabId,
      type: 'create-table',
      connectionId: connection.id,
      connectionName: connection.name,
      database,
      schemaName,
      editorMode: 'create',
      label: `New Table ${scopeLabel}${schemaLabel}`.trim(),
    })
  },

  openEditTable: (connection, tableName, database, schemaName) => {
    const scopedName = database ? `${database}.${tableName}` : tableName
    const tabId = `edit-table::${connection.id}::${database ?? ''}::${schemaName ?? ''}::${tableName}`
    get().openTab({
      id: tabId,
      type: 'create-table',
      connectionId: connection.id,
      connectionName: connection.name,
      tableName,
      database,
      schemaName,
      editorMode: 'edit',
      label: `Edit ${scopedName}`,
    })
  },

  deleteTable: async (connection, tableName, database, schemaName, itemType = 'table') => {
    const qualifiedTable = schemaName && connection.dbType === 'postgresql'
      ? `${schemaName}.${tableName}`
      : tableName

    const result = await api.deleteTable(connection.id, qualifiedTable, database, schemaName, itemType)
    if (result.error) {
      set({ status: { message: result.error, error: true } })
      return result
    }

    await get().refreshConnectionTables(connection.id, database)

    set(state => {
      const remainingTabs = state.tabs.filter(tab => !(
        tab.connectionId === connection.id &&
        tab.tableName === tableName &&
        tab.database === database &&
        tab.schemaName === schemaName
      ))
      const activeStillExists = remainingTabs.some(tab => tab.id === state.activeTabId)
      const label = itemType === 'view' ? 'view' : 'table'
      return {
        tabs: remainingTabs,
        activeTabId: activeStillExists
          ? state.activeTabId
          : remainingTabs[remainingTabs.length - 1]?.id ?? null,
        status: { message: `Deleted ${label} ${qualifiedTable}` },
      }
    })

    return result
  },

  openQuery: (connection, context = {}) => {
    const tabId = `query::${connection.id}::${Date.now()}`
    const scope = context.tableName || context.database
    get().openTab({
      id: tabId,
      type: 'query',
      connectionId: connection.id,
      connectionName: connection.name,
      database: context.database,
      tableName: context.tableName,
      label: scope ? `Query — ${scope}` : `Query — ${connection.name}`,
    })
  },

  // ── Status ────────────────────────────────────────────────────────────────
  setStatus: (status) => set({ status }),
  setGridFooter: (gridFooter) => set({ gridFooter }),

  loadCurrentUser: async () => {
    const token = get().authToken
    if (!token) {
      set({ authUser: null, authLoading: false })
      return
    }

    const result = await api.getCurrentUser(token)
    if (result.user) {
      set({ authUser: result.user, authLoading: false })
      return
    }

    localStorage.removeItem(AUTH_TOKEN_KEY)
    set({ authUser: null, authToken: null, authLoading: false })
  },

  register: async (payload) => {
    const result = await api.register(payload)
    if (result.error || !result.user || !result.token) {
      set({ status: { message: result.error || 'Unable to register', error: true } })
      return false
    }

    localStorage.setItem(AUTH_TOKEN_KEY, result.token)
    set({
      authUser: result.user,
      authToken: result.token,
      authLoading: false,
      savedConnections: [],
      hasLoadedSavedConnections: false,
      hasRestoredSavedConnections: false,
      status: { message: `Signed in as ${result.user.username}` },
    })
    return true
  },

  login: async (payload) => {
    const result = await api.login(payload)
    if (result.error || !result.user || !result.token) {
      set({ status: { message: result.error || 'Unable to log in', error: true } })
      return false
    }

    localStorage.setItem(AUTH_TOKEN_KEY, result.token)
    set({
      authUser: result.user,
      authToken: result.token,
      authLoading: false,
      savedConnections: [],
      hasLoadedSavedConnections: false,
      hasRestoredSavedConnections: false,
      status: { message: `Welcome back, ${result.user.username}` },
    })
    return true
  },

  logout: async () => {
    const token = get().authToken
    const openConnectionIds = get().connections.map(connection => connection.id)
    await Promise.all(openConnectionIds.map(id => api.closeDatabase(id)))
    await api.logout(token)
    localStorage.removeItem(AUTH_TOKEN_KEY)
    set({
      authUser: null,
      authToken: null,
      tabs: [],
      activeTabId: null,
      subTabs: {},
      connections: [],
      savedConnections: [],
      hasLoadedSavedConnections: false,
      hasRestoredSavedConnections: false,
      status: { message: 'Signed out' },
    })
  },
}))

export default useAppStore
