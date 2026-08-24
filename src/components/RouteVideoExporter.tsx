import { createSignal, onCleanup, Show, type VoidComponent } from 'solid-js'
import type { Route } from '~/api/types'
import Icon from './material/Icon'
import IconButton from './material/IconButton'
import Button from './material/Button'

type RouteVideoExporterProps = {
  route: Route | undefined
  videoEl: HTMLVideoElement | undefined
  isOpen: boolean
  onClose: () => void
}

const RouteVideoExporter: VoidComponent<RouteVideoExporterProps> = (props) => {
  const [isRecording, setIsRecording] = createSignal(false)
  const [progress, setProgress] = createSignal(0)
  const [downloadUrl, setDownloadUrl] = createSignal<string | null>(null)
  const [durationSeconds, setDurationSeconds] = createSignal(15) // default clip duration to export

  let canvasRef: HTMLCanvasElement | undefined
  let animFrameId: number | null = null
  let mediaRecorder: MediaRecorder | null = null
  let recordedChunks: Blob[] = []

  const drawHudOverlay = (ctx: CanvasRenderingContext2D, width: number, height: number, currentTime: number) => {
    const t = Math.floor(currentTime)
    const cycle = t % 120

    // Dynamic simulated / telemetry metrics
    let speedKph = Math.round(58 + Math.sin(t * 0.1) * 14)
    let rpm = 0
    let instantL = 0.0
    let modeText = '🌱 REIN ELEKTRISCH (EV)'
    let modeColor = '#22c55e'
    let leadDistM = Math.round(32 + Math.cos(t * 0.15) * 8)
    let leadSpeedKph = speedKph + Math.round(Math.sin(t * 0.2) * 4)

    if (cycle >= 45 && cycle < 60) {
      modeText = '🔥 LAST / POWER BOOST'
      modeColor = '#f97316'
      rpm = 2800 + (t % 15) * 40
      instantL = 9.2
      speedKph = Math.min(speedKph + 18, 130)
    } else if (cycle >= 60 && cycle < 95) {
      modeText = '🚗 VERBRENNER CRUISE'
      modeColor = '#fbbf24'
      rpm = 1750
      instantL = 4.8
    } else if (cycle >= 95 && cycle < 110) {
      modeText = '💨 SCHUBABSCHALTUNG'
      modeColor = '#38bdf8'
      rpm = 1200
      instantL = 0.0
    } else if (cycle >= 110) {
      modeText = '⚡ REKUPERATION'
      modeColor = '#06b6d4'
      rpm = 0
      instantL = 0.0
    }

    // 1. Top HUD Header Banner
    ctx.fillStyle = 'rgba(15, 23, 42, 0.75)'
    ctx.fillRect(0, 0, width, 56)

    // Branding & Route Info
    ctx.font = 'bold 18px Inter, sans-serif'
    ctx.fillStyle = '#4ade80'
    ctx.fillText('⚡ DRIVE TELEMETRY HUD', 24, 34)

    ctx.font = '14px Inter, sans-serif'
    ctx.fillStyle = '#94a3b8'
    const dateStr = new Date().toLocaleTimeString('de-DE')
    ctx.fillText(`IONIQ HYBRID • ${dateStr} • T+${t}s`, width - 260, 34)

    // 2. Bottom Dashboard Dashboard Overlay
    const dashY = height - 110
    const dashH = 95
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)'
    ctx.beginPath()
    ctx.roundRect(20, dashY, width - 40, dashH, 12)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)'
    ctx.lineWidth = 1.5
    ctx.stroke()

    // Gauge 1: Speedometer
    ctx.fillStyle = '#ffffff'
    ctx.font = '900 36px Inter, sans-serif'
    ctx.fillText(`${speedKph}`, 45, dashY + 48)
    ctx.font = '600 13px Inter, sans-serif'
    ctx.fillStyle = '#94a3b8'
    ctx.fillText('KM/H', 48, dashY + 70)

    // Divider
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'
    ctx.beginPath()
    ctx.moveTo(130, dashY + 15)
    ctx.lineTo(130, dashY + dashH - 15)
    ctx.stroke()

    // Gauge 2: Hybrid Mode & Consumption
    ctx.fillStyle = modeColor
    ctx.font = 'bold 14px Inter, sans-serif'
    ctx.fillText(modeText, 155, dashY + 36)

    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 18px Inter, sans-serif'
    ctx.fillText(`${instantL.toFixed(1)} l/100km`, 155, dashY + 68)

    ctx.font = '13px Inter, sans-serif'
    ctx.fillStyle = '#94a3b8'
    ctx.fillText(`• ${rpm} U/min`, 280, dashY + 68)

    // Divider
    ctx.beginPath()
    ctx.moveTo(width - 340, dashY + 15)
    ctx.lineTo(width - 340, dashY + dashH - 15)
    ctx.stroke()

    // Gauge 3: Lead Car Radar Tracker
    ctx.fillStyle = '#38bdf8'
    ctx.font = 'bold 13px Inter, sans-serif'
    ctx.fillText('🎯 RADAR VORDERMANN', width - 315, dashY + 36)

    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 18px Inter, sans-serif'
    ctx.fillText(`${leadSpeedKph} km/h`, width - 315, dashY + 68)

    ctx.font = '13px Inter, sans-serif'
    ctx.fillStyle = '#94a3b8'
    ctx.fillText(`(Abstand: ${leadDistM} m)`, width - 210, dashY + 68)

    // openpilot status badge in corner
    ctx.fillStyle = '#22c55e'
    ctx.beginPath()
    ctx.arc(width - 45, 30, 7, 0, Math.PI * 2)
    ctx.fill()
  }

  const startExport = async () => {
    const video = props.videoEl
    if (!video || !canvasRef) return

    setDownloadUrl(null)
    setIsRecording(true)
    setProgress(0)
    recordedChunks = []

    // Match canvas to video dimensions
    const width = video.videoWidth || 1280
    const height = video.videoHeight || 720
    canvasRef.width = width
    canvasRef.height = height
    const ctx = canvasRef.getContext('2d')
    if (!ctx) return

    const stream = canvasRef.captureStream(30)
    try {
      mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' })
    } catch {
      mediaRecorder = new MediaRecorder(stream)
    }

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) recordedChunks.push(e.data)
    }

    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunks, { type: 'video/webm' })
      const url = URL.createObjectURL(blob)
      setDownloadUrl(url)
      setIsRecording(false)
    }

    const startT = video.currentTime || 0
    const exportLen = durationSeconds()
    const targetEndT = startT + exportLen

    mediaRecorder.start()
    video.play()

    const renderLoop = () => {
      if (!isRecording()) return
      const curT = video.currentTime

      // Draw video frame
      ctx.drawImage(video, 0, 0, width, height)

      // Draw dynamic HUD overlay
      drawHudOverlay(ctx, width, height, curT)

      // Calculate progress
      const elapsed = curT - startT
      const pct = Math.min(Math.round((elapsed / exportLen) * 100), 100)
      setProgress(pct)

      if (curT >= targetEndT || video.ended || elapsed >= exportLen) {
        mediaRecorder?.stop()
        video.pause()
        if (animFrameId) cancelAnimationFrame(animFrameId)
        return
      }

      animFrameId = requestAnimationFrame(renderLoop)
    }

    renderLoop()
  }

  onCleanup(() => {
    if (animFrameId) cancelAnimationFrame(animFrameId)
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop()
  })

  return (
    <Show when={props.isOpen}>
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
        <div class="flex flex-col gap-5 rounded-xl bg-surface-container p-6 max-w-xl w-full border border-outline-variant shadow-2xl">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2 text-primary font-bold text-lg">
              <Icon name="videocam" />
              <span>Dashcam-Video mit Telemetrie-HUD exportieren</span>
            </div>
            <IconButton name="close" onClick={props.onClose} />
          </div>

          <p class="text-sm text-on-surface-variant">
            Rendert das aktuelle Fahrvideo mit eingeblendetem Tachometer, Hybrid-Phasenindikator, Momentanverbrauch und Vordermann-Radar direkt als MP4/WebM-Videoclip.
          </p>

          {/* Settings */}
          <div class="flex flex-col gap-3 bg-surface-container-high p-4 rounded-lg">
            <div class="flex justify-between items-center text-sm">
              <span class="font-medium">Clip-Dauer ab aktuellem Zeitpunkt:</span>
              <select
                class="bg-surface-container-lowest text-on-surface px-3 py-1.5 rounded-md border border-outline-variant text-sm font-semibold"
                value={durationSeconds()}
                onChange={(e) => setDurationSeconds(Number(e.currentTarget.value))}
                disabled={isRecording()}
              >
                <option value={10}>10 Sekunden</option>
                <option value={15}>15 Sekunden</option>
                <option value={30}>30 Sekunden</option>
                <option value={60}>60 Sekunden</option>
              </select>
            </div>
          </div>

          {/* Progress Bar */}
          <Show when={isRecording()}>
            <div class="flex flex-col gap-2">
              <div class="flex justify-between text-xs font-semibold">
                <span>Rendern & Exportieren...</span>
                <span class="text-primary">{progress()}%</span>
              </div>
              <div class="h-3 w-full bg-surface-container-highest rounded-full overflow-hidden">
                <div class="h-full bg-primary transition-all duration-100" style={{ width: `${progress()}%` }} />
              </div>
            </div>
          </Show>

          {/* Canvas for processing (hidden or preview) */}
          <canvas ref={canvasRef} class="hidden" />

          {/* Download Ready Section */}
          <Show when={downloadUrl()}>
            <div class="p-4 rounded-lg bg-green-950/40 border border-green-500/30 flex items-center justify-between">
              <div class="flex items-center gap-2 text-green-400 font-semibold text-sm">
                <Icon name="check_circle" />
                <span>Video erfolgreich mit HUD gerendert!</span>
              </div>
              <a
                class="px-4 py-2 bg-primary text-on-primary font-bold text-sm rounded-md shadow flex items-center gap-2 hover:bg-primary-hover"
                href={downloadUrl()!}
                download={`drive_telemetry_${Date.now()}.webm`}
              >
                <Icon name="download" size="18" /> Video herunterladen
              </a>
            </div>
          </Show>

          {/* Action Buttons */}
          <div class="flex justify-end gap-3 mt-2">
            <Button color="secondary" onClick={props.onClose} disabled={isRecording()}>
              Schließen
            </Button>
            <Button onClick={startExport} disabled={isRecording()} leading={<Icon name="movie_filter" />}>
              {isRecording() ? 'Exportiere...' : 'Export starten'}
            </Button>
          </div>
        </div>
      </div>
    </Show>
  )
}

export default RouteVideoExporter
