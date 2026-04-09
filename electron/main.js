const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const net  = require('net')

const isDev = process.env.NODE_ENV !== 'production'

// ── Lazy-load drivers (avoid crash if native module missing) ──────────────────
let Database, mysql, pgLib, mongoLib, ssh2Lib
try { Database = require('better-sqlite3') } catch (_) {}
try { mysql   = require('mysql2/promise')   } catch (_) {}
try { pgLib   = require('pg')               } catch (_) {}
try { mongoLib = require('mongodb')         } catch (_) {}
try { ssh2Lib = require('ssh2')             } catch (_) {}

// connections: Map<id, { adapter, name, dbType, filePath?, sshCleanup? }>
const connections = new Map()

// ── SSH Tunnel ────────────────────────────────────────────────────────────────
function createSSHTunnel(sshCfg, targetHost, targetPort) {
  return new Promise((resolve, reject) => {
    if (!ssh2Lib) return reject(new Error('ssh2 module not available'))
    const { Client } = ssh2Lib
    const client = new Client()

    client.on('ready', () => {
      const server = net.createServer(sock => {
        client.forwardOut('127.0.0.1', 0, targetHost, targetPort, (err, stream) => {
          if (err) { sock.destroy(); return }
          sock.pipe(stream).pipe(sock)
          sock.on('close', () => { try { stream.close() } catch (_) {} })
        })
      })
      server.listen(0, '127.0.0.1', () => {
        resolve({
          port: server.address().port,
          close: () => { try { server.close(); client.end() } catch (_) {} },
        })
      })
    })
    client.on('error', reject)

    const sshConnCfg = {
      host: sshCfg.host,
      port: Number(sshCfg.port) || 22,
      username: sshCfg.username,
      readyTimeout: 15000,
    }
    if (sshCfg.privateKey) {
      const fs = require('fs')
      const keyPath = sshCfg.privateKey.replace(/^~/, require('os').homedir())
      sshConnCfg.privateKey = fs.readFileSync(keyPath)
    } else {
      sshConnCfg.password = sshCfg.password
    }
    client.connect(sshConnCfg)
  })
}

// ── SQLite Adapter ────────────────────────────────────────────────────────────
class SQLiteAdapter {
  constructor(db) { this.db = db }

  listTables() {
    return this.db.prepare(`
      SELECT name, type FROM sqlite_master
      WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%'
      ORDER BY type, name
    `).all()
  }

  getTableData(table, page, limit) {
    const lim = Math.min(limit || 100, 1000)
    const off = (page || 0) * lim
    const rows = this.db.prepare(`SELECT rowid as __rowid__, * FROM "${table}" LIMIT ? OFFSET ?`).all(lim, off)
    const { cnt } = this.db.prepare(`SELECT COUNT(*) as cnt FROM "${table}"`).get()
    return { rows, total: cnt, page: page || 0, limit: lim }
  }

  getTableStructure(table) {
    const columns    = this.db.prepare(`PRAGMA table_info("${table}")`).all()
    const foreignKeys = this.db.prepare(`PRAGMA foreign_key_list("${table}")`).all()
    const indices    = this.db.prepare(`PRAGMA index_list("${table}")`).all()
    const { sql }    = this.db.prepare(`SELECT sql FROM sqlite_master WHERE name = ?`).get(table) || {}
    return { columns, foreignKeys, indices, sql: sql || '' }
  }

  runQuery(sql) {
    const start = Date.now()
    const isSelect = /^(SELECT|PRAGMA|EXPLAIN|WITH)\b/i.test(sql.trim())
    try {
      if (isSelect) {
        const rows = this.db.prepare(sql).all()
        return { rows, elapsed: Date.now() - start, type: 'select' }
      }
      this.db.exec(sql)
      return { changes: 0, elapsed: Date.now() - start, type: 'exec' }
    } catch (e) { return { error: e.message } }
  }

