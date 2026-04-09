import { useState, useCallback, useEffect } from 'react'
import useAppStore from '../store/appStore'
import type { DbType, ConnectionConfig, SshConfig } from '../types'

const api = window.electronAPI

const IconMysql = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2.5 11.5c2.2-3.7 4.85-5.55 8-5.55 1.25 0 2.25.4 3 .95-.35.2-.88.72-1.05 1.25.95.15 1.85.72 2.05 1.4-.7.1-1.5.55-1.95 1.15.55.15 1.25.65 1.4 1.25-1.1.45-2.75.25-4-.3-.7.95-1.75 1.55-3.15 1.8-1.3.2-2.75-.05-4.3-.75Z" />
  </svg>
)

const IconPostgres = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5.3 4.4c0-1.55 1.2-2.7 2.75-2.7 1.9 0 3.75 1.3 3.75 4.3v4.7c0 1.75-.95 2.7-2.35 2.7-.7 0-1.25-.2-1.95-.55l-1.35.7" />
    <path d="M5.15 8.35h3.1" />
    <path d="M4.8 5.8c-.95.45-1.55 1.3-1.55 2.35 0 1.45 1.2 2.7 2.95 2.7.7 0 1.4-.2 2-.55" />
  </svg>
)

const IconMongo = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 1.6c1.85 2.15 2.8 4.15 2.8 6.1 0 2.65-1.3 4.8-2.8 6.7-1.5-1.9-2.8-4.05-2.8-6.7 0-1.95.95-3.95 2.8-6.1Z" />
    <path d="M8 4.1v8.6" />
  </svg>
)

const IconClose = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
    <path d="M2.2 2.2 9.8 9.8M9.8 2.2 2.2 9.8" />
  </svg>
)

