import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useAppStore from '../store/appStore'
import type { Connection } from '../types'

const api = window.electronAPI

type DefaultOption = {
  value: string
  label: string
  sql: string | null
}

type ColumnDraft = {
  id: string
  name: string
  type: string
  length: string
  isPrimaryKey: boolean
  notNull: boolean
  defaultValue: string
  comment: string
}

type TypeOption = {
  value: string
  defaultLength?: string
  allowLength?: boolean
}

const TYPE_OPTIONS: Record<'sqlite' | 'mysql' | 'postgresql' | 'mongodb', TypeOption[]> = {
  sqlite: [
    { value: 'INTEGER' },
    { value: 'TEXT' },
    { value: 'REAL' },
    { value: 'NUMERIC', allowLength: true },
    { value: 'BLOB' },
    { value: 'BOOLEAN' },
    { value: 'DATE' },
    { value: 'DATETIME' },
    { value: 'VARCHAR', allowLength: true, defaultLength: '255' },
  ],
  mysql: [
    { value: 'INT' },
    { value: 'BIGINT' },
    { value: 'VARCHAR', allowLength: true, defaultLength: '255' },
    { value: 'CHAR', allowLength: true, defaultLength: '255' },
    { value: 'TEXT' },
    { value: 'BOOLEAN' },
    { value: 'DECIMAL', allowLength: true, defaultLength: '10,2' },
    { value: 'DATE' },
    { value: 'DATETIME' },
    { value: 'TIMESTAMP' },
  ],
  postgresql: [
    { value: 'UUID' },
    { value: 'INTEGER' },
    { value: 'BIGSERIAL' },
    { value: 'SERIAL' },
    { value: 'VARCHAR', allowLength: true, defaultLength: '255' },
    { value: 'CHAR', allowLength: true, defaultLength: '255' },
    { value: 'TEXT' },
    { value: 'BOOLEAN' },
    { value: 'NUMERIC', allowLength: true, defaultLength: '10,2' },
    { value: 'DATE' },
    { value: 'TIMESTAMP WITH TIME ZONE' },
    { value: 'TIMESTAMP' },
  ],
  mongodb: [{ value: 'TEXT' }],
}

const DEFAULT_OPTIONS: Record<'sqlite' | 'mysql' | 'postgresql' | 'mongodb', DefaultOption[]> = {
  sqlite: [
    { value: 'none', label: 'None', sql: null },
    { value: 'null', label: 'NULL', sql: 'NULL' },
    { value: 'empty', label: "Empty string ('')", sql: "''" },
    { value: 'zero', label: '0', sql: '0' },
    { value: 'current_date', label: 'CURRENT_DATE', sql: 'CURRENT_DATE' },
    { value: 'current_time', label: 'CURRENT_TIME', sql: 'CURRENT_TIME' },
    { value: 'current_timestamp', label: 'CURRENT_TIMESTAMP', sql: 'CURRENT_TIMESTAMP' },
  ],
  mysql: [
    { value: 'none', label: 'None', sql: null },
    { value: 'null', label: 'NULL', sql: 'NULL' },
    { value: 'empty', label: "Empty string ('')", sql: "''" },
    { value: 'zero', label: '0', sql: '0' },
    { value: 'current_date', label: 'CURRENT_DATE', sql: 'CURRENT_DATE' },
    { value: 'current_time', label: 'CURRENT_TIME', sql: 'CURRENT_TIME' },
    { value: 'current_timestamp', label: 'CURRENT_TIMESTAMP', sql: 'CURRENT_TIMESTAMP' },
  ],
  postgresql: [
    { value: 'none', label: 'None', sql: null },
    { value: 'null', label: 'NULL', sql: 'NULL' },
    { value: 'empty', label: "Empty string ('')", sql: "''" },
    { value: 'zero', label: '0', sql: '0' },
    { value: 'true', label: 'TRUE', sql: 'TRUE' },
    { value: 'false', label: 'FALSE', sql: 'FALSE' },
    { value: 'gen_random_uuid', label: 'gen_random_uuid()', sql: 'gen_random_uuid()' },
    { value: 'now', label: 'now()', sql: 'now()' },
    { value: 'current_date', label: 'CURRENT_DATE', sql: 'CURRENT_DATE' },
    { value: 'current_timestamp', label: 'CURRENT_TIMESTAMP', sql: 'CURRENT_TIMESTAMP' },
  ],
  mongodb: [{ value: 'none', label: 'None', sql: null }],
}