  insertRow(table, data) {
    try {
      const keys = Object.keys(data)
      const cols = keys.map(k => `"${k}"`).join(', ')
      const ph   = keys.map(() => '?').join(', ')
      const vals = keys.map(k => data[k] === '' ? null : data[k])
      const r = this.db.prepare(`INSERT INTO "${table}" (${cols}) VALUES (${ph})`).run(...vals)
      return { success: true, lastInsertRowid: r.lastInsertRowid }
    } catch (e) { return { error: e.message } }
  }

  updateRow(table, rowid, data) {
    try {
      const keys = Object.keys(data).filter(k => k !== '__rowid__')
      if (!keys.length) return { success: true }
      const sets = keys.map(k => `"${k}" = ?`).join(', ')
      const vals = [...keys.map(k => data[k] === '' ? null : data[k]), rowid]
      this.db.prepare(`UPDATE "${table}" SET ${sets} WHERE rowid = ?`).run(...vals)
      return { success: true }
    } catch (e) { return { error: e.message } }
  }

  deleteRow(table, rowid) {
    try {
      this.db.prepare(`DELETE FROM "${table}" WHERE rowid = ?`).run(rowid)
      return { success: true }
    } catch (e) { return { error: e.message } }
  }

  close() { try { this.db.close() } catch (_) {} }
}

// ── MySQL Adapter ─────────────────────────────────────────────────────────────
class MySQLAdapter {
  constructor(conn, database) { this.conn = conn; this.database = database; this._pk = {} }

  _tbl(table, dbName) {
    const db = dbName || this.database
    return db ? `\`${db}\`.\`${table}\`` : `\`${table}\``
  }

  async _getPk(table, dbName) {
    const db = dbName || this.database
    const key = `${db}.${table}`
    if (this._pk[key] !== undefined) return this._pk[key]
    const [rows] = await this.conn.execute(
      `SELECT COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = 'PRIMARY' LIMIT 1`,
      [db, table]
    )
    this._pk[key] = rows[0]?.COLUMN_NAME || null
    return this._pk[key]
  }

  async listDatabases() {
    const [rows] = await this.conn.execute(
      `SELECT SCHEMA_NAME as name FROM information_schema.SCHEMATA
       WHERE SCHEMA_NAME NOT IN ('information_schema','performance_schema','mysql','sys')
       ORDER BY SCHEMA_NAME`
    )
    return rows.map(r => ({ name: r.name, tables: null }))
  }

  async listTablesForDatabase(dbName) {
    const [rows] = await this.conn.execute(
      `SELECT TABLE_NAME as name, IF(TABLE_TYPE='VIEW','view','table') as type
       FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME`,
      [dbName]
    )
    return rows
  }

  async listTables() {
    if (this.database) return this.listTablesForDatabase(this.database)
    // fallback: no database selected
    const [rows] = await this.conn.execute(
      `SELECT SCHEMA_NAME as name, 'table' as type FROM information_schema.SCHEMATA
       WHERE SCHEMA_NAME NOT IN ('information_schema','performance_schema','mysql','sys')
       ORDER BY SCHEMA_NAME`
    )
    return rows
  }

  async getTableData(table, page, limit, dbName) {
    const lim = Math.min(limit || 100, 1000)
    const off = (page || 0) * lim
    const pk  = await this._getPk(table, dbName)
    const ref = this._tbl(table, dbName)
    const [rows] = await this.conn.execute(`SELECT * FROM ${ref} LIMIT ? OFFSET ?`, [lim, off])
    const [[{ cnt }]] = await this.conn.execute(`SELECT COUNT(*) as cnt FROM ${ref}`)
    const out = rows.map(r => ({ __rowid__: pk ? r[pk] : null, ...r }))
    return { rows: out, total: Number(cnt), page: page || 0, limit: lim }
  }

