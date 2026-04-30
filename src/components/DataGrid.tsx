import { useState, useCallback, useMemo, useEffect, useRef, memo } from 'react'
import type { ColumnInfo, DbRow, StatusInfo } from '../types'
import useAppStore from '../store/appStore'
import { MdRefresh } from "react-icons/md";
import { LuFilter } from "react-icons/lu";
import { FiPlus, FiTrash2, FiX, FiSave, FiCalendar } from "react-icons/fi";
import { MdDragIndicator } from "react-icons/md";

const api = window.electronAPI
const NEW_ROW_ID = -1

function stringifyDbValue(value: DbRow[string]) {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  } catch (_) {
    return String(value)
  }
}

function toEditableValue(value: DbRow[string]) {
  return stringifyDbValue(value)
}

type TemporalInputKind = 'text' | 'date' | 'time' | 'datetime-local'

function getTemporalInputKind(columnName: string, columnType?: string): TemporalInputKind {
  const normalizedType = String(columnType || '').toLowerCase()
  const normalizedName = columnName.toLowerCase()

  if (normalizedType.includes('timestamp') || normalizedType.includes('datetime')) return 'datetime-local'
  if (normalizedType === 'date' || /\bdate\b/.test(normalizedType)) return 'date'
  if (normalizedType.includes('time')) return 'time'

  if (normalizedName.endsWith('_at') || normalizedName.includes('timestamp')) return 'datetime-local'
  if (normalizedName.includes('date')) return 'date'
  if (normalizedName.includes('time')) return 'time'

  return 'text'
}

