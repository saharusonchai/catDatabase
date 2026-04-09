const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // ── File-based SQLite ─────────────────────────────────────────────────────
  openDatabase:    ()                              => ipcRenderer.invoke('db:open-file'),
  createDatabase:  ()                              => ipcRenderer.invoke('db:create-file'),
  getDemo:         ()                              => ipcRenderer.invoke('db:get-demo'),

  // ── Remote connection ─────────────────────────────────────────────────────
  connectRemote:   (config)                        => ipcRenderer.invoke('db:connect-remote', config),
  testConnection:  (config)                        => ipcRenderer.invoke('db:test-connection', config),

  // ── Shared ────────────────────────────────────────────────────────────────
  closeDatabase:      (id)                         => ipcRenderer.invoke('db:close', id),
  listTables:         (id)                         => ipcRenderer.invoke('db:list-tables', id),
  listDatabases:      (id)                         => ipcRenderer.invoke('db:list-databases', id),
  listTablesForDb:    (id, dbName)                 => ipcRenderer.invoke('db:list-tables-for-db', id, dbName),
  getTableStructure:  (id, table, db)              => ipcRenderer.invoke('db:table-structure', id, table, db),
  getTableData:       (id, table, page, limit, db) => ipcRenderer.invoke('db:table-data', id, table, page, limit, db),
  insertRow:          (id, table, data, db)        => ipcRenderer.invoke('db:insert-row', id, table, data, db),
  updateRow:          (id, table, rowid, data, db) => ipcRenderer.invoke('db:update-row', id, table, rowid, data, db),
  deleteRow:          (id, table, rowid, db)       => ipcRenderer.invoke('db:delete-row', id, table, rowid, db),
  runQuery:           (id, sql)                    => ipcRenderer.invoke('db:run-query', id, sql),
})
