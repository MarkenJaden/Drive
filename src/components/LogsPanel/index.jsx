import React, { useCallback, useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { downloadDeviceLog, fetchDeviceLogs } from '../../api/ioniq';

function fmtBytes(bytes) {
  const val = Number(bytes || 0);
  if (val < 1024) return `${val} B`;
  if (val < 1024 * 1024) return `${(val / 1024).toFixed(1)} KB`;
  if (val < 1024 * 1024 * 1024) return `${(val / (1024 * 1024)).toFixed(1)} MB`;
  return `${(val / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function levelColor(level) {
  const upper = String(level || '').toUpperCase();
  if (upper.includes('ERR') || upper.includes('CRIT')) return 'text-red-300';
  if (upper.includes('WARN')) return 'text-amber-300';
  if (upper.includes('DEBUG')) return 'text-white/50';
  return 'text-emerald-300';
}

const LogsPanel = ({ dongleId }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState('ALL');
  const [downloadingKey, setDownloadingKey] = useState(null);

  const loadLogs = useCallback(async () => {
    if (!dongleId) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await fetchDeviceLogs(dongleId);
      setData(resp);
    } catch (err) {
      setError(err.message || 'Logs konnten nicht geladen werden');
    } finally {
      setLoading(false);
    }
  }, [dongleId]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const filteredSwaglogs = useMemo(() => {
    const entries = Array.isArray(data?.swaglogs) ? data.swaglogs : [];
    const q = query.trim().toLowerCase();
    return entries.filter((item) => {
      if (levelFilter !== 'ALL' && !String(item.level || '').toUpperCase().includes(levelFilter)) {
        return false;
      }
      if (!q) return true;
      return (
        String(item.message || '').toLowerCase().includes(q)
        || String(item.daemon || '').toLowerCase().includes(q)
      );
    });
  }, [data?.swaglogs, query, levelFilter]);

  const handleDownload = async (category, filename) => {
    const key = `${category}/${filename}`;
    setDownloadingKey(key);
    try {
      await downloadDeviceLog(dongleId, category, filename);
    } catch (err) {
      setError(err.message || 'Download fehlgeschlagen');
    } finally {
      setDownloadingKey(null);
    }
  };

  if (loading && !data) {
    return <div className="p-6 text-white/70">Lade Geräte-Logs & Speicherstatus…</div>;
  }

  const storage = data?.storage || { routeCount: 0, segmentCount: 0, totalBytes: 0 };
  const bootlogs = Array.isArray(data?.bootlogs) ? data.bootlogs : [];
  const crashlogs = Array.isArray(data?.crashlogs) ? data.crashlogs : [];

  return (
    <div className="flex flex-col gap-4 px-4 py-4 text-white">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">System-Logs & Speicher</h2>
          <p className="text-xs text-white/60">
            Routen: {storage.routeCount} · Segmente: {storage.segmentCount} · Belegter Speicher: {fmtBytes(storage.totalBytes)}
          </p>
        </div>
        <button
          type="button"
          onClick={loadLogs}
          className="rounded-md bg-white/10 hover:bg-white/20 px-3 py-1.5 text-xs font-semibold text-white cursor-pointer"
        >
          Aktualisieren
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/15 px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-lg border border-white/10 bg-[#1D2225] p-4">
          <h3 className="mb-2 text-sm font-semibold">Bootlogs ({bootlogs.length})</h3>
          {bootlogs.length === 0 ? (
            <p className="text-xs text-white/60">Noch keine Bootlogs hochgeladen.</p>
          ) : (
            <div className="max-h-60 overflow-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-white/10 text-white/60">
                  <tr>
                    <th className="py-1.5 pr-2">Datei</th>
                    <th className="py-1.5 pr-2">Größe</th>
                    <th className="py-1.5 pr-2">Upload</th>
                    <th className="py-1.5 text-right">Aktion</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {bootlogs.map((b) => (
                    <tr key={b.filename}>
                      <td className="py-1.5 pr-2 font-mono text-[11px]">{b.filename}</td>
                      <td className="py-1.5 pr-2">{fmtBytes(b.size)}</td>
                      <td className="py-1.5 pr-2 whitespace-nowrap">{dayjs(b.uploadedAt).format('DD.MM. HH:mm')}</td>
                      <td className="py-1.5 text-right">
                        <button
                          type="button"
                          disabled={downloadingKey === `boot/${b.filename}`}
                          onClick={() => handleDownload('boot', b.filename)}
                          className="rounded bg-white/10 hover:bg-white/20 px-2 py-0.5 text-[11px] cursor-pointer"
                        >
                          Download
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-white/10 bg-[#1D2225] p-4">
          <h3 className="mb-2 text-sm font-semibold">Crashlogs ({crashlogs.length})</h3>
          {crashlogs.length === 0 ? (
            <p className="text-xs text-white/60">Keine Crashlogs gemeldet.</p>
          ) : (
            <div className="max-h-60 overflow-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-white/10 text-white/60">
                  <tr>
                    <th className="py-1.5 pr-2">Datei</th>
                    <th className="py-1.5 pr-2">Größe</th>
                    <th className="py-1.5 pr-2">Upload</th>
                    <th className="py-1.5 text-right">Aktion</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {crashlogs.map((c) => (
                    <tr key={c.filename}>
                      <td className="py-1.5 pr-2 font-mono text-[11px]">{c.filename}</td>
                      <td className="py-1.5 pr-2">{fmtBytes(c.size)}</td>
                      <td className="py-1.5 pr-2 whitespace-nowrap">{dayjs(c.uploadedAt).format('DD.MM. HH:mm')}</td>
                      <td className="py-1.5 text-right">
                        <button
                          type="button"
                          disabled={downloadingKey === `crash/${c.filename}`}
                          onClick={() => handleDownload('crash', c.filename)}
                          className="rounded bg-white/10 hover:bg-white/20 px-2 py-0.5 text-[11px] cursor-pointer"
                        >
                          Download
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-white/10 bg-[#1D2225] p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Athena Swaglogs ({filteredSwaglogs.length})</h3>
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Suchen (Daemon / Text)…"
              className="rounded bg-black/40 border border-white/20 px-2.5 py-1 text-xs text-white"
            />
            <select
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value)}
              className="rounded bg-black/40 border border-white/20 px-2 py-1 text-xs text-white"
            >
              <option value="ALL">Alle Level</option>
              <option value="ERROR">ERROR</option>
              <option value="WARN">WARNING</option>
              <option value="INFO">INFO</option>
              <option value="DEBUG">DEBUG</option>
            </select>
          </div>
        </div>
        {filteredSwaglogs.length === 0 ? (
          <p className="text-xs text-white/60">Keine Swaglog-Einträge gefunden.</p>
        ) : (
          <div className="max-h-96 overflow-auto font-mono text-[11px] divide-y divide-white/5">
            {filteredSwaglogs.slice(0, 250).map((entry, idx) => (
              <div key={`${entry.timestamp}-${idx}`} className="py-1.5 flex gap-2">
                <span className="text-white/45 whitespace-nowrap">
                  {entry.timestamp ? dayjs(entry.timestamp).format('DD.MM HH:mm:ss') : '—'}
                </span>
                <span className={`font-semibold w-14 shrink-0 ${levelColor(entry.level)}`}>
                  {entry.level}
                </span>
                {entry.daemon && (
                  <span className="text-sky-300/80 shrink-0">[{entry.daemon}]</span>
                )}
                <span className="text-white/85 break-all">{entry.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default LogsPanel;
