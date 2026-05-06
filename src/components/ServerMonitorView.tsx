import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useAppStore from '../store/appStore'
import type { Connection, ServerProcess } from '../types'

const api = window.electronAPI

const Ic = ({ size = 14, sw = 1.6, children }: { size?: number; sw?: number; children: React.ReactNode }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
)

const IconRefresh = (p: { size?: number; sw?: number }) => (
  <Ic {...p}><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></Ic>
)
const IconKill = (p: { size?: number; sw?: number }) => (
  <Ic {...p}><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></Ic>
)
const IconCopy = (p: { size?: number; sw?: number }) => (
  <Ic {...p}><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></Ic>
)
const IconServer = (p: { size?: number; sw?: number }) => (
  <Ic {...p}><rect x="2" y="2" width="20" height="8" rx="2" /><rect x="2" y="14" width="20" height="8" rx="2" /><line x1="6" y1="6" x2="6.01" y2="6" /><line x1="6" y1="18" x2="6.01" y2="18" /></Ic>
)
const IconWarn = (p: { size?: number; sw?: number }) => (
  <Ic {...p}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></Ic>
)

const SUPPORTED_DB_TYPES = new Set(['mysql', 'postgresql'])
const REFRESH_INTERVAL_SECONDS = 3

const COLUMNS: { key: keyof ServerProcess; label: string; width?: number }[] = [
  { key: 'id', label: 'ID', width: 80 },
  { key: 'user', label: 'User', width: 120 },
  { key: 'host', label: 'Host', width: 160 },
  { key: 'database', label: 'Database', width: 140 },
  { key: 'command', label: 'Command', width: 110 },
  { key: 'time', label: 'Time (s)', width: 80 },
  { key: 'state', label: 'State', width: 140 },
  { key: 'info', label: 'Info' },
]

interface Props {
  connectionId: string
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  return String(value)
}