let draftCounter = 0

function createColumnDraft(connection: Connection, overrides: Partial<ColumnDraft> = {}): ColumnDraft {
  const dbType = connection.dbType ?? 'postgresql'
  const firstType = TYPE_OPTIONS[dbType][0]
  draftCounter += 1

  return {
    id: `column-${draftCounter}`,
    name: '',
    type: firstType.value,
    length: firstType.defaultLength ?? '',
    isPrimaryKey: false,
    notNull: false,
    defaultValue: 'none',
    comment: '',
    ...overrides,
  }
}

function quoteIdentifier(connection: Connection, value: string) {
  if (connection.dbType === 'mysql') return `\`${value}\``
  return `"${value}"`
}

function buildColumnDefinition(connection: Connection, column: ColumnDraft) {
  const dbType = connection.dbType ?? 'postgresql'
  const identifier = quoteIdentifier(connection, column.name.trim())
  const type = `${column.type.trim()}${column.length.trim() ? `(${column.length.trim()})` : ''}`
  const defaultOption = DEFAULT_OPTIONS[dbType].find(option => option.value === column.defaultValue)

  if (dbType === 'sqlite' && column.isPrimaryKey && type.toUpperCase() === 'INTEGER') {
    return `${identifier} INTEGER PRIMARY KEY${column.defaultValue === 'none' ? ' AUTOINCREMENT' : ''}`
  }

  const parts = [identifier, type]
  if (column.isPrimaryKey) parts.push('PRIMARY KEY')
  if (column.notNull || column.isPrimaryKey) parts.push('NOT NULL')
  if (defaultOption?.sql != null) parts.push(`DEFAULT ${defaultOption.sql}`)
  if (dbType === 'mysql' && column.comment.trim()) parts.push(`COMMENT '${column.comment.replace(/'/g, "''")}'`)

  return parts.join(' ')
}

function TypeBadge({ type }: { type: string }) {
  const upper = type.toUpperCase()
  let className = 'text-slate-300 border-slate-600/40'
  if (/INT|SERIAL|UUID/.test(upper)) className = 'text-[#4da3ff] border-[#4da3ff]/25'
  if (/TEXT|CHAR/.test(upper)) className = 'text-emerald-400 border-emerald-400/20'
  if (/TIME|DATE/.test(upper)) className = 'text-[#2f7cff] border-[#2f7cff]/20'
  if (/BOOL/.test(upper)) className = 'text-amber-400 border-amber-400/25'

  return <span className={`inline-flex rounded-md border bg-[#0b1118] px-2 py-1 font-mono text-[11px] ${className}`}>{type}</span>
}

function parseTypeSpec(connection: Connection, value: string | null | undefined) {
  const raw = String(value || '').trim()
  const match = raw.match(/^(.+?)(?:\((.+)\))?$/)
  const base = match?.[1]?.trim() || ''
  const length = match?.[2]?.trim() || ''
  const options = TYPE_OPTIONS[connection.dbType ?? 'postgresql']
  const matched = options.find(option => option.value.toLowerCase() === base.toLowerCase())
  return {
    type: matched?.value ?? (base || options[0].value),
    length: length || matched?.defaultLength || '',
  }
}

interface Props {
  connectionId: string
  connectionName: string
  database?: string
  schemaName?: string
  tableName?: string
  mode?: 'create' | 'edit'
}