  async getTableStructure(table, dbName) {
    const ref = this._tbl(table, dbName)
    const [cols] = await this.conn.execute(`SHOW FULL COLUMNS FROM ${ref}`)
    const columns = cols.map((c, i) => ({
      cid: i, name: c.Field, type: c.Type,
      notnull: c.Null === 'NO' ? 1 : 0, dflt_value: c.Default, pk: c.Key === 'PRI' ? 1 : 0,
    }))
    let ddl = ''
    try {
      const [[r]] = await this.conn.execute(`SHOW CREATE TABLE ${ref}`)
      ddl = r['Create Table'] || r['Create View'] || ''
    } catch (_) {}
    return { columns, foreignKeys: [], indices: [], sql: ddl }
  }

  async runQuery(sql) {
    const start = Date.now()
    const isSelect = /^(SELECT|SHOW|DESCRIBE|DESC|EXPLAIN|WITH)\b/i.test(sql.trim())
    try {
      if (isSelect) {
        const [rows] = await this.conn.execute(sql)
        return { rows: rows.map(r => ({ ...r })), elapsed: Date.now() - start, type: 'select' }
      }
      const [result] = await this.conn.execute(sql)
      return { changes: result.affectedRows || 0, elapsed: Date.now() - start, type: 'exec' }
    } catch (e) { return { error: e.message } }
  }

  async insertRow(table, data, dbName) {
    try {
      const keys = Object.keys(data)
      const cols = keys.map(k => `\`${k}\``).join(', ')
      const ph   = keys.map(() => '?').join(', ')
      const vals = keys.map(k => data[k] === '' ? null : data[k])
      const ref  = this._tbl(table, dbName)
      const [r]  = await this.conn.execute(`INSERT INTO ${ref} (${cols}) VALUES (${ph})`, vals)
      return { success: true, lastInsertRowid: r.insertId }
    } catch (e) { return { error: e.message } }
  }

  async updateRow(table, rowid, data, dbName) {
    try {
      const pk = await this._getPk(table, dbName)
      if (!pk) return { error: 'No primary key found for update' }
      const keys = Object.keys(data).filter(k => k !== '__rowid__' && k !== pk)
      if (!keys.length) return { success: true }
      const sets = keys.map(k => `\`${k}\` = ?`).join(', ')
      const vals = [...keys.map(k => data[k] === '' ? null : data[k]), rowid]
      const ref  = this._tbl(table, dbName)
      await this.conn.execute(`UPDATE ${ref} SET ${sets} WHERE \`${pk}\` = ?`, vals)
      return { success: true }
    } catch (e) { return { error: e.message } }
  }

  async deleteRow(table, rowid, dbName) {
    try {
      const pk = await this._getPk(table, dbName)
      if (!pk) return { error: 'No primary key found for delete' }
      const ref = this._tbl(table, dbName)
      await this.conn.execute(`DELETE FROM ${ref} WHERE \`${pk}\` = ?`, [rowid])
      return { success: true }
    } catch (e) { return { error: e.message } }
  }

  async close() { try { await this.conn.end() } catch (_) {} }
}

// ── PostgreSQL Adapter ────────────────────────────────────────────────────────
class PostgreSQLAdapter {
  constructor(client) { this.client = client; this._pk = {} }

  _tbl(table, schema) {
    return schema ? `"${schema}"."${table}"` : `"${table}"`
  }

  async _getPk(table, schema) {
    const key = `${schema || 'public'}.${table}`
    if (this._pk[key] !== undefined) return this._pk[key]
    const ref = schema ? `${schema}.${table}` : table
    const { rows } = await this.client.query(`
      SELECT a.attname as col
      FROM pg_index i
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
      WHERE i.indrelid = $1::regclass AND i.indisprimary LIMIT 1
    `, [ref]).catch(() => ({ rows: [] }))
    this._pk[key] = rows[0]?.col || null
    return this._pk[key]
  }

  async listDatabases() {
    const { rows } = await this.client.query(`
      SELECT schema_name as name FROM information_schema.schemata
      WHERE schema_name NOT IN ('pg_catalog','information_schema','pg_toast')
      AND schema_name NOT LIKE 'pg_%'
      ORDER BY schema_name
    `)
    return rows.map(r => ({ name: r.name, tables: null }))
  }