function toTemporalInputValue(value: string, kind: TemporalInputKind) {
  if (!value) return ''
  if (kind === 'datetime-local') {
    const trimmed = value.trim()
    const normalized = trimmed.replace(' ', 'T')
    const match = normalized.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(:\d{2})?/)
    if (match) return `${match[1]}${match[2] ?? ''}`

    const parsed = new Date(trimmed)
    if (!Number.isNaN(parsed.getTime())) {
      const year = parsed.getFullYear()
      const month = padTemporalPart(parsed.getMonth() + 1)
      const day = padTemporalPart(parsed.getDate())
      const hours = padTemporalPart(parsed.getHours())
      const minutes = padTemporalPart(parsed.getMinutes())
      const seconds = padTemporalPart(parsed.getSeconds())
      return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`
    }

    return trimmed
  }
  if (kind === 'date') {
    const trimmed = value.trim()
    const match = trimmed.match(/^\d{4}-\d{2}-\d{2}/)
    return match ? match[0] : value
  }
  if (kind === 'time') {
    const trimmed = value.trim()
    const match = trimmed.match(/^\d{2}:\d{2}(:\d{2})?/)
    if (match) return match[0]

    const parsed = new Date(trimmed)
    if (!Number.isNaN(parsed.getTime())) {
      return `${padTemporalPart(parsed.getHours())}:${padTemporalPart(parsed.getMinutes())}:${padTemporalPart(parsed.getSeconds())}`
    }

    return value
  }
  return value
}

function fromTemporalInputValue(value: string, kind: TemporalInputKind) {
  if (!value) return ''
  if (kind === 'datetime-local') {
    const normalized = value.replace('T', ' ')
    return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(normalized) ? `${normalized}:00` : normalized
  }
  return value
}

function padTemporalPart(value: number) {
  return String(value).padStart(2, '0')
}

function formatDateObject(value: Date, kind: TemporalInputKind) {
  const year = value.getFullYear()
  const month = padTemporalPart(value.getMonth() + 1)
  const day = padTemporalPart(value.getDate())
  const hours = padTemporalPart(value.getHours())
  const minutes = padTemporalPart(value.getMinutes())
  const seconds = padTemporalPart(value.getSeconds())

  if (kind === 'date') return `${day}-${month}-${year}`
  if (kind === 'time') return `${hours}:${minutes}:${seconds}`
  if (kind === 'datetime-local') return `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`
  return String(value)
}

function formatTemporalEditorValue(value: string, kind: TemporalInputKind) {
  if (!value) return ''

  if (kind === 'date') {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (match) return `${match[3]}-${match[2]}-${match[1]}`
  }

  if (kind === 'datetime-local') {
    const normalized = value.replace('T', ' ')
    const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}:\d{2})(:\d{2})?$/)
    if (match) return `${match[3]}-${match[2]}-${match[1]} ${match[4]}${match[5] ?? ''}`
  }

  return value
}

function formatTemporalDisplayValue(value: DbRow[string], kind: TemporalInputKind) {
  if (value == null || kind === 'text') return value
  if (value instanceof Date) return formatDateObject(value, kind)

  const raw = stringifyDbValue(value).trim()
  if (!raw) return raw

  if (kind === 'date') {
    const match = raw.match(/(\d{4})-(\d{2})-(\d{2})/)
    return match ? `${match[3]}-${match[2]}-${match[1]}` : raw
  }

  if (kind === 'time') {
    const match = raw.match(/\d{2}:\d{2}(:\d{2})?/)
    return match ? match[0] : raw
  }

  if (kind === 'datetime-local') {
    const isoMatch = raw.match(/(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2})(:\d{2})?/)
    if (isoMatch) {
      const [year, month, day] = isoMatch[1].split('-')
      return `${day}-${month}-${year} ${isoMatch[2]}${isoMatch[3] ?? ':00'}`
    }

    const parsed = new Date(raw)
    if (!Number.isNaN(parsed.getTime())) {
      return formatDateObject(parsed, kind)
    }
  }

  return raw
}

function TemporalEditor({
  kind,
  value,
  onChange,
  onStopPropagation,
  onSave,
  onCancel,
}: {
  kind: TemporalInputKind
  value: string
  onChange: (value: string) => void
  onStopPropagation: (event: React.MouseEvent | React.FocusEvent) => void
  onSave: () => void
  onCancel: () => void
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)

  if (kind === 'text') {
    return (
      <input
        value={value}
        onClick={onStopPropagation}
        onChange={event => onChange(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Enter') {
            event.preventDefault()
            onSave()
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            onCancel()
          }
        }}
        className="w-full rounded-md bg-slate-950/70 border-none text-[12px] p-1 text-slate-100 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-400/20"
      />
    )
  }

  return (
    <div className="relative flex items-center">
      <input
        readOnly
        value={formatTemporalEditorValue(toTemporalInputValue(value, kind), kind)}
        onClick={event => {
          onStopPropagation(event)
          if (inputRef.current) {
            openTemporalPicker(inputRef.current, kind)
            inputRef.current.focus()
          }
        }}
        className="w-full rounded-md bg-slate-950/70 border-none text-[12px] p-1 text-slate-100 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-400/20"
      />
      <button
        type="button"
        onMouseDown={event => {
          event.preventDefault()
          event.stopPropagation()
          if (inputRef.current) {
            openTemporalPicker(inputRef.current, kind)
          }
          inputRef.current?.focus()
        }}
        className="absolute right-1 inline-flex h-6 w-6 items-center justify-center rounded text-slate-400 transition hover:bg-slate-800 hover:text-slate-100"
        aria-label={kind === 'time' ? 'Open time picker' : 'Open date picker'}
      >
        <FiCalendar size={13} />
      </button>
      <input
        ref={inputRef}
        type={kind}
        value={toTemporalInputValue(value, kind)}
        step={kind === 'datetime-local' || kind === 'time' ? 1 : undefined}
        onClick={event => event.stopPropagation()}
        onFocus={event => onStopPropagation(event)}
        onChange={event => onChange(fromTemporalInputValue(event.target.value, kind))}
        onKeyDown={event => {
          if (event.key === 'Enter') {
            event.preventDefault()
            onSave()
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            onCancel()
          }
        }}
        className="absolute left-0 top-0 h-px w-px opacity-0"
      />
    </div>
  )
}

function openTemporalPicker(target: HTMLInputElement, kind: TemporalInputKind) {
  if (kind === 'text') return
  if (typeof target.showPicker === 'function') {
    try {
      target.showPicker()
    } catch (_) {
      // Some browsers block showPicker outside trusted interactions.
    }
  }
}

type FilterMode = 'builder' | 'sql'
type FilterConnector = 'AND' | 'OR'
type FilterOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'startsWith' | 'endsWith' | 'isNull' | 'isNotNull'

interface FilterClause {
  id: number
  enabled: boolean
  connector: FilterConnector
  column: string
  operator: FilterOperator
  value: string
}

const FILTER_OPERATORS: Array<{ value: FilterOperator; label: string }> = [
  { value: 'eq', label: '=' },
  { value: 'neq', label: '!=' },
  { value: 'gt', label: '>' },
  { value: 'gte', label: '>=' },
  { value: 'lt', label: '<' },
  { value: 'lte', label: '<=' },
  { value: 'contains', label: 'contains' },
  { value: 'startsWith', label: 'starts with' },
  { value: 'endsWith', label: 'ends with' },
  { value: 'isNull', label: 'is null' },
  { value: 'isNotNull', label: 'is not null' },
]

function createFilterClause(column = ''): FilterClause {
  return {
    id: Date.now() + Math.floor(Math.random() * 1000),
    enabled: true,
    connector: 'AND',
    column,
    operator: 'eq',
    value: '',
  }
}

function escapeSqlLiteral(value: string) {
  return value.replace(/'/g, "''")
}

function toSqlValue(value: string) {
  const trimmed = value.trim()
  if (!trimmed.length) return "''"
  if (/^null$/i.test(trimmed)) return 'NULL'
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return trimmed
  return `'${escapeSqlLiteral(trimmed)}'`
}

function buildFilterExpression(clause: FilterClause) {
  const column = clause.column.trim()
  if (!column) return ''

  switch (clause.operator) {
    case 'isNull':
      return `${column} IS NULL`
    case 'isNotNull':
      return `${column} IS NOT NULL`
    case 'contains':
      return `${column} LIKE '%${escapeSqlLiteral(clause.value)}%'`
    case 'startsWith':
      return `${column} LIKE '${escapeSqlLiteral(clause.value)}%'`
    case 'endsWith':
      return `${column} LIKE '%${escapeSqlLiteral(clause.value)}'`
    case 'eq':
      return `${column} = ${toSqlValue(clause.value)}`
    case 'neq':
      return `${column} != ${toSqlValue(clause.value)}`
    case 'gt':
      return `${column} > ${toSqlValue(clause.value)}`
    case 'gte':
      return `${column} >= ${toSqlValue(clause.value)}`
    case 'lt':
      return `${column} < ${toSqlValue(clause.value)}`
    case 'lte':
      return `${column} <= ${toSqlValue(clause.value)}`
    default:
      return ''
  }
}

function buildFilterSql(clauses: FilterClause[]) {
  const activeClauses = clauses
    .filter(clause => clause.enabled)
    .map(clause => ({ clause, expression: buildFilterExpression(clause) }))
    .filter(item => item.expression)

  return activeClauses
    .map((item, index) => index === 0 ? item.expression : `${item.clause.connector} ${item.expression}`)
    .join(' ')
}

type ModalState =
  | { type: 'delete' }
  | null

// Delete Confirm
function DeleteConfirm({ count, onConfirm, onClose }: { count: number; onConfirm: () => void; onClose: () => void }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal fade-in" style={{ minWidth: 320 }} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600, color: 'var(--red)' }}>
          Delete {count} row{count > 1 ? 's' : ''}?
        </h3>
        <p style={{ color: 'var(--text-secondary)', margin: '0 0 20px', fontSize: 13 }}>This action cannot be undone.</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-danger" style={{ background: 'var(--red)', color: '#fff' }} onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </div>
  )
}

// Cell
const Cell = memo(function Cell({
  value,
  isPk,
  style,
  onClick,
  onDoubleClick,
}: {
  value: DbRow[string]
  isPk: boolean
  style?: React.CSSProperties
  onClick?: (event: React.MouseEvent<HTMLTableCellElement>) => void
  onDoubleClick?: (event: React.MouseEvent<HTMLTableCellElement>) => void
}) {
  if (value === null || value === undefined) return <td style={style} className="null-cell" onClick={onClick} onDoubleClick={onDoubleClick}>NULL</td>
  const isNum = typeof value === 'number'
  const displayValue = stringifyDbValue(value)
  return <td style={style} className={isPk ? 'pk-cell' : isNum ? 'num-cell' : ''} title={displayValue} onClick={onClick} onDoubleClick={onDoubleClick}>{displayValue}</td>
})

// DataGrid
interface Props {
  connectionId: string
  tableName: string
  database?: string
  onStatusChange?: (status: StatusInfo) => void
}

export default function DataGrid({ connectionId, tableName, database, onStatusChange }: Props) {
  const setGridFooter = useAppStore(s => s.setGridFooter)
  const [rows, setRows]                     = useState<DbRow[]>([])
  const [columns, setColumns]               = useState<string[]>([])
  const [columnInfoByName, setColumnInfoByName] = useState<Record<string, ColumnInfo>>({})
  const [total, setTotal]                   = useState(0)
  const [page, setPage]                     = useState(0)
  const [limit, setLimit]                   = useState(100)
  const [loading, setLoading]               = useState(false)
  const [error, setError]                   = useState<string | null>(null)
  const [selectedRowids, setSelectedRowids] = useState<Set<number>>(new Set())
  const [sortCol, setSortCol]               = useState<string | null>(null)
  const [sortDir, setSortDir]               = useState<'asc' | 'desc'>('asc')
  const [modal, setModal]                   = useState<ModalState>(null)
  const [filter, setFilter]                 = useState('')
  const [columnWidths, setColumnWidths]     = useState<Record<string, number>>({})
  const [editingRowId, setEditingRowId]     = useState<number | null>(null)
  const [editingDraft, setEditingDraft]     = useState<Record<string, string>>({})
  const [savingEdit, setSavingEdit]         = useState(false)
  const [filterPanelOpen, setFilterPanelOpen] = useState(false)
  const [filterMode, setFilterMode]         = useState<FilterMode>('builder')
  const [filterClauses, setFilterClauses]   = useState<FilterClause[]>([createFilterClause()])
  const [filterSqlDraft, setFilterSqlDraft] = useState('')
  const [appliedFilter, setAppliedFilter]   = useState('')
  const resizeRef = useRef<{ column: string; startX: number; startWidth: number } | null>(null)

  const builderSql = useMemo(() => buildFilterSql(filterClauses), [filterClauses])

  const loadData = useCallback(async (pg = 0, nextFilter = appliedFilter, nextLimit = limit) => {
    setLoading(true)
    setError(null)
    setSelectedRowids(new Set())
    setEditingRowId(null)
    setEditingDraft({})
    const trimmedFilter = nextFilter.trim()
    const result = await api.getTableData(connectionId, tableName, pg, nextLimit, database, trimmedFilter || undefined)
    if (result.error) { setError(result.error); setLoading(false); return }
    setRows(result.rows)
    setTotal(result.total)
    setPage(pg)
    if (result.rows.length > 0) {
      setColumns(Object.keys(result.rows[0]).filter(c => c !== '__rowid__'))
    } else {
      const struct = await api.getTableStructure(connectionId, tableName, database)
      if (!('error' in struct)) setColumns(struct.columns.map(c => c.name))
    }
    onStatusChange?.({ message: `${database ? `${database}.` : ''}${tableName} - ${result.total} rows`, rows: result.total })
    setLoading(false)
  }, [appliedFilter, connectionId, tableName, limit, database, onStatusChange])

  useEffect(() => {
    setPage(0)
    setSortCol(null)
    setFilter('')
    setAppliedFilter('')
    setFilterSqlDraft('')
    setFilterClauses([createFilterClause()])
    setFilterMode('builder')
    setFilterPanelOpen(false)
    void loadData(0, '')
  }, [connectionId, tableName, database])

  useEffect(() => {
    let cancelled = false

    void api.getTableStructure(connectionId, tableName, database).then(struct => {
      if (cancelled || 'error' in struct) return
      setColumnInfoByName(
        Object.fromEntries(struct.columns.map(column => [column.name, column]))
      )
    })

    return () => {
      cancelled = true
    }
  }, [connectionId, tableName, database])

  useEffect(() => {
    if (!columns.length) return
    setFilterClauses(prev => prev.map(clause => clause.column ? clause : { ...clause, column: columns[0] }))
  }, [columns])

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      const resize = resizeRef.current
      if (!resize) return
      const nextWidth = Math.max(120, resize.startWidth + (event.clientX - resize.startX))
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

  const displayRows = useMemo(() => {
    let r = rows
    if (filter) {
      const q = filter.toLowerCase()
      r = r.filter(row => Object.values(row).some(v => v != null && String(v).toLowerCase().includes(q)))
    }
    if (sortCol) {
      r = [...r].sort((a, b) => {
        const av = a[sortCol], bv = b[sortCol]
        if (av == null && bv == null) return 0
        if (av == null) return sortDir === 'asc' ? 1 : -1
        if (bv == null) return sortDir === 'asc' ? -1 : 1
        if (typeof av === 'number' && typeof bv === 'number') return sortDir === 'asc' ? av - bv : bv - av
        return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av))
      })
    }
    return r
  }, [rows, sortCol, sortDir, filter])

  const visibleRows = useMemo(() => {
    if (editingRowId !== NEW_ROW_ID) return displayRows
    const draftRow = Object.fromEntries(columns.map(column => [column, editingDraft[column] ?? null]))
    return [...displayRows, { __rowid__: NEW_ROW_ID, ...draftRow }]
  }, [displayRows, editingRowId, columns, editingDraft])

  const handleSort = useCallback((col: string) => {
    setSortCol(prev => {
      if (prev === col) { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); return col }
      setSortDir('asc'); return col
    })
  }, [])

  const handleResizeStart = useCallback((col: string, event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    const currentWidth = columnWidths[col] ?? 180
    resizeRef.current = { column: col, startX: event.clientX, startWidth: currentWidth }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [columnWidths])

  const handleRowClick = useCallback((rowid: number, e: React.MouseEvent) => {
    setSelectedRowids(prev => {
      const next = new Set(prev)
      if (e.ctrlKey || e.metaKey) {
        next.has(rowid) ? next.delete(rowid) : next.add(rowid)
      } else {
        return new Set(next.has(rowid) && next.size === 1 ? [] : [rowid])
      }
      return next
    })
  }, [])

  const startInlineEdit = useCallback((row: DbRow) => {
    const rowid = row.__rowid__ as number
    setSelectedRowids(new Set([rowid]))
    setEditingRowId(rowid)
    setEditingDraft(
      Object.fromEntries(columns.map(column => [column, toEditableValue(row[column])]))
    )
  }, [columns])

  const cancelInlineEdit = useCallback(() => {
    setEditingRowId(null)
    setEditingDraft({})
    setSavingEdit(false)
    setSelectedRowids(new Set())
  }, [])

  const handleStartInsert = useCallback(() => {
    setModal(null)
    setSelectedRowids(new Set([NEW_ROW_ID]))
    setEditingRowId(NEW_ROW_ID)
    setEditingDraft(Object.fromEntries(columns.map(column => [column, ''])))
  }, [columns])

  const handleSaveInlineEdit = useCallback(async () => {
    if (editingRowId == null) return
    setSavingEdit(true)
    const cleaned = Object.fromEntries(Object.entries(editingDraft).filter(([key]) => key !== '__rowid__'))
    const result = editingRowId === NEW_ROW_ID
      ? await api.insertRow(connectionId, tableName, cleaned, database)
      : await api.updateRow(connectionId, tableName, editingRowId, cleaned, database)
    if (result.error) {
      alert(`${editingRowId === NEW_ROW_ID ? 'Insert' : 'Update'} failed:\n` + result.error)
      setSavingEdit(false)
      return
    }
    cancelInlineEdit()
    loadData(page)
  }, [editingRowId, editingDraft, connectionId, tableName, database, cancelInlineEdit, loadData, page])

  const handleDelete = useCallback(async () => {
    if (selectedRowids.size === 1 && selectedRowids.has(NEW_ROW_ID)) {
      cancelInlineEdit()
      setModal(null)
      return
    }
    for (const rowid of selectedRowids) {
      await api.deleteRow(connectionId, tableName, rowid, database)
    }
    setSelectedRowids(new Set())
    setModal(null)
    loadData(page)
  }, [connectionId, tableName, database, selectedRowids, page, loadData, cancelInlineEdit])

  const totalPages = Math.max(1, Math.ceil(total / limit))
  const rangeStart = total === 0 ? 0 : page * limit + 1
  const rangeEnd = Math.min((page + 1) * limit, total)
  const hasFilterPanel = filterPanelOpen || Boolean(appliedFilter)

  const handleApplyFilter = useCallback(async () => {
    const nextFilter = filterMode === 'builder' ? builderSql.trim() : filterSqlDraft.trim()
    setAppliedFilter(nextFilter)
    setFilterPanelOpen(true)
    await loadData(0, nextFilter)
  }, [filterMode, builderSql, filterSqlDraft, loadData])

  const handleClearFilter = useCallback(async () => {
    setAppliedFilter('')
    setFilterSqlDraft('')
    setFilterClauses([createFilterClause(columns[0] ?? '')])
    await loadData(0, '')
  }, [columns, loadData])

  useEffect(() => {
    const isEditing = editingRowId != null
    const selectionCount = selectedRowids.size
    const isNewRow = editingRowId === NEW_ROW_ID
    const selectionLabel = isEditing
      ? isNewRow
        ? 'Adding new row'
        : `Editing row #${editingRowId}`
      : selectionCount > 0
        ? `${selectionCount} row${selectionCount > 1 ? 's' : ''} selected`
        : undefined

    const footerActions = [
      {
        key: 'insert-row',
        label: 'New Row',
        icon: <FiPlus size={13} />,
        variant: 'ghost' as const,
        disabled: savingEdit || isEditing,
        onClick: handleStartInsert,
      },
      ...(isEditing
        ? [
              ...(!isNewRow
                ? [{
                    key: 'delete-rows',
                    label: `Delete${selectionCount > 1 ? ` (${selectionCount})` : ''}`,
                    icon: <FiTrash2 size={13} />,
                    variant: 'danger' as const,
                    disabled: savingEdit || selectionCount === 0,
                    onClick: () => setModal({ type: 'delete' }),
                  }]
                : []),
              {
                key: 'cancel-edit',
                label: 'Cancel',
                icon: <FiX size={13} />,
                variant: 'ghost' as const,
                disabled: savingEdit,
                onClick: cancelInlineEdit,
              },
              {
                key: 'save-edit',
                label: savingEdit ? 'Saving...' : 'Save',
                icon: <FiSave size={13} />,
                variant: 'primary' as const,
                disabled: savingEdit,
                onClick: () => { void handleSaveInlineEdit() },
              },
          ]
        : selectionCount > 0
          ? [
              {
                key: 'delete-rows',
                label: `Delete${selectionCount > 1 ? ` (${selectionCount})` : ''}`,
                icon: <FiTrash2 size={13} />,
                variant: 'danger' as const,
                onClick: () => setModal({ type: 'delete' }),
              },
            ]
          : []),
    ]

    setGridFooter({
      visible: true,
      summary: filter ? `${displayRows.length} / ${total} rows` : `${rangeStart}-${rangeEnd} of ${total}`,
      selectionLabel,
      pageLabel: `${page + 1} / ${totalPages}`,
      limit,
      canPrev: page > 0,
      canNext: page < totalPages - 1,
      actions: footerActions,
      onPrev: () => { void loadData(page - 1) },
      onNext: () => { void loadData(page + 1) },
      onLimitChange: (nextLimit: number) => {
        setLimit(nextLimit)
        void loadData(0, appliedFilter, nextLimit)
      },
    })

    return () => setGridFooter(null)
  }, [
    setGridFooter,
    filter,
    displayRows.length,
    total,
    rangeStart,
    rangeEnd,
    page,
    totalPages,
    limit,
    loadData,
    appliedFilter,
    editingRowId,
    selectedRowids,
    savingEdit,
    cancelInlineEdit,
    handleSaveInlineEdit,
    handleStartInsert,
    handleDelete,
  ])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, width: '100%', minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
      {/* Toolbar */}
      <div className="toolbar" style={{ flexShrink: 0 }}>
        <button className="btn btn-ghost" onClick={() => loadData(page)}><MdRefresh />  Refresh</button>
        <div className="toolbar-sep" />
        <button
          className="btn btn-ghost"
          style={{
            color: filterPanelOpen || appliedFilter ? 'var(--text-primary)' : 'var(--text-secondary)',
            borderColor: appliedFilter ? 'rgba(82, 148, 232, 0.35)' : undefined,
            background: appliedFilter ? 'rgba(82, 148, 232, 0.08)' : undefined,
          }}
          onClick={() => setFilterPanelOpen(open => !open)}
        >
         <LuFilter/> SQL Filter{appliedFilter ? ' *' : ''}
        </button>
        <div className="toolbar-sep" />
        <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter rows..."
          style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)', padding: '3px 8px', borderRadius: 4, fontSize: 12, fontFamily: 'JetBrains Mono', outline: 'none', width: 180 }}
        />
        <div style={{ flex: 1 }} />
      </div>

      {hasFilterPanel && (
        <div
          className="fade-in"
          style={{
            borderBottom: '1px solid var(--border)',
            background: 'linear-gradient(180deg, rgba(18,24,33,0.98), rgba(14,19,26,0.98))',
            padding: '10px 12px 12px',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{ display: 'inline-flex', padding: 3, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 8 }}>
              {(['builder', 'sql'] as FilterMode[]).map(mode => (
                <button
                  key={mode}
                  className="btn"
                  style={{
                    padding: '5px 10px',
                    border: 'none',
                    borderRadius: 6,
                    background: filterMode === mode ? 'rgba(82, 148, 232, 0.18)' : 'transparent',
                    color: filterMode === mode ? '#dfeeff' : 'var(--text-secondary)',
                  }}
                  onClick={() => setFilterMode(mode)}
                >
                  {mode === 'builder' ? 'Builder' : 'SQL'}
                </button>
              ))}
            </div>
            <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
              {filterMode === 'builder' ? 'Build WHERE conditions visually' : 'Write a WHERE expression directly'}
            </span>
            <div style={{ flex: 1 }} />
            <button className="btn btn-ghost" onClick={() => setFilterPanelOpen(false)}>Hide</button>
          </div>

          {filterMode === 'builder' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filterClauses.map((clause, index) => {
                const operatorNeedsValue = clause.operator !== 'isNull' && clause.operator !== 'isNotNull'
                return (
                  <div
                    key={clause.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '24px 68px minmax(140px, 1.2fr) minmax(140px, 1fr) minmax(160px, 1.4fr) 32px',
                      gap: 8,
                      alignItems: 'center',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={clause.enabled}
                      onChange={event => setFilterClauses(prev => prev.map(item => item.id === clause.id ? { ...item, enabled: event.target.checked } : item))}
                    />
                    <select
                      value={clause.connector}
                      disabled={index === 0}
                      onChange={event => setFilterClauses(prev => prev.map(item => item.id === clause.id ? { ...item, connector: event.target.value as FilterConnector } : item))}
                      className="form-input"
                      style={{ height: 32, padding: '0 8px', opacity: index === 0 ? 0.45 : 1 }}
                    >
                      <option value="AND">AND</option>
                      <option value="OR">OR</option>
                    </select>
                    <select
                      value={clause.column}
                      onChange={event => setFilterClauses(prev => prev.map(item => item.id === clause.id ? { ...item, column: event.target.value } : item))}
                      className="form-input"
                      style={{ height: 32, padding: '0 8px' }}
                    >
                      {columns.map(column => <option key={column} value={column}>{column}</option>)}
                    </select>
                    <select
                      value={clause.operator}
                      onChange={event => setFilterClauses(prev => prev.map(item => item.id === clause.id ? { ...item, operator: event.target.value as FilterOperator } : item))}
                      className="form-input"
                      style={{ height: 32, padding: '0 8px' }}
                    >
                      {FILTER_OPERATORS.map(operator => <option key={operator.value} value={operator.value}>{operator.label}</option>)}
                    </select>
                    <input
                      className="form-input"
                      value={clause.value}
                      disabled={!operatorNeedsValue}
                      onChange={event => setFilterClauses(prev => prev.map(item => item.id === clause.id ? { ...item, value: event.target.value } : item))}
                      placeholder={operatorNeedsValue ? 'Value or SQL literal' : 'No value needed'}
                    />
                    <button
                      className="btn btn-ghost"
                      style={{ justifyContent: 'center', padding: 0, height: 32 }}
                      disabled={filterClauses.length === 1}
                      onClick={() => setFilterClauses(prev => prev.filter(item => item.id !== clause.id))}
                    >
                      -
                    </button>
                  </div>
                )
              })}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button className="btn btn-ghost" onClick={() => setFilterClauses(prev => [...prev, createFilterClause(columns[0] ?? '')])}>+ Add Condition</button>
              </div>
              <div style={{ border: '1px solid var(--border)', background: 'var(--bg-input)', borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>
                  Generated WHERE
                </div>
                <div style={{ fontFamily: 'JetBrains Mono', fontSize: 12, color: builderSql ? 'var(--text-primary)' : 'var(--text-muted)', wordBreak: 'break-word' }}>
                  {builderSql || 'No active conditions yet'}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <textarea
                className="sql-editor"
                value={filterSqlDraft}
                onChange={event => setFilterSqlDraft(event.target.value)}
                placeholder={`id = 1 AND name LIKE '%cat%'`}
                style={{ minHeight: 110, borderRadius: 8, padding: 12 }}
              />
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                {'ใส่เฉพาะเงื่อนไขหลัง WHERE เช่น status = active AND age >= 2'}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
            <button className="btn btn-primary" onClick={() => void handleApplyFilter()}>Apply Filter</button>
            <button className="btn btn-ghost" onClick={() => void handleClearFilter()}>Reset</button>
            <div style={{ flex: 1 }} />
            {appliedFilter && (
              <div style={{ maxWidth: '55%', fontSize: 11.5, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                Active: <span className="mono" style={{ color: 'var(--text-primary)' }}>{appliedFilter}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Table */}
      <div style={{ display: 'flex', flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden', position: 'relative' }}>
        <div
          style={{ flex: 1, minWidth: 0, minHeight: 0, overflowX: 'auto', overflowY: 'auto' }}
        >
          {error && (
            <div style={{ padding: 20, color: 'var(--red)', fontFamily: 'JetBrains Mono', fontSize: 12 }}>
              Error: {error}
            </div>
          )}
          {!error && !loading && visibleRows.length === 0 && (
            <div style={{ minHeight: '100%', padding: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: 'var(--text-muted)' }}>
              <div>
                <div style={{ fontSize: 32, marginBottom: 8 }}>[ ]</div>
                Table is empty
              </div>
            </div>
          )}
          {!error && columns.length > 0 && (
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 36, textAlign: 'center', color: 'var(--text-muted)' }}>#</th>
                  {columns.map(col => (
                    <th
                      key={col}
                      className={sortCol === col ? 'sorted' : ''}
                      onClick={() => handleSort(col)}
                      style={{ width: columnWidths[col] ?? 180, minWidth: columnWidths[col] ?? 180, maxWidth: columnWidths[col] ?? 180 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', position: 'relative', height: '100%' }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {col}{sortCol === col && <span style={{ marginLeft: 4 }}>{sortDir === 'asc' ? '^' : 'v'}</span>}
                        </span>
                        <span
                          onMouseDown={event => handleResizeStart(col, event)}
                          title="Drag to resize column"
                          style={{
                            position: 'absolute',
                            right: -8,
                            top: '50%',
                            width: 16,
                            height: 22,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transform: 'translateY(-50%)',
                            cursor: 'col-resize',
                            color: 'var(--text-muted)',
                            opacity: 0.7,
                          }}
                        >
                          <MdDragIndicator size={16} />
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row, i) => {
                  const rowid = row.__rowid__ as number
                  const isEditing = editingRowId === rowid
                  return (
                    <tr key={rowid ?? i} className={selectedRowids.has(rowid) ? 'selected' : ''}
                      onClick={e => handleRowClick(rowid, e)}
                      style={{ cursor: 'default' }}>
                      <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 11 }}>{page * limit + i + 1}</td>
                      {columns.map((col, ci) => {
                        const inputKind = getTemporalInputKind(col, columnInfoByName[col]?.type)

                        return isEditing ? (
                          <td
                            key={col}
                            style={{ width: columnWidths[col] ?? 180, minWidth: columnWidths[col] ?? 180, maxWidth: columnWidths[col] ?? 180, padding: 6 }}
                          >
                            <TemporalEditor
                              kind={inputKind}
                              value={editingDraft[col] ?? ''}
                              onStopPropagation={event => event.stopPropagation()}
                              onChange={nextValue => setEditingDraft(prev => ({
                                ...prev,
                                [col]: nextValue,
                              }))}
                              onSave={() => { void handleSaveInlineEdit() }}
                              onCancel={cancelInlineEdit}
                            />
                          </td>
                        ) : (
                          <Cell
                            key={col}
                            value={formatTemporalDisplayValue(row[col], inputKind)}
                            isPk={ci === 0}
                            onClick={event => {
                              event.stopPropagation()
                              startInlineEdit(row)
                            }}
                            onDoubleClick={event => {
                              event.stopPropagation()
                              startInlineEdit(row)
                            }}
                            style={{ width: columnWidths[col] ?? 180, minWidth: columnWidths[col] ?? 180, maxWidth: columnWidths[col] ?? 180 }}
                          />
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
        {loading && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(30,33,40,0.7)', zIndex: 20 }}>
            <span style={{ color: 'var(--text-secondary)' }}>Loading...</span>
          </div>
        )}
      </div>

      {/* Modals */}
      {modal?.type === 'delete' && (
        <DeleteConfirm count={selectedRowids.size} onConfirm={handleDelete} onClose={() => setModal(null)} />
      )}
    </div>
  )
}
