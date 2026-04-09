import { useState, useCallback, useRef, useEffect, memo } from 'react'
import type { QueryResult, StatusInfo, DbRow } from '../types'

const api = window.electronAPI

// ── Result table ──────────────────────────────────────────────────────────────
const ResultTable = memo(function ResultTable({ rows }: { rows: DbRow[] }) {
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({})
  const resizeRef = useRef<{ column: string; startX: number; startWidth: number } | null>(null)

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

  const handleResizeStart = useCallback((col: string, event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    const currentWidth = columnWidths[col] ?? 180
    resizeRef.current = { column: col, startX: event.clientX, startWidth: currentWidth }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [columnWidths])

  if (rows.length === 0) return (
    <div style={{ padding: 24, color: 'var(--text-muted)', fontSize: 12.5, fontFamily: 'JetBrains Mono' }}>
      Query returned 0 rows.
    </div>
  )
  const cols = Object.keys(rows[0])
  return (
    <div style={{ overflow: 'auto', flex: 1 }}>
      <table className="data-table">
        <thead>
          <tr>
            <th style={{ width: 36, textAlign: 'center', color: 'var(--text-muted)' }}>#</th>
            {cols.map(c => (
              <th key={c} style={{ width: columnWidths[c] ?? 180, minWidth: columnWidths[c] ?? 180, maxWidth: columnWidths[c] ?? 180 }}>
                <div style={{ display: 'flex', alignItems: 'center', position: 'relative', height: '100%' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{c}</span>
                  <span
                    onMouseDown={event => handleResizeStart(c, event)}
                    style={{ position: 'absolute', right: -8, top: 0, width: 16, height: '100%', cursor: 'col-resize' }}
                  />
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 11 }}>{i + 1}</td>
              {cols.map(c => {
                const v = row[c]
                if (v === null || v === undefined) return <td key={c} className="null-cell">NULL</td>
                return <td key={c} style={{ width: columnWidths[c] ?? 180, minWidth: columnWidths[c] ?? 180, maxWidth: columnWidths[c] ?? 180 }} className={typeof v === 'number' ? 'num-cell' : ''} title={String(v)}>{String(v)}</td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
})

// ── QueryEditor ───────────────────────────────────────────────────────────────
interface Props {
  connectionId: string
  connectionName: string
  database?: string
  onStatusChange?: (status: StatusInfo) => void
}

const PRESETS = [
  { label: 'List Tables',  sql: "SELECT name, type FROM sqlite_master WHERE type IN ('table','view') ORDER BY name;" },
  { label: 'Table Info',   sql: "PRAGMA table_info('cats');" },
  { label: 'Row Count',    sql: "SELECT COUNT(*) as count FROM cats;" },
  { label: 'Schema',       sql: "SELECT sql FROM sqlite_master WHERE type='table' ORDER BY name;" },
]

export default function QueryEditor({ connectionId, connectionName, database, onStatusChange }: Props) {
  const [sql, setSql]         = useState("-- Write your SQL query here\n-- Press Ctrl+Enter to run\n\nSELECT * FROM sqlite_master\nWHERE type = 'table'\nORDER BY name;\n")
  const [result, setResult]   = useState<QueryResult | null>(null)
  const [running, setRunning] = useState(false)
  const [editorHeight, setEditorHeight] = useState(200)
  const dragging   = useRef(false)
  const dragStart  = useRef(0)
  const heightStart = useRef(0)

  const runQuery = useCallback(async () => {
    if (!connectionId || !sql.trim()) return
    setRunning(true)
    setResult(null)
    const res = await api.runQuery(connectionId, sql)
    setResult(res)
    if (res.error) {
      onStatusChange?.({ message: `Error: ${res.error}`, error: true })
    } else if (res.type === 'select') {
      onStatusChange?.({ message: `${res.rows?.length ?? 0} rows returned in ${res.elapsed ?? 0}ms`, rows: res.rows?.length, time: res.elapsed })
    } else {
      onStatusChange?.({ message: `Query OK — ${res.changes ?? 0} rows affected`, time: res.elapsed })
    }
    setRunning(false)
  }, [connectionId, sql, onStatusChange])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') runQuery() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [runQuery])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      const ta = e.currentTarget
      const start = ta.selectionStart
      const end   = ta.selectionEnd
      setSql(prev => prev.substring(0, start) + '  ' + prev.substring(end))
      requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = start + 2 })
    }
  }, [])

  const onDividerMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current  = true
    dragStart.current = e.clientY
    heightStart.current = editorHeight
    e.preventDefault()
  }, [editorHeight])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return
      setEditorHeight(h => Math.max(80, Math.min(600, heightStart.current + (e.clientY - dragStart.current))))
    }
    const onUp = () => { dragging.current = false }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <div className="toolbar">
        <button className="btn btn-primary" onClick={runQuery} disabled={running || !connectionId} title="Ctrl+Enter">
          {running ? '⏳ Running…' : '▶ Run Query'}
        </button>
        <div className="toolbar-sep" />
        <button className="btn btn-ghost" onClick={() => setSql('')}>✕ Clear</button>
        <div className="toolbar-sep" />
        <select
          onChange={e => { if (e.target.value) setSql(e.target.value); e.target.value = '' }}
          defaultValue=""
          style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-secondary)', padding: '3px 8px', borderRadius: 4, fontSize: 11.5, outline: 'none', cursor: 'pointer' }}
        >
          <option value="" disabled>Presets…</option>
          {PRESETS.map(p => <option key={p.label} value={p.sql}>{p.label}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        {connectionId
          ? <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono' }}>📎 {connectionName}{database ? ` (${database})` : ''}</span>
          : <span style={{ fontSize: 11, color: 'var(--red)' }}>No connection selected</span>
        }
      </div>

      {/* Editor + divider */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <textarea
          className="sql-editor"
          value={sql}
          onChange={e => setSql(e.target.value)}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          style={{ width: '100%', height: editorHeight, padding: '12px 16px', display: 'block', borderLeft: 'none', borderRight: 'none', borderTop: 'none' }}
          placeholder="SELECT * FROM ..."
        />
        <div onMouseDown={onDividerMouseDown}
          style={{ height: 6, background: 'var(--border)', cursor: 'row-resize', borderTop: '1px solid var(--border-light)', borderBottom: '1px solid var(--border-light)' }}
        />
      </div>

      {/* Results */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {!result && !running && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--text-muted)', fontSize: 12.5, gap: 8 }}>
            <span style={{ fontSize: 20 }}>⌨️</span>
            Press <kbd style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 3, padding: '1px 5px', fontSize: 11, fontFamily: 'JetBrains Mono' }}>Ctrl+Enter</kbd> to run
          </div>
        )}
        {running && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--text-secondary)', gap: 8 }}>
            ⏳ Running query…
          </div>
        )}
        {result && !running && (
          <div className="fade-in" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{
              padding: '6px 12px', borderBottom: '1px solid var(--border)', background: 'var(--bg-panel)',
              fontSize: 12, color: result.error ? 'var(--red)' : 'var(--green)',
              fontFamily: 'JetBrains Mono', display: 'flex', alignItems: 'center', gap: 8,
            }}>
              {result.error ? (
                <><span>✗</span><span>Error: {result.error}</span></>
              ) : result.type === 'select' ? (
                <><span>✓</span><span>{result.rows?.length ?? 0} rows</span>
                  {result.elapsed != null && <span style={{ color: 'var(--text-muted)' }}>in {result.elapsed}ms</span>}</>
              ) : (
                <><span>✓</span><span>Query OK — {result.changes ?? 0} row{result.changes !== 1 ? 's' : ''} affected</span>
                  {result.elapsed != null && <span style={{ color: 'var(--text-muted)' }}>in {result.elapsed}ms</span>}</>
              )}
            </div>
            {result.type === 'select' && result.rows && <ResultTable rows={result.rows} />}
          </div>
        )}
      </div>
    </div>
  )
}
