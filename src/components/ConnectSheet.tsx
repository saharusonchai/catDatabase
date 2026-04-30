import { useState, useCallback, useEffect } from 'react'
import useAppStore from '../store/appStore'
import type { DbType, ConnectionConfig, SshConfig } from '../types'

const api = window.electronAPI

const IconMysql = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3C7 3 3 5.5 3 9c0 2 1.5 3.8 4 5v5l3-2 3 2V14c2.5-1.2 4-3 4-5 0-3.5-4-6-5-6z" />
    <path d="M9 9h.01M15 9h.01" />
  </svg>
)

const IconPostgres = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="12" cy="5" rx="9" ry="3" />
    <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
    <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
  </svg>
)

const IconMongo = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2c3.5 4 5 7.5 5 10.5a5 5 0 0 1-10 0C7 9.5 8.5 6 12 2z" />
    <path d="M12 6v13" />
  </svg>
)

const IconClose = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
    <path d="M2.5 2.5 11.5 11.5M11.5 2.5 2.5 11.5" />
  </svg>
)

const IconCheck = () => (
  <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2.5 7l3.5 3.5 5.5-6" />
  </svg>
)

const IconWarn = () => (
  <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 2.5 12.5 12H1.5L7 2.5z" />
    <path d="M7 6v3M7 10.5v.5" />
  </svg>
)

const DB_TYPES: { value: DbType; label: string; icon: JSX.Element; defaultPort: number; desc: string }[] = [
  { value: 'mysql', label: 'MySQL', icon: <IconMysql />, defaultPort: 3306, desc: 'Port 3306' },
  { value: 'postgresql', label: 'PostgreSQL', icon: <IconPostgres />, defaultPort: 5432, desc: 'Port 5432' },
  { value: 'mongodb', label: 'MongoDB', icon: <IconMongo />, defaultPort: 27017, desc: 'Port 27017' },
]

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  hint,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: string
  hint?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span style={{ color: 'var(--text-secondary)', fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          {label}
        </span>
        {hint && (
          <span style={{ color: 'var(--text-muted)', fontSize: 10.5 }}>{hint}</span>
        )}
      </div>
      <input
        type={type}
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        style={{
          height: 38,
          borderRadius: 10,
          border: '1px solid var(--border)',
          background: 'var(--bg-input)',
          padding: '0 12px',
          fontSize: 13,
          color: 'var(--text-primary)',
          outline: 'none',
          transition: 'border-color 0.15s',
          fontFamily: "'JetBrains Mono', monospace",
        }}
        onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
        onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
      />
    </div>
  )
}

function Toggle({
  label,
  copy,
  checked,
  onChange,
}: {
  label: string
  copy: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        width: '100%',
        padding: '12px 14px',
        borderRadius: 12,
        border: `1px solid ${checked ? 'var(--accent)' : 'var(--border)'}`,
        background: checked ? 'rgba(0,95,184,0.08)' : 'var(--bg-input)',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'border-color 0.15s, background 0.15s',
      }}
    >
      <span
        style={{
          flexShrink: 0,
          marginTop: 1,
          width: 18,
          height: 18,
          borderRadius: 5,
          border: `1.5px solid ${checked ? 'var(--accent)' : 'var(--border)'}`,
          background: checked ? 'var(--accent)' : 'transparent',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          transition: 'all 0.15s',
        }}
      >
        {checked && <IconCheck />}
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{label}</span>
        <span style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>{copy}</span>
      </span>
    </button>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: '0.16em',
      textTransform: 'uppercase',
      color: 'var(--text-muted)',
      paddingBottom: 4,
    }}>
      {children}
    </div>
  )
}

function Divider() {
  return <div style={{ height: 1, background: 'var(--border)', margin: '2px 0' }} />
}