  async listTablesForDatabase(schemaName) {
    const { rows } = await this.client.query(`
      SELECT tablename as name, 'table' as type FROM pg_tables WHERE schemaname = $1
      UNION ALL
      SELECT viewname as name, 'view' as type FROM pg_views WHERE schemaname = $1
      ORDER BY type, name
    `, [schemaName])
    return rows
  }

  async listTables() {
    const { rows } = await this.client.query(`
      SELECT tablename as name, 'table' as type FROM pg_tables
      WHERE schemaname NOT IN ('pg_catalog','information_schema','pg_toast')
      AND schemaname NOT LIKE 'pg_%'
      UNION ALL
      SELECT viewname as name, 'view' as type FROM pg_views
      WHERE schemaname NOT IN ('pg_catalog','information_schema','pg_toast')
      AND schemaname NOT LIKE 'pg_%'
      ORDER BY type, name
    `)
    return rows
  }

  async getTableData(table, page, limit, schema) {
    const lim = Math.min(limit || 100, 1000)
    const off = (page || 0) * lim
    const pk  = await this._getPk(table, schema)
    const ref = this._tbl(table, schema)
    const { rows } = await this.client.query(`SELECT * FROM ${ref} LIMIT $1 OFFSET $2`, [lim, off])
    const { rows: [{ cnt }] } = await this.client.query(`SELECT COUNT(*) as cnt FROM ${ref}`)
    const out = rows.map(r => ({ __rowid__: pk ? r[pk] : null, ...r }))
    return { rows: out, total: parseInt(cnt), page: page || 0, limit: lim }
  }

  async getTableStructure(table, schema) {
    const { rows: cols } = await this.client.query(`
      SELECT ordinal_position - 1 as cid, column_name as name, data_type as type,
             CASE WHEN is_nullable = 'NO' THEN 1 ELSE 0 END as notnull,
             column_default as dflt_value
      FROM information_schema.columns
      WHERE table_name = $1 ${schema ? 'AND table_schema = $2' : ''}
      ORDER BY ordinal_position
    `, schema ? [table, schema] : [table])
    const pk = await this._getPk(table, schema)
    const columns = cols.map(c => ({ ...c, pk: c.name === pk ? 1 : 0 }))
    return { columns, foreignKeys: [], indices: [], sql: `-- Table: ${schema ? schema + '.' : ''}${table}` }
  }

  async runQuery(sql) {
    const start = Date.now()
    try {
      const { rows, rowCount } = await this.client.query(sql)
      if (rows.length > 0 || /^(SELECT|WITH|EXPLAIN)\b/i.test(sql.trim())) {
        return { rows, elapsed: Date.now() - start, type: 'select' }
      }
      return { changes: rowCount || 0, elapsed: Date.now() - start, type: 'exec' }
    } catch (e) { return { error: e.message } }
  }

  async insertRow(table, data, schema) {
    try {
      const keys = Object.keys(data)
      const cols = keys.map(k => `"${k}"`).join(', ')
      const ph   = keys.map((_, i) => `$${i + 1}`).join(', ')
      const vals = keys.map(k => data[k] === '' ? null : data[k])
      const ref  = this._tbl(table, schema)
      const { rows } = await this.client.query(
        `INSERT INTO ${ref} (${cols}) VALUES (${ph}) RETURNING *`, vals
      )
      return { success: true, lastInsertRowid: rows[0]?.id }
    } catch (e) { return { error: e.message } }
  }

  async updateRow(table, rowid, data, schema) {
    try {
      const pk = await this._getPk(table, schema)
      if (!pk) return { error: 'No primary key found for update' }
      const keys = Object.keys(data).filter(k => k !== '__rowid__' && k !== pk)
      if (!keys.length) return { success: true }
      const sets = keys.map((k, i) => `"${k}" = $${i + 1}`).join(', ')
      const vals = [...keys.map(k => data[k] === '' ? null : data[k]), rowid]
      const ref  = this._tbl(table, schema)
      await this.client.query(`UPDATE ${ref} SET ${sets} WHERE "${pk}" = $${keys.length + 1}`, vals)
      return { success: true }
    } catch (e) { return { error: e.message } }
  }

