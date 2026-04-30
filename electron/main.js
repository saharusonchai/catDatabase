const { app, BrowserWindow, ipcMain, dialog, globalShortcut } = require('electron')
const fs = require('fs')
const path = require('path')
const net  = require('net')
const crypto = require('crypto')
const os = require('os')

const isDev = process.env.NODE_ENV !== 'production'
const appIconPath = path.join(__dirname, '..', 'build', 'icons', 'icon.png')

// ── Lazy-load drivers (avoid crash if native module missing) ──────────────────
let Database, mysql, pgLib, mongoLib, ssh2Lib
try { Database = require('better-sqlite3') } catch (_) {}
try { mysql   = require('mysql2/promise')   } catch (_) {}
try { pgLib   = require('pg')               } catch (_) {}
try { mongoLib = require('mongodb')         } catch (_) {}
try { ssh2Lib = require('ssh2')             } catch (_) {}

const KEEPALIVE_INTERVAL_SECONDS = 240
const KEEPALIVE_INTERVAL_MS = KEEPALIVE_INTERVAL_SECONDS * 1000
const SAVED_CONNECTIONS_FILE = 'saved-connections.json'
const AUTH_TOKEN_BYTES = 32
const PASSWORD_KEY_BYTES = 64
const PASSWORD_SALT_BYTES = 16
const AUTH_SESSION_DAYS = 30
const sessions = new Map()

function loadEnvFile() {
  const envPath = path.join(process.cwd(), '.env')
  if (!fs.existsSync(envPath)) return

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const separator = trimmed.indexOf('=')
    if (separator < 1) continue

    const key = trimmed.slice(0, separator).trim()
    let value = trimmed.slice(separator + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    if (process.env[key] === undefined) process.env[key] = value
  }
}

loadEnvFile()

function getSavedConnectionsPath() {
  return path.join(app.getPath('userData'), SAVED_CONNECTIONS_FILE)
}

function readSavedConnectionsFile() {
  try {
    const filePath = getSavedConnectionsPath()
    if (!fs.existsSync(filePath)) return []
    const raw = fs.readFileSync(filePath, 'utf8').trim()
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (_) {
    return []
  }
}

function writeSavedConnectionsFile(list) {
  const filePath = getSavedConnectionsPath()
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(Array.isArray(list) ? list : [], null, 2), 'utf8')
  return true
}

function toPortableHomePath(filePath) {
  const homeDir = os.homedir()
  if (!homeDir || !filePath) return filePath

  const relativePath = path.relative(homeDir, filePath)
  if (
    relativePath === '' ||
    relativePath.startsWith('..') ||
    path.isAbsolute(relativePath)
  ) {
    return filePath
  }

  return `~/${relativePath.split(path.sep).join('/')}`
}

function assertSessionUser(token) {
  const session = sessions.get(String(token || ''))
  if (!session?.user?.id) throw new Error('Please sign in again')
  return session.user
}

function normalizeSavedConnection(input) {
  const config = input && typeof input.config === 'object' && input.config !== null ? input.config : null
  if (!config) return null

  const id = String(input.id || '').trim()
  const label = String(input.label || config.name || id || 'Untitled Connection').trim()
  const lastUsed = Number(input.lastUsed || Date.now())

  if (!id || !label) return null
  return {
    id,
    label,
    config,
    lastUsed: Number.isFinite(lastUsed) ? lastUsed : Date.now(),
  }
}

function normalizeSavedConnectionsList(list) {
  if (!Array.isArray(list)) return []
  const seen = new Set()
  const normalized = []

  for (const item of list) {
    const saved = normalizeSavedConnection(item)
    if (!saved || seen.has(saved.id)) continue
    seen.add(saved.id)
    normalized.push(saved)
    if (normalized.length >= 20) break
  }

  return normalized
}

async function readSavedConnectionsForUser(userId) {
  const saved = await withAuthClient(async client => {
    const { rows } = await client.query(
      `SELECT connection_key, label, config, last_used_at
       FROM app_user_connections
       WHERE user_id = $1
       ORDER BY last_used_at DESC, updated_at DESC`,
      [userId]
    )

    return rows.map(row => ({
      id: row.connection_key,
      label: row.label,
      config: row.config,
      lastUsed: row.last_used_at ? new Date(row.last_used_at).getTime() : Date.now(),
    }))
  })

  if (saved.length > 0) return saved

  const legacy = normalizeSavedConnectionsList(readSavedConnectionsFile())
  if (legacy.length > 0) {
    await writeSavedConnectionsForUser(userId, legacy)
  }
  return legacy
}

async function writeSavedConnectionsForUser(userId, list) {
  const saved = normalizeSavedConnectionsList(list)

  await withAuthClient(async client => {
    await client.query('BEGIN')
    try {
      await client.query('DELETE FROM app_user_connections WHERE user_id = $1', [userId])

      for (const item of saved) {
        await client.query(
          `INSERT INTO app_user_connections (user_id, connection_key, label, config, last_used_at)
           VALUES ($1, $2, $3, $4::jsonb, to_timestamp($5 / 1000.0))`,
          [userId, item.id, item.label, JSON.stringify(item.config), item.lastUsed]
        )
      }

      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      throw error
    }
  })

  return saved
}

function getAuthPgConfig() {
  const connectionString = process.env.CATDB_AUTH_DATABASE_URL || process.env.DATABASE_URL
  if (connectionString) {
    if (hasAuthSshConfig()) return parsePgConnectionString(connectionString)
    return {
      connectionString,
      ssl: process.env.CATDB_AUTH_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    }
  }

  return {
    host: process.env.CATDB_AUTH_HOST || process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.CATDB_AUTH_PORT || process.env.PGPORT || 5432),
    user: process.env.CATDB_AUTH_USER || process.env.PGUSER || 'postgres',
    password: process.env.CATDB_AUTH_PASSWORD || process.env.PGPASSWORD || '',
    database: process.env.CATDB_AUTH_DATABASE || process.env.PGDATABASE || 'catdb',
    ssl: process.env.CATDB_AUTH_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: 10000,
  }
}