export default function ConnectSheet() {
  const closeConnectModal = useAppStore(s => s.closeConnectModal)
  const connectRemote = useAppStore(s => s.connectRemote)
  const closeConnection = useAppStore(s => s.closeConnection)
  const editingConnectionId = useAppStore(s => s.editingConnectionId)
  const editingConnectionConfig = useAppStore(s => s.editingConnectionConfig)

  const [connName, setConnName] = useState('')
  const [dbType, setDbType] = useState<DbType>('mysql')
  const [host, setHost] = useState('127.0.0.1')
  const [port, setPort] = useState('3306')
  const [username, setUsername] = useState('root')
  const [password, setPassword] = useState('')
  const [database, setDatabase] = useState('')
  const [useKeepAlive, setUseKeepAlive] = useState(false)
  const [useSsh, setUseSsh] = useState(false)
  const [sshHost, setSshHost] = useState('')
  const [sshPort, setSshPort] = useState('22')
  const [sshUser, setSshUser] = useState('')
  const [sshPassword, setSshPassword] = useState('')
  const [sshKey, setSshKey] = useState('')
  const [testing, setTesting] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)

  const handleDbTypeChange = useCallback((type: DbType) => {
    setDbType(type)
    const def = DB_TYPES.find(entry => entry.value === type)
    if (def) setPort(String(def.defaultPort))
    setTestResult(null)
  }, [])

  useEffect(() => {
    if (!editingConnectionConfig) return
    setConnName(editingConnectionConfig.name ?? '')
    setDbType(editingConnectionConfig.dbType)
    setHost(editingConnectionConfig.host ?? '127.0.0.1')
    setPort(String(editingConnectionConfig.port ?? DB_TYPES.find(entry => entry.value === editingConnectionConfig.dbType)?.defaultPort ?? ''))
    setUsername(editingConnectionConfig.username ?? '')
    setPassword(editingConnectionConfig.password ?? '')
    setDatabase(editingConnectionConfig.database ?? '')
    setUseKeepAlive(Boolean(editingConnectionConfig.keepAlive))
    if (editingConnectionConfig.ssh) {
      setUseSsh(true)
      setSshHost(editingConnectionConfig.ssh.host ?? '')
      setSshPort(String(editingConnectionConfig.ssh.port ?? 22))
      setSshUser(editingConnectionConfig.ssh.username ?? '')
      setSshPassword(editingConnectionConfig.ssh.password ?? '')
      setSshKey(editingConnectionConfig.ssh.privateKey ?? '')
    } else {
      setUseSsh(false)
      setSshHost('')
      setSshPort('22')
      setSshUser('')
      setSshPassword('')
      setSshKey('')
    }
    setTestResult(null)
  }, [editingConnectionConfig])

  const buildConfig = useCallback((): ConnectionConfig => {
    const ssh: SshConfig | undefined = useSsh && sshHost
      ? {
          host: sshHost,
          port: Number(sshPort) || 22,
          username: sshUser,
          password: sshPassword || undefined,
          privateKey: sshKey || undefined,
        }
      : undefined

    return {
      dbType,
      host,
      port: Number(port),
      username,
      password,
      database,
      keepAlive: useKeepAlive || undefined,
      ssh,
      name: connName || undefined,
    }
  }, [connName, database, dbType, host, password, port, sshHost, sshKey, sshPassword, sshPort, sshUser, useKeepAlive, useSsh, username])

  const handleTest = useCallback(async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await api.testConnection(buildConfig())
      setTestResult(result.ok
        ? { ok: true, msg: `Connected successfully${result.latency != null ? ` · ${result.latency}ms` : ''}` }
        : { ok: false, msg: result.error ?? 'Connection failed' })
    } catch (error: unknown) {
      setTestResult({ ok: false, msg: String(error) })
    }
    setTesting(false)
  }, [buildConfig])

  const handleConnect = useCallback(async () => {
    setConnecting(true)
    const previousConnectionId = editingConnectionId
    const result = await connectRemote(buildConfig())
    if (result && previousConnectionId && !previousConnectionId.startsWith('saved:')) {
      await closeConnection(previousConnectionId)
    }
    setConnecting(false)
  }, [buildConfig, closeConnection, connectRemote, editingConnectionId])

  const currentType = DB_TYPES.find(item => item.value === dbType)!
  const busy = testing || connecting

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.72)',
        padding: 24,
        backdropFilter: 'blur(8px)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 680,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 20,
          border: '1px solid var(--border)',
          background: 'var(--bg-panel)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.5)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20px 24px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              border: '1px solid var(--border)',
              background: 'var(--bg-sidebar)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#79bbff',
              flexShrink: 0,
            }}>
              {currentType.icon}
            </span>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 2 }}>
                Database Connection
              </div>
              <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                {editingConnectionId ? 'Edit Connection' : 'New Connection'}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={closeConnectModal}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--bg-sidebar)',
              color: 'var(--text-muted)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'color 0.14s, border-color 0.14s',
              flexShrink: 0,
            }}
            onMouseEnter={e => {
              e.currentTarget.style.color = 'var(--text-primary)'
              e.currentTarget.style.borderColor = 'var(--border-light)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = 'var(--text-muted)'
              e.currentTarget.style.borderColor = 'var(--border)'
            }}
          >
            <IconClose />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* DB Type Selector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <SectionLabel>Database Engine</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
              {DB_TYPES.map(type => {
                const isActive = dbType === type.value
                return (
                  <button
                    key={type.value}
                    type="button"
                    onClick={() => handleDbTypeChange(type.value)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 14px',
                      borderRadius: 12,
                      border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
                      background: isActive ? 'rgba(0,95,184,0.1)' : 'var(--bg-input)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.14s',
                    }}
                  >
                    <span style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      border: `1px solid ${isActive ? 'rgba(0,95,184,0.3)' : 'var(--border)'}`,
                      background: isActive ? 'rgba(0,95,184,0.12)' : 'var(--bg-sidebar)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: isActive ? '#79bbff' : 'var(--text-muted)',
                      flexShrink: 0,
                      transition: 'all 0.14s',
                    }}>
                      {type.icon}
                    </span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                        {type.label}
                      </div>
                      <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{type.desc}</div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <Divider />

          {/* Connection Details */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <SectionLabel>Connection Details</SectionLabel>
            <Field
              label="Connection Name"
              value={connName}
              onChange={setConnName}
              placeholder={`${currentType.label} — ${host || '127.0.0.1'}${database ? `/${database}` : ''}`}
              hint="Optional"
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 10 }}>
              <Field label="Host" value={host} onChange={setHost} placeholder="127.0.0.1" />
              <Field label="Port" value={port} onChange={setPort} placeholder={String(currentType.defaultPort)} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Username" value={username} onChange={setUsername} placeholder="root" />
              <Field label="Password" value={password} onChange={setPassword} placeholder="Optional" type="password" />
            </div>
            <Field
              label={dbType === 'mongodb' ? 'Database / Auth DB' : 'Initial Database'}
              value={database}
              onChange={setDatabase}
              placeholder={dbType === 'mongodb' ? 'admin' : 'Leave blank to browse all'}
              hint="Optional"
            />
          </div>

          <Divider />

          {/* Options */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <SectionLabel>Options</SectionLabel>
            <Toggle
              label="Keepalive Interval"
              copy="Enable driver keepalive with a 240-second interval to prevent dropped connections."
              checked={useKeepAlive}
              onChange={checked => { setUseKeepAlive(checked); setTestResult(null) }}
            />
            <Toggle
              label="SSH Tunnel"
              copy="Route the database connection through a bastion or jump host."
              checked={useSsh}
              onChange={checked => { setUseSsh(checked); setTestResult(null) }}
            />

            {useSsh && (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                padding: '14px 16px',
                borderRadius: 12,
                border: '1px solid var(--border)',
                background: 'var(--bg-app)',
                marginTop: 4,
              }}>
                <SectionLabel>SSH Configuration</SectionLabel>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 10 }}>
                  <Field label="SSH Host" value={sshHost} onChange={setSshHost} placeholder="bastion.example.com" />
                  <Field label="Port" value={sshPort} onChange={setSshPort} placeholder="22" />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <Field label="SSH Username" value={sshUser} onChange={setSshUser} placeholder="ubuntu" />
                  <Field label="SSH Password" value={sshPassword} onChange={setSshPassword} placeholder="Optional" type="password" />
                </div>
                <Field label="Private Key Path" value={sshKey} onChange={setSshKey} placeholder="~/.ssh/id_rsa" />
              </div>
            )}
          </div>

        </div>

        {/* Footer */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '14px 24px',
          borderTop: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          {/* Test Result — always visible, left side */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {testResult && (
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                padding: '6px 12px',
                borderRadius: 8,
                border: `1px solid ${testResult.ok ? 'rgba(90,182,114,0.28)' : 'rgba(232,98,90,0.28)'}`,
                background: testResult.ok ? 'rgba(90,182,114,0.07)' : 'rgba(232,98,90,0.07)',
                maxWidth: '100%',
              }}>
                <span style={{ flexShrink: 0, color: testResult.ok ? 'var(--green)' : 'var(--red)', lineHeight: 0 }}>
                  {testResult.ok ? <IconCheck /> : <IconWarn />}
                </span>
                <span style={{
                  fontSize: 12.5,
                  color: testResult.ok ? 'var(--green)' : 'var(--red)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {testResult.msg}
                </span>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <button
            type="button"
            onClick={closeConnectModal}
            style={{
              height: 36,
              padding: '0 16px',
              borderRadius: 9,
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--text-secondary)',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'color 0.14s, border-color 0.14s',
              fontFamily: "'DM Sans', sans-serif",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.color = 'var(--text-primary)'
              e.currentTarget.style.borderColor = 'var(--border-light)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = 'var(--text-secondary)'
              e.currentTarget.style.borderColor = 'var(--border)'
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleTest}
            disabled={busy}
            style={{
              height: 36,
              padding: '0 16px',
              borderRadius: 9,
              border: '1px solid var(--border)',
              background: 'var(--bg-sidebar)',
              color: busy ? 'var(--text-muted)' : 'var(--text-secondary)',
              fontSize: 13,
              fontWeight: 500,
              cursor: busy ? 'not-allowed' : 'pointer',
              opacity: busy ? 0.5 : 1,
              transition: 'color 0.14s, border-color 0.14s',
              fontFamily: "'DM Sans', sans-serif",
            }}
            onMouseEnter={e => {
              if (!busy) {
                e.currentTarget.style.color = 'var(--text-primary)'
                e.currentTarget.style.borderColor = 'var(--accent)'
              }
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = busy ? 'var(--text-muted)' : 'var(--text-secondary)'
              e.currentTarget.style.borderColor = 'var(--border)'
            }}
          >
            {testing ? 'Testing…' : 'Test Connection'}
          </button>
          <button
            type="button"
            onClick={handleConnect}
            disabled={busy}
            style={{
              height: 36,
              padding: '0 18px',
              borderRadius: 9,
              border: '1px solid var(--accent-dim)',
              background: 'var(--accent)',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: busy ? 'not-allowed' : 'pointer',
              opacity: busy ? 0.5 : 1,
              transition: 'background 0.14s',
              fontFamily: "'DM Sans', sans-serif",
            }}
            onMouseEnter={e => { if (!busy) e.currentTarget.style.background = '#0a6ccb' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--accent)' }}
          >
            {connecting ? 'Saving…' : editingConnectionId ? 'Save Connection' : 'Connect'}
          </button>
          </div>
        </div>
      </div>
    </div>
  )
}