function ConfirmKillDialog({
  process,
  onCancel,
  onConfirm,
}: {
  process: ServerProcess
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal fade-in" style={{ minWidth: 380, maxWidth: 460 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <span
            style={{
              width: 40, height: 40, borderRadius: 12,
              background: 'var(--red-soft)', color: 'var(--red)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}
          >
            <IconWarn size={18} sw={1.8} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--tx-1)', letterSpacing: '-0.01em' }}>
              End Process #{process.id}?
            </h3>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--tx-2)', lineHeight: 1.55 }}>
              จะส่งคำสั่งยกเลิก process นี้บน server ทันที — การกระทำนี้ไม่สามารถย้อนกลับได้
            </p>
            {process.info && (
              <div
                style={{
                  marginTop: 10, padding: '8px 10px', borderRadius: 8,
                  background: 'var(--inset)', color: 'var(--tx-2)',
                  fontSize: 11.5, fontFamily: 'var(--mono)',
                  maxHeight: 100, overflow: 'auto', whiteSpace: 'pre-wrap',
                }}
              >
                {process.info}
              </div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 22 }}>
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button
            className="btn"
            style={{ background: 'var(--red)', color: '#fff', borderColor: 'var(--red)' }}
            onClick={onConfirm}
          >
            <IconKill size={12} sw={2} />
            <span style={{ marginLeft: 6 }}>End Process</span>
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ServerMonitorView({ connectionId }: Props) {
  const connections = useAppStore(s => s.connections)
  const savedConnections = useAppStore(s => s.savedConnections)
  const activateSavedConnection = useAppStore(s => s.activateSavedConnection)
  const setStatus = useAppStore(s => s.setStatus)
  const pickerToken = useAppStore(s => s.serverMonitorPickerToken)

  const monitorableConnections = useMemo(
    () => connections.filter(c => SUPPORTED_DB_TYPES.has(String(c.dbType))),
    [connections],
  )
  const monitorableSaved = useMemo(
    () => savedConnections.filter(s => SUPPORTED_DB_TYPES.has(String(s.config.dbType))),
    [savedConnections],
  )

  type AvailableServer = {
    key: string
    label: string
    dbType: string
    savedId?: string
    activeConnectionId?: string
  }

  const availableServers = useMemo<AvailableServer[]>(() => {
    const list: AvailableServer[] = []
    const seenSavedIds = new Set<string>()

    for (const saved of monitorableSaved) {
      const active = monitorableConnections.find(c => c.savedConnectionId === saved.id)
      list.push({
        key: `saved:${saved.id}`,
        label: saved.label,
        dbType: saved.config.dbType,
        savedId: saved.id,
        activeConnectionId: active?.id,
      })
      seenSavedIds.add(saved.id)
    }

    for (const conn of monitorableConnections) {
      if (conn.savedConnectionId && seenSavedIds.has(conn.savedConnectionId)) continue
      list.push({
        key: `active:${conn.id}`,
        label: conn.name,
        dbType: String(conn.dbType ?? ''),
        activeConnectionId: conn.id,
      })
    }

    return list
  }, [monitorableConnections, monitorableSaved])

  void connectionId

  const [selectedKey, setSelectedKey] = useState<string>('')
  const [activatingSavedId, setActivatingSavedId] = useState<string | null>(null)
  const [rows, setRows] = useState<ServerProcess[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL_SECONDS)
  const [killTarget, setKillTarget] = useState<ServerProcess | null>(null)
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null)
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; process: ServerProcess } | null>(null)
  const refreshTimer = useRef<number | null>(null)

  // Reset to picker mode every time the user clicks the Server Monitor button
  useEffect(() => {
    setSelectedKey('')
    setRows([])
    setError(null)
    setSelectedRowId(null)
    setFilter('')
  }, [pickerToken])

  const selectedServer = useMemo(
    () => availableServers.find(s => s.key === selectedKey) ?? null,
    [availableServers, selectedKey],
  )

  const selectedConnection: Connection | null = useMemo(() => {
    if (!selectedServer) return null
    if (selectedServer.activeConnectionId) {
      return monitorableConnections.find(c => c.id === selectedServer.activeConnectionId) ?? null
    }
    return null
  }, [monitorableConnections, selectedServer])

  const handleSelectServer = useCallback(async (key: string) => {
    setSelectedKey(key)
    const target = availableServers.find(s => s.key === key)
    if (!target) return
    if (target.activeConnectionId) return // already connected
    if (!target.savedId) return
    setActivatingSavedId(target.savedId)
    try {
      await activateSavedConnection(target.savedId)
    } finally {
      setActivatingSavedId(null)
    }
  }, [availableServers, activateSavedConnection])

  const loadProcessList = useCallback(async () => {
    setCountdown(REFRESH_INTERVAL_SECONDS)
    if (!selectedConnection) {
      setRows([])
      setError(null)
      return
    }
    setLoading(true)
    const result = await api.getProcessList(selectedConnection.id)
    setLoading(false)
    if (result?.error) {
      setError(result.error)
      setRows([])
      return
    }
    setError(null)
    setRows(Array.isArray(result?.rows) ? result.rows : [])
  }, [selectedConnection])

  useEffect(() => {
    void loadProcessList()
  }, [loadProcessList])

  useEffect(() => {
    if (refreshTimer.current) {
      window.clearInterval(refreshTimer.current)
      refreshTimer.current = null
    }
    if (!autoRefresh || !selectedConnection) {
      setCountdown(REFRESH_INTERVAL_SECONDS)
      return
    }
    setCountdown(REFRESH_INTERVAL_SECONDS)
    refreshTimer.current = window.setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          void loadProcessList()
          return REFRESH_INTERVAL_SECONDS
        }
        return prev - 1
      })
    }, 1000)
    return () => {
      if (refreshTimer.current) window.clearInterval(refreshTimer.current)
      refreshTimer.current = null
    }
  }, [autoRefresh, loadProcessList, selectedConnection])

  useEffect(() => {
    const close = () => setContextMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('blur', close)
    }
  }, [])

  const handleKill = useCallback(async (process: ServerProcess) => {
    if (!selectedConnection) return
    setKillTarget(null)
    const result = await api.killProcess(selectedConnection.id, process.id)
    if (result?.error) {
      setStatus({ message: `Failed to end process #${process.id}: ${result.error}`, error: true })
      setError(result.error)
      return
    }
    setStatus({ message: `Ended process #${process.id}` })
    void loadProcessList()
  }, [selectedConnection, setStatus, loadProcessList])

  const copyToClipboard = useCallback(async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopyFeedback(label)
      setStatus({ message: `Copied ${label}` })
      window.setTimeout(() => setCopyFeedback(null), 1500)
    } catch (e) {
      setStatus({ message: `Copy failed: ${(e as Error).message}`, error: true })
    }
  }, [setStatus])

  const handleCopyRow = useCallback((process: ServerProcess) => {
    const text = COLUMNS
      .map(col => `${col.label}: ${formatCellValue(process[col.key])}`)
      .join('\n')
    void copyToClipboard(text, `process #${process.id}`)
  }, [copyToClipboard])

  const handleCopyInfo = useCallback((process: ServerProcess) => {
    const text = formatCellValue(process.info) || ''
    if (!text) {
      setStatus({ message: 'No SQL info to copy', error: true })
      return
    }
    void copyToClipboard(text, 'SQL info')
  }, [copyToClipboard, setStatus])

  const filteredRows = useMemo(() => {
    if (!filter.trim()) return rows
    const needle = filter.trim().toLowerCase()
    return rows.filter(row =>
      COLUMNS.some(col => formatCellValue(row[col.key]).toLowerCase().includes(needle))
    )
  }, [rows, filter])

  // Picker mode: show full-page server picker when nothing selected (or no servers exist)
  if (!selectedKey || availableServers.length === 0) {
    return (
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: 'var(--surface)', overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-faint)' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--tx-1)', letterSpacing: '-0.02em' }}>Server Monitor</div>
          <div style={{ marginTop: 4, fontSize: 12.5, color: 'var(--tx-3)' }}>
            เลือก server ที่ต้องการตรวจสอบ process list
          </div>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
          {availableServers.length > 0 ? (
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', maxWidth: 920 }}>
              {availableServers.map(server => {
                const isActive = Boolean(server.activeConnectionId)
                const isActivating = server.savedId !== undefined && server.savedId === activatingSavedId
                return (
                  <button
                    key={server.key}
                    type="button"
                    disabled={Boolean(activatingSavedId)}
                    onClick={() => void handleSelectServer(server.key)}
                    style={{
                      display: 'flex', flexDirection: 'column', gap: 10,
                      padding: '16px 18px', textAlign: 'left',
                      border: '1px solid var(--border)', borderRadius: 12,
                      background: 'var(--inset)', color: 'var(--tx-1)',
                      cursor: activatingSavedId ? 'wait' : 'pointer',
                      transition: 'all 0.12s ease',
                    }}
                    onMouseEnter={e => { if (!activatingSavedId) { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'var(--surface)' } }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--inset)' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span
                        style={{
                          width: 36, height: 36, borderRadius: 10,
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          background: 'var(--accent-soft)', color: 'var(--accent-fg)',
                        }}
                      >
                        <IconServer size={16} sw={1.7} />
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--tx-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {server.label}
                        </div>
                        <div style={{ marginTop: 2, fontSize: 11, color: 'var(--tx-3)', fontFamily: 'var(--mono)' }}>
                          {server.dbType.toUpperCase()}
                        </div>
                      </div>
                      <span
                        style={{
                          padding: '2px 8px', fontSize: 10, fontWeight: 700,
                          letterSpacing: '0.08em', textTransform: 'uppercase',
                          borderRadius: 999,
                          color: isActive ? 'var(--green)' : 'var(--tx-3)',
                          background: isActive ? 'rgba(0,180,120,0.10)' : 'var(--surface)',
                        }}
                      >
                        {isActivating ? 'Connecting' : isActive ? 'Active' : 'Idle'}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 240 }}>
              <div style={{ maxWidth: 420, textAlign: 'center' }}>
                <div
                  style={{
                    width: 56, height: 56, margin: '0 auto 16px', borderRadius: 14,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    background: 'var(--accent-soft)', color: 'var(--accent-fg)',
                  }}
                >
                  <IconServer size={26} sw={1.7} />
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--tx-1)', marginBottom: 6 }}>
                  ยังไม่มี server ที่ใช้ Monitor ได้
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--tx-3)', lineHeight: 1.6 }}>
                  Server Monitor รองรับเฉพาะการเชื่อมต่อ MySQL หรือ PostgreSQL — กรุณาเพิ่ม connection ก่อน
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: 'var(--surface)', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 18px', borderBottom: '1px solid var(--border-faint)',
        }}
      >
        <button
          type="button"
          onClick={() => setSelectedKey('')}
          title="Choose another server"
          className="btn btn-ghost"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 10px', height: 30 }}
        >
          <IconServer size={13} sw={1.7} />
          <span style={{ fontWeight: 600, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {selectedServer?.label ?? 'Select server'}
          </span>
          <span style={{ marginLeft: 4, color: 'var(--tx-3)', fontSize: 10, fontFamily: 'var(--mono)' }}>
            {selectedServer ? `· ${selectedServer.dbType.toUpperCase()}` : ''}
          </span>
          <span style={{ marginLeft: 4, color: 'var(--tx-3)', fontSize: 11 }}>▼</span>
        </button>

        <input
          type="search"
          placeholder="Filter processes…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          style={{
            flex: 1, minWidth: 180, maxWidth: 320,
            background: 'var(--inset)', border: '1px solid var(--border)',
            color: 'var(--tx-1)', padding: '0 10px', height: 30, borderRadius: 8,
            fontSize: 12.5, outline: 'none', fontFamily: 'var(--font)',
          }}
        />

        <div style={{ flex: 1 }} />

        <label
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 12, color: 'var(--tx-2)', userSelect: 'none', cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={e => setAutoRefresh(e.target.checked)}
            style={{ accentColor: 'var(--accent)' }}
          />
          <span>Auto refresh</span>
          {autoRefresh && selectedConnection && (
            <span
              style={{
                marginLeft: 4, padding: '1px 8px', minWidth: 32, textAlign: 'center',
                fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 600,
                color: 'var(--accent-fg)', background: 'var(--accent-soft)',
                borderRadius: 999,
              }}
            >
              {loading ? '…' : `${countdown}s`}
            </span>
          )}
        </label>

        <button
          type="button"
          onClick={() => void loadProcessList()}
          disabled={loading}
          className="btn btn-ghost"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 12px', height: 30 }}
        >
          <IconRefresh size={12} sw={1.8} />
          <span>{loading ? 'Loading…' : 'Refresh'}</span>
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', position: 'relative' }}>
        {error && (
          <div
            style={{
              margin: '12px 18px', padding: '10px 12px',
              border: '1px solid var(--red)', background: 'var(--red-soft)',
              color: 'var(--red)', borderRadius: 8, fontSize: 12.5,
            }}
          >
            {error}
          </div>
        )}

        <table className="data-table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th style={{ width: 40, textAlign: 'center', color: 'var(--tx-3)' }}>#</th>
              {COLUMNS.map(col => (
                <th
                  key={col.key as string}
                  style={col.width ? { width: col.width, minWidth: col.width } : { minWidth: 240 }}
                >
                  {col.label}
                </th>
              ))}
              <th style={{ width: 140, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 && !loading && (
              <tr>
                <td colSpan={COLUMNS.length + 2} style={{ padding: 24, textAlign: 'center', color: 'var(--tx-3)', fontSize: 12.5 }}>
                  {!selectedConnection
                    ? (activatingSavedId ? 'Connecting…' : 'Select a server to start monitoring.')
                    : rows.length === 0 ? 'No active processes.' : 'No processes match the filter.'}
                </td>
              </tr>
            )}
            {filteredRows.map((process, index) => {
              const rowKey = String(process.id ?? index)
              const isSelected = selectedRowId === rowKey
              return (
                <tr
                  key={rowKey}
                  onClick={() => setSelectedRowId(rowKey)}
                  onContextMenu={event => {
                    event.preventDefault()
                    setSelectedRowId(rowKey)
                    setContextMenu({
                      x: Math.min(event.clientX, window.innerWidth - 200),
                      y: Math.min(event.clientY, window.innerHeight - 180),
                      process,
                    })
                  }}
                  style={{
                    background: isSelected ? 'var(--accent-soft)' : undefined,
                    cursor: 'pointer',
                  }}
                >
                  <td style={{ textAlign: 'center', color: 'var(--tx-3)', fontSize: 11 }}>{index + 1}</td>
                  {COLUMNS.map(col => {
                    const value = process[col.key]
                    const display = formatCellValue(value)
                    return (
                      <td
                        key={col.key as string}
                        className={value === null || value === undefined ? 'null-cell' : (col.key === 'id' || col.key === 'time' ? 'num-cell' : '')}
                        title={display}
                        style={col.key === 'info'
                          ? { fontFamily: 'var(--mono)', fontSize: 11.5, maxWidth: 480, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
                          : undefined}
                      >
                        {value === null || value === undefined ? 'NULL' : display}
                      </td>
                    )
                  })}
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: 4 }}>
                      <button
                        type="button"
                        title="Copy row details"
                        onClick={event => { event.stopPropagation(); handleCopyRow(process) }}
                        className="btn btn-ghost"
                        style={{ padding: '0 8px', height: 24 }}
                      >
                        <IconCopy size={11} sw={1.8} />
                      </button>
                      <button
                        type="button"
                        title="End Process"
                        onClick={event => { event.stopPropagation(); setKillTarget(process) }}
                        className="btn"
                        style={{
                          padding: '0 8px', height: 24,
                          background: 'transparent', color: 'var(--red)', borderColor: 'transparent',
                        }}
                      >
                        <IconKill size={11} sw={1.8} />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 18px', borderTop: '1px solid var(--border-faint)',
          background: 'var(--surface)', fontSize: 11.5, color: 'var(--tx-3)',
        }}
      >
        <span>{filteredRows.length} of {rows.length} processes</span>
        {copyFeedback && (
          <span style={{ color: 'var(--accent-fg)', fontWeight: 600 }}>Copied: {copyFeedback}</span>
        )}
        <div style={{ flex: 1 }} />
        {selectedConnection && (
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>
            {selectedConnection.config?.host ?? selectedConnection.name}
          </span>
        )}
      </div>

      {contextMenu && (
        <div
          style={{
            position: 'fixed', left: contextMenu.x, top: contextMenu.y, zIndex: 1200,
            minWidth: 200, overflow: 'hidden', borderRadius: 12,
            background: 'var(--surface)', padding: 6, boxShadow: 'var(--shadow-lg)',
          }}
          onClick={event => event.stopPropagation()}
          onContextMenu={event => event.preventDefault()}
        >
          <button className="ctx-item" onClick={() => { handleCopyRow(contextMenu.process); setContextMenu(null) }}>
            <IconCopy size={12} sw={1.7} /><span>Copy Row Details</span>
          </button>
          <button className="ctx-item" onClick={() => { handleCopyInfo(contextMenu.process); setContextMenu(null) }}>
            <IconCopy size={12} sw={1.7} /><span>Copy SQL Info</span>
          </button>
          <button
            className="ctx-item ctx-item-danger"
            onClick={() => { setKillTarget(contextMenu.process); setContextMenu(null) }}
          >
            <IconKill size={12} sw={1.7} /><span>End Process</span>
          </button>
        </div>
      )}

      {killTarget && (
        <ConfirmKillDialog
          process={killTarget}
          onCancel={() => setKillTarget(null)}
          onConfirm={() => void handleKill(killTarget)}
        />
      )}
    </div>
  )
}
