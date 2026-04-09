import { useState, useCallback } from 'react'
import useAppStore from '../store/appStore'
import type { DbType, ConnectionConfig, SshConfig, SavedConnection } from '../types'

const api = window.electronAPI

// ── DB type definitions ───────────────────────────────────────────────────────
const DB_TYPES: { value: DbType; label: string; icon: string; defaultPort: number }[] = [
  { value: 'mysql',      label: 'MySQL',      icon: '🐬', defaultPort: 3306  },
  { value: 'postgresql', label: 'PostgreSQL',  icon: '🐘', defaultPort: 5432  },
  { value: 'mongodb',    label: 'MongoDB',     icon: '🍃', defaultPort: 27017 },
]

const DB_ICON: Record<string, string> = { mysql: '🐬', postgresql: '🐘', mongodb: '🍃', sqlite: '🗃️' }

// ── Field helper ──────────────────────────────────────────────────────────────
const Field = ({
  label, value, onChange, placeholder, type = 'text', disabled = false,
}: {
  label: string; value: string; onChange: (v: string) => void
  placeholder?: string; type?: string; disabled?: boolean
}) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
    <label style={{ fontSize: 11.5, color: 'var(--text-secondary)', fontWeight: 500 }}>{label}</label>
    <input
      type={type}
      className="form-input"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      autoComplete="off"
      style={{ opacity: disabled ? 0.5 : 1 }}
    />
  </div>
)

