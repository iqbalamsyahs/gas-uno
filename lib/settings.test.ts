import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadSettings, saveSettings } from './settings';

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  });
  return data;
}

afterEach(() => vi.unstubAllGlobals());

describe('loadSettings', () => {
  it('default kalau storage tidak tersedia (tidak ada localStorage)', () => {
    expect(loadSettings()).toEqual({ sound: true });
  });

  it('membaca nilai yang tersimpan', () => {
    fakeStorage({ 'uno.settings': JSON.stringify({ sound: false }) });
    expect(loadSettings()).toEqual({ sound: false });
  });

  it('nilai tidak sah diganti default, JSON rusak juga', () => {
    fakeStorage({ 'uno.settings': JSON.stringify({ sound: 'ya' }) });
    expect(loadSettings()).toEqual({ sound: true });
    fakeStorage({ 'uno.settings': '{rusak' });
    expect(loadSettings()).toEqual({ sound: true });
  });
});

describe('saveSettings', () => {
  it('disimpan lalu dibaca kembali', () => {
    fakeStorage();
    saveSettings({ sound: false });
    expect(loadSettings()).toEqual({ sound: false });
  });
});
