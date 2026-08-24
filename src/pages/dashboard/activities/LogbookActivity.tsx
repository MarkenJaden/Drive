import { createMemo, createSignal, For, onMount, Show, type VoidComponent } from 'solid-js'
import { createResource } from 'solid-js'
import { getRoutes } from '~/api/devices'
import Icon from '~/components/material/Icon'
import IconButton from '~/components/material/IconButton'
import TopAppBar from '~/components/material/TopAppBar'
import Button from '~/components/material/Button'

type LogbookEntry = {
  category: string
  notes: string
  driver: string
  startLocation: string
  endLocation: string
}

type LogbookStore = Record<string, LogbookEntry>

const CATEGORIES = ['Geschäftlich', 'Arbeitsweg', 'Privat', 'Kundenbesuch', 'Urlaub', 'Werkstatt']

const LogbookActivity: VoidComponent<{ dongleId: string }> = (props) => {
  const [routes] = createResource(() => props.dongleId, getRoutes)
  const storageKey = () => `drive_logbook_${props.dongleId}`

  const [entries, setEntries] = createSignal<LogbookStore>({})
  const [activeFilter, setActiveFilter] = createSignal('all')
  const [defaultDriver, setDefaultDriver] = createSignal('Jan-Jaden Schmidt')

  onMount(() => {
    try {
      const saved = localStorage.getItem(storageKey())
      if (saved) setEntries(JSON.parse(saved))
    } catch {
      // ignore
    }
  })

  const saveEntry = (routeId: string, updates: Partial<LogbookEntry>) => {
    const current = entries()[routeId] || {
      category: 'Privat',
      notes: '',
      driver: defaultDriver(),
      startLocation: '',
      endLocation: '',
    }
    const updated = {
      ...entries(),
      [routeId]: { ...current, ...updates },
    }
    setEntries(updated)
    try {
      localStorage.setItem(storageKey(), JSON.stringify(updated))
    } catch {
      // ignore
    }
  }

  const sortedRoutes = createMemo(() => {
    const r = routes() || []
    return [...r].sort((a, b) => (b.start_time_utc_millis || 0) - (a.start_time_utc_millis || 0))
  })

  const filteredRoutes = createMemo(() => {
    const list = sortedRoutes()
    const f = activeFilter()
    if (f === 'all') return list
    return list.filter((route) => {
      const cat = entries()[route.fullname]?.category || 'Privat'
      return cat === f
    })
  })

  const summary = createMemo(() => {
    let totalKm = 0
    let businessKm = 0
    let commuteKm = 0
    let privateKm = 0

    for (const r of sortedRoutes()) {
      const km = (r.length || 0) * 1.60934 // miles to km
      totalKm += km
      const cat = entries()[r.fullname]?.category || 'Privat'
      if (cat === 'Geschäftlich' || cat === 'Kundenbesuch') businessKm += km
      else if (cat === 'Arbeitsweg') commuteKm += km
      else privateKm += km
    }

    return {
      totalKm: Math.round(totalKm),
      businessKm: Math.round(businessKm),
      commuteKm: Math.round(commuteKm),
      privateKm: Math.round(privateKm),
      businessEuro: (businessKm * 0.3).toFixed(2), // 0,30€ / km Pendler-/Reisekosten
    }
  })

  const exportCSV = () => {
    const rows = [
      ['Datum', 'Startzeit', 'Endzeit', 'Fahrtstrecke (km)', 'Kategorie', 'Zweck / Notizen', 'Fahrer', 'Startort', 'Zielort'],
    ]

    for (const r of sortedRoutes()) {
      const d = new Date(r.start_time_utc_millis || 0)
      const dateStr = d.toLocaleDateString('de-DE')
      const startTimeStr = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
      const endTime = new Date((r.start_time_utc_millis || 0) + (r.duration || 0) * 1000)
      const endTimeStr = endTime.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
      const km = ((r.length || 0) * 1.60934).toFixed(1)

      const entry = entries()[r.fullname] || {
        category: 'Privat',
        notes: '',
        driver: defaultDriver(),
        startLocation: '',
        endLocation: '',
      }

      rows.push([
        dateStr,
        startTimeStr,
        endTimeStr,
        km,
        entry.category,
        `"${(entry.notes || '').replace(/"/g, '""')}"`,
        `"${entry.driver}"`,
        `"${entry.startLocation}"`,
        `"${entry.endLocation}"`,
      ])
    }

    const csvContent = '\uFEFF' + rows.map((e) => e.join(';')).join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute('download', `Fahrtenbuch_${props.dongleId}_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <>
      <TopAppBar
        component="h2"
        leading={<IconButton class="md:hidden" name="arrow_back" href={`/${props.dongleId}`} />}
      >
        <span>📒 Digitales Fahrtenbuch</span>
      </TopAppBar>

      <div class="flex flex-col gap-6 p-4 max-w-5xl mx-auto w-full">
        {/* Summary Cards */}
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div class="flex flex-col p-4 rounded-xl bg-surface-container border border-outline-variant">
            <span class="text-xs text-on-surface-variant font-bold uppercase tracking-wider">Gesamtstrecke</span>
            <span class="text-2xl font-extrabold text-primary mt-1">{summary().totalKm} <span class="text-sm font-semibold">km</span></span>
            <span class="text-xs text-on-surface-variant mt-1">{sortedRoutes().length} erfasste Fahrten</span>
          </div>

          <div class="flex flex-col p-4 rounded-xl bg-surface-container border border-outline-variant">
            <span class="text-xs text-on-surface-variant font-bold uppercase tracking-wider">Geschäftlich</span>
            <span class="text-2xl font-extrabold text-green-400 mt-1">{summary().businessKm} <span class="text-sm font-semibold">km</span></span>
            <span class="text-xs text-green-500 font-semibold mt-1">~ {summary().businessEuro} € Erstattung</span>
          </div>

          <div class="flex flex-col p-4 rounded-xl bg-surface-container border border-outline-variant">
            <span class="text-xs text-on-surface-variant font-bold uppercase tracking-wider">Arbeitsweg</span>
            <span class="text-2xl font-extrabold text-cyan-400 mt-1">{summary().commuteKm} <span class="text-sm font-semibold">km</span></span>
            <span class="text-xs text-on-surface-variant mt-1">Pendler-Strecke</span>
          </div>

          <div class="flex flex-col p-4 rounded-xl bg-surface-container border border-outline-variant">
            <span class="text-xs text-on-surface-variant font-bold uppercase tracking-wider">Privatfahrten</span>
            <span class="text-2xl font-extrabold text-amber-400 mt-1">{summary().privateKm} <span class="text-sm font-semibold">km</span></span>
            <span class="text-xs text-on-surface-variant mt-1">Freizeit & Urlaub</span>
          </div>
        </div>

        {/* Action Header & Filter */}
        <div class="flex flex-wrap items-center justify-between gap-3 bg-surface-container p-4 rounded-xl border border-outline-variant">
          <div class="flex items-center gap-2 overflow-x-auto">
            <span class="text-xs font-bold text-on-surface-variant uppercase mr-1">Filter:</span>
            <button
              class={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${activeFilter() === 'all' ? 'bg-primary text-on-primary' : 'bg-surface-container-highest text-on-surface hover:bg-surface-container-high'}`}
              onClick={() => setActiveFilter('all')}
            >
              Alle ({sortedRoutes().length})
            </button>
            <button
              class={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${activeFilter() === 'Geschäftlich' ? 'bg-green-600 text-white' : 'bg-surface-container-highest text-on-surface hover:bg-surface-container-high'}`}
              onClick={() => setActiveFilter('Geschäftlich')}
            >
              Geschäftlich
            </button>
            <button
              class={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${activeFilter() === 'Arbeitsweg' ? 'bg-cyan-600 text-white' : 'bg-surface-container-highest text-on-surface hover:bg-surface-container-high'}`}
              onClick={() => setActiveFilter('Arbeitsweg')}
            >
              Arbeitsweg
            </button>
            <button
              class={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${activeFilter() === 'Privat' ? 'bg-amber-600 text-white' : 'bg-surface-container-highest text-on-surface hover:bg-surface-container-high'}`}
              onClick={() => setActiveFilter('Privat')}
            >
              Privat
            </button>
          </div>

          <div class="flex items-center gap-2">
            <Button onClick={exportCSV} leading={<Icon name="download" />}>
              CSV-Export (Excel)
            </Button>
            <Button color="secondary" onClick={() => window.print()} leading={<Icon name="print" />}>
              Drucken / PDF
            </Button>
          </div>
        </div>

        {/* Route Logbook Table / List */}
        <div class="flex flex-col gap-3">
          <For each={filteredRoutes()} fallback={<div class="p-8 text-center text-on-surface-variant">Keine Fahrten im gewählten Filter gefunden.</div>}>
            {(route) => {
              const d = new Date(route.start_time_utc_millis || 0)
              const dateStr = d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })
              const timeStr = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
              const km = ((route.length || 0) * 1.60934).toFixed(1)
              const entry = () => entries()[route.fullname] || {
                category: 'Privat',
                notes: '',
                driver: defaultDriver(),
                startLocation: '',
                endLocation: '',
              }

              return (
                <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-xl bg-surface-container border border-outline-variant hover:border-primary/40 transition">
                  <div class="flex flex-col min-w-48">
                    <div class="flex items-center gap-2 font-bold text-base text-on-surface">
                      <Icon name="directions_car" size="18" />
                      <span>{dateStr}</span>
                      <span class="text-xs text-on-surface-variant font-medium">({timeStr} Uhr)</span>
                    </div>
                    <div class="text-sm font-semibold text-primary mt-1">
                      {km} km • {Math.round((route.duration || 0) / 60)} Min.
                    </div>
                  </div>

                  {/* Category Dropdown */}
                  <div class="flex flex-col gap-1 min-w-36">
                    <label class="text-xs text-on-surface-variant font-semibold">Kategorie</label>
                    <select
                      class="px-2.5 py-1.5 rounded-lg bg-surface-container-highest text-on-surface text-xs font-bold border border-outline-variant"
                      value={entry().category}
                      onChange={(e) => saveEntry(route.fullname, { category: e.currentTarget.value })}
                    >
                      <For each={CATEGORIES}>
                        {(cat) => <option value={cat}>{cat}</option>}
                      </For>
                    </select>
                  </div>

                  {/* Notes / Purpose Input */}
                  <div class="flex-1 flex flex-col gap-1">
                    <label class="text-xs text-on-surface-variant font-semibold">Zweck der Fahrt / Notizen</label>
                    <input
                      type="text"
                      placeholder="z. B. Kunde XYZ, Projekt-Termin, Einkauf..."
                      class="px-3 py-1.5 rounded-lg bg-surface-container-highest text-on-surface text-xs border border-outline-variant"
                      value={entry().notes}
                      onInput={(e) => saveEntry(route.fullname, { notes: e.currentTarget.value })}
                    />
                  </div>

                  {/* Route Link */}
                  <div class="flex items-center self-end md:self-center">
                    <IconButton
                      name="open_in_new"
                      href={`/${props.dongleId}/${route.fullname.split('|')[1]}`}
                      title="Route & Video ansehen"
                    />
                  </div>
                </div>
              )
            }}
          </For>
        </div>
      </div>
    </>
  )
}

export default LogbookActivity