// ── Recent connections panel ──────────────────────────────────────────────────
function RecentPanel({
  saved,
  onLoad,
  onDelete,
  onReconnect,
  busy,
}: {
  saved: SavedConnection[]
  onLoad: (s: SavedConnection) => void
  onDelete: (id: string) => void
  onReconnect: (config: ConnectionConfig) => void
  busy: boolean
}) {
  const [hovered, setHovered] = useState<string | null>(null)

  if (saved.length === 0) return null

  function relativeTime(ms: number) {
    const diff = Date.now() - ms
    const m = Math.floor(diff / 60000)
    const h = Math.floor(diff / 3600000)
    const d = Math.floor(diff / 86400000)
    if (d > 0) return `${d}d ago`
    if (h > 0) return `${h}h ago`
    if (m > 0) return `${m}m ago`
    return 'just now'
  }

  return (
    <div style={{
      width: 200, flexShrink: 0,
      borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      paddingRight: 0, marginRight: 0,
    }}>
      <div style={{ padding: '0 0 10px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: 0.5, textTransform: 'uppercase' }}>
        Recent
      </div>
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {saved.map(s => (
          <div
            key={s.id}
            onMouseEnter={() => setHovered(s.id)}
            onMouseLeave={() => setHovered(null)}
            style={{
              borderRadius: 5, padding: '7px 8px',
              background: hovered === s.id ? 'var(--bg-hover)' : 'transparent',
              cursor: 'default', position: 'relative',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
              <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>{DB_ICON[s.config.dbType] ?? '🔌'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {s.label}
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {s.config.host}:{s.config.port}{s.config.database ? `/${s.config.database}` : ''}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, opacity: 0.7 }}>
                  {relativeTime(s.lastUsed)}
                </div>
              </div>
            </div>

            {hovered === s.id && (
              <div className="fade-in" style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                <button
                  className="btn btn-primary"
                  style={{ flex: 1, fontSize: 11, padding: '3px 0', justifyContent: 'center' }}
                  disabled={busy}
                  onClick={() => onReconnect(s.config)}
                >
                  Connect
                </button>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 11, padding: '3px 6px' }}
                  onClick={() => onLoad(s)}
                  title="Load into form"
                >
                  ✎
                </button>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 11, padding: '3px 6px', color: 'var(--red)' }}
                  onClick={() => onDelete(s.id)}
                  title="Remove"
                >
                  ✕
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── ConnectModal ──────────────────────────────────────────────────────────────
export default function ConnectModal() {
  const closeConnectModal    = useAppStore(s => s.closeConnectModal)
  const connectRemote        = useAppStore(s => s.connectRemote)
  const savedConnections     = useAppStore(s => s.savedConnections)
  const deleteSavedConnection = useAppStore(s => s.deleteSavedConnection)

  const [connName, setConnName] = useState('')
  const [dbType,   setDbType]   = useState<DbType>('mysql')
  const [host,     setHost]     = useState('127.0.0.1')
  const [port,     setPort]     = useState('3306')
  const [username, setUsername] = useState('root')
  const [password, setPassword] = useState('')
  const [database, setDatabase] = useState('')

  const [useSsh,      setUseSsh]      = useState(false)
  const [sshHost,     setSshHost]     = useState('')
  const [sshPort,     setSshPort]     = useState('22')
  const [sshUser,     setSshUser]     = useState('')
  const [sshPassword, setSshPassword] = useState('')
  const [sshKey,      setSshKey]      = useState('')

  const [testing,    setTesting]    = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)

  const handleDbTypeChange = useCallback((t: DbType) => {
    setDbType(t)
    const def = DB_TYPES.find(d => d.value === t)
    if (def) setPort(String(def.defaultPort))
    setTestResult(null)
  }, [])

  const loadSaved = useCallback((s: SavedConnection) => {
    const c = s.config
    setConnName(s.label)
    setDbType(c.dbType as DbType)
    setHost(c.host ?? '')
    setPort(String(c.port ?? ''))
    setUsername(c.username ?? '')
    setPassword(c.password ?? '')
    setDatabase(c.database ?? '')
    if (c.ssh) {
      setUseSsh(true)
      setSshHost(c.ssh.host ?? '')
      setSshPort(String(c.ssh.port ?? 22))
      setSshUser(c.ssh.username ?? '')
      setSshPassword(c.ssh.password ?? '')
      setSshKey(c.ssh.privateKey ?? '')
    } else {
      setUseSsh(false)
    }
    setTestResult(null)
  }, [])

  const buildConfig = useCallback((): ConnectionConfig => {
    const ssh: SshConfig | undefined = useSsh && sshHost
      ? { host: sshHost, port: Number(sshPort) || 22, username: sshUser, password: sshPassword || undefined, privateKey: sshKey || undefined }
      : undefined
    return { dbType, host, port: Number(port), username, password, database, ssh, name: connName || undefined }
  }, [dbType, host, port, username, password, database, useSsh, sshHost, sshPort, sshUser, sshPassword, sshKey, connName])

  const handleTest = useCallback(async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await api.testConnection(buildConfig())
      setTestResult(res.ok
        ? { ok: true,  msg: `Connected successfully${res.latency != null ? ` (${res.latency}ms)` : ''}` }
        : { ok: false, msg: res.error ?? 'Connection failed' })
    } catch (e: unknown) {
      setTestResult({ ok: false, msg: String(e) })
    }
    setTesting(false)
  }, [buildConfig])

  const handleConnect = useCallback(async () => {
    setConnecting(true)
    await connectRemote(buildConfig())
    setConnecting(false)
  }, [buildConfig, connectRemote])

  const handleReconnect = useCallback(async (config: ConnectionConfig) => {
    setConnecting(true)
    await connectRemote(config)
    setConnecting(false)
  }, [connectRemote])

  const currentType = DB_TYPES.find(d => d.value === dbType)!
  const busy = testing || connecting

  return (
    <div className="modal-overlay">
      <div
        className="modal fade-in"
        style={{ padding: 0, overflow: 'hidden', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 20 }}>{currentType.icon}</span>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>New Connection</h3>
          </div>
          <button className="btn btn-ghost" style={{ padding: '2px 8px' }} onClick={closeConnectModal}>✕</button>
        </div>

        {/* Body: recent panel + form */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
          {/* Recent panel */}
          {savedConnections.length > 0 && (
            <div style={{ width: 210, flexShrink: 0, borderRight: '1px solid var(--border)', padding: '14px 10px', overflowY: 'auto' }}>
              <RecentPanel
                saved={savedConnections}
                onLoad={loadSaved}
                onDelete={deleteSavedConnection}
                onReconnect={handleReconnect}
                busy={busy}
              />
            </div>
          )}

          {/* Form */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 20px', minWidth: 0 }}>
            {/* DB Type Tabs */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 18, background: 'var(--bg-input)', borderRadius: 6, padding: 3 }}>
              {DB_TYPES.map(t => (
                <button
                  key={t.value}
                  onClick={() => handleDbTypeChange(t.value)}
                  style={{
                    flex: 1, padding: '6px 8px', border: 'none', borderRadius: 4, cursor: 'pointer',
                    fontSize: 12, fontWeight: 500, transition: 'all 0.15s',
                    background: dbType === t.value ? 'var(--bg-panel)' : 'transparent',
                    color: dbType === t.value ? 'var(--text-primary)' : 'var(--text-muted)',
                    boxShadow: dbType === t.value ? '0 1px 3px rgba(0,0,0,0.3)' : 'none',
                  }}
                >
                  {t.icon} {t.label}
                </button>
              ))}
            </div>

            {/* Connection fields */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Field
                label="Connection Name"
                value={connName}
                onChange={setConnName}
                placeholder={`${currentType.label} — ${host || '127.0.0.1'}${database ? `/${database}` : ''}`}
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 10 }}>
                <Field label="Host" value={host} onChange={setHost} placeholder="127.0.0.1" />
                <Field label="Port" value={port} onChange={setPort} placeholder={String(currentType.defaultPort)} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Field label="Username" value={username} onChange={setUsername} placeholder="root" />
                <Field label="Password" value={password} onChange={setPassword} placeholder="(optional)" type="password" />
              </div>
              <Field
                label={dbType === 'mongodb' ? 'Database / Auth DB' : 'Database (optional)'}
                value={database}
                onChange={setDatabase}
                placeholder={dbType === 'mongodb' ? 'admin' : 'Leave blank to list all'}
              />
            </div>

            {/* SSH Tunnel */}
            <div style={{ marginTop: 18, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: useSsh ? 12 : 0 }}>
                <input
                  type="checkbox"
                  checked={useSsh}
                  onChange={e => { setUseSsh(e.target.checked); setTestResult(null) }}
                  style={{ accentColor: 'var(--accent)', width: 14, height: 14 }}
                />
                <span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text-secondary)' }}>SSH Tunnel</span>
              </label>

              {useSsh && (
                <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 10 }}>
                    <Field label="SSH Host" value={sshHost} onChange={setSshHost} placeholder="bastion.example.com" />
                    <Field label="SSH Port" value={sshPort} onChange={setSshPort} placeholder="22" />
                  </div>
                  <Field label="SSH Username" value={sshUser} onChange={setSshUser} placeholder="ubuntu" />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <Field label="SSH Password" value={sshPassword} onChange={setSshPassword} placeholder="(optional)" type="password" />
                    <Field label="Private Key Path" value={sshKey} onChange={setSshKey} placeholder="~/.ssh/id_rsa" />
                  </div>
                </div>
              )}
            </div>

            {/* Test result */}
            {testResult && (
              <div className="fade-in" style={{
                marginTop: 14, padding: '8px 12px', borderRadius: 5, fontSize: 12,
                fontFamily: 'JetBrains Mono',
                background: testResult.ok ? 'rgba(80,200,120,0.1)' : 'rgba(220,80,80,0.1)',
                color: testResult.ok ? 'var(--green)' : 'var(--red)',
                border: `1px solid ${testResult.ok ? 'var(--green)' : 'var(--red)'}`,
              }}>
                {testResult.ok ? '✓ ' : '✗ '}{testResult.msg}
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
              <button className="btn btn-ghost" onClick={closeConnectModal}>Cancel</button>
              <button className="btn btn-ghost" onClick={handleTest} disabled={busy} style={{ minWidth: 130 }}>
                {testing ? '⏳ Testing…' : '⚡ Test Connection'}
              </button>
              <button className="btn btn-primary" onClick={handleConnect} disabled={busy} style={{ minWidth: 100 }}>
                {connecting ? '⏳ Connecting…' : 'Connect'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