function mapDefaultValue(connection: Connection, value: string | null | undefined) {
  if (value == null) return 'none'
  const normalized = String(value).trim().toLowerCase()
  const options = DEFAULT_OPTIONS[connection.dbType ?? 'postgresql']
  const matched = options.find(option => option.sql?.toLowerCase() === normalized)
  return matched?.value ?? 'none'
}

function normalizeTypeValue(connection: Connection, value: string | null | undefined) {
  return parseTypeSpec(connection, value).type
}

export default function CreateTableView({ connectionId, connectionName, database, schemaName, tableName: sourceTableName, mode = 'create' }: Props) {
  const connections = useAppStore(s => s.connections)
  const tabs = useAppStore(s => s.tabs)
  const activeTabId = useAppStore(s => s.activeTabId)
  const closeTab = useAppStore(s => s.closeTab)
  const selectTable = useAppStore(s => s.selectTable)
  const refreshConnectionTables = useAppStore(s => s.refreshConnectionTables)
  const setStatus = useAppStore(s => s.setStatus)
  const connection = connections.find(item => item.id === connectionId) ?? null

  const [tableName, setTableName] = useState('')
  const [columns, setColumns] = useState<ColumnDraft[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadingStructure, setLoadingStructure] = useState(false)
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({})
  const resizeRef = useRef<{ column: string; startX: number; startWidth: number } | null>(null)

  const dbType = connection?.dbType ?? 'postgresql'
  const typeOptions = TYPE_OPTIONS[dbType]
  const defaultOptions = DEFAULT_OPTIONS[dbType]
  const activeTab = tabs.find(tab => tab.id === activeTabId) ?? null
  const canEditSchema = mode === 'edit' ? dbType === 'postgresql' : true

  const previewSql = useMemo(() => {
    if (!connection) return ''
    const validColumns = columns.filter(column => column.name.trim())
    if (!tableName.trim() || validColumns.length === 0) return ''
    return `CREATE TABLE ${tableName.trim()} (\n${validColumns.map(column => `  ${buildColumnDefinition(connection, column)}`).join(',\n')}\n)`
  }, [columns, connection, tableName])

  const updateColumn = useCallback((id: string, updater: (column: ColumnDraft) => ColumnDraft) => {
    setColumns(prev => prev.map(column => (column.id === id ? updater(column) : column)))
  }, [])

  useEffect(() => {
    if (!connection) return
    setError(null)

    if (mode === 'edit' && sourceTableName) {
      setLoadingStructure(true)
      void api.getTableStructure(connection.id, schemaName ? `${schemaName}.${sourceTableName}` : sourceTableName, database).then(result => {
        if ('error' in result) {
          setError(result.error)
          setColumns([])
          return
        }
        setTableName(sourceTableName)
        setColumns(result.columns.map(column => createColumnDraft(connection, {
          name: column.name,
          type: parseTypeSpec(connection, column.type).type,
          length: parseTypeSpec(connection, column.type).length,
          isPrimaryKey: Boolean(column.pk),
          notNull: Boolean(column.notnull),
          defaultValue: mapDefaultValue(connection, column.dflt_value),
          comment: column.comment ?? '',
        })))
      }).finally(() => {
        setLoadingStructure(false)
      })
      return
    }

    setTableName('')
    setColumns([])
  }, [connection, database, mode, schemaName, sourceTableName])

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      const resize = resizeRef.current
      if (!resize) return
      const nextWidth = Math.max(90, resize.startWidth + (event.clientX - resize.startX))
      setColumnWidths(prev => ({ ...prev, [resize.column]: nextWidth }))
    }

    const onMouseUp = () => {
      resizeRef.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  const handleResizeStart = useCallback((column: string, event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    const currentWidth = columnWidths[column] ?? 140
    resizeRef.current = { column, startX: event.clientX, startWidth: currentWidth }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [columnWidths])

  const getColumnWidth = useCallback((column: string, fallback: number) => {
    const width = columnWidths[column] ?? fallback
    return { width, minWidth: width, maxWidth: width }
  }, [columnWidths])

  const handleCreate = useCallback(async () => {
    if (!connection) {
      setError('Connection not found')
      return
    }

    const normalizedTableName = tableName.trim()
    if (!normalizedTableName) {
      setError('Table name is required')
      return
    }
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(normalizedTableName)) {
      setError('Table name must use letters, numbers, and underscores only')
      return
    }
    if (columns.length === 0) {
      setError('Add at least one column before creating the table')
      return
    }

    const usedNames = new Set<string>()
    for (const column of columns) {
      const name = column.name.trim()
      if (!name) {
        setError('Every column needs a name')
        return
      }
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
        setError(`Column "${name}" must use letters, numbers, and underscores only`)
        return
      }
      const lowered = name.toLowerCase()
      if (usedNames.has(lowered)) {
        setError(`Column "${name}" is duplicated`)
        return
      }
      usedNames.add(lowered)
    }

    setSaving(true)
    setError(null)
    const columnsSql = columns.map(column => buildColumnDefinition(connection, column)).join(',\n')
    const comments = Object.fromEntries(
      columns
        .map(column => [column.name.trim(), column.comment.trim()] as const)
        .filter(([name]) => name.length > 0)
    )
    const result = mode === 'edit' && sourceTableName
      ? await api.updateTableSchema(connection.id, schemaName && dbType === 'postgresql' ? `${schemaName}.${sourceTableName}` : sourceTableName, normalizedTableName, columnsSql, database, schemaName, comments)
      : await api.createTable(connection.id, normalizedTableName, columnsSql, database, schemaName, comments)
    if (result.error) {
      setError(result.error)
      setSaving(false)
      return
    }

    await refreshConnectionTables(connection.id, database)
    setStatus({ message: mode === 'edit' ? `Updated table ${normalizedTableName}` : `Created table ${normalizedTableName}` })
    setSaving(false)
    selectTable(connection, schemaName && dbType === 'postgresql' ? `${schemaName}.${normalizedTableName}` : normalizedTableName, database)
    if (activeTab) closeTab(activeTab.id)
  }, [activeTab, closeTab, columns, connection, database, dbType, mode, refreshConnectionTables, schemaName, selectTable, setStatus, sourceTableName, tableName])

  if (!connection) {
    return (
      <div style={{ padding: 32, fontSize: 13, color: 'var(--red)' }}>
        Connection not available.
      </div>
    )
  }

  const headers = [
    { key: 'Name',     label: 'Name',     fallback: 180 },
    { key: 'Type',     label: 'Type',     fallback: 280 },
    { key: 'Length',   label: 'Length',   fallback: 120 },
    { key: 'PK',       label: 'PK',       fallback: 90  },
    { key: 'Nullable', label: 'Nullable', fallback: 170 },
    { key: 'Default',  label: 'Default',  fallback: 240 },
    { key: 'Comment',  label: 'Comment',  fallback: 220 },
    { key: 'Actions',  label: '',         fallback: 80  },
  ]

  const cellInputStyle: React.CSSProperties = {
    height: 32,
    width: '100%',
    padding: '0 10px',
    border: 0,
    borderRadius: 8,
    background: 'var(--inset)',
    color: 'var(--tx-1)',
    fontFamily: 'var(--mono)',
    fontSize: 12,
    outline: 'none',
    transition: 'box-shadow 0.12s ease',
  }

  const thStyle: React.CSSProperties = {
    background: 'var(--surface)',
    padding: '0 16px',
    height: 40,
    textAlign: 'left',
    fontWeight: 600,
    fontSize: 11,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: 'var(--tx-3)',
    borderBottom: '1px solid var(--border)',
    fontFamily: 'var(--font)',
    whiteSpace: 'nowrap',
  }

  const tdStyle: React.CSSProperties = {
    padding: '8px 10px',
    borderBottom: '1px solid var(--border-faint)',
    background: 'transparent',
    verticalAlign: 'middle',
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'auto', background: 'var(--surface)' }} className="fade-in">
      {/* Header */}
      <section style={{ padding: '20px 24px 18px', borderBottom: '1px solid var(--border-faint)', flexShrink: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--tx-3)' }}>
          {mode === 'edit' ? 'Edit Table' : 'Create Table'}
        </div>

        <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ minWidth: 320, flex: 1 }}>
            <label
              style={{
                display: 'block',
                marginBottom: 8,
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'var(--tx-3)',
              }}
            >
              Table Name
            </label>
            <input
              value={tableName}
              onChange={event => setTableName(event.target.value)}
              placeholder="new_table"
              autoComplete="off"
              disabled={mode === 'edit' && !canEditSchema}
              style={{
                height: 40,
                width: '100%',
                maxWidth: 420,
                padding: '0 14px',
                border: 0,
                borderRadius: 10,
                background: 'var(--inset)',
                color: 'var(--tx-1)',
                fontSize: 13,
                fontFamily: 'var(--mono)',
                outline: 'none',
                transition: 'box-shadow 0.12s ease',
              }}
              onFocus={e => { e.currentTarget.style.boxShadow = 'var(--focus)' }}
              onBlur={e => { e.currentTarget.style.boxShadow = 'none' }}
            />
            <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--tx-3)' }}>
              {database ? `Database: ${database}` : connectionName}
              {schemaName ? ` • Schema: ${schemaName}` : ''}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={() => {
                setColumns(prev => [...prev, createColumnDraft(connection)])
                setError(null)
              }}
              disabled={!canEditSchema}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '0 14px',
                height: 36,
                borderRadius: 999,
                border: '1px dashed var(--border-strong)',
                background: 'transparent',
                color: 'var(--tx-2)',
                fontSize: 12.5,
                fontWeight: 500,
                cursor: canEditSchema ? 'pointer' : 'not-allowed',
                opacity: canEditSchema ? 1 : 0.5,
                transition: 'all 0.12s ease',
              }}
              onMouseEnter={e => { if (canEditSchema) { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent-fg)' } }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.color = 'var(--tx-2)' }}
            >
              <span style={{ fontSize: 14, lineHeight: 1 }}>+</span>
              <span>Add Column</span>
            </button>
            <button
              type="button"
              onClick={() => activeTab && closeTab(activeTab.id)}
              style={{
                padding: '0 16px',
                height: 36,
                borderRadius: 999,
                border: 0,
                background: 'transparent',
                color: 'var(--tx-2)',
                fontSize: 12.5,
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.12s ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--hover)'; e.currentTarget.style.color = 'var(--tx-1)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--tx-2)' }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={saving || loadingStructure || !canEditSchema}
              style={{
                padding: '0 18px',
                height: 36,
                borderRadius: 999,
                border: 0,
                background: (saving || loadingStructure || !canEditSchema) ? 'var(--border-strong)' : 'var(--accent)',
                color: '#fff',
                fontSize: 12.5,
                fontWeight: 600,
                cursor: (saving || loadingStructure || !canEditSchema) ? 'not-allowed' : 'pointer',
                transition: 'background 0.12s ease',
              }}
              onMouseEnter={e => { if (!(saving || loadingStructure || !canEditSchema)) e.currentTarget.style.background = 'var(--accent-2)' }}
              onMouseLeave={e => { if (!(saving || loadingStructure || !canEditSchema)) e.currentTarget.style.background = 'var(--accent)' }}
            >
              {mode === 'edit' ? (saving ? 'Saving…' : 'Save Changes') : saving ? 'Creating…' : 'Create Table'}
            </button>
          </div>
        </div>
      </section>

      {/* Body */}
      <section style={{ padding: '18px 24px 24px', flex: 1, minHeight: 0 }}>
        {loadingStructure && (
          <div
            style={{
              marginBottom: 16,
              padding: '10px 14px',
              borderRadius: 10,
              background: 'var(--accent-soft)',
              color: 'var(--accent-fg)',
              fontSize: 12.5,
              fontWeight: 500,
            }}
          >
            Loading table structure…
          </div>
        )}
        {mode === 'edit' && !loadingStructure && !canEditSchema && (
          <div
            style={{
              marginBottom: 16,
              padding: '10px 14px',
              borderRadius: 10,
              background: 'var(--yellow-soft)',
              color: 'var(--yellow)',
              fontSize: 12.5,
              fontWeight: 500,
            }}
          >
            Existing values are loaded into the form. Saving schema edits is currently supported for PostgreSQL.
          </div>
        )}

        <h4
          style={{
            margin: '0 4px 10px',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--tx-3)',
          }}
        >
          Columns <span style={{ marginLeft: 4, padding: '1px 7px', borderRadius: 999, background: 'var(--inset)', color: 'var(--tx-2)', fontFamily: 'var(--mono)', fontSize: 10 }}>{columns.length}</span>
        </h4>

        <div style={{ overflow: 'hidden', borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', background: 'var(--surface)' }}>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 12 }}>
            <thead>
              <tr>
                {headers.map(header => (
                  <th key={header.key} style={{ ...thStyle, ...getColumnWidth(header.key, header.fallback) }}>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <span>{header.label}</span>
                      <span
                        onMouseDown={event => handleResizeStart(header.key, event)}
                        style={{ position: 'absolute', right: -8, top: -4, height: 32, width: 12, cursor: 'col-resize' }}
                      />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {columns.map((column, index) => (
                <tr key={column.id} style={{ background: 'transparent' }}>
                  <td style={tdStyle}>
                    <input
                      value={column.name}
                      onChange={event => updateColumn(column.id, current => ({ ...current, name: event.target.value }))}
                      placeholder="column_name"
                      autoComplete="off"
                      disabled={!canEditSchema}
                      style={{ ...cellInputStyle, color: 'var(--accent-fg)', fontWeight: 600 }}
                      onFocus={e => { e.currentTarget.style.boxShadow = 'var(--focus)' }}
                      onBlur={e => { e.currentTarget.style.boxShadow = 'none' }}
                    />
                  </td>
                  <td style={tdStyle}>
                    <select
                      value={column.type}
                      onChange={event => {
                        const option = typeOptions.find(item => item.value === event.target.value)
                        updateColumn(column.id, current => ({
                          ...current,
                          type: event.target.value,
                          length: option?.allowLength ? (current.type === event.target.value ? current.length : (option.defaultLength ?? '')) : '',
                        }))
                      }}
                      disabled={!canEditSchema}
                      style={{ ...cellInputStyle, color: 'var(--orange)', cursor: 'pointer' }}
                    >
                      {typeOptions.map(option => (
                        <option key={option.value} value={option.value}>
                          {option.value}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={tdStyle}>
                    <input
                      value={column.length}
                      onChange={event => updateColumn(column.id, current => ({ ...current, length: event.target.value }))}
                      placeholder={(typeOptions.find(option => option.value === column.type)?.defaultLength) ?? ''}
                      disabled={!canEditSchema || !typeOptions.find(option => option.value === column.type)?.allowLength}
                      style={{ ...cellInputStyle, opacity: typeOptions.find(option => option.value === column.type)?.allowLength ? 1 : 0.5 }}
                      onFocus={e => { e.currentTarget.style.boxShadow = 'var(--focus)' }}
                      onBlur={e => { e.currentTarget.style.boxShadow = 'none' }}
                    />
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={column.isPrimaryKey}
                      onChange={event => updateColumn(column.id, current => ({
                        ...current,
                        isPrimaryKey: event.target.checked,
                        notNull: event.target.checked ? true : current.notNull,
                      }))}
                      disabled={!canEditSchema}
                      style={{ width: 14, height: 14, accentColor: 'var(--accent)', cursor: 'pointer' }}
                    />
                  </td>
                  <td style={tdStyle}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={!(column.notNull || column.isPrimaryKey)}
                        disabled={column.isPrimaryKey || !canEditSchema}
                        onChange={event => updateColumn(column.id, current => ({ ...current, notNull: !event.target.checked }))}
                        style={{ width: 14, height: 14, accentColor: 'var(--accent)', cursor: column.isPrimaryKey ? 'not-allowed' : 'pointer' }}
                      />
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: 999,
                          fontSize: 10.5,
                          fontWeight: 700,
                          letterSpacing: '0.04em',
                          fontFamily: 'var(--font)',
                          background: column.notNull || column.isPrimaryKey ? 'var(--red-soft)' : 'var(--green-soft)',
                          color: column.notNull || column.isPrimaryKey ? 'var(--red)' : 'var(--green)',
                        }}
                      >
                        {column.notNull || column.isPrimaryKey ? 'NOT NULL' : 'NULL'}
                      </span>
                    </label>
                  </td>
                  <td style={tdStyle}>
                    <select
                      value={column.defaultValue}
                      onChange={event => updateColumn(column.id, current => ({ ...current, defaultValue: event.target.value }))}
                      disabled={!canEditSchema}
                      style={{ ...cellInputStyle, minWidth: 200, color: 'var(--orange)', cursor: 'pointer' }}
                    >
                      {defaultOptions.map(option => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={tdStyle}>
                    <input
                      value={column.comment}
                      onChange={event => updateColumn(column.id, current => ({ ...current, comment: event.target.value }))}
                      placeholder="comment"
                      disabled={!canEditSchema}
                      style={{ ...cellInputStyle, fontFamily: 'var(--font)' }}
                      onFocus={e => { e.currentTarget.style.boxShadow = 'var(--focus)' }}
                      onBlur={e => { e.currentTarget.style.boxShadow = 'none' }}
                    />
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    <button
                      type="button"
                      disabled={columns.length === 1 || !canEditSchema}
                      onClick={() => {
                        setColumns(prev => prev.filter(item => item.id !== column.id))
                        setError(null)
                      }}
                      title="Remove column"
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 8,
                        border: 0,
                        background: 'transparent',
                        color: 'var(--tx-3)',
                        cursor: columns.length === 1 || !canEditSchema ? 'not-allowed' : 'pointer',
                        opacity: columns.length === 1 || !canEditSchema ? 0.4 : 1,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.12s ease',
                      }}
                      onMouseEnter={e => { if (columns.length > 1 && canEditSchema) { e.currentTarget.style.background = 'var(--red-soft)'; e.currentTarget.style.color = 'var(--red)' } }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--tx-3)' }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                        <path d="M10 11v6M14 11v6" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {error && (
          <div
            style={{
              marginTop: 16,
              padding: '10px 14px',
              borderRadius: 10,
              background: 'var(--red-soft)',
              color: 'var(--red)',
              fontSize: 12.5,
              fontWeight: 500,
            }}
          >
            {error}
          </div>
        )}

        {previewSql && (
          <div style={{ marginTop: 22 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 8,
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'var(--tx-3)',
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 99,
                  background: 'var(--accent)',
                  display: 'inline-block',
                }}
              />
              Preview SQL
            </div>
            <pre
              style={{
                margin: 0,
                padding: '14px 16px',
                overflowX: 'auto',
                borderRadius: 'var(--r-lg)',
                background: 'var(--inset)',
                color: 'var(--tx-1)',
                fontFamily: 'var(--mono)',
                fontSize: 12,
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {previewSql}
            </pre>
          </div>
        )}
      </section>
    </div>
  )
}
