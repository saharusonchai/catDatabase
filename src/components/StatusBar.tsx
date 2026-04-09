import { memo } from 'react'
import useAppStore from '../store/appStore'

export default memo(function StatusBar() {
  const status    = useAppStore(s => s.status)
  const connCount = useAppStore(s => s.connections.length)
  const { message, rows, time, error } = status

  return (
    <div style={{
      height: 26,
      background: error ? 'var(--red)' : 'var(--bg-sidebar)',
      borderTop: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 12px',
      gap: 16,
      fontSize: 11.5,
      fontFamily: 'JetBrains Mono',
      color: error ? '#fff' : 'var(--text-secondary)',
      flexShrink: 0,
    }}>
      <span style={{
        width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
        background: connCount > 0 ? 'var(--green)' : 'var(--text-muted)',
      }} />
      {message && (
        <span style={{
          color: error ? '#fff' : 'var(--text-primary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {message}
        </span>
      )}
      <div style={{ flex: 1 }} />
      {rows !== undefined && !error && (
        <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
          {rows.toLocaleString()} rows
        </span>
      )}
      {time !== undefined && !error && (
        <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{time}ms</span>
      )}
      {connCount > 0 && (
        <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
          {connCount} connection{connCount > 1 ? 's' : ''}
        </span>
      )}
      <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>CatDB v2.0</span>
    </div>
  )
})