  async deleteRow(table, rowid, schema) {
    try {
      const pk = await this._getPk(table, schema)
      if (!pk) return { error: 'No primary key found for delete' }
      const ref = this._tbl(table, schema)
      await this.client.query(`DELETE FROM ${ref} WHERE "${pk}" = $1`, [rowid])
      return { success: true }
    } catch (e) { return { error: e.message } }
  }

  async close() { try { await this.client.end() } catch (_) {} }
}

// ── MongoDB Adapter ───────────────────────────────────────────────────────────
class MongoDBAdapter {
  constructor(client, db) { this.client = client; this.db = db }

  async listTables() {
    const colls = await this.db.listCollections().toArray()
    return colls.map(c => ({ name: c.name, type: 'table' }))
  }

  async getTableData(table, page, limit) {
    const lim = Math.min(limit || 100, 1000)
    const off = (page || 0) * lim
    const coll = this.db.collection(table)
    const [docs, total] = await Promise.all([
      coll.find({}).skip(off).limit(lim).toArray(),
      coll.countDocuments(),
    ])
    const rows = docs.map(doc => {
      const { _id, ...rest } = doc
      return { __rowid__: _id.toString(), _id: _id.toString(), ...rest }
    })
    return { rows, total, page: page || 0, limit: lim }
  }

  async getTableStructure(table) {
    const doc = await this.db.collection(table).findOne({})
    const columns = doc ? Object.keys(doc).map((k, i) => ({
      cid: i, name: k,
      type: k === '_id' ? 'ObjectId' : (Array.isArray(doc[k]) ? 'Array' : typeof doc[k]),
      notnull: 0, dflt_value: null, pk: k === '_id' ? 1 : 0,
    })) : []
    const total = await this.db.collection(table).countDocuments()
    return { columns, foreignKeys: [], indices: [], sql: `// Collection: ${table} (${total} documents)` }
  }

  async runQuery(sql) {
    const start = Date.now()
    try {
      // Accept JSON: { "find": "col", "filter": {}, "limit": 100 }
      const cmd = JSON.parse(sql)
      if (cmd.find) {
        const docs = await this.db.collection(cmd.find)
          .find(cmd.filter || {}).limit(cmd.limit || 100).toArray()
        const rows = docs.map(d => ({ ...d, _id: d._id?.toString(), __rowid__: d._id?.toString() }))
        return { rows, elapsed: Date.now() - start, type: 'select' }
      }
      return { error: 'Use JSON: { "find": "collection", "filter": {} }' }
    } catch (_) {
      return { error: 'MongoDB queries must be JSON: { "find": "collection", "filter": {} }' }
    }
  }

  async insertRow(table, data) {
    try {
      const { __rowid__, _id, ...rest } = data
      const r = await this.db.collection(table).insertOne(rest)
      return { success: true, lastInsertRowid: r.insertedId.toString() }
    } catch (e) { return { error: e.message } }
  }

  async updateRow(table, rowid, data) {
    try {
      const { ObjectId } = mongoLib
      const { __rowid__, _id, ...rest } = data
      await this.db.collection(table).updateOne({ _id: new ObjectId(rowid) }, { $set: rest })
      return { success: true }
    } catch (e) { return { error: e.message } }
  }

  async deleteRow(table, rowid) {
    try {
      const { ObjectId } = mongoLib
      await this.db.collection(table).deleteOne({ _id: new ObjectId(rowid) })
      return { success: true }
    } catch (e) { return { error: e.message } }
  }

  async close() { try { await this.client.close() } catch (_) {} }
}

