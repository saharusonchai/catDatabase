import { memo } from 'react'
import useAppStore from '../store/appStore'

const IconPulse = ({ active }: { active: boolean }) => (
  <span className={`inline-flex h-2.5 w-2.5 rounded-full ${active ? 'bg-emerald-400 shadow-[0_0_18px_rgba(52,211,153,0.45)]' : 'bg-slate-600'}`} />
)

export default memo(function StatusBar() {
  const status = useAppStore(s => s.status)
  const connCount = useAppStore(s => s.connections.length)
  const { message, rows, time, error } = status

  return (
    <div className={`flex h-9 items-center gap-4 border-t px-4 text-[11px] ${error ? 'border-rose-400/20 bg-rose-500/12 text-rose-100' : 'border-white/6 bg-[#151922] text-slate-400'}`}>
      <IconPulse active={connCount > 0} />
      <span className={`truncate ${error ? 'text-rose-100' : 'text-slate-200'}`}>
        {message || 'Ready'}
      </span>
      <div className="flex-1" />
      {rows !== undefined && !error && <span>{rows.toLocaleString()} rows</span>}
      {time !== undefined && !error && <span>{time}ms</span>}
      <span>{connCount} connection{connCount !== 1 ? 's' : ''}</span>
      <span className="text-slate-500">CatDB v2.0</span>
    </div>
  )
})
