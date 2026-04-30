import type { ReactNode } from 'react'

// ── Domain types ──────────────────────────────────────────────────────────────

export type DbType = 'sqlite' | 'mysql' | 'postgresql' | 'mongodb'

export interface SshConfig {
  host: string
  port: number
  username: string
  password?: string
  privateKey?: string
}

export interface ConnectionConfig {
  dbType: DbType
  name?: string
  // Remote DB fields
  host?: string
  port?: number
  username?: string
  password?: string
  database?: string
  keepAlive?: boolean
  // SSH tunnel
  ssh?: SshConfig
}

export interface SavedConnection {
  id: string
  label: string
  config: ConnectionConfig
  lastUsed: number   // unix ms
}

export interface TableItem {
  name: string
  type: 'table' | 'view'
  schema?: string
}

export interface DatabaseNode {
  name: string
  tables: TableItem[] | null   // null = not yet loaded
}

export interface Connection {
  id: string
  name: string
  filePath: string
  dbType?: DbType
  config?: ConnectionConfig
  /** SQLite: flat table list. Remote: null (use databases instead) */
  tables: TableItem[]
  /** MySQL / PG / Mongo: database/schema list with lazy-loaded tables */
  databases?: DatabaseNode[]
}

export type SubTab = 'data' | 'structure'
export type TabType = 'table' | 'query' | 'create-table'

export interface Tab {
  id: string
  type: TabType
  connectionId: string
  connectionName: string
  tableName?: string
  database?: string   // which database/schema the table belongs to (remote only)
  schemaName?: string
  editorMode?: 'create' | 'edit'
  label: string
}

export interface StatusInfo {
  message: string
  rows?: number
  time?: number
  error?: boolean
}

export interface GridFooterState {
  visible: boolean
  summary: string
  selectionLabel?: string
  pageLabel: string
  limit: number
  canPrev: boolean
  canNext: boolean
  actions?: Array<{
    key: string
    label: string
    icon?: ReactNode
    variant?: 'ghost' | 'primary' | 'danger'
    disabled?: boolean
    onClick?: () => void
  }>
  onPrev?: () => void
  onNext?: () => void
  onLimitChange?: (limit: number) => void
}

export type DbValue =
  | string
  | number
  | boolean
  | null
  | Record<string, unknown>
  | unknown[]

/** A row returned from the database grid */
export type DbRow = Record<string, DbValue>

// ── SQLite PRAGMA types ───────────────────────────────────────────────────────

export interface ColumnInfo {
  cid: number
  name: string
  type: string
  notnull: 0 | 1
  dflt_value: string | null
  pk: 0 | 1
  comment?: string | null
}

export interface ForeignKey {
  id: number
  seq: number
  table: string
  from: string
  to: string
  on_update: string
  on_delete: string
  match: string
}

export interface IndexInfo {
  seq: number
  name: string
  unique: 0 | 1
  origin: string
  partial: 0 | 1
}

export interface TableStructure {
  columns: ColumnInfo[]
  foreignKeys: ForeignKey[]
  indices: IndexInfo[]
  sql: string
}

// ── IPC result types ──────────────────────────────────────────────────────────

export interface IpcConnectionResult {
  id: string
  name: string
  filePath: string
  dbType?: DbType
  database?: string
  error?: string
}

export interface TableDataResult {
  rows: DbRow[]
  total: number
  page: number
  limit: number
  error?: string
}

export interface QueryResult {
  rows?: DbRow[]
  changes?: number
  lastInsertRowid?: number
  elapsed?: number
  type?: 'select' | 'exec'
  error?: string
}

export interface RowMutationResult {
  success?: boolean
  lastInsertRowid?: number
  error?: string
}

export interface PersistResult {
  success?: boolean
  error?: string
}

// ── Electron API (window.electronAPI) ────────────────────────────────────────

export interface ElectronAPI {
  openDatabase:       ()                                          => Promise<IpcConnectionResult | null>
  createDatabase:     ()                                          => Promise<IpcConnectionResult | null>
  closeDatabase:      (id: string)                               => Promise<boolean>
  getDemo:            ()                                          => Promise<IpcConnectionResult>
  connectRemote:      (config: ConnectionConfig)                  => Promise<IpcConnectionResult>
  testConnection:     (config: ConnectionConfig)                  => Promise<{ ok: boolean; error?: string; latency?: number }>
  createTable:        (id: string, table: string, columnsSql: string, db?: string, schema?: string, comments?: Record<string, string>) => Promise<RowMutationResult>
  updateTableSchema:  (id: string, table: string, nextTable: string, columnsSql: string, db?: string, schema?: string, comments?: Record<string, string>) => Promise<RowMutationResult>
  deleteTable:        (id: string, table: string, db?: string, schema?: string, itemType?: 'table' | 'view') => Promise<RowMutationResult>
  getSavedConnections: ()                                         => Promise<SavedConnection[] | { error: string }>
  setSavedConnections: (list: SavedConnection[])                  => Promise<PersistResult>
  listTables:         (id: string)                               => Promise<TableItem[] | { error: string }>
  listDatabases:      (id: string)                               => Promise<DatabaseNode[] | { error: string }>
  listTablesForDb:    (id: string, dbName: string)               => Promise<TableItem[] | { error: string }>
  getTableStructure:  (id: string, table: string, db?: string)   => Promise<TableStructure | { error: string }>
  getTableData:       (id: string, table: string, page: number, limit: number, db?: string, filter?: string) => Promise<TableDataResult>
  insertRow:          (id: string, table: string, data: Record<string, string>, db?: string) => Promise<RowMutationResult>
  updateRow:          (id: string, table: string, rowid: number, data: Record<string, string>, db?: string) => Promise<RowMutationResult>
  deleteRow:          (id: string, table: string, rowid: number, db?: string) => Promise<RowMutationResult>
  runQuery:           (id: string, sql: string)                  => Promise<QueryResult>
}

// ── Global augmentation ───────────────────────────────────────────────────────

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