// ── Connection factory ────────────────────────────────────────────────────────
async function buildAdapter(cfg) {
  switch (cfg.dbType) {
    case 'mysql': {
      if (!mysql) throw new Error('mysql2 module not available')
      const conn = await mysql.createConnection({
        host: cfg.host, port: Number(cfg.port) || 3306,
        user: cfg.username, password: cfg.password, database: cfg.database,
        ssl: cfg.ssl ? {} : undefined,
        connectTimeout: 10000,
      })
      return new MySQLAdapter(conn, cfg.database)
    }
    case 'postgresql': {
      if (!pgLib) throw new Error('pg module not available')
      const { Client } = pgLib
      const client = new Client({
        host: cfg.host, port: Number(cfg.port) || 5432,
        user: cfg.username, password: cfg.password, database: cfg.database,
        ssl: cfg.ssl ? { rejectUnauthorized: false } : undefined,
        connectionTimeoutMillis: 10000,
      })
      await client.connect()
      return new PostgreSQLAdapter(client)
    }
    case 'mongodb': {
      if (!mongoLib) throw new Error('mongodb module not available')
      const { MongoClient } = mongoLib
      const auth = cfg.username
        ? `${encodeURIComponent(cfg.username)}:${encodeURIComponent(cfg.password)}@`
        : ''
      const url  = `mongodb://${auth}${cfg.host}:${Number(cfg.port) || 27017}`
      const client = new MongoClient(url, { serverSelectionTimeoutMS: 10000 })
      await client.connect()
      const db = client.db(cfg.database || 'admin')
      return new MongoDBAdapter(client, db)
    }
    default:
      throw new Error(`Unknown database type: ${cfg.dbType}`)
  }
}

// ── Demo SQLite database ──────────────────────────────────────────────────────
function createDemoDatabase() {
  if (!Database) return null
  const demoPath = path.join(app.getPath('userData'), 'cats_demo.db')
  const db = new Database(demoPath)
  db.exec(`
    CREATE TABLE IF NOT EXISTS cats (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
      breed TEXT, age INTEGER, color TEXT, weight_kg REAL,
      indoor INTEGER DEFAULT 1, notes TEXT
    );
    CREATE TABLE IF NOT EXISTS breeds (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE,
      origin TEXT, temperament TEXT, lifespan TEXT
    );
    CREATE TABLE IF NOT EXISTS health_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT, cat_id INTEGER NOT NULL,
      date TEXT, type TEXT, description TEXT, vet TEXT,
      FOREIGN KEY (cat_id) REFERENCES cats(id)
    );
  `)
  if (db.prepare('SELECT COUNT(*) as c FROM cats').get().c === 0) {
    const ins = db.prepare(`INSERT INTO cats (name,breed,age,color,weight_kg,indoor,notes) VALUES (?,?,?,?,?,?,?)`)
    ;[
      ['Whiskers','Persian',3,'White',4.2,1,'Loves sleeping on the couch'],
      ['Luna','Siamese',2,'Cream',3.1,1,'Very vocal and playful'],
      ['Shadow','British Shorthair',5,'Gray',5.0,1,'Calm and independent'],
      ['Mochi','Scottish Fold',1,'Orange Tabby',2.8,1,'Curious folded ears'],
      ['Bella','Maine Coon',4,'Brown Tabby',6.5,0,'Loves outdoor adventures'],
      ['Tiger','Bengal',3,'Spotted Brown',4.8,0,'High energy breed'],
      ['Nala','Abyssinian',2,'Ruddy',3.4,1,'Athletic and intelligent'],
      ['Cleo','Egyptian Mau',6,'Silver Spotted',3.9,1,'Ancient breed, fast runner'],
    ].forEach(r => ins.run(...r))
  }
  if (db.prepare('SELECT COUNT(*) as c FROM breeds').get().c === 0) {
    const ins = db.prepare(`INSERT INTO breeds (name,origin,temperament,lifespan) VALUES (?,?,?,?)`)
    ;[
      ['Persian','Iran','Calm, Gentle, Affectionate','12-17 years'],
      ['Siamese','Thailand','Vocal, Active, Social','15-20 years'],
      ['British Shorthair','UK','Calm, Reserved, Patient','12-20 years'],
      ['Scottish Fold','Scotland','Curious, Adaptable, Sweet','11-15 years'],
      ['Maine Coon','USA','Friendly, Playful, Gentle','12-15 years'],
      ['Bengal','USA','Active, Energetic, Curious','10-16 years'],
    ].forEach(r => ins.run(...r))
  }
  return { db, filePath: demoPath, name: 'cats_demo.db' }
}

