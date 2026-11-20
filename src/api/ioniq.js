import { request } from '../api';

export function fetchIoniqOverview(dongleId) {
  return request.get(`api/ioniq/${encodeURIComponent(dongleId)}/overview`);
}

export function fetchIoniqRecording(dongleId, recId) {
  return request.get(`api/ioniq/${encodeURIComponent(dongleId)}/recordings/${encodeURIComponent(recId)}`);
}

export function logDriveRefuel(dongleId, payload) {
  return request.post(`api/ioniq/${encodeURIComponent(dongleId)}/refuel`, payload);
}

export function fetchDeviceLogs(dongleId) {
  return request.get(`api/logs/${encodeURIComponent(dongleId)}`);
}

export async function downloadDeviceLog(dongleId, category, filename) {
  const url = `${request.baseUrl}api/logs/${encodeURIComponent(dongleId)}/download/${encodeURIComponent(category)}/${encodeURIComponent(filename)}`;
  const resp = await fetch(url, {
    method: 'GET',
    headers: {
      ...(request.headers.Authorization ? { Authorization: request.headers.Authorization } : {}),
    },
  });
  if (!resp.ok) {
    throw new Error(`Download fehlgeschlagen (${resp.status})`);
  }
  const blob = await resp.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
