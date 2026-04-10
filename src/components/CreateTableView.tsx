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
  const dbType = connection.dbType ?? 'sqlite'
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
  const dbType = connection.dbType ?? 'sqlite'
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
  const options = TYPE_OPTIONS[connection.dbType ?? 'sqlite']
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
  const options = DEFAULT_OPTIONS[connection.dbType ?? 'sqlite']
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

  const dbType = connection?.dbType ?? 'sqlite'
  const typeOptions = TYPE_OPTIONS[dbType]
  const defaultOptions = DEFAULT_OPTIONS[dbType]
  const activeTab = tabs.find(tab => tab.id === activeTabId) ?? null
  const canEditSchema = mode === 'edit' ? dbType === 'sqlite' || dbType === 'postgresql' : true

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
    return <div className="p-8 text-sm text-rose-300">Connection not available.</div>
  }

  return (
    <div className="h-full overflow-auto bg-[#0f141b]">
      <section className="border-b border-[#1b2735] px-6 py-5">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{mode === 'edit' ? 'Edit Table' : 'Create Table'}</div>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-[320px] flex-1">
            <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Table Name</label>
            <input
              value={tableName}
              onChange={event => setTableName(event.target.value)}
              placeholder="new_table"
              autoComplete="off"
              disabled={mode === 'edit' && !canEditSchema}
              className="h-11 w-full max-w-[420px] rounded-xl border border-[#1b2735] bg-[#0b1118] px-4 text-sm text-slate-100 outline-none transition focus:border-[#005FB8]"
            />
            <div className="mt-2 text-xs text-slate-500">
              {database ? `Database: ${database}` : connectionName}
              {schemaName ? ` • Schema: ${schemaName}` : ''}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setColumns(prev => [...prev, createColumnDraft(connection)])
                setError(null)
              }}
              disabled={!canEditSchema}
              className="rounded-xl border border-[#244466] bg-[#102235] px-4 py-2.5 text-sm font-medium text-[#79bbff] transition hover:border-[#2f5e8f] hover:bg-[#12304c]"
            >
              Add Row
            </button>
            <button
              type="button"
              onClick={() => activeTab && closeTab(activeTab.id)}
              className="rounded-xl border border-[#1b2735] bg-[#121821] px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:border-[#2d4f70]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={saving || loadingStructure || !canEditSchema}
              className="rounded-xl bg-[#005FB8] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0a6ccb] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {mode === 'edit' ? (saving ? 'Saving...' : 'Save Changes') : saving ? 'Creating...' : 'Create Table'}
            </button>
          </div>
        </div>
      </section>

      <section className="px-3 py-4">
        {loadingStructure && <div className="mb-4 rounded-xl border border-[#244466] bg-[#102235]/40 px-4 py-3 text-sm text-slate-200">Loading table structure...</div>}
        {mode === 'edit' && !loadingStructure && !canEditSchema && (
          <div className="mb-4 rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
            Existing values are loaded into the form. Saving schema edits is currently supported only for SQLite and PostgreSQL.
          </div>
        )}
        <h4 className="mb-3 px-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-400">Columns ({columns.length})</h4>
        <div className="overflow-hidden rounded-md border border-[#1b2735]">
          <table className="min-w-full border-collapse text-sm">
            <thead className="bg-[#111821] text-[11px] uppercase tracking-[0.08em] text-[#7f97b7]">
              <tr>
                {[
                  // { key: '#', label: '#', fallback: 90, className: 'border-b border-r border-[#1b2735] px-4 py-3 text-left font-medium' },
                  { key: 'Name', label: 'Name', fallback: 180, className: 'border-b border-r border-[#1b2735] px-4 py-3 text-left font-medium' },
                  { key: 'Type', label: 'Type', fallback: 280, className: 'border-b border-r border-[#1b2735] px-4 py-3 text-left font-medium' },
                  { key: 'Length', label: 'Length', fallback: 120, className: 'border-b border-r border-[#1b2735] px-4 py-3 text-left font-medium' },
                  { key: 'PK', label: 'PK', fallback: 90, className: 'border-b border-r border-[#1b2735] px-4 py-3 text-left font-medium' },
                  { key: 'Nullable', label: 'Nullable', fallback: 170, className: 'border-b border-r border-[#1b2735] px-4 py-3 text-left font-medium' },
                  { key: 'Default', label: 'Default', fallback: 240, className: 'border-b border-r border-[#1b2735] px-4 py-3 text-left font-medium' },
                  { key: 'Comment', label: 'Comment', fallback: 220, className: 'border-b border-r border-[#1b2735] px-4 py-3 text-left font-medium' },
                  { key: 'Actions', label: 'Actions', fallback: 130, className: 'border-b border-[#1b2735] px-4 py-3 text-left font-medium' },
                ].map(header => (
                  <th key={header.key} className={header.className} style={getColumnWidth(header.key, header.fallback)}>
                    <div className="relative flex items-center">
                      <span>{header.label}</span>
                      <span
                        onMouseDown={event => handleResizeStart(header.key, event)}
                        className="absolute -right-2 -top-2 h-8 w-4 cursor-col-resize"
                      />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {columns.map((column, index) => (
                <tr key={column.id} className={index % 2 === 0 ? 'bg-[#0f141b]' : 'bg-[#101720]'}>
                  {/* <td className="border-b border-r border-[#182433] px-4 py-3 font-mono text-xs text-slate-500">{index}</td> */}
                  <td className="border-b border-r border-[#182433] px-3 py-2">
                    <input
                      value={column.name}
                      onChange={event => updateColumn(column.id, current => ({ ...current, name: event.target.value }))}
                      placeholder="column_name"
                      autoComplete="off"
                      disabled={!canEditSchema}
                      className="h-8 w-full rounded-md border border-[#1b2735] bg-[#0b1118] px-3 font-mono text-sm text-[#79bbff] outline-none transition focus:border-[#005FB8]"
                    />
                  </td>
                  <td className="border-b border-r border-[#182433] px-3 py-2">
                    <div className="flex items-center gap-3">
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
                        className="h-8 rounded-md border border-[#1b2735] bg-[#0b1118] px-3 font-mono text-sm text-slate-100 outline-none transition focus:border-[#005FB8]"
                      >
                        {typeOptions.map(option => (
                          <option key={option.value} value={option.value} className="bg-[#0b1118] text-slate-100">
                            {option.value}
                          </option>
                        ))}
                      </select>
                      {/* <TypeBadge type={column.type} /> */}
                    </div>
                  </td>
                  <td className="border-b border-r border-[#182433] px-3 py-2">
                    <input
                      value={column.length}
                      onChange={event => updateColumn(column.id, current => ({ ...current, length: event.target.value }))}
                      placeholder={(typeOptions.find(option => option.value === column.type)?.defaultLength) ?? ''}
                      disabled={!canEditSchema || !typeOptions.find(option => option.value === column.type)?.allowLength}
                      className="h-8 w-full rounded-md border border-[#1b2735] bg-[#0b1118] px-3 font-mono text-sm text-slate-100 outline-none transition focus:border-[#005FB8] disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </td>
                  <td className="border-b border-r border-[#182433] px-4 py-3">
                    <input
                      type="checkbox"
                      checked={column.isPrimaryKey}
                      onChange={event => updateColumn(column.id, current => ({
                        ...current,
                        isPrimaryKey: event.target.checked,
                        notNull: event.target.checked ? true : current.notNull,
                      }))}
                      disabled={!canEditSchema}
                      className="h-4 w-4 accent-[#ffcf52]"
                    />
                  </td>
                  <td className="border-b border-r border-[#182433] px-4 py-3">
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={!(column.notNull || column.isPrimaryKey)}
                        disabled={column.isPrimaryKey || !canEditSchema}
                        onChange={event => updateColumn(column.id, current => ({ ...current, notNull: !event.target.checked }))}
                        className="h-4 w-4 accent-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                      />
                      <span className={`font-mono text-xs ${column.notNull || column.isPrimaryKey ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {column.notNull || column.isPrimaryKey ? 'NOT NULL' : 'NULL'}
                      </span>
                    </label>
                  </td>
                  <td className="border-b border-r border-[#182433] px-3 py-2">
                    <select
                      value={column.defaultValue}
                      onChange={event => updateColumn(column.id, current => ({ ...current, defaultValue: event.target.value }))}
                      disabled={!canEditSchema}
                      className="h-8 min-w-[220px] rounded-md border border-[#1b2735] bg-[#0b1118] px-3 font-mono text-sm text-orange-300 outline-none transition focus:border-[#005FB8]"
                    >
                      {defaultOptions.map(option => (
                        <option key={option.value} value={option.value} className="bg-[#0b1118] text-slate-100">
                          {option.label}
                        </option>
                      ))}
                      </select>
                  </td>
                  <td className="border-b border-r border-[#182433] px-3 py-2">
                    <input
                      value={column.comment}
                      onChange={event => updateColumn(column.id, current => ({ ...current, comment: event.target.value }))}
                      placeholder="comment"
                      disabled={!canEditSchema}
                      className="h-8 w-full rounded-md border border-[#1b2735] bg-[#0b1118] px-3 text-sm text-slate-100 outline-none transition focus:border-[#005FB8]"
                    />
                  </td>
                  <td className="border-b border-[#182433] px-4 py-3">
                    <button
                      type="button"
                      disabled={columns.length === 1 || !canEditSchema}
                      onClick={() => {
                        setColumns(prev => prev.filter(item => item.id !== column.id))
                        setError(null)
                      }}
                      className="rounded-lg border border-[#283241] bg-[#121821] px-3 py-2 text-xs font-medium text-slate-300 transition hover:border-rose-400/40 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {error && <div className="mt-4 rounded-xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</div>}

        {previewSql && (
          <div className="mt-5">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Preview SQL</div>
            <pre className="overflow-x-auto rounded-xl border border-[#1b2735] bg-[#0b1118] px-4 py-4 font-mono text-[12px] leading-6 text-slate-300">{previewSql}</pre>
          </div>
        )}
      </section>
    </div>
  )
}