// ── Window ────────────────────────────────────────────────────────────────────
function createWindow() {
  const win = new BrowserWindow({
    width: 1400, height: 900, minWidth: 900, minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false, contextIsolation: true,
    },
    title: 'CatDB', backgroundColor: '#1e2128',
  })
  if (isDev) win.loadURL('http://localhost:5173')
  else win.loadFile(path.join(__dirname, '../dist/index.html'))
}

// ── IPC — file-based SQLite ───────────────────────────────────────────────────
function openSQLiteFile(filePath) {
  if (!Database) return { error: 'better-sqlite3 not available. Run: npm run rebuild' }
  try {
    const db = new Database(filePath)
    const id = `conn_${Date.now()}`
    const name = path.basename(filePath)
    connections.set(id, { adapter: new SQLiteAdapter(db), name, dbType: 'sqlite', filePath })
    return { id, name, filePath }
  } catch (e) { return { error: e.message } }
}

ipcMain.handle('db:open-file', async () => {
  const r = await dialog.showOpenDialog({
    title: 'Open SQLite Database',
    filters: [{ name: 'SQLite', extensions: ['db','sqlite','sqlite3','s3db','sl3'] }, { name: 'All', extensions: ['*'] }],
    properties: ['openFile'],
  })
  if (r.canceled || !r.filePaths.length) return null
  return openSQLiteFile(r.filePaths[0])
})

ipcMain.handle('db:create-file', async () => {
  const r = await dialog.showSaveDialog({
    title: 'Create New SQLite Database',
    filters: [{ name: 'SQLite', extensions: ['db'] }],
    defaultPath: 'new_database.db',
  })
  if (r.canceled || !r.filePath) return null
  return openSQLiteFile(r.filePath)
})

ipcMain.handle('db:get-demo', () => {
  if (!Database) return { error: 'better-sqlite3 not available. Run: npm run rebuild' }
  for (const [id, conn] of connections) {
    if (conn.name === 'cats_demo.db') return { id, name: conn.name, filePath: conn.filePath }
  }
  try {
    const demo = createDemoDatabase()
    if (!demo) return { error: 'Failed to create demo DB' }
    const id = 'demo'
    connections.set(id, { adapter: new SQLiteAdapter(demo.db), name: demo.name, dbType: 'sqlite', filePath: demo.filePath })
    return { id, name: demo.name, filePath: demo.filePath }
  } catch (e) { return { error: e.message } }
})

// ── IPC — remote connection ───────────────────────────────────────────────────
ipcMain.handle('db:connect-remote', async (_, cfg) => {
  let sshCleanup = null
  try {
    let host = cfg.host
    let port = Number(cfg.port)

    if (cfg.ssh) {
      const tunnel = await createSSHTunnel(cfg.ssh, host, port)
      host = '127.0.0.1'
      port = tunnel.port
      sshCleanup = tunnel.close
    }

    const adapter = await buildAdapter({ ...cfg, host, port })
    const id   = `conn_${Date.now()}`
    const name = cfg.name || `${cfg.dbType}://${cfg.host}/${cfg.database || ''}`
    connections.set(id, { adapter, name, dbType: cfg.dbType, sshCleanup })
    return {
      id,
      name,
      filePath: `${cfg.dbType}://${cfg.host}:${cfg.port}/${cfg.database || ''}`,
      dbType: cfg.dbType,
      database: cfg.database,
    }
  } catch (e) {
    if (sshCleanup) sshCleanup()
    return { error: e.message }
  }
})