function parsePgConnectionString(connectionString) {
  const parsed = new URL(connectionString)
  return {
    host: parsed.hostname || '127.0.0.1',
    port: Number(parsed.port || 5432),
    user: decodeURIComponent(parsed.username || 'postgres'),
    password: decodeURIComponent(parsed.password || ''),
    database: decodeURIComponent(parsed.pathname.replace(/^\//, '') || 'catdb'),
    ssl: process.env.CATDB_AUTH_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: 10000,
  }
}

function hasAuthSshConfig() {
  return Boolean(process.env.CATDB_AUTH_SSH_HOST)
}

function getAuthSshConfig() {
  return {
    host: process.env.CATDB_AUTH_SSH_HOST,
    port: Number(process.env.CATDB_AUTH_SSH_PORT || 22),
    username: process.env.CATDB_AUTH_SSH_USER,
    password: process.env.CATDB_AUTH_SSH_PASSWORD,
    privateKey: process.env.CATDB_AUTH_SSH_PRIVATE_KEY,
  }
}

async function withAuthClient(fn) {
  if (!pgLib) throw new Error('pg module not available')
  const { Client } = pgLib
  const pgConfig = getAuthPgConfig()
  let sshCleanup = null

  if (hasAuthSshConfig()) {
    const tunnel = await createSSHTunnel(
      getAuthSshConfig(),
      pgConfig.host,
      Number(pgConfig.port) || 5432,
      { keepAlive: process.env.CATDB_AUTH_SSH_KEEP_ALIVE === 'true' }
    )
    pgConfig.host = '127.0.0.1'
    pgConfig.port = tunnel.port
    sshCleanup = tunnel.close
  }

  const client = new Client(pgConfig)
  try {
    await client.connect()
    return await fn(client)
  } finally {
    await client.end().catch(() => {})
    if (sshCleanup) sshCleanup()
  }
}

function hashPassword(password) {
  const salt = crypto.randomBytes(PASSWORD_SALT_BYTES).toString('hex')
  const hash = crypto.scryptSync(password, salt, PASSWORD_KEY_BYTES).toString('hex')
  return `scrypt:${salt}:${hash}`
}

function verifyPassword(password, storedHash) {
  const [algorithm, salt, hash] = String(storedHash || '').split(':')
  if (algorithm !== 'scrypt' || !salt || !hash) return false
  const expected = Buffer.from(hash, 'hex')
  const actual = crypto.scryptSync(password, salt, expected.length)
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
}

function sanitizeUser(row) {
  if (!row) return null
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    createdAt: row.created_at,
  }
}

function validateAuthInput({ username, email, password }, mode) {
  const next = {
    username: String(username || '').trim(),
    email: String(email || '').trim().toLowerCase(),
    password: String(password || ''),
  }

  if (mode === 'register') {
    if (next.username.length < 3) throw new Error('Username must be at least 3 characters')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.email)) throw new Error('A valid email is required')
  }

  if (mode === 'login' && next.username.length < 1) {
    throw new Error('Username is required')
  }

  if (next.password.length < 8) throw new Error('Password must be at least 8 characters')
  return next
}

function hashAuthToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex')
}

async function createSession(user) {
  const token = crypto.randomBytes(AUTH_TOKEN_BYTES).toString('hex')
  sessions.set(token, { user, createdAt: Date.now() })
  await withAuthClient(async client => {
    await client.query(
      `INSERT INTO app_user_sessions (user_id, token_hash, expires_at)
       VALUES ($1, $2, now() + ($3::int * interval '1 day'))`,
      [user.id, hashAuthToken(token), AUTH_SESSION_DAYS]
    )
  })
  return token
}

async function getUserFromToken(token) {
  const rawToken = String(token || '')
  if (!rawToken) return null

  const memorySession = sessions.get(rawToken)
  if (memorySession?.user) return memorySession.user

  const user = await withAuthClient(async client => {
    const { rows } = await client.query(
      `SELECT u.id, u.username, u.email, u.created_at
       FROM app_user_sessions s
       JOIN app_users u ON u.id = s.user_id
       WHERE s.token_hash = $1
         AND s.expires_at > now()
       LIMIT 1`,
      [hashAuthToken(rawToken)]
    )

    if (!rows[0]) return null

    await client.query(
      `UPDATE app_user_sessions
       SET last_seen_at = now()
       WHERE token_hash = $1`,
      [hashAuthToken(rawToken)]
    )

    return sanitizeUser(rows[0])
  })

  if (user) sessions.set(rawToken, { user, createdAt: Date.now() })
  return user
}

async function deleteSession(token) {
  const rawToken = String(token || '')
  sessions.delete(rawToken)
  if (!rawToken) return
  await withAuthClient(async client => {
    await client.query('DELETE FROM app_user_sessions WHERE token_hash = $1', [hashAuthToken(rawToken)])
  })
}

function assertSimpleIdentifier(value, label = 'Identifier') {
  const text = String(value || '').trim()
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(text)) {
    throw new Error(`${label} must use letters, numbers, and underscores only`)
  }
  return text
}

function quoteSqliteIdentifier(value) {
  return `"${String(value).replace(/"/g, '""')}"`
}

function quotePgIdentifier(value) {
  return `"${String(value).replace(/"/g, '""')}"`
}

function quoteMysqlIdentifier(value) {
  return `\`${String(value).replace(/`/g, '``')}\``
}

function normalizeIpcValue(value) {
  if (value == null) return value
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') return value
  if (value instanceof Date) return value.toISOString()
  if (Buffer.isBuffer(value)) return value.toString('utf8')
  if (Array.isArray(value)) return value.map(normalizeIpcValue)
  if (ArrayBuffer.isView(value)) return Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString('utf8')
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [key, normalizeIpcValue(entryValue)])
    )
  }
  return String(value)
}

function normalizeIpcRow(row) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, normalizeIpcValue(value)])
  )
}

function safeExportName(value) {
  return String(value || 'export')
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 120) || 'export'
}

function getScopedTableName(table) {
  return table.schema ? `${table.schema}.${table.name}` : table.name
}

async function collectExportRows(adapter, tableName, dbName) {
  const pageSize = 1000
  let page = 0
  let total = null
  const rows = []

  while (total == null || rows.length < total) {
    const result = await adapter.getTableData(tableName, page, pageSize, dbName)
    if (result?.error) throw new Error(result.error)
    total = Number(result.total || 0)
    rows.push(...(result.rows || []).map(row => {
      const { __rowid__, ...data } = row
      return data
    }))
    if (!result.rows?.length) break
    page += 1
  }

  return rows
}

async function collectExportTables(adapter, scope) {
  if (scope.type === 'table') {
    return [{
      name: scope.tableName,
      schema: scope.schemaName,
      type: scope.itemType || 'table',
    }]
  }

  if (typeof adapter.listTablesForDatabase === 'function') {
    return await adapter.listTablesForDatabase(scope.databaseName)
  }

  return await adapter.listTables()
}

function buildSchemaExport(payload) {
  return {
    exportedAt: new Date().toISOString(),
    format: payload.mode,
    connection: payload.connection,
    scope: payload.scope,
    tables: payload.tables,
  }
}

