const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // ── File-based SQLite ─────────────────────────────────────────────────────
  openDatabase:    ()                              => ipcRenderer.invoke('db:open-file'),
  createDatabase:  ()                              => ipcRenderer.invoke('db:create-file'),
  getDemo:         ()                              => ipcRenderer.invoke('db:get-demo'),

  // ── Remote connection ─────────────────────────────────────────────────────
  connectRemote:   (config)                        => ipcRenderer.invoke('db:connect-remote', config),
  testConnection:  (config)                        => ipcRenderer.invoke('db:test-connection', config),
  createTable:     (id, table, columnsSql, db, schema, comments) => ipcRenderer.invoke('db:create-table', id, table, columnsSql, db, schema, comments),
  updateTableSchema: (id, table, nextTable, columnsSql, db, schema, comments) => ipcRenderer.invoke('db:update-table-schema', id, table, nextTable, columnsSql, db, schema, comments),
  deleteTable:     (id, table, db, schema, itemType) => ipcRenderer.invoke('db:delete-table', id, table, db, schema, itemType),
  getSavedConnections: ()                          => ipcRenderer.invoke('app:get-saved-connections'),
  setSavedConnections: (list)                      => ipcRenderer.invoke('app:set-saved-connections', list),

  // ── Shared ────────────────────────────────────────────────────────────────
  closeDatabase:      (id)                         => ipcRenderer.invoke('db:close', id),
  listTables:         (id)                         => ipcRenderer.invoke('db:list-tables', id),
  listDatabases:      (id)                         => ipcRenderer.invoke('db:list-databases', id),
  listTablesForDb:    (id, dbName)                 => ipcRenderer.invoke('db:list-tables-for-db', id, dbName),
  getTableStructure:  (id, table, db)              => ipcRenderer.invoke('db:table-structure', id, table, db),
  getTableData:       (id, table, page, limit, db, filter) => ipcRenderer.invoke('db:table-data', id, table, page, limit, db, filter),
  insertRow:          (id, table, data, db)        => ipcRenderer.invoke('db:insert-row', id, table, data, db),
  updateRow:          (id, table, rowid, data, db) => ipcRenderer.invoke('db:update-row', id, table, rowid, data, db),
  deleteRow:          (id, table, rowid, db)       => ipcRenderer.invoke('db:delete-row', id, table, rowid, db),
  runQuery:           (id, sql)                    => ipcRenderer.invoke('db:run-query', id, sql),
})
