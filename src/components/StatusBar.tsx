import { memo } from 'react'
import useAppStore from '../store/appStore'

const Sep = () => (
  <span style={{ width: 1, height: 12, background: 'rgba(255,255,255,0.12)', margin: '0 14px' }} />
)

export default memo(function StatusBar() {
  const status = useAppStore(s => s.status)
  const connCount = useAppStore(s => s.connections.length)
  const { message, rows, time, error } = status

  const dotColor = error ? 'var(--red)' : connCount > 0 ? 'var(--accent)' : 'rgba(255,255,255,0.4)'
  const stateLabel = error ? 'ERROR' : connCount > 0 ? 'READY' : 'IDLE'

  return (
    <div
      style={{
        height: 28,
        flexShrink: 0,
        padding: '0 18px',
        display: 'flex',
        alignItems: 'center',
        background: 'var(--primary)',
        color: '#b6c2d6',
        fontSize: 11,
        fontFamily: 'var(--mono)',
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 7, height: 7, borderRadius: 99, background: dotColor }} />
        <span style={{ color: '#e6ecf5', fontWeight: 600, letterSpacing: '0.04em' }}>{stateLabel}</span>
      </span>
      <Sep />
      <span style={{ color: error ? '#ffc4c0' : '#dde3ef', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '50%' }}>
        {message || 'Ready'}
      </span>
      <div style={{ flex: 1 }} />
      {rows !== undefined && !error && (
        <>
          <span><span style={{ opacity: 0.6 }}>rows</span> <span style={{ color: '#fff', fontWeight: 600 }}>{rows.toLocaleString()}</span></span>
          <Sep />
        </>
      )}
      {time !== undefined && !error && (
        <>
          <span><span style={{ opacity: 0.6 }}>latency</span> <span style={{ color: 'var(--accent-fg)', fontWeight: 600 }}>{time}ms</span></span>
          <Sep />
        </>
      )}
      <span><span style={{ opacity: 0.6 }}>connections</span> <span style={{ color: '#fff', fontWeight: 600 }}>{connCount}</span></span>
      <Sep />
      <span style={{ opacity: 0.6 }}>UTF-8</span>
      <Sep />
      <span style={{ opacity: 0.6 }}>v2.4.1</span>
    </div>
  )
})