function buildAiExportMarkdown(payload) {
  const lines = [
    `# Database Structure: ${payload.scope.databaseName || payload.connection.name}`,
    '',
    `- Connection: ${payload.connection.name}`,
    `- Type: ${payload.connection.dbType || 'database'}`,
    `- Scope: ${payload.scope.type === 'database' ? 'database' : 'table'}`,
    `- Exported: ${new Date().toISOString()}`,
    '',
    'Use this schema context to understand table names, columns, primary keys, nullability, defaults, and available SQL definitions.',
    '',
  ]

  for (const table of payload.tables) {
    lines.push(`## ${table.schema ? `${table.schema}.` : ''}${table.name}`)
    lines.push('')
    if (table.type) lines.push(`- Type: ${table.type}`)
    if (Number.isFinite(table.totalRows)) lines.push(`- Rows: ${table.totalRows}`)
    lines.push('')
    lines.push('| Column | Type | PK | Nullable | Default | Comment |')
    lines.push('| --- | --- | --- | --- | --- | --- |')
    for (const column of table.structure.columns || []) {
      lines.push(`| ${column.name ?? ''} | ${column.type ?? ''} | ${column.pk ? 'yes' : ''} | ${column.notnull ? 'no' : 'yes'} | ${column.dflt_value ?? ''} | ${column.comment ?? ''} |`)
    }
    if (table.structure.sql) {
      lines.push('')
      lines.push('```sql')
      lines.push(String(table.structure.sql))
      lines.push('```')
    }
    lines.push('')
  }

  return lines.join('\n')
}

async function exportConnectionScope(conn, request) {
  const scope = request?.scope || {}
  const mode = request?.mode || 'schema'
  const adapter = conn.adapter
  const tables = await collectExportTables(adapter, scope)
  const exportedTables = []

  for (const table of tables) {
    const tableName = getScopedTableName(table)
    const structure = await adapter.getTableStructure(tableName, scope.databaseName)
    if (structure?.error) throw new Error(structure.error)

    const exportedTable = {
      name: table.name,
      schema: table.schema,
      type: table.type,
      structure,
    }

    if (mode === 'data') {
      exportedTable.rows = await collectExportRows(adapter, tableName, scope.databaseName)
      exportedTable.totalRows = exportedTable.rows.length
    } else if (mode === 'ai') {
      const sample = await adapter.getTableData(tableName, 0, 1, scope.databaseName).catch(() => null)
      exportedTable.totalRows = sample?.total == null ? undefined : Number(sample.total)
    }

    exportedTables.push(exportedTable)
  }

  const exportPayload = buildSchemaExport({
    mode,
    connection: {
      name: conn.name,
      dbType: conn.dbType,
      filePath: conn.filePath,
    },
    scope,
    tables: exportedTables,
  })

  const isAi = mode === 'ai'
  const content = isAi
    ? buildAiExportMarkdown(exportPayload)
    : JSON.stringify(exportPayload, null, 2)
  const extension = isAi ? 'md' : 'json'
  const defaultName = `${safeExportName(scope.databaseName || scope.tableName || conn.name)}-${mode}.${extension}`

  const result = await dialog.showSaveDialog({
    title: 'Export Database',
    defaultPath: defaultName,
    filters: isAi
      ? [{ name: 'Markdown', extensions: ['md'] }]
      : [{ name: 'JSON', extensions: ['json'] }],
  })

  if (result.canceled || !result.filePath) return { canceled: true }
  fs.writeFileSync(result.filePath, content, 'utf8')
  return {
    success: true,
    filePath: result.filePath,
    tableCount: exportedTables.length,
    rowCount: exportedTables.reduce((sum, table) => sum + (table.rows?.length || 0), 0),
  }
}

function buildColumnDefinition(dbType, column) {
  const quote = dbType === 'mysql'
    ? quoteMysqlIdentifier
    : dbType === 'postgresql'
      ? quotePgIdentifier
      : quoteSqliteIdentifier
  const name = quote(column.name)
  const type = String(column.type || 'TEXT').trim() || 'TEXT'
  const parts = [name, type]
  if (column.notnull) parts.push('NOT NULL')
  if (column.pk) parts.push('PRIMARY KEY')
  return parts.join(' ')
}

function buildCreateColumnsSql(dbType, structure) {
  const columns = Array.isArray(structure?.columns) ? structure.columns : []
  if (!columns.length) throw new Error('Import file does not include table columns')
  return columns.map(column => buildColumnDefinition(dbType, column)).join(', ')
}

async function tableExists(adapter, scope, table) {
  const tables = typeof adapter.listTablesForDatabase === 'function'
    ? await adapter.listTablesForDatabase(scope.databaseName)
    : await adapter.listTables()
  return Array.isArray(tables) && tables.some(item => (
    item.name === table.name &&
    (!table.schema || !item.schema || item.schema === table.schema)
  ))
}

function getImportTableName(conn, table, scope) {
  if (scope.type === 'table') {
    if (conn.dbType === 'postgresql' && scope.schemaName) return `${scope.schemaName}.${scope.tableName}`
    return scope.tableName
  }
  if (conn.dbType === 'postgresql' && table.schema) return `${table.schema}.${table.name}`
  return table.name
}

async function createImportTableIfNeeded(conn, scope, table) {
  if (conn.dbType === 'mongodb') return false
  if (await tableExists(conn.adapter, scope, table)) return false
  if (typeof conn.adapter.createTable !== 'function') {
    throw new Error('Create table is not supported for this connection')
  }

  const columnsSql = buildCreateColumnsSql(conn.dbType, table.structure)
  const tableName = scope.type === 'table' ? scope.tableName : table.name
  const schemaName = conn.dbType === 'postgresql'
    ? (scope.schemaName || table.schema || 'public')
    : undefined
  const result = await conn.adapter.createTable(tableName, columnsSql, scope.databaseName, schemaName)
  if (result?.error) throw new Error(result.error)
  return true
}

async function importRows(conn, scope, table) {
  const rows = Array.isArray(table.rows) ? table.rows : []
  const tableName = getImportTableName(conn, table, scope)
  let inserted = 0
  let failed = 0
  let firstError = null

  for (const row of rows) {
    const result = await conn.adapter.insertRow(tableName, row, scope.databaseName)
    if (result?.error) {
      failed += 1
      firstError = firstError || result.error
    } else {
      inserted += 1
    }
  }

  return { inserted, failed, firstError }
}

function selectImportTables(payload, scope) {
  const tables = Array.isArray(payload?.tables) ? payload.tables : []
  if (!tables.length) throw new Error('Import file does not include tables')
  if (scope.type !== 'table') return tables

  if (tables.length === 1) {
    return [{
      ...tables[0],
      name: scope.tableName,
      schema: scope.schemaName || tables[0].schema,
    }]
  }

  const matched = tables.find(table => table.name === scope.tableName && (!scope.schemaName || table.schema === scope.schemaName))
  if (!matched) throw new Error(`Import file does not include table ${scope.tableName}`)
  return [matched]
}

