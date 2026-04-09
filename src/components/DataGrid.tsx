import { useState, useCallback, useMemo, useEffect, useRef, memo } from 'react'
import type { DbRow, StatusInfo } from '../types'

const api = window.electronAPI

function toEditableValue(value: DbRow[string]) {
  return value == null ? '' : String(value)
}

// ── Types ─────────────────────────────────────────────────────────────────────
type ModalState =
  | { type: 'insert' }
  | { type: 'edit'; data: DbRow }
  | { type: 'delete' }
  | null

// ── Row Modal ─────────────────────────────────────────────────────────────────
interface RowModalProps {
  mode: 'insert' | 'edit'
  columns: string[]
  initialData?: DbRow
  onSave: (data: Record<string, string>) => void
  onClose: () => void
}

function RowModal({ mode, columns, initialData, onSave, onClose }: RowModalProps) {
  const [form, setForm] = useState<Record<string, string>>(() => {
    if (mode === 'edit' && initialData) {
      return Object.fromEntries(columns.map(c => [c, initialData[c] == null ? '' : String(initialData[c])]))
    }
    return Object.fromEntries(columns.map(c => [c, '']))
  })

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal fade-in" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{mode === 'insert' ? '+ Insert Row' : '✏️ Edit Row'}</h3>
          <button className="btn btn-ghost" style={{ padding: '2px 8px' }} onClick={onClose}>✕</button>
        </div>
        <form onSubmit={e => { e.preventDefault(); onSave(form) }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px', maxHeight: 400, overflowY: 'auto' }}>
            {columns.map(col => (
              <div key={col}>
                <label className="form-label">{col}</label>
                <input
                  className="form-input"
                  value={form[col]}
                  onChange={e => setForm(prev => ({ ...prev, [col]: e.target.value }))}
                  placeholder="NULL"
                  autoComplete="off"
                />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary">{mode === 'insert' ? 'Insert' : 'Save Changes'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Delete Confirm ────────────────────────────────────────────────────────────
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

// ── Cell ──────────────────────────────────────────────────────────────────────
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
  return <td style={style} className={isPk ? 'pk-cell' : isNum ? 'num-cell' : ''} title={String(value)} onClick={onClick} onDoubleClick={onDoubleClick}>{String(value)}</td>
})

// ── DataGrid ──────────────────────────────────────────────────────────────────
interface Props {
  connectionId: string
  tableName: string
  database?: string
  onStatusChange?: (status: StatusInfo) => void
}

export default function DataGrid({ connectionId, tableName, database, onStatusChange }: Props) {
  const [rows, setRows]                     = useState<DbRow[]>([])
  const [columns, setColumns]               = useState<string[]>([])
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
  const resizeRef = useRef<{ column: string; startX: number; startWidth: number } | null>(null)

  const loadData = useCallback(async (pg = 0) => {
    setLoading(true)
    setError(null)
    setSelectedRowids(new Set())
    setEditingRowId(null)
    setEditingDraft({})
    const result = await api.getTableData(connectionId, tableName, pg, limit, database)
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
    onStatusChange?.({ message: `${database ? `${database}.` : ''}${tableName} — ${result.total} rows`, rows: result.total })
    setLoading(false)
  }, [connectionId, tableName, limit, database, onStatusChange])

  useEffect(() => {
    setPage(0); setSortCol(null); setFilter('')
    loadData(0)
  }, [connectionId, tableName, database])

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
  }, [])

  useEffect(() => {
    if (modal?.type === 'edit') {
      startInlineEdit(modal.data)
      setModal(null)
    }
  }, [modal, startInlineEdit])

  const handleInsert = useCallback(async (data: Record<string, string>) => {
    const result = await api.insertRow(connectionId, tableName, data, database)
    if (result.error) { alert('Insert failed:\n' + result.error); return }
    setModal(null)
    loadData(page)
  }, [connectionId, tableName, database, page, loadData])

  const handleSaveInlineEdit = useCallback(async () => {
    if (editingRowId == null) return
    setSavingEdit(true)
    const cleaned = Object.fromEntries(Object.entries(editingDraft).filter(([key]) => key !== '__rowid__'))
    const result = await api.updateRow(connectionId, tableName, editingRowId, cleaned, database)
    if (result.error) {
      alert('Update failed:\n' + result.error)
      setSavingEdit(false)
      return
    }
    cancelInlineEdit()
    loadData(page)
  }, [editingRowId, editingDraft, connectionId, tableName, database, cancelInlineEdit, loadData, page])

  const handleDelete = useCallback(async () => {
    for (const rowid of selectedRowids) {
      await api.deleteRow(connectionId, tableName, rowid, database)
    }
    setSelectedRowids(new Set())
    setModal(null)
    loadData(page)
  }, [connectionId, tableName, database, selectedRowids, page, loadData])

  const selectedRow = useMemo(() => {
    if (selectedRowids.size !== 1) return null
    const [rowid] = selectedRowids
    return rows.find(r => r.__rowid__ === rowid) ?? null
  }, [selectedRowids, rows])

  const totalPages = Math.max(1, Math.ceil(total / limit))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <div className="toolbar">
        <button className="btn btn-ghost" onClick={() => loadData(page)}>↺ Refresh</button>
        <div className="toolbar-sep" />
        <button className="btn btn-ghost" style={{ color: 'var(--green)' }} onClick={() => setModal({ type: 'insert' })}>+ New Row</button>
        <button className="btn btn-ghost" disabled={selectedRowids.size !== 1}
          onClick={() => selectedRow && setModal({ type: 'edit', data: selectedRow })}>✏ Edit</button>
        <button className="btn btn-danger" disabled={selectedRowids.size === 0} onClick={() => setModal({ type: 'delete' })}>
          🗑 Delete{selectedRowids.size > 1 ? ` (${selectedRowids.size})` : ''}
        </button>
        <div className="toolbar-sep" />
        <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter rows…"
          style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)', padding: '3px 8px', borderRadius: 4, fontSize: 12, fontFamily: 'JetBrains Mono', outline: 'none', width: 180 }}
        />
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginRight: 6 }}>
          {filter ? `${displayRows.length} / ${total} rows` : `${page * limit + 1}–${Math.min((page + 1) * limit, total)} of ${total}`}
        </span>
        <button className="btn btn-ghost" style={{ padding: '3px 8px' }} disabled={page === 0} onClick={() => loadData(page - 1)}>‹</button>
        <span style={{ fontSize: 11.5, color: 'var(--text-secondary)', padding: '0 4px' }}>{page + 1} / {totalPages}</span>
        <button className="btn btn-ghost" style={{ padding: '3px 8px' }} disabled={page >= totalPages - 1} onClick={() => loadData(page + 1)}>›</button>
        <select value={limit} onChange={e => setLimit(Number(e.target.value))}
          style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-secondary)', padding: '3px 4px', borderRadius: 4, fontSize: 11.5, outline: 'none', marginLeft: 4 }}>
          {[50, 100, 250, 500, 1000].map(n => <option key={n} value={n}>{n} rows</option>)}
        </select>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
        {loading && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(30,33,40,0.7)', zIndex: 20 }}>
            <span style={{ color: 'var(--text-secondary)' }}>Loading…</span>
          </div>
        )}
        {error && <div style={{ padding: 20, color: 'var(--red)', fontFamily: 'JetBrains Mono', fontSize: 12 }}>Error: {error}</div>}
        {!error && !loading && rows.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>Table is empty
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
                        {col}{sortCol === col && <span style={{ marginLeft: 4 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                      </span>
                      <span
                        onMouseDown={event => handleResizeStart(col, event)}
                        style={{ position: 'absolute', right: -8, top: 0, width: 16, height: '100%', cursor: 'col-resize' }}
                      />
                    </div>
                  </th>
                ))}
                <th style={{ width: 140, minWidth: 140, textAlign: 'center', color: 'var(--text-muted)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row, i) => {
                const rowid = row.__rowid__ as number
                const isEditing = editingRowId === rowid
                return (
                  <tr key={rowid ?? i} className={selectedRowids.has(rowid) ? 'selected' : ''}
                    onClick={e => handleRowClick(rowid, e)}
                    style={{ cursor: 'default' }}>
                    <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 11 }}>{page * limit + i + 1}</td>
                    {columns.map((col, ci) => (
                      isEditing ? (
                        <td
                          key={col}
                          style={{ width: columnWidths[col] ?? 180, minWidth: columnWidths[col] ?? 180, maxWidth: columnWidths[col] ?? 180, padding: 6 }}
                        >
                          <input
                            value={editingDraft[col] ?? ''}
                            onClick={event => event.stopPropagation()}
                            onChange={event => setEditingDraft(prev => ({ ...prev, [col]: event.target.value }))}
                            onKeyDown={event => {
                              if (event.key === 'Enter') {
                                event.preventDefault()
                                void handleSaveInlineEdit()
                              }
                              if (event.key === 'Escape') {
                                event.preventDefault()
                                cancelInlineEdit()
                              }
                            }}
                            className="w-full rounded-md border border-sky-400/30 bg-slate-950/70 px-2 py-1.5 text-[12px] text-slate-100 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-400/20"
                          />
                        </td>
                      ) : (
                        <Cell
                          key={col}
                          value={row[col]}
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
                    ))}
                    <td style={{ width: 140, minWidth: 140, textAlign: 'center' }}>
                      {isEditing ? (
                        <div className="flex items-center justify-center gap-2">
                          <button className="btn btn-primary" disabled={savingEdit} onClick={event => { event.stopPropagation(); void handleSaveInlineEdit() }}>
                            {savingEdit ? 'Saving...' : 'Save'}
                          </button>
                          <button className="btn btn-ghost" disabled={savingEdit} onClick={event => { event.stopPropagation(); cancelInlineEdit() }}>
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button className="btn btn-ghost" onClick={event => { event.stopPropagation(); startInlineEdit(row) }}>
                          Edit
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modals */}
      {modal?.type === 'insert' && (
        <RowModal mode="insert" columns={columns} onSave={handleInsert} onClose={() => setModal(null)} />
      )}
      {modal?.type === 'delete' && (
        <DeleteConfirm count={selectedRowids.size} onConfirm={handleDelete} onClose={() => setModal(null)} />
      )}
    </div>
  )
}
