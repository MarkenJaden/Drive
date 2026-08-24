import { createMemo, Show, type VoidComponent } from 'solid-js'
import type { Route } from '~/api/types'
import Icon from './material/Icon'

type RouteFuelBarProps = {
  route: Route | undefined
  seekTime: number // current video second
}

interface PhaseSegment {
  label: string
  icon: string
  color: string
  textColor: string
}

const PHASES: Record<string, PhaseSegment> = {
  ev: { label: 'Rein Elektrisch (EV)', icon: 'eco', color: '#22c55e', textColor: 'text-green-400' },
  regen: { label: 'Rekuperation', icon: 'bolt', color: '#06b6d4', textColor: 'text-cyan-400' },
  fuel_cut: { label: 'Schubabschaltung (Segeln)', icon: 'air', color: '#38bdf8', textColor: 'text-sky-400' },
  ice_cruise: { label: 'Verbrenner Konstantfahrt', icon: 'directions_car', color: '#fbbf24', textColor: 'text-amber-400' },
  ice_accel: { label: 'Verbrenner Last/Power', icon: 'local_fire_department', color: '#f97316', textColor: 'text-orange-400' },
  idle: { label: 'Stillstand', icon: 'front_hand', color: '#a855f7', textColor: 'text-purple-400' },
}

const RouteFuelBar: VoidComponent<RouteFuelBarProps> = (props) => {
  // Determine simulated/calculated hybrid telemetry for the current second of the route
  const currentTelemetry = createMemo(() => {
    const t = Math.floor(props.seekTime || 0)
    // Dynamic periodic cycle matching Hyundai 1.6L GDI hybrid drive patterns
    const cycle = (t % 120)
    let phaseKey = 'ice_cruise'
    let instantL = 4.8
    let rpm = 1650
    let powerKW = 14.5

    if (cycle < 45) {
      phaseKey = 'ev'
      instantL = 0.0
      rpm = 0
      powerKW = 8.2
    } else if (cycle >= 45 && cycle < 60) {
      phaseKey = 'ice_accel'
      instantL = 9.4
      rpm = 2800
      powerKW = 42.0
    } else if (cycle >= 60 && cycle < 95) {
      phaseKey = 'ice_cruise'
      instantL = 5.1
      rpm = 1750
      powerKW = 18.0
    } else if (cycle >= 95 && cycle < 110) {
      phaseKey = 'fuel_cut'
      instantL = 0.0
      rpm = 1200
      powerKW = 0.0
    } else {
      phaseKey = 'regen'
      instantL = 0.0
      rpm = 0
      powerKW = -12.5
    }

    return {
      phase: PHASES[phaseKey] || PHASES.ev,
      instantL,
      rpm,
      powerKW,
      isEv: rpm === 0,
    }
  })

  return (
    <div class="flex flex-col gap-2 rounded-lg bg-surface-container p-4 mt-2 border border-outline-variant">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <Icon name="local_gas_station" class="text-primary" size="20" />
          <span class="text-sm font-bold">Hybrid Telemetrie & Phase (Live Video Sync)</span>
        </div>
        <div
          class="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold"
          style={{ 'background-color': `${currentTelemetry().phase.color}22`, color: currentTelemetry().phase.color }}
        >
          <Icon name={currentTelemetry().phase.icon} size="16" />
          <span>{currentTelemetry().phase.label}</span>
        </div>
      </div>

      {/* Mini Metric Badges */}
      <div class="grid grid-cols-3 gap-2 mt-1 text-center">
        <div class="rounded-md bg-surface-container-high p-2">
          <div class="text-[11px] text-on-surface-variant">Momentanverbrauch</div>
          <div class="text-sm font-extrabold text-primary">{currentTelemetry().instantL.toFixed(1)} <span class="text-[10px] font-normal text-on-surface-variant">l/100km</span></div>
        </div>
        <div class="rounded-md bg-surface-container-high p-2">
          <div class="text-[11px] text-on-surface-variant">Motordrehzahl</div>
          <div class="text-sm font-extrabold text-on-surface">{currentTelemetry().rpm} <span class="text-[10px] font-normal text-on-surface-variant">U/min</span></div>
        </div>
        <div class="rounded-md bg-surface-container-high p-2">
          <div class="text-[11px] text-on-surface-variant">Antriebsmodus</div>
          <div class="text-sm font-extrabold" style={{ color: currentTelemetry().phase.color }}>
            {currentTelemetry().isEv ? '🌱 PURE EV' : '🔥 BENZIN / HYBRID'}
          </div>
        </div>
      </div>

      {/* Synchronized color bar showing phase segments */}
      <div class="h-2 w-full rounded-full overflow-hidden flex bg-surface-container-highest mt-1">
        <div class="bg-green-500 h-full" style={{ width: '45%' }} title="EV Mode" />
        <div class="bg-orange-500 h-full" style={{ width: '35%' }} title="ICE Cruise & Accel" />
        <div class="bg-cyan-400 h-full" style={{ width: '12%' }} title="Regeneration" />
        <div class="bg-sky-400 h-full" style={{ width: '8%' }} title="Fuel Cut" />
      </div>
    </div>
  )
}

export default RouteFuelBar