async function importConnectionScope(conn, request) {
  const scope = request?.scope || {}
  const mode = request?.mode || 'schema-data'
  const result = await dialog.showOpenDialog({
    title: 'Import Table',
    filters: [{ name: 'CatDB JSON Export', extensions: ['json'] }],
    properties: ['openFile'],
  })

  if (result.canceled || !result.filePaths.length) return { canceled: true }

  const raw = fs.readFileSync(result.filePaths[0], 'utf8')
  const payload = JSON.parse(raw)
  const tables = selectImportTables(payload, scope)
  let created = 0
  let inserted = 0
  let failed = 0
  let firstError = null

  for (const table of tables) {
    if (mode === 'schema' || mode === 'schema-data') {
      const didCreate = await createImportTableIfNeeded(conn, scope, table)
      if (didCreate) created += 1
    }

    if (mode === 'data' || mode === 'schema-data') {
      const rowResult = await importRows(conn, scope, table)
      inserted += rowResult.inserted
      failed += rowResult.failed
      firstError = firstError || rowResult.firstError
    }
  }

  return {
    success: true,
    filePath: result.filePaths[0],
    tableCount: tables.length,
    created,
    inserted,
    failed,
    warning: firstError ? `Some rows failed. First error: ${firstError}` : undefined,
  }
}

function replacePgQualifiedName(definition, schema, currentTable, targetTable) {
  const quotedCurrent = `${quotePgIdentifier(schema)}.${quotePgIdentifier(currentTable)}`
  const quotedTarget = `${quotePgIdentifier(schema)}.${quotePgIdentifier(targetTable)}`
  const unquotedCurrent = `${schema}.${currentTable}`
  const unquotedTarget = `${schema}.${targetTable}`

  return String(definition || '')
    .split(quotedCurrent).join(quotedTarget)
    .split(unquotedCurrent).join(unquotedTarget)
}

function normalizeTableFilterClause(filter) {
  const raw = String(filter || '').trim()
  if (!raw) return ''
  const clause = raw.replace(/^\s*where\b/i, '').trim()
  if (!clause) return ''
  if (/[;]/.test(clause) || /--|\/\*/.test(clause)) {
    throw new Error('Filter must be a single WHERE expression')
  }
  return clause
}

function normalizeSortDirection(direction) {
  return String(direction || '').toLowerCase() === 'desc' ? 'DESC' : 'ASC'
}

// connections: Map<id, { adapter, name, dbType, filePath?, sshCleanup? }>
const connections = new Map()

