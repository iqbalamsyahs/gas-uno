// Pengaturan per perangkat. Disimpan di localStorage; kalau storage tidak tersedia, pakai default.
// Kecepatan bot bukan di sini: itu pengaturan per meja, diatur host di lobi.
export type Settings = { sound: boolean };

const KEY = 'uno.settings';
const DEFAULTS: Settings = { sound: true };

export function loadSettings(): Settings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Settings> | null;
    if (!raw) return DEFAULTS;
    return { sound: typeof raw.sound === 'boolean' ? raw.sound : DEFAULTS.sound };
  } catch {
    return DEFAULTS;
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // storage diblokir: pengaturan hanya berlaku untuk sesi ini
  }
}
