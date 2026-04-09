import { useState, useEffect, useCallback } from 'react'
import type { TableStructure, ColumnInfo } from '../types'

const api = window.electronAPI

// ── Type badge ────────────────────────────────────────────────────────────────
function TypeBadge({ type }: { type: string }) {
  const t = (type || 'TEXT').toUpperCase()
  let color = 'var(--text-muted)'
  if (/INT/.test(t))                        color = 'var(--cyan)'
  if (/REAL|FLOAT|DOUBLE|NUMERIC|DECIMAL/.test(t)) color = 'var(--purple)'
  if (/TEXT|CHAR|CLOB/.test(t))             color = 'var(--green)'
  if (/BLOB/.test(t))                       color = 'var(--yellow)'
  if (/BOOL/.test(t))                       color = 'var(--orange)'
  if (/DATE|TIME/.test(t))                  color = 'var(--accent)'

  return (
    <span style={{
      fontSize: 10.5, fontFamily: 'JetBrains Mono', color,
      background: 'var(--bg-app)', border: `1px solid ${color}40`,
      padding: '1px 6px', borderRadius: 3, letterSpacing: '0.03em',
    }}>
      {t}
    </span>
  )
}

// ── Column row ────────────────────────────────────────────────────────────────
const tdStyle: React.CSSProperties = {
  padding: '7px 12px',
  borderBottom: '1px solid var(--border-light)',
  borderRight: '1px solid var(--border-light)',
}

function ColumnRow({ col, idx, fkTarget }: { col: ColumnInfo; idx: number; fkTarget?: string }) {
  return (
    <tr style={{ background: idx % 2 === 0 ? 'transparent' : 'var(--bg-row-alt)' }}>
      <td style={{ ...tdStyle, color: 'var(--text-muted)', fontSize: 11, fontFamily: 'JetBrains Mono' }}>{col.cid}</td>
      <td style={{ ...tdStyle, fontWeight: col.pk ? 600 : 400, color: col.pk ? 'var(--accent)' : 'var(--text-primary)', fontFamily: 'JetBrains Mono' }}>
        {col.name}
      </td>
      <td style={tdStyle}><TypeBadge type={col.type} /></td>
      <td style={{ ...tdStyle, textAlign: 'center', color: col.pk ? 'var(--yellow)' : 'var(--text-muted)', fontSize: 13 }}>
        {col.pk ? '🔑' : ''}
      </td>
      <td style={{ ...tdStyle, textAlign: 'center', color: col.notnull ? 'var(--red)' : 'var(--green)', fontSize: 11, fontFamily: 'JetBrains Mono' }}>
        {col.notnull ? 'NOT NULL' : 'NULL'}
      </td>
      <td style={{ ...tdStyle, color: col.dflt_value != null ? 'var(--orange)' : 'var(--text-muted)', fontFamily: 'JetBrains Mono', fontSize: 11.5, fontStyle: col.dflt_value == null ? 'italic' : 'normal' }}>
        {col.dflt_value ?? '—'}
      </td>
      <td style={{ ...tdStyle, color: 'var(--purple)', fontFamily: 'JetBrains Mono', fontSize: 11.5 }}>
        {fkTarget ?? ''}
      </td>
    </tr>
  )
}

// ── StructureView ─────────────────────────────────────────────────────────────
interface Props {
  connectionId: string
  tableName: string
  database?: string
}

export default function StructureView({ connectionId, tableName, database }: Props) {
  const [structure, setStructure] = useState<TableStructure | null>(null)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [showSql, setShowSql]     = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const res = await api.getTableStructure(connectionId, tableName, database)
    if ('error' in res) { setError(res.error); setLoading(false); return }
    setStructure(res)
    setLoading(false)
  }, [connectionId, tableName, database])

  useEffect(() => { load() }, [load])

  if (loading) return <div style={{ padding: 32, color: 'var(--text-muted)', fontSize: 12.5 }}>Loading structure…</div>
  if (error)   return <div style={{ padding: 24, color: 'var(--red)', fontFamily: 'JetBrains Mono', fontSize: 12 }}>Error: {error}</div>
  if (!structure) return null

  const { columns, foreignKeys, indices, sql } = structure
  const fkMap: Record<string, string> = {}
  foreignKeys?.forEach(fk => { fkMap[fk.from] = `${fk.table}(${fk.to})` })

  const thStyle: React.CSSProperties = {
    padding: '7px 12px', textAlign: 'left', fontWeight: 500, fontSize: 11,
    color: 'var(--text-secondary)', letterSpacing: '0.05em', textTransform: 'uppercase',
    borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border-light)', whiteSpace: 'nowrap',
  }

  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      {/* Columns */}
      <section style={{ padding: '16px 20px 0' }}>
        <h4 style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Columns ({columns.length})
        </h4>
        <div style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: 'var(--bg-table-hd)' }}>
                {['#', 'Name', 'Type', 'PK', 'Nullable', 'Default', 'References'].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {columns.map((col, i) => (
                <ColumnRow key={col.cid} col={col} idx={i} fkTarget={fkMap[col.name]} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Indices */}
      {indices && indices.length > 0 && (
        <section style={{ padding: '16px 20px 0' }}>
          <h4 style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Indices ({indices.length})
          </h4>
          <div style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12.5 }}>
              <thead>
                <tr style={{ background: 'var(--bg-table-hd)' }}>
                  {['Name', 'Unique', 'Origin'].map(h => <th key={h} style={thStyle}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {indices.map((idx, i) => (
                  <tr key={idx.name} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-row-alt)' }}>
                    <td style={{ ...tdStyle, fontFamily: 'JetBrains Mono', color: 'var(--text-primary)' }}>{idx.name}</td>
                    <td style={{ ...tdStyle, color: idx.unique ? 'var(--green)' : 'var(--text-muted)', fontFamily: 'JetBrains Mono', fontSize: 11 }}>
                      {idx.unique ? 'UNIQUE' : ''}
                    </td>
                    <td style={{ ...tdStyle, color: 'var(--text-muted)', fontSize: 11, fontFamily: 'JetBrains Mono' }}>
                      {idx.origin === 'pk' ? 'Primary Key' : idx.origin === 'u' ? 'UNIQUE constraint' : 'CREATE INDEX'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* DDL */}
      {sql && (
        <section style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: showSql ? 10 : 0, cursor: 'pointer' }}
            onClick={() => setShowSql(v => !v)}>
            <h4 style={{ margin: 0, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>DDL</h4>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{showSql ? '▲' : '▼'}</span>
          </div>
          {showSql && (
            <pre className="fade-in" style={{
              background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 6,
              padding: '12px 16px', margin: 0, fontFamily: 'JetBrains Mono', fontSize: 12,
              color: 'var(--text-code)', overflowX: 'auto', lineHeight: 1.6, userSelect: 'text',
            }}>
              {sql}
            </pre>
          )}
        </section>
      )}
    </div>
  )
}