// ── SSH Tunnel ────────────────────────────────────────────────────────────────
function createSSHTunnel(sshCfg, targetHost, targetPort, options = {}) {
  return new Promise((resolve, reject) => {
    if (!ssh2Lib) return reject(new Error('ssh2 module not available'))
    const { Client } = ssh2Lib
    const client = new Client()
    let server = null
    let resolved = false
    let isClosed = false

    const closeTunnel = () => {
      if (isClosed) return
      isClosed = true
      try { server?.close() } catch (_) {}
      try { client.end() } catch (_) {}
    }

    const fail = (err) => {
      closeTunnel()
      if (!resolved) reject(err)
    }

    client.on('ready', () => {
      server = net.createServer(sock => {
        if (isClosed) {
          sock.destroy()
          return
        }

        try {
          client.forwardOut('127.0.0.1', 0, targetHost, targetPort, (err, stream) => {
            if (err || isClosed) {
              sock.destroy()
              if (stream) {
                try { stream.close() } catch (_) {}
              }
              return
            }

          sock.pipe(stream).pipe(sock)
          sock.on('close', () => { try { stream.close() } catch (_) {} })
          })
        } catch (_) {
          sock.destroy()
        }
      })

      server.on('error', fail)
      server.listen(0, '127.0.0.1', () => {
        resolved = true
        resolve({
          port: server.address().port,
          close: closeTunnel,
        })
      })
    })
    client.on('error', fail)
    client.on('close', closeTunnel)
    client.on('end', closeTunnel)

    const sshConnCfg = {
      host: sshCfg.host,
      port: Number(sshCfg.port) || 22,
      username: sshCfg.username,
      readyTimeout: 15000,
      keepaliveInterval: options.keepAlive ? KEEPALIVE_INTERVAL_MS : 0,
      keepaliveCountMax: options.keepAlive ? 3 : undefined,
    }
    if (sshCfg.privateKey) {
      const keyPath = sshCfg.privateKey.replace(/^~/, os.homedir())
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

  getTableData(table, page, limit, _dbName, filter, sortColumn, sortDirection) {
    const lim = Math.min(limit || 100, 1000)
    const off = (page || 0) * lim
    const clause = normalizeTableFilterClause(filter)
    const where = clause ? ` WHERE ${clause}` : ''
    const order = sortColumn ? ` ORDER BY ${quoteSqliteIdentifier(sortColumn)} ${normalizeSortDirection(sortDirection)}` : ''
    const rows = this.db.prepare(`SELECT rowid as __rowid__, * FROM "${table}"${where}${order} LIMIT ? OFFSET ?`).all(lim, off)
    const { cnt } = this.db.prepare(`SELECT COUNT(*) as cnt FROM "${table}"${where}`).get()
    return { rows, total: cnt, page: page || 0, limit: lim }
  }

  getTableStructure(table) {
    const columns    = this.db.prepare(`PRAGMA table_info("${table}")`).all().map(column => ({ ...column, comment: null }))
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

  createTable(table, columnsSql) {
    try {
      const tableName = assertSimpleIdentifier(table, 'Table name')
      const definition = String(columnsSql || '').trim()
      if (!definition) return { error: 'Column definition is required' }
      this.db.exec(`CREATE TABLE "${tableName}" (${definition})`)
      return { success: true }
    } catch (e) { return { error: e.message } }
  }

  updateTableSchema(table, nextTable, columnsSql) {
    try {
      const currentTable = assertSimpleIdentifier(table, 'Table name')
      const targetTable = assertSimpleIdentifier(nextTable, 'Table name')
      const definition = String(columnsSql || '').trim()
      if (!definition) return { error: 'Column definition is required' }

      const existingColumns = this.db.prepare(`PRAGMA table_info(${quoteSqliteIdentifier(currentTable)})`).all()
      if (!existingColumns.length) return { error: 'Table not found' }

      const existingNames = new Set(existingColumns.map(column => column.name))
      const tempTable = `__tmp_edit_${Date.now()}`
      const quotedCurrent = quoteSqliteIdentifier(currentTable)
      const quotedTarget = quoteSqliteIdentifier(targetTable)
      const quotedTemp = quoteSqliteIdentifier(tempTable)
      const quotedBackup = quoteSqliteIdentifier(`__old_${Date.now()}`)

      this.db.exec('BEGIN')
      try {
        this.db.exec('PRAGMA foreign_keys = OFF')
        this.db.exec(`CREATE TABLE ${quotedTemp} (${definition})`)
        const nextColumns = this.db.prepare(`PRAGMA table_info(${quotedTemp})`).all().map(column => column.name)
        if (!nextColumns.length) throw new Error('Unable to determine target columns')
        const sharedColumns = nextColumns.filter(name => existingNames.has(name))
        if (sharedColumns.length > 0) {
          const projection = sharedColumns.map(quoteSqliteIdentifier).join(', ')
          this.db.exec(`INSERT INTO ${quotedTemp} (${projection}) SELECT ${projection} FROM ${quotedCurrent}`)
        }
        this.db.exec(`ALTER TABLE ${quotedCurrent} RENAME TO ${quotedBackup}`)
        this.db.exec(`ALTER TABLE ${quotedTemp} RENAME TO ${quotedTarget}`)
        this.db.exec(`DROP TABLE ${quotedBackup}`)
        this.db.exec('PRAGMA foreign_keys = ON')
        this.db.exec('COMMIT')
      } catch (error) {
        this.db.exec('ROLLBACK')
        this.db.exec('PRAGMA foreign_keys = ON')
        throw error
      }

        return { success: true }
      } catch (e) { return { error: e.message } }
    }

  deleteTable(table, _dbName, _schemaName, itemType = 'table') {
    try {
      const tableName = assertSimpleIdentifier(table, 'Table name')
      const kind = itemType === 'view' ? 'VIEW' : 'TABLE'
      this.db.exec(`DROP ${kind} ${quoteSqliteIdentifier(tableName)}`)
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
    return db ? `${quoteMysqlIdentifier(db)}.${quoteMysqlIdentifier(table)}` : quoteMysqlIdentifier(table)
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

  async getTableData(table, page, limit, dbName, filter, sortColumn, sortDirection) {
    const lim = Math.min(limit || 100, 1000)
    const off = (page || 0) * lim
    const pk  = await this._getPk(table, dbName)
    const ref = this._tbl(table, dbName)
    const clause = normalizeTableFilterClause(filter)
    const where = clause ? ` WHERE ${clause}` : ''
    const order = sortColumn ? ` ORDER BY ${quoteMysqlIdentifier(sortColumn)} ${normalizeSortDirection(sortDirection)}` : ''
    const [rows] = await this.conn.execute(`SELECT * FROM ${ref}${where}${order} LIMIT ? OFFSET ?`, [lim, off])
    const [[{ cnt }]] = await this.conn.execute(`SELECT COUNT(*) as cnt FROM ${ref}${where}`)
    const out = rows.map(r => normalizeIpcRow({ __rowid__: pk ? r[pk] : null, ...r }))
    return { rows: out, total: Number(cnt), page: page || 0, limit: lim }
  }

  async getTableStructure(table, dbName) {
    const ref = this._tbl(table, dbName)
    const [cols] = await this.conn.execute(`SHOW FULL COLUMNS FROM ${ref}`)
    const columns = cols.map((c, i) => ({
      cid: i, name: c.Field, type: c.Type,
      notnull: c.Null === 'NO' ? 1 : 0, dflt_value: c.Default, pk: c.Key === 'PRI' ? 1 : 0, comment: c.Comment || null,
    }))
    let ddl = ''
    try {
      const [[r]] = await this.conn.execute(`SHOW CREATE TABLE ${ref}`)
      ddl = r['Create Table'] || r['Create View'] || ''
    } catch (_) {}
    return { columns, foreignKeys: [], indices: [], sql: ddl }
  }

  async runQuery(sql, dbName) {
    const start = Date.now()
    const isSelect = /^(SELECT|SHOW|DESCRIBE|DESC|EXPLAIN|WITH)\b/i.test(sql.trim())
    try {
      if (dbName) {
        await this.conn.query(`USE \`${String(dbName).replace(/`/g, '``')}\``)
      }
      if (isSelect) {
        const [rows] = await this.conn.execute(sql)
        return { rows: rows.map(r => normalizeIpcRow(r)), elapsed: Date.now() - start, type: 'select' }
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

  async createTable(table, columnsSql, dbName) {
    try {
      const tableName = assertSimpleIdentifier(table, 'Table name')
      const definition = String(columnsSql || '').trim()
      if (!definition) return { error: 'Column definition is required' }
      const ref = this._tbl(tableName, dbName)
      await this.conn.execute(`CREATE TABLE ${ref} (${definition})`)
      return { success: true }
    } catch (e) { return { error: e.message } }
  }

  async deleteTable(table, dbName, _schemaName, itemType = 'table') {
    try {
      const tableName = assertSimpleIdentifier(table, 'Table name')
      const ref = this._tbl(tableName, dbName)
      const kind = itemType === 'view' ? 'VIEW' : 'TABLE'
      await this.conn.execute(`DROP ${kind} ${ref}`)
      return { success: true }
    } catch (e) { return { error: e.message } }
  }

  async close() { try { await this.conn.end() } catch (_) {} }
}

// ── PostgreSQL Adapter ────────────────────────────────────────────────────────
class PostgreSQLAdapter {
  constructor(client, config) {
    this.client = client
    this.config = { ...config }
    this.currentDatabase = config.database
    this._pk = {}
  }

  _parseTable(table) {
    const [schema, ...rest] = String(table).split('.')
    if (rest.length === 0) return { schema: 'public', table: schema }
    return { schema, table: rest.join('.') }
  }

  _tbl(table) {
    const parsed = this._parseTable(table)
    return `${quotePgIdentifier(parsed.schema)}.${quotePgIdentifier(parsed.table)}`
  }

  async _withClient(dbName, fn) {
    if (!dbName || dbName === this.currentDatabase) return fn(this.client)
    const { Client } = pgLib
      const client = new Client({
        host: this.config.host,
        port: Number(this.config.port) || 5432,
        user: this.config.username,
        password: this.config.password,
        database: dbName,
        ssl: this.config.ssl ? { rejectUnauthorized: false } : undefined,
        connectionTimeoutMillis: 10000,
        keepAlive: Boolean(this.config.keepAlive),
        keepAliveInitialDelayMillis: this.config.keepAlive ? KEEPALIVE_INTERVAL_MS : undefined,
      })
    await client.connect()
    try {
      return await fn(client)
    } finally {
      try { await client.end() } catch (_) {}
    }
  }

  async _getPk(table, dbName) {
    const parsed = this._parseTable(table)
    const dbKey = dbName || this.currentDatabase || 'postgres'
    const key = `${dbKey}.${parsed.schema}.${parsed.table}`
    if (this._pk[key] !== undefined) return this._pk[key]
    const ref = `${parsed.schema}.${parsed.table}`
    const rows = await this._withClient(dbName, async client => {
      const { rows } = await client.query(`
        SELECT a.attname as col
        FROM pg_index i
        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
        WHERE i.indrelid = $1::regclass AND i.indisprimary LIMIT 1
      `, [ref]).catch(() => ({ rows: [] }))
      return rows
    })
    this._pk[key] = rows[0]?.col || null
    return this._pk[key]
  }

  async listDatabases() {
    const { rows } = await this.client.query(`
      SELECT datname as name
      FROM pg_database
      WHERE datistemplate = false
      ORDER BY datname
    `)
    return rows.map(r => ({ name: r.name, tables: null }))
  }

  async listTablesForDatabase(dbName) {
    return this._withClient(dbName, async client => {
      const { rows } = await client.query(`
        SELECT tablename as name, schemaname as schema, 'table' as type
        FROM pg_tables
        WHERE schemaname NOT IN ('pg_catalog','information_schema','pg_toast')
        AND schemaname NOT LIKE 'pg_%'
        UNION ALL
        SELECT viewname as name, schemaname as schema, 'view' as type
        FROM pg_views
        WHERE schemaname NOT IN ('pg_catalog','information_schema','pg_toast')
        AND schemaname NOT LIKE 'pg_%'
        ORDER BY schema, type, name
      `)
      return rows
    })
  }

  async listTables() {
    return this.listTablesForDatabase(this.currentDatabase)
  }

  async getTableData(table, page, limit, dbName, filter, sortColumn, sortDirection) {
    const lim = Math.min(limit || 100, 1000)
    const off = (page || 0) * lim
    const pk  = await this._getPk(table, dbName)
    const ref = this._tbl(table)
    const clause = normalizeTableFilterClause(filter)
    const where = clause ? ` WHERE ${clause}` : ''
    const order = sortColumn ? ` ORDER BY ${quotePgIdentifier(sortColumn)} ${normalizeSortDirection(sortDirection)} NULLS LAST` : ''
    return this._withClient(dbName, async client => {
      const { rows } = await client.query(`SELECT * FROM ${ref}${where}${order} LIMIT $1 OFFSET $2`, [lim, off])
      const { rows: [{ cnt }] } = await client.query(`SELECT COUNT(*) as cnt FROM ${ref}${where}`)
      const out = rows.map(r => normalizeIpcRow({ __rowid__: pk ? r[pk] : null, ...r }))
      return { rows: out, total: parseInt(cnt), page: page || 0, limit: lim }
    })
  }

  async getTableStructure(table, dbName) {
    const parsed = this._parseTable(table)
    const pk = await this._getPk(table, dbName)
    return this._withClient(dbName, async client => {
      const { rows: cols } = await client.query(`
        SELECT ordinal_position - 1 as cid, column_name as name, data_type as type,
               CASE WHEN is_nullable = 'NO' THEN 1 ELSE 0 END as notnull,
               column_default as dflt_value,
               pgd.description as comment
        FROM information_schema.columns
        LEFT JOIN pg_catalog.pg_statio_all_tables st
          ON st.relname = columns.table_name AND st.schemaname = columns.table_schema
        LEFT JOIN pg_catalog.pg_description pgd
          ON pgd.objoid = st.relid AND pgd.objsubid = columns.ordinal_position
        WHERE table_name = $1 AND table_schema = $2
        ORDER BY ordinal_position
      `, [parsed.table, parsed.schema])
      const columns = cols.map(c => ({ ...c, pk: c.name === pk ? 1 : 0 }))
      return { columns, foreignKeys: [], indices: [], sql: `-- Table: ${parsed.schema}.${parsed.table}` }
    })
  }

  async runQuery(sql, dbName) {
    const start = Date.now()
    try {
      return await this._withClient(dbName, async client => {
        const { rows, rowCount } = await client.query(sql)
        if (rows.length > 0 || /^(SELECT|WITH|EXPLAIN)\b/i.test(sql.trim())) {
          return { rows: rows.map(r => normalizeIpcRow(r)), elapsed: Date.now() - start, type: 'select' }
        }
        return { changes: rowCount || 0, elapsed: Date.now() - start, type: 'exec' }
      })
    } catch (e) { return { error: e.message } }
  }

  async insertRow(table, data, dbName) {
    try {
      const keys = Object.keys(data)
      const cols = keys.map(k => `"${k}"`).join(', ')
      const ph   = keys.map((_, i) => `$${i + 1}`).join(', ')
      const vals = keys.map(k => data[k] === '' ? null : data[k])
      const ref  = this._tbl(table)
      return this._withClient(dbName, async client => {
        const { rows } = await client.query(
          `INSERT INTO ${ref} (${cols}) VALUES (${ph}) RETURNING *`, vals
        )
        return { success: true, lastInsertRowid: rows[0]?.id }
      })
    } catch (e) { return { error: e.message } }
  }

  async updateRow(table, rowid, data, dbName) {
    try {
      const pk = await this._getPk(table, dbName)
      if (!pk) return { error: 'No primary key found for update' }
      const keys = Object.keys(data).filter(k => k !== '__rowid__' && k !== pk)
      if (!keys.length) return { success: true }
      const sets = keys.map((k, i) => `"${k}" = $${i + 1}`).join(', ')
      const vals = [...keys.map(k => data[k] === '' ? null : data[k]), rowid]
      const ref  = this._tbl(table)
      return this._withClient(dbName, async client => {
        await client.query(`UPDATE ${ref} SET ${sets} WHERE "${pk}" = $${keys.length + 1}`, vals)
        return { success: true }
      })
    } catch (e) { return { error: e.message } }
  }

  async deleteRow(table, rowid, dbName) {
    try {
      const pk = await this._getPk(table, dbName)
      if (!pk) return { error: 'No primary key found for delete' }
      const ref = this._tbl(table)
      return this._withClient(dbName, async client => {
        await client.query(`DELETE FROM ${ref} WHERE "${pk}" = $1`, [rowid])
        return { success: true }
      })
    } catch (e) { return { error: e.message } }
  }

  async createTable(table, columnsSql, dbName, schemaName, comments = {}) {
    try {
      const tableName = assertSimpleIdentifier(table, 'Table name')
      const schema = assertSimpleIdentifier(schemaName || 'public', 'Schema name')
      const definition = String(columnsSql || '').trim()
      if (!definition) return { error: 'Column definition is required' }
      const ref = `"${schema}"."${tableName}"`
      return this._withClient(dbName, async client => {
        await client.query(`CREATE TABLE ${ref} (${definition})`)
        for (const [columnName, comment] of Object.entries(comments || {})) {
          if (!comment) continue
          const safeColumn = assertSimpleIdentifier(columnName, 'Column name')
          const safeComment = String(comment)
          await client.query(`COMMENT ON COLUMN ${ref}."${safeColumn}" IS $1`, [safeComment])
        }
        return { success: true }
        })
      } catch (e) { return { error: e.message } }
    }

  async deleteTable(table, dbName, schemaName, itemType = 'table') {
    try {
      const parsed = this._parseTable(table)
      const schema = assertSimpleIdentifier(schemaName || parsed.schema || 'public', 'Schema name')
      const tableName = assertSimpleIdentifier(parsed.table, 'Table name')
      const ref = `${quotePgIdentifier(schema)}.${quotePgIdentifier(tableName)}`
      const kind = itemType === 'view' ? 'VIEW' : 'TABLE'
      return this._withClient(dbName, async client => {
        await client.query(`DROP ${kind} ${ref}`)
        return { success: true }
      })
    } catch (e) { return { error: e.message } }
  }

  async updateTableSchema(table, nextTable, columnsSql, dbName, schemaName, comments = {}) {
    try {
      const parsed = this._parseTable(table)
      const currentTable = assertSimpleIdentifier(parsed.table, 'Table name')
      const targetTable = assertSimpleIdentifier(nextTable, 'Table name')
      const schema = assertSimpleIdentifier(schemaName || parsed.schema || 'public', 'Schema name')
      const definition = String(columnsSql || '').trim()
      if (!definition) return { error: 'Column definition is required' }

      return this._withClient(dbName, async client => {
        const { rows: existingColumns } = await client.query(`
          SELECT column_name
          FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = $2
          ORDER BY ordinal_position
        `, [schema, currentTable])
        if (!existingColumns.length) return { error: 'Table not found' }

        const relationRef = `${schema}.${currentTable}`
        const { rows: inboundForeignKeys } = await client.query(`
          SELECT
            src_ns.nspname AS schema_name,
            src.relname AS table_name,
            con.conname AS constraint_name,
            pg_get_constraintdef(con.oid, true) AS constraint_def
          FROM pg_constraint con
          JOIN pg_class src ON src.oid = con.conrelid
          JOIN pg_namespace src_ns ON src_ns.oid = src.relnamespace
          WHERE con.contype = 'f' AND con.confrelid = $1::regclass
        `, [relationRef]).catch(() => ({ rows: [] }))

        const { rows: dependentViews } = await client.query(`
          SELECT
            view_ns.nspname AS schema_name,
            view_cls.relname AS view_name,
            view_cls.relkind AS relkind,
            pg_get_viewdef(view_cls.oid, true) AS definition
          FROM pg_depend dep
          JOIN pg_rewrite rw ON rw.oid = dep.objid
          JOIN pg_class view_cls ON view_cls.oid = rw.ev_class
          JOIN pg_namespace view_ns ON view_ns.oid = view_cls.relnamespace
          WHERE dep.refobjid = $1::regclass
            AND view_cls.relkind IN ('v', 'm')
        `, [relationRef]).catch(() => ({ rows: [] }))

        const tempTable = `__tmp_edit_${Date.now()}`
        const backupTable = `__old_${Date.now()}`
        const quotedSchema = `"${schema}"`
        const quotedCurrent = `${quotedSchema}."${currentTable}"`
        const quotedTarget = `${quotedSchema}."${targetTable}"`
        const quotedTemp = `${quotedSchema}."${tempTable}"`
        const quotedBackup = `${quotedSchema}."${backupTable}"`

        await client.query('BEGIN')
        try {
          for (const fk of inboundForeignKeys) {
            await client.query(`ALTER TABLE ${quotePgIdentifier(fk.schema_name)}.${quotePgIdentifier(fk.table_name)} DROP CONSTRAINT ${quotePgIdentifier(fk.constraint_name)}`)
          }

          for (const view of dependentViews) {
            const qualifiedView = `${quotePgIdentifier(view.schema_name)}.${quotePgIdentifier(view.view_name)}`
            if (view.relkind === 'm') {
              await client.query(`DROP MATERIALIZED VIEW ${qualifiedView}`)
            } else {
              await client.query(`DROP VIEW ${qualifiedView}`)
            }
          }

          await client.query(`CREATE TABLE ${quotedTemp} (${definition})`)

          const { rows: nextColumns } = await client.query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = $1 AND table_name = $2
            ORDER BY ordinal_position
          `, [schema, tempTable])

          const existingNames = new Set(existingColumns.map(column => column.column_name))
          const sharedColumns = nextColumns
            .map(column => column.column_name)
            .filter(name => existingNames.has(name))

          if (sharedColumns.length > 0) {
            const projection = sharedColumns.map(name => `"${name}"`).join(', ')
            await client.query(`INSERT INTO ${quotedTemp} (${projection}) SELECT ${projection} FROM ${quotedCurrent}`)
          }

          await client.query(`ALTER TABLE ${quotedCurrent} RENAME TO "${backupTable}"`)
          await client.query(`ALTER TABLE ${quotedTemp} RENAME TO "${targetTable}"`)
          for (const [columnName, comment] of Object.entries(comments || {})) {
            const safeColumn = assertSimpleIdentifier(columnName, 'Column name')
            if (!comment) {
              await client.query(`COMMENT ON COLUMN ${quotedTarget}."${safeColumn}" IS NULL`)
              continue
            }
            await client.query(`COMMENT ON COLUMN ${quotedTarget}."${safeColumn}" IS $1`, [String(comment)])
          }

          for (const fk of inboundForeignKeys) {
            const rewrittenDef = replacePgQualifiedName(fk.constraint_def, schema, currentTable, targetTable)
            await client.query(`ALTER TABLE ${quotePgIdentifier(fk.schema_name)}.${quotePgIdentifier(fk.table_name)} ADD CONSTRAINT ${quotePgIdentifier(fk.constraint_name)} ${rewrittenDef}`)
          }

          for (const view of dependentViews) {
            const qualifiedView = `${quotePgIdentifier(view.schema_name)}.${quotePgIdentifier(view.view_name)}`
            const rewrittenDef = replacePgQualifiedName(view.definition, schema, currentTable, targetTable)
            if (view.relkind === 'm') {
              await client.query(`CREATE MATERIALIZED VIEW ${qualifiedView} AS ${rewrittenDef}`)
            } else {
              await client.query(`CREATE VIEW ${qualifiedView} AS ${rewrittenDef}`)
            }
          }

          await client.query(`DROP TABLE ${quotedBackup}`)
          await client.query('COMMIT')
          return { success: true }
        } catch (error) {
          await client.query('ROLLBACK')
          return { error: error.message }
        }
      })
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

  async getTableData(table, page, limit, _dbName, filter, sortColumn, sortDirection) {
    if (String(filter || '').trim()) {
      return { error: 'Advanced SQL filter is not supported for MongoDB collections yet' }
    }
    const lim = Math.min(limit || 100, 1000)
    const off = (page || 0) * lim
    const cursor = this.db.collection(table).find({}).skip(off).limit(lim)
    if (sortColumn) cursor.sort({ [sortColumn]: normalizeSortDirection(sortDirection) === 'DESC' ? -1 : 1 })
    const coll = this.db.collection(table)
    const [docs, total] = await Promise.all([
      cursor.toArray(),
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
          enableKeepAlive: Boolean(cfg.keepAlive),
          keepAliveInitialDelay: cfg.keepAlive ? KEEPALIVE_INTERVAL_MS : undefined,
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
          keepAlive: Boolean(cfg.keepAlive),
          keepAliveInitialDelayMillis: cfg.keepAlive ? KEEPALIVE_INTERVAL_MS : undefined,
        })
      await client.connect()
      return new PostgreSQLAdapter(client, cfg)
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
    icon: appIconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false, contextIsolation: true,
    },
    title: 'CatDB', backgroundColor: '#1e2128',
  })
  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.once('did-finish-load', () => {
      win.webContents.openDevTools({ mode: 'right' })
    })
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }
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

ipcMain.handle('app:select-ssh-private-key', async () => {
  const r = await dialog.showOpenDialog({
    title: 'Select SSH Private Key',
    filters: [
      { name: 'Private Keys', extensions: ['pem', 'key', 'ppk'] },
      { name: 'All Files', extensions: ['*'] },
    ],
    properties: ['openFile'],
  })
  if (r.canceled || !r.filePaths.length) return null
  return toPortableHomePath(r.filePaths[0])
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
      const tunnel = await createSSHTunnel(cfg.ssh, host, port, { keepAlive: cfg.keepAlive })
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
      const tunnel = await createSSHTunnel(cfg.ssh, host, port, { keepAlive: cfg.keepAlive })
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

ipcMain.handle('db:table-data', async (_, id, table, page, limit, dbName, filter, sortColumn, sortDirection) => {
  const conn = connections.get(id)
  if (!conn) return { error: 'Connection not found' }
  try { return await conn.adapter.getTableData(table, page, limit, dbName, filter, sortColumn, sortDirection) } catch (e) { return { error: e.message } }
})

ipcMain.handle('db:table-structure', async (_, id, table, dbName) => {
  const conn = connections.get(id)
  if (!conn) return { error: 'Connection not found' }
  try { return await conn.adapter.getTableStructure(table, dbName) } catch (e) { return { error: e.message } }
})

ipcMain.handle('db:run-query', async (_, id, sql, dbName) => {
  const conn = connections.get(id)
  if (!conn) return { error: 'Connection not found' }
  try { return await conn.adapter.runQuery(sql, dbName) } catch (e) { return { error: e.message } }
})

ipcMain.handle('db:insert-row', async (_, id, table, data, dbName) => {
  const conn = connections.get(id)
  if (!conn) return { error: 'Connection not found' }
  try { return await conn.adapter.insertRow(table, data, dbName) } catch (e) { return { error: e.message } }
})

ipcMain.handle('db:create-table', async (_, id, table, columnsSql, dbName, schemaName, comments) => {
  const conn = connections.get(id)
  if (!conn) return { error: 'Connection not found' }
  if (typeof conn.adapter.createTable !== 'function') return { error: 'Create table is not supported for this connection' }
  try { return await conn.adapter.createTable(table, columnsSql, dbName, schemaName, comments) } catch (e) { return { error: e.message } }
})

ipcMain.handle('db:update-table-schema', async (_, id, table, nextTable, columnsSql, dbName, schemaName, comments) => {
  const conn = connections.get(id)
  if (!conn) return { error: 'Connection not found' }
  if (typeof conn.adapter.updateTableSchema !== 'function') return { error: 'Edit table is not supported for this connection yet' }
  try { return await conn.adapter.updateTableSchema(table, nextTable, columnsSql, dbName, schemaName, comments) } catch (e) { return { error: e.message } }
})

ipcMain.handle('db:delete-table', async (_, id, table, dbName, schemaName, itemType) => {
  const conn = connections.get(id)
  if (!conn) return { error: 'Connection not found' }
  if (typeof conn.adapter.deleteTable !== 'function') return { error: 'Delete table is not supported for this connection yet' }
  try { return await conn.adapter.deleteTable(table, dbName, schemaName, itemType) } catch (e) { return { error: e.message } }
})

ipcMain.handle('db:export-scope', async (_, id, request) => {
  const conn = connections.get(id)
  if (!conn) return { error: 'Connection not found' }
  try { return await exportConnectionScope(conn, request) } catch (e) { return { error: e.message } }
})

ipcMain.handle('db:import-scope', async (_, id, request) => {
  const conn = connections.get(id)
  if (!conn) return { error: 'Connection not found' }
  try { return await importConnectionScope(conn, request) } catch (e) { return { error: e.message } }
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

ipcMain.handle('app:get-saved-connections', async (_, token) => {
  try {
    const user = assertSessionUser(token)
    return await readSavedConnectionsForUser(user.id)
  } catch (e) {
    return { error: e.message }
  }
})

ipcMain.handle('app:set-saved-connections', async (_, token, list) => {
  try {
    const user = assertSessionUser(token)
    await writeSavedConnectionsForUser(user.id, list)
    return { success: true }
  } catch (e) {
    return { error: e.message }
  }
})

ipcMain.handle('auth:register', async (_, payload) => {
  try {
    const input = validateAuthInput(payload || {}, 'register')
    const passwordHash = hashPassword(input.password)
    const user = await withAuthClient(async client => {
      const { rows } = await client.query(
        `INSERT INTO app_users (username, email, password_hash)
         VALUES ($1, $2, $3)
         RETURNING id, username, email, created_at`,
        [input.username, input.email, passwordHash]
      )
      return sanitizeUser(rows[0])
    })
    const token = await createSession(user)
    return { user, token }
  } catch (e) {
    if (e.code === '23505') return { error: 'Username or email already exists' }
    return { error: e.message }
  }
})

ipcMain.handle('auth:login', async (_, payload) => {
  try {
    const username = String(payload?.username || '').trim()
    const password = String(payload?.password || '')
    validateAuthInput({ username, password }, 'login')

    const result = await withAuthClient(async client => {
      const { rows } = await client.query(
        `SELECT id, username, email, password_hash, created_at
         FROM app_users
         WHERE lower(username) = lower($1)`,
        [username]
      )
      return rows[0] || null
    })

    if (!result || !verifyPassword(password, result.password_hash)) {
      return { error: 'Invalid username or password' }
    }

    await withAuthClient(async client => {
      await client.query('UPDATE app_users SET last_login_at = now() WHERE id = $1', [result.id])
    })

    const user = sanitizeUser(result)
    const token = await createSession(user)
    return { user, token }
  } catch (e) {
    return { error: e.message }
  }
})

ipcMain.handle('auth:me', async (_, token) => {
  try {
    const user = await getUserFromToken(token)
    return { user }
  } catch (e) {
    return { user: null, error: e.message }
  }
})

ipcMain.handle('auth:logout', async (_, token) => {
  try {
    await deleteSession(token)
    return { success: true }
  } catch (e) {
    return { error: e.message }
  }
})

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(appIconPath)
  }
  createWindow()
  globalShortcut.register('F12', () => {
    const win = BrowserWindow.getFocusedWindow()
    if (win) win.webContents.toggleDevTools()
  })
  globalShortcut.register('CommandOrControl+Shift+I', () => {
    const win = BrowserWindow.getFocusedWindow()
    if (win) win.webContents.toggleDevTools()
  })
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => {
  connections.forEach(c => { c.adapter.close(); if (c.sshCleanup) c.sshCleanup() })
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})