ipcMain.handle('db:test-connection', async (_, cfg) => {
  let sshCleanup = null
  const start = Date.now()
  try {
    let host = cfg.host
    let port = Number(cfg.port)
    if (cfg.ssh) {
      const tunnel = await createSSHTunnel(cfg.ssh, host, port)
      host = '127.0.0.1'; port = tunnel.port; sshCleanup = tunnel.close
    }
    const adapter = await buildAdapter({ ...cfg, host, port })
    await adapter.close()
    return { ok: true, latency: Date.now() - start }
  } catch (e) {
    return { ok: false, error: e.message }
  } finally {
    if (sshCleanup) sshCleanup()
  }
})

// ── IPC — generic adapter passthrough ────────────────────────────────────────
ipcMain.handle('db:close', async (_, id) => {
  const conn = connections.get(id)
  if (conn) { await conn.adapter.close(); if (conn.sshCleanup) conn.sshCleanup(); connections.delete(id) }
  return true
})

ipcMain.handle('db:list-tables', async (_, id) => {
  const conn = connections.get(id)
  if (!conn) return { error: 'Connection not found' }
  try { return await conn.adapter.listTables() } catch (e) { return { error: e.message } }
})

ipcMain.handle('db:list-databases', async (_, id) => {
  const conn = connections.get(id)
  if (!conn) return { error: 'Connection not found' }
  if (typeof conn.adapter.listDatabases !== 'function') return []
  try { return await conn.adapter.listDatabases() } catch (e) { return { error: e.message } }
})

ipcMain.handle('db:list-tables-for-db', async (_, id, dbName) => {
  const conn = connections.get(id)
  if (!conn) return { error: 'Connection not found' }
  if (typeof conn.adapter.listTablesForDatabase !== 'function') return { error: 'Database listing not supported' }
  try { return await conn.adapter.listTablesForDatabase(dbName) } catch (e) { return { error: e.message } }
})

ipcMain.handle('db:table-data', async (_, id, table, page, limit, dbName) => {
  const conn = connections.get(id)
  if (!conn) return { error: 'Connection not found' }
  try { return await conn.adapter.getTableData(table, page, limit, dbName) } catch (e) { return { error: e.message } }
})

ipcMain.handle('db:table-structure', async (_, id, table, dbName) => {
  const conn = connections.get(id)
  if (!conn) return { error: 'Connection not found' }
  try { return await conn.adapter.getTableStructure(table, dbName) } catch (e) { return { error: e.message } }
})

ipcMain.handle('db:run-query', async (_, id, sql) => {
  const conn = connections.get(id)
  if (!conn) return { error: 'Connection not found' }
  try { return await conn.adapter.runQuery(sql) } catch (e) { return { error: e.message } }
})

ipcMain.handle('db:insert-row', async (_, id, table, data, dbName) => {
  const conn = connections.get(id)
  if (!conn) return { error: 'Connection not found' }
  try { return await conn.adapter.insertRow(table, data, dbName) } catch (e) { return { error: e.message } }
})

ipcMain.handle('db:update-row', async (_, id, table, rowid, data, dbName) => {
  const conn = connections.get(id)
  if (!conn) return { error: 'Connection not found' }
  try { return await conn.adapter.updateRow(table, rowid, data, dbName) } catch (e) { return { error: e.message } }
})

ipcMain.handle('db:delete-row', async (_, id, table, rowid, dbName) => {
  const conn = connections.get(id)
  if (!conn) return { error: 'Connection not found' }
  try { return await conn.adapter.deleteRow(table, rowid, dbName) } catch (e) { return { error: e.message } }
})

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => {
  connections.forEach(c => { c.adapter.close(); if (c.sshCleanup) c.sshCleanup() })
  if (process.platform !== 'darwin') app.quit()
})
