import '@testing-library/jest-dom/vitest';
import 'whatwg-fetch';
import { vi } from 'vitest';

// Node 25 experimental webstorage compatibility for jsdom
if (typeof window !== 'undefined' && (!window.localStorage || typeof window.localStorage.getItem !== 'function')) {
  let store = {};
  const mockStorage = {
    getItem: vi.fn((key) => (key in store ? store[key] : null)),
    setItem: vi.fn((key, value) => { store[key] = String(value); }),
    removeItem: vi.fn((key) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
    key: vi.fn((idx) => Object.keys(store)[idx] || null),
    get length() { return Object.keys(store).length; },
  };
  Object.defineProperty(window, 'localStorage', { value: mockStorage, writable: true, configurable: true });
  Object.defineProperty(globalThis, 'localStorage', { value: mockStorage, writable: true, configurable: true });
}

vi.mock('localforage');

vi.mock('mapbox-gl/dist/mapbox-gl', () => ({
  GeolocateControl: vi.fn(),
  Map: vi.fn(() => ({
    addControl: vi.fn(),
    on: vi.fn(),
    remove: vi.fn(),
  })),
}));