const DB_TYPES: { value: DbType; label: string; icon: JSX.Element; defaultPort: number }[] = [
  { value: 'mysql', label: 'MySQL', icon: <IconMysql />, defaultPort: 3306 },
  { value: 'postgresql', label: 'PostgreSQL', icon: <IconPostgres />, defaultPort: 5432 },
  { value: 'mongodb', label: 'MongoDB', icon: <IconMongo />, defaultPort: 27017 },
]

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-stone-500">{label}</span>
      <input
        type={type}
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className="h-11 rounded-2xl border border-stone-800 bg-stone-950 px-4 text-sm text-stone-100 outline-none transition focus:border-[#005FB8]"
      />
    </label>
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
    <label className="flex items-start gap-3 rounded-2xl border border-stone-800 bg-stone-950/70 px-4 py-4 text-sm text-stone-300">
      <input
        type="checkbox"
        checked={checked}
        onChange={event => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-stone-700 bg-stone-950 text-stone-200"
      />
      <span className="flex flex-col gap-1">
        <span className="font-medium text-stone-100">{label}</span>
        <span className="text-xs leading-5 text-stone-500">{copy}</span>
      </span>
    </label>
  )
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
        ? { ok: true, msg: `Connected successfully${result.latency != null ? ` (${result.latency}ms)` : ''}` }
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
    if (result && previousConnectionId) {
      await closeConnection(previousConnectionId)
    }
    setConnecting(false)
  }, [buildConfig, closeConnection, connectRemote, editingConnectionId])

  const currentType = DB_TYPES.find(item => item.value === dbType)!
  const busy = testing || connecting

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 p-6 backdrop-blur-md">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-[32px] border border-[#1b2735] bg-[#0f141b] shadow-[0_40px_120px_rgba(0,0,0,0.5)]">
        <div className="border-b border-stone-800 px-8 py-7">
          <div className="flex items-start justify-between gap-6">
            <div className="flex items-start gap-4">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-[#1f3c58] bg-[#0f2236] text-[#79bbff]">
                {currentType.icon}
              </span>
              <div className="space-y-1">
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-stone-500">Connection</div>
                <h3 className="text-2xl font-semibold tracking-[-0.03em] text-stone-50">
                  {editingConnectionId ? 'Edit connection' : 'Connect to a database'}
                </h3>
                <p className="max-w-xl text-sm leading-6 text-stone-500">
                  {editingConnectionId
                    ? 'Update the connection details, test them, then save the new session.'
                    : 'A quieter workspace for creating and testing a connection without extra panels.'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={closeConnectModal}
              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-stone-800 bg-stone-950 text-stone-400 transition hover:border-stone-700 hover:text-stone-200"
            >
              <IconClose />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-8 py-7">
          <div className="grid gap-7">
            <div className="grid grid-cols-3 gap-3">
              {DB_TYPES.map(type => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => handleDbTypeChange(type.value)}
                  className={`rounded-3xl border px-4 py-5 text-left transition ${
                    dbType === type.value
                      ? 'border-[#005FB8] bg-[#112031] text-stone-50'
                      : 'border-stone-800 bg-[#151515] text-stone-400 hover:border-[#2d4f70] hover:text-stone-200'
                  }`}
                >
                  <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-stone-800 bg-stone-950">
                    {type.icon}
                  </div>
                  <div className="text-sm font-medium">{type.label}</div>
                  <div className="mt-1 text-xs text-stone-500">Default port {type.defaultPort}</div>
                </button>
              ))}
            </div>

            <div className="grid gap-5 rounded-[28px] border border-[#1b2735] bg-[#121821] p-6">
              <Field
                label="Connection Name"
                value={connName}
                onChange={setConnName}
                placeholder={`${currentType.label} - ${host || '127.0.0.1'}${database ? `/${database}` : ''}`}
              />
              <div className="grid grid-cols-[minmax(0,1fr),110px] gap-4">
                <Field label="Host" value={host} onChange={setHost} placeholder="127.0.0.1" />
                <Field label="Port" value={port} onChange={setPort} placeholder={String(currentType.defaultPort)} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Username" value={username} onChange={setUsername} placeholder="root" />
                <Field label="Password" value={password} onChange={setPassword} placeholder="Optional" type="password" />
              </div>
              <Field
                label={dbType === 'mongodb' ? 'Database / Auth DB' : 'Initial Database'}
                value={database}
                onChange={setDatabase}
                placeholder={dbType === 'mongodb' ? 'admin' : 'Leave blank to browse all'}
              />

            </div>

            <div className="grid gap-4 rounded-[28px] border border-[#1b2735] bg-[#121821] p-6">
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-stone-500">Options</div>

              <Toggle
                label="Keepalive interval"
                copy="Enable driver keepalive with a 240 second interval."
                checked={useKeepAlive}
                onChange={checked => {
                  setUseKeepAlive(checked)
                  setTestResult(null)
                }}
              />

              <Toggle
                label="Use SSH tunnel"
                copy="Open the database connection through a bastion or private host."
                checked={useSsh}
                onChange={checked => {
                  setUseSsh(checked)
                  setTestResult(null)
                }}
              />

              {useSsh && (
                <div className="grid gap-4 rounded-3xl border border-[#1b2735] bg-[#0b1118] p-4">
                  <div className="grid grid-cols-[minmax(0,1fr),110px] gap-4">
                    <Field label="SSH Host" value={sshHost} onChange={setSshHost} placeholder="bastion.example.com" />
                    <Field label="SSH Port" value={sshPort} onChange={setSshPort} placeholder="22" />
                  </div>
                  <Field label="SSH Username" value={sshUser} onChange={setSshUser} placeholder="ubuntu" />
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="SSH Password" value={sshPassword} onChange={setSshPassword} placeholder="Optional" type="password" />
                    <Field label="Private Key Path" value={sshKey} onChange={setSshKey} placeholder="~/.ssh/id_rsa" />
                  </div>
                </div>
              )}
            </div>

            {testResult && (
              <div className={`rounded-3xl border px-4 py-4 text-sm ${
                testResult.ok
                  ? 'border-[#214f7f] bg-[#10253b] text-[#b7daff]'
                  : 'border-rose-950 bg-rose-950/40 text-rose-200'
              }`}>
                {testResult.msg}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-stone-800 px-8 py-6">
          <button
            type="button"
            onClick={closeConnectModal}
            className="rounded-2xl border border-stone-800 bg-stone-950 px-4 py-2.5 text-sm font-medium text-stone-300 transition hover:border-stone-700 hover:text-stone-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleTest}
            disabled={busy}
            className="rounded-2xl border border-[#2a3f56] bg-[#121821] px-4 py-2.5 text-sm font-medium text-stone-200 transition hover:border-[#005FB8] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {testing ? 'Testing...' : 'Test Connection'}
          </button>
          <button
            type="button"
            onClick={handleConnect}
            disabled={busy}
            className="rounded-2xl bg-[#005FB8] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0a6ccb] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {connecting ? 'Saving...' : editingConnectionId ? 'Save Connection' : 'Connect'}
          </button>
        </div>
      </div>
    </div>
  )
}
