import React, { useCallback, useEffect, useState } from 'react';
import dayjs from 'dayjs';
import {
  fetchIoniqOverview,
  fetchIoniqRecording,
  logDriveRefuel,
} from '../../api/ioniq';

function fmtNum(val, digits = 1, suffix = '') {
  if (typeof val !== 'number' || !Number.isFinite(val)) return '—';
  return `${val.toFixed(digits)}${suffix ? ` ${suffix}` : ''}`;
}

function fmtEpoch(sec) {
  if (typeof sec !== 'number' || !Number.isFinite(sec) || sec <= 0) return '—';
  const ms = sec > 1e12 ? sec : sec * 1000;
  return dayjs(ms).format('DD.MM.YY HH:mm');
}

function fmtDuration(sec) {
  if (typeof sec !== 'number' || !Number.isFinite(sec) || sec < 0) return '—';
  const totalMin = Math.round(sec / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function badgeTone(status) {
  if (status === 'critical' || status === 'hot_warn' || status === 'error') {
    return 'bg-red-500/20 text-red-300 border border-red-500/40';
  }
  if (status === 'warn' || status === 'cold_warmup' || status === 'warming') {
    return 'bg-amber-500/20 text-amber-300 border border-amber-500/40';
  }
  if (status === 'ok' || status === 'optimal') {
    return 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40';
  }
  return 'bg-white/10 text-white/70 border border-white/15';
}

function downloadTextFile(filename, text, mimeType) {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const IoniqPanel = ({ dongleId }) => {
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [subTab, setSubTab] = useState('trips');

  const [showRefuelForm, setShowRefuelForm] = useState(false);
  const [litersInput, setLitersInput] = useState('');
  const [priceInput, setPriceInput] = useState('');
  const [odometerInput, setOdometerInput] = useState('');
  const [notesInput, setNotesInput] = useState('');
  const [fullTankInput, setFullTankInput] = useState(true);
  const [refuelBusy, setRefuelBusy] = useState(false);
  const [refuelMsg, setRefuelMsg] = useState(null);

  const [selectedRec, setSelectedRec] = useState(null);
  const [recLoading, setRecLoading] = useState(false);

  const loadOverview = useCallback(async () => {
    if (!dongleId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchIoniqOverview(dongleId);
      setOverview(data);
    } catch (err) {
      setError(err.message || 'Fehler beim Laden der Ioniq-Daten');
    } finally {
      setLoading(false);
    }
  }, [dongleId]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const handleOpenRefuel = (prefillLiters = null, prefillOdo = null) => {
    const defaultPrice = overview?.config?.fuelPriceEurPerLiter;
    setLitersInput(prefillLiters != null ? String(prefillLiters) : '');
    setPriceInput(defaultPrice != null ? String(defaultPrice) : '');
    setOdometerInput(prefillOdo != null ? String(prefillOdo) : '');
    setNotesInput('');
    setFullTankInput(true);
    setRefuelMsg(null);
    setShowRefuelForm(true);
  };

  const handleSubmitRefuel = async (e) => {
    e.preventDefault();
    const liters = Number(litersInput);
    if (!Number.isFinite(liters) || liters < 0.1 || liters > 90) {
      setRefuelMsg('Bitte gültige Liter-Menge (0,1 – 90 L) eingeben.');
      return;
    }
    setRefuelBusy(true);
    setRefuelMsg(null);
    try {
      const payload = {
        liters,
        fullTank: fullTankInput,
        notes: notesInput,
      };
      if (priceInput !== '' && Number.isFinite(Number(priceInput))) {
        payload.pricePerLiter = Number(priceInput);
      }
      if (odometerInput !== '' && Number.isFinite(Number(odometerInput))) {
        payload.odometerKm = Number(odometerInput);
      }
      const res = await logDriveRefuel(dongleId, payload);
      if (res?.overview) setOverview(res.overview);
      setShowRefuelForm(false);
      setRefuelMsg('Tankstopp gespeichert.');
    } catch (err) {
      setRefuelMsg(err.message || 'Speichern fehlgeschlagen.');
    } finally {
      setRefuelBusy(false);
    }
  };

  const handleInspectRecording = async (recId) => {
    setRecLoading(true);
    try {
      const bundle = await fetchIoniqRecording(dongleId, recId);
      setSelectedRec(bundle);
    } catch (err) {
      setError(err.message || 'Flight Recording konnte nicht geladen werden.');
    } finally {
      setRecLoading(false);
    }
  };

  const handleExportTripsCsv = () => {
    const trips = overview?.fuel?.trips || [];
    if (!trips.length) return;
    const cols = [
      'id', 'label', 'startedAt', 'endedAt', 'durationS', 'distanceKm',
      'evDistanceKm', 'evDistancePct', 'evTimePct', 'fuelLiters', 'avgLPer100Km',
      'estimatedCostEur', 'sourceMode', 'maxSpeedKph', 'maxCoolantC',
    ];
    const escape = (v) => {
      const s = v == null ? '' : String(v);
      return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [
      cols.join(','),
      ...trips.map((t) => cols.map((c) => escape(t[c])).join(',')),
    ];
    downloadTextFile(`ioniq-trips-${dongleId}.csv`, `${lines.join('\n')}\n`, 'text/csv;charset=utf-8');
  };

  if (loading && !overview) {
    return (
      <div className="p-6 text-white/70">Lade Ioniq HEV Telemetrie & Verbrauchsdaten…</div>
    );
  }

  const fuel = overview?.fuel || {};
  const diag = overview?.diagnostics || {};
  const live = diag.liveSummary || {};
  const bat12v = live.battery12vHealth || {};
  const thermal = live.thermalStatus || {};
  const curTank = fuel.currentTank || {};
  const trips = Array.isArray(fuel.trips) ? fuel.trips : [];
  const latestTrip = fuel.activeTrip || trips[0] || null;
  const tankHistory = Array.isArray(fuel.tankHistory) ? fuel.tankHistory : [];
  const refuelLog = Array.isArray(fuel.refuelLog) ? fuel.refuelLog : [];
  const liveEcus = Array.isArray(diag.liveEcus) ? diag.liveEcus : [];
  const scanDtcs = Array.isArray(diag.lastScan?.dtcs) ? diag.lastScan.dtcs : [];
  const passiveWarnings = Array.isArray(diag.passive?.activeWarnings) ? diag.passive.activeWarnings : [];
  const recordings = Array.isArray(overview?.recordings) ? overview.recordings : [];
  const hasAnyData = Boolean(overview?.syncedAt || refuelLog.length || trips.length || liveEcus.length);

  return (
    <div className="flex flex-col gap-4 px-4 py-4 text-white">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-white">Hyundai Ioniq HEV — Verbrauch & Diagnose</h2>
          <p className="text-xs text-white/60">
            Letzter Sync: {overview?.syncedAt ? fmtEpoch(overview.syncedAt) : 'Noch kein Geräte-Sync'}
            {overview?.openpilot?.version ? ` · openpilot ${overview.openpilot.version}` : ''}
            {overview?.openpilot?.branch ? ` (${overview.openpilot.branch})` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => handleOpenRefuel(fuel.refuelAlert?.estimatedAddedLiters, fuel.refuelAlert?.odometerKm)}
            className="rounded-md bg-emerald-600/80 hover:bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white cursor-pointer"
          >
            + Tankstopp eintragen
          </button>
          <button
            type="button"
            onClick={loadOverview}
            className="rounded-md bg-white/10 hover:bg-white/20 px-3 py-1.5 text-xs font-semibold text-white cursor-pointer"
          >
            Aktualisieren
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/15 px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      )}

      {refuelMsg && (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/15 px-3 py-2 text-xs text-emerald-200">
          {refuelMsg}
        </div>
      )}

      {fuel.refuelAlert && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-400/40 bg-amber-500/15 px-4 py-3 text-sm">
          <div>
            <span className="font-semibold text-amber-200">Tankvorgang erkannt:</span>{' '}
            <span className="text-white/90">
              Tankfüllstand +{fuel.refuelAlert.deltaBars} Balken ({fuel.refuelAlert.fromPct}% → {fuel.refuelAlert.toPct}%),
              geschätzt ~{fuel.refuelAlert.estimatedAddedLiters} L
            </span>
          </div>
          <button
            type="button"
            onClick={() => handleOpenRefuel(fuel.refuelAlert.estimatedAddedLiters, fuel.refuelAlert.odometerKm)}
            className="rounded bg-amber-500 px-3 py-1 text-xs font-semibold text-black hover:bg-amber-400 cursor-pointer"
          >
            Jetzt bestätigen
          </button>
        </div>
      )}

      {showRefuelForm && (
        <form
          onSubmit={handleSubmitRefuel}
          className="grid grid-cols-1 md:grid-cols-6 gap-3 rounded-lg border border-white/15 bg-[#1D2225] p-4"
        >
          <div>
            <label className="block text-xs text-white/70 mb-1">Getankte Liter *</label>
            <input
              type="number"
              step="0.01"
              min="0.1"
              max="90"
              required
              value={litersInput}
              onChange={(e) => setLitersInput(e.target.value)}
              placeholder="z.B. 38.50"
              className="w-full rounded bg-black/40 border border-white/20 px-2.5 py-1.5 text-sm text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-white/70 mb-1">Preis (€/L)</label>
            <input
              type="number"
              step="0.001"
              min="0.5"
              max="5"
              value={priceInput}
              onChange={(e) => setPriceInput(e.target.value)}
              placeholder="1.759"
              className="w-full rounded bg-black/40 border border-white/20 px-2.5 py-1.5 text-sm text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-white/70 mb-1">Kilometerstand</label>
            <input
              type="number"
              step="0.1"
              value={odometerInput}
              onChange={(e) => setOdometerInput(e.target.value)}
              placeholder="optional"
              className="w-full rounded bg-black/40 border border-white/20 px-2.5 py-1.5 text-sm text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-white/70 mb-1">Notiz</label>
            <input
              type="text"
              maxLength={120}
              value={notesInput}
              onChange={(e) => setNotesInput(e.target.value)}
              placeholder="Tankstelle / E10"
              className="w-full rounded bg-black/40 border border-white/20 px-2.5 py-1.5 text-sm text-white"
            />
          </div>
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 text-xs text-white/80 cursor-pointer">
              <input
                type="checkbox"
                checked={fullTankInput}
                onChange={(e) => setFullTankInput(e.target.checked)}
              />
              Volltank (Tank-to-Tank)
            </label>
          </div>
          <div className="flex items-end justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowRefuelForm(false)}
              className="rounded bg-white/10 px-3 py-1.5 text-xs text-white/80 hover:bg-white/20 cursor-pointer"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={refuelBusy}
              className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 cursor-pointer"
            >
              {refuelBusy ? 'Speichere…' : 'Speichern'}
            </button>
          </div>
        </form>
      )}

      {!hasAnyData ? (
        <div className="rounded-lg border border-white/10 bg-[#1D2225] p-6 text-sm text-white/75">
          Noch keine Ioniq-Daten synchronisiert. Wähle am Gerät unter Entwickler-Einstellungen den
          Cloud-Provider <strong>MarkenJaden Drive</strong>, starte das Gerät neu und verbinde es mit WLAN/Mobilfunk.
          Danach überträgt <code className="text-white/90">drive_sync</code> automatisch Verbrauch, Tankdaten, ECUs und Flight Recordings.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-lg border border-white/10 bg-gradient-to-b from-[#30373B] to-[#1D2225] p-4">
              <div className="text-xs uppercase tracking-wide text-white/60">Aktueller Tank</div>
              <div className="mt-1 text-2xl font-bold">{fmtNum(curTank.estimatedLPer100Km, 2, 'L/100km')}</div>
              <div className="mt-1 text-xs text-white/70">
                Strecke {fmtNum(curTank.distanceKm, 1, 'km')} · Geschätzt {fmtNum(curTank.estimatedFuelLiters, 2, 'L')}
              </div>
              <div className="text-xs text-white/50">
                Reichweite {live.dteKm != null ? `${live.dteKm} km` : '—'} · Tank {live.fuelDispPct != null ? `${live.fuelDispPct}%` : '—'}
              </div>
            </div>

            <div className="rounded-lg border border-white/10 bg-gradient-to-b from-[#30373B] to-[#1D2225] p-4">
              <div className="text-xs uppercase tracking-wide text-white/60">Langzeit Tank-to-Tank</div>
              <div className="mt-1 text-2xl font-bold">{fmtNum(fuel.lifetimeTankAvgLPer100Km, 2, 'L/100km')}</div>
              <div className="mt-1 text-xs text-white/70">
                Kosten {fmtNum(fuel.lifetimeCostPer100Km, 2, '€/100km')} · Gesamt {fmtNum(fuel.totalLoggedLiters, 1, 'L')}
              </div>
              <div className="text-xs text-white/50">
                Kalibrierfaktor {fmtNum(fuel.calibrationFactor, 3)}
              </div>
            </div>

            <div className="rounded-lg border border-white/10 bg-gradient-to-b from-[#30373B] to-[#1D2225] p-4">
              <div className="text-xs uppercase tracking-wide text-white/60">
                {fuel.activeTrip ? 'Aktive Fahrt' : 'Letzte Fahrt'}
              </div>
              <div className="mt-1 text-2xl font-bold">{fmtNum(latestTrip?.avgLPer100Km, 2, 'L/100km')}</div>
              <div className="mt-1 text-xs text-white/70">
                {fmtNum(latestTrip?.distanceKm, 1, 'km')} · EV-Anteil {fmtNum(latestTrip?.evDistancePct, 0, '%')}
              </div>
              <div className="text-xs text-white/50">
                Kraftstoff {fmtNum(latestTrip?.fuelLiters, 2, 'L')} · Dauer {fmtDuration(latestTrip?.durationS)}
              </div>
            </div>

            <div className="rounded-lg border border-white/10 bg-gradient-to-b from-[#30373B] to-[#1D2225] p-4">
              <div className="text-xs uppercase tracking-wide text-white/60">Fahrzeug-Health</div>
              <div className="mt-1 flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badgeTone(bat12v.status)}`}>
                  12V: {bat12v.voltageV != null ? `${bat12v.voltageV}V` : bat12v.label || '—'}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badgeTone(thermal.state)}`}>
                  {thermal.coolantTempC != null ? `${thermal.coolantTempC}°C` : '—'}
                </span>
              </div>
              <div className="mt-2 text-xs text-white/70">
                Aktive DTCs: {scanDtcs.length} · Passiv-Warnungen: {passiveWarnings.length}
              </div>
              <div className="text-xs text-white/50">
                Odometer: {live.odometerKm != null ? `${Math.round(live.odometerKm)} km` : '—'}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 border-b border-white/10 pb-2">
            {[
              { id: 'trips', label: `Verbrauch & Fahrten (${trips.length})` },
              { id: 'tanks', label: `Tank-Historie (${refuelLog.length})` },
              { id: 'diag', label: `Diagnose & ECUs (${liveEcus.filter((e) => e.online).length}/${liveEcus.length})` },
              { id: 'recordings', label: `Flight Recordings (${recordings.length})` },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSubTab(tab.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                  subTab === tab.id
                    ? 'bg-white text-black'
                    : 'bg-white/10 text-white/80 hover:bg-white/20'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {subTab === 'trips' && (
            <div className="rounded-lg border border-white/10 bg-[#1D2225] p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Aufgezeichnete Fahrten</h3>
                {trips.length > 0 && (
                  <button
                    type="button"
                    onClick={handleExportTripsCsv}
                    className="rounded bg-white/10 hover:bg-white/20 px-2.5 py-1 text-xs text-white cursor-pointer"
                  >
                    CSV Export
                  </button>
                )}
              </div>
              {trips.length === 0 ? (
                <p className="text-xs text-white/60">Noch keine abgeschlossenen Fahrten vorhanden.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-white/10 text-white/60">
                      <tr>
                        <th className="py-2 pr-3">Start</th>
                        <th className="py-2 pr-3">Dauer</th>
                        <th className="py-2 pr-3">Strecke</th>
                        <th className="py-2 pr-3">Ø L/100km</th>
                        <th className="py-2 pr-3">Liter</th>
                        <th className="py-2 pr-3">EV %</th>
                        <th className="py-2 pr-3">Kosten</th>
                        <th className="py-2 pr-3">Quelle</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {trips.map((t, idx) => (
                        <tr key={t.id || idx} className="hover:bg-white/5">
                          <td className="py-2 pr-3 whitespace-nowrap">{fmtEpoch(t.startedAt)}</td>
                          <td className="py-2 pr-3">{fmtDuration(t.durationS)}</td>
                          <td className="py-2 pr-3">{fmtNum(t.distanceKm, 1, 'km')}</td>
                          <td className="py-2 pr-3 font-semibold text-emerald-300">{fmtNum(t.avgLPer100Km, 2)}</td>
                          <td className="py-2 pr-3">{fmtNum(t.fuelLiters, 2, 'L')}</td>
                          <td className="py-2 pr-3">{fmtNum(t.evDistancePct, 0, '%')}</td>
                          <td className="py-2 pr-3">{fmtNum(t.estimatedCostEur, 2, '€')}</td>
                          <td className="py-2 pr-3 text-white/60">{t.sourceMode || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {subTab === 'tanks' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-lg border border-white/10 bg-[#1D2225] p-4">
                <h3 className="mb-3 text-sm font-semibold">Tankstopps ({refuelLog.length})</h3>
                {refuelLog.length === 0 ? (
                  <p className="text-xs text-white/60">Noch keine Tankstopps eingetragen.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-white/10 text-white/60">
                        <tr>
                          <th className="py-2 pr-2">Datum</th>
                          <th className="py-2 pr-2">Liter</th>
                          <th className="py-2 pr-2">Kosten</th>
                          <th className="py-2 pr-2">Typ</th>
                          <th className="py-2 pr-2">Quelle</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {refuelLog.map((r, idx) => (
                          <tr key={r.id || idx}>
                            <td className="py-2 pr-2 whitespace-nowrap">{fmtEpoch(r.loggedAt)}</td>
                            <td className="py-2 pr-2 font-semibold">{fmtNum(r.liters, 2, 'L')}</td>
                            <td className="py-2 pr-2">{fmtNum(r.costEur, 2, '€')}</td>
                            <td className="py-2 pr-2">{r.fullTank !== false ? 'Voll' : 'Teil'}</td>
                            <td className="py-2 pr-2">
                              <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                r.source === 'drive'
                                  ? 'bg-sky-500/20 text-sky-300'
                                  : 'bg-white/10 text-white/75'
                              }`}>
                                {r.source === 'drive' ? 'Drive' : 'Gerät'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-white/10 bg-[#1D2225] p-4">
                <h3 className="mb-3 text-sm font-semibold">Abgeschlossene Tank-Zyklen ({tankHistory.length})</h3>
                {tankHistory.length === 0 ? (
                  <p className="text-xs text-white/60">Nach dem ersten Volltanken werden hier reale Tank-to-Tank-Zyklen angezeigt.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-white/10 text-white/60">
                        <tr>
                          <th className="py-2 pr-2">Ende</th>
                          <th className="py-2 pr-2">Distanz</th>
                          <th className="py-2 pr-2">Real L</th>
                          <th className="py-2 pr-2">L/100km</th>
                          <th className="py-2 pr-2">€/100km</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {tankHistory.map((t, idx) => (
                          <tr key={t.endedAt || idx}>
                            <td className="py-2 pr-2 whitespace-nowrap">{fmtEpoch(t.endedAt)}</td>
                            <td className="py-2 pr-2">{fmtNum(t.distanceKm, 1, 'km')}</td>
                            <td className="py-2 pr-2">{fmtNum(t.actualLiters, 2, 'L')}</td>
                            <td className="py-2 pr-2 font-semibold text-emerald-300">{fmtNum(t.actualLPer100Km, 2)}</td>
                            <td className="py-2 pr-2">{fmtNum(t.costPer100Km, 2, '€')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {subTab === 'diag' && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-lg border border-white/10 bg-[#1D2225] p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">12V Bordnetz / IBS</h3>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badgeTone(bat12v.status)}`}>
                      {bat12v.label || 'Unbekannt'}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-white/80">
                    <div>Spannung: <strong>{bat12v.voltageV != null ? `${bat12v.voltageV} V` : '—'}</strong></div>
                    <div>SoC / SoH: <strong>{bat12v.socPct != null ? `${bat12v.socPct}%` : '—'} / {bat12v.sohPct != null ? `${bat12v.sohPct}%` : '—'}</strong></div>
                    <div>Strom: <strong>{bat12v.currentA != null ? `${bat12v.currentA} A` : '—'}</strong></div>
                    <div>LDC lädt: <strong>{bat12v.ldcCharging ? 'Ja' : 'Nein'}</strong></div>
                  </div>
                  {bat12v.advice && <p className="mt-2 text-xs text-white/60">{bat12v.advice}</p>}
                </div>

                <div className="rounded-lg border border-white/10 bg-[#1D2225] p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Thermik & Temperaturen</h3>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badgeTone(thermal.state)}`}>
                      {thermal.label || 'Unbekannt'}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-white/80">
                    <div>Kühlmittel: <strong>{fmtNum(thermal.coolantTempC, 1, '°C')}</strong></div>
                    <div>Motoröl: <strong>{fmtNum(live.engOilTempC, 1, '°C')}</strong></div>
                    <div>Außen: <strong>{fmtNum(thermal.ambientTempC, 1, '°C')}</strong></div>
                    <div>Innenraum: <strong>{fmtNum(thermal.cabinTempC, 1, '°C')}</strong></div>
                  </div>
                  {thermal.explanation && <p className="mt-2 text-xs text-white/60">{thermal.explanation}</p>}
                </div>
              </div>

              <div className="rounded-lg border border-white/10 bg-[#1D2225] p-4">
                <h3 className="mb-3 text-sm font-semibold">C-CAN Steuergeräte Matrix ({liveEcus.length})</h3>
                {liveEcus.length === 0 ? (
                  <p className="text-xs text-white/60">Keine ECU-Präsenzdaten empfangen.</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                    {liveEcus.map((ecu) => (
                      <div
                        key={ecu.ecuId}
                        className={`rounded border p-2 text-xs ${
                          ecu.online
                            ? 'border-emerald-500/35 bg-emerald-500/10'
                            : 'border-white/10 bg-black/20 opacity-65'
                        }`}
                      >
                        <div className="flex items-center justify-between font-semibold">
                          <span>{ecu.ecuId}</span>
                          <span className={ecu.online ? 'text-emerald-300' : 'text-white/50'}>
                            {ecu.online ? 'ONLINE' : 'OFFLINE'}
                          </span>
                        </div>
                        <div className="mt-0.5 truncate text-[11px] text-white/70" title={ecu.name}>
                          {ecu.name}
                        </div>
                        <div className="mt-1 text-[10px] text-white/50">
                          Bus {ecu.bus ?? '—'} · {ecu.framesSeen ?? 0} Frames
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-white/10 bg-[#1D2225] p-4">
                <h3 className="mb-2 text-sm font-semibold">
                  Fehlerspeicher & Warnungen ({scanDtcs.length + passiveWarnings.length})
                </h3>
                {scanDtcs.length === 0 && passiveWarnings.length === 0 ? (
                  <p className="text-xs text-emerald-300">Keine gespeicherten DTCs oder aktiven Warnungen.</p>
                ) : (
                  <div className="flex flex-col gap-2 text-xs">
                    {scanDtcs.map((d, idx) => (
                      <div key={`${d.ecuId}-${d.code}-${idx}`} className="rounded border border-red-500/30 bg-red-500/10 p-2.5">
                        <div className="font-semibold text-red-200">
                          [{d.ecuId}] {d.code} — {d.title || d.description || 'Fehlercode'}
                        </div>
                        {d.advice && <div className="mt-1 text-white/75">{d.advice}</div>}
                      </div>
                    ))}
                    {passiveWarnings.map((w, idx) => (
                      <div key={`${w.code}-${idx}`} className="rounded border border-amber-500/30 bg-amber-500/10 p-2.5">
                        <div className="font-semibold text-amber-200">
                          [{w.ecuId}] {w.code}: {w.message}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {subTab === 'recordings' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-lg border border-white/10 bg-[#1D2225] p-4">
                <h3 className="mb-3 text-sm font-semibold">Event Flight Recordings ({recordings.length})</h3>
                {recordings.length === 0 ? (
                  <p className="text-xs text-white/60">Noch keine Flight Recordings synchronisiert.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {recordings.map((rec) => (
                      <button
                        key={rec.id}
                        type="button"
                        onClick={() => handleInspectRecording(rec.id)}
                        className={`flex items-center justify-between rounded border p-2.5 text-left text-xs cursor-pointer ${
                          selectedRec?.id === rec.id
                            ? 'border-white/50 bg-white/15'
                            : 'border-white/10 bg-black/20 hover:bg-white/10'
                        }`}
                      >
                        <div>
                          <div className="font-semibold text-white">{rec.label || rec.trigger || rec.id}</div>
                          <div className="text-white/60">
                            {fmtEpoch(rec.startedAt)} · {fmtDuration(rec.durationS)} · {rec.sampleCount ?? '—'} Samples
                          </div>
                        </div>
                        <span className="text-white/70">Inspect →</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-white/10 bg-[#1D2225] p-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Recording Inspector</h3>
                  {selectedRec && (
                    <button
                      type="button"
                      onClick={() => downloadTextFile(
                        `ioniq-recording-${selectedRec.id}.json`,
                        JSON.stringify(selectedRec, null, 2),
                        'application/json',
                      )}
                      className="rounded bg-white/10 hover:bg-white/20 px-2.5 py-1 text-xs text-white cursor-pointer"
                    >
                      JSON Download
                    </button>
                  )}
                </div>
                {recLoading ? (
                  <p className="text-xs text-white/60">Lade Recording-Bundle…</p>
                ) : !selectedRec ? (
                  <p className="text-xs text-white/60">Wähle links ein Recording aus.</p>
                ) : (
                  <pre className="max-h-96 overflow-auto rounded bg-black/40 p-3 text-[11px] text-white/85">
                    {JSON.stringify(
                      {
                        id: selectedRec.id,
                        trigger: selectedRec.trigger,
                        startedAt: selectedRec.startedAt,
                        endedAt: selectedRec.endedAt,
                        summary: selectedRec.summary,
                        sampleCount: Array.isArray(selectedRec.samples) ? selectedRec.samples.length : selectedRec.sampleCount,
                        samplesPreview: Array.isArray(selectedRec.samples) ? selectedRec.samples.slice(0, 5) : undefined,
                      },
                      null,
                      2,
                    )}
                  </pre>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default IoniqPanel;
