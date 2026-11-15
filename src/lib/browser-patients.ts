const prefix = 'diffmd-patient-v1:';
const changeEvent = 'diffmd-patients-change';
const patientIdPattern = /^LOCAL-[A-F0-9]{12}$/;

export type BrowserPatient = { id: string; name: string };

export function subscribeToPatients(onChange: () => void) {
  function onStorage(event: StorageEvent) {
    if (event.storageArea === localStorage && (event.key === null || event.key.startsWith(prefix))) {
      onChange();
    }
  }
  window.addEventListener('storage', onStorage);
  window.addEventListener(changeEvent, onChange);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(changeEvent, onChange);
  };
}

export function readBrowserPatients(): string {
  const patients: BrowserPatient[] = [];
  try {
    const storage = window.localStorage;
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (!key?.startsWith(prefix)) continue;
      const id = key.slice(prefix.length);
      if (!patientIdPattern.test(id)) continue;
      const name = storage.getItem(key);
      if (name?.trim() && name.length <= 80) patients.push({ id, name });
    }
  } catch {
    return '[]';
  }
  return JSON.stringify(patients);
}

export function createBrowserPatient(name: string): BrowserPatient | null {
  try {
    const id = 'LOCAL-' + crypto.randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase();
    window.localStorage.setItem(prefix + id, name);
    window.dispatchEvent(new Event(changeEvent));
    return { id, name };
  } catch {
    return null;
  }
}

export function readBrowserNote(id: string, side: 'earlier' | 'later'): string {
  try {
    return window.localStorage.getItem(`${prefix}${id}:${side}`) ?? '';
  } catch {
    return '';
  }
}

export function saveBrowserNote(id: string, side: 'earlier' | 'later', value: string): boolean {
  try {
    const key = `${prefix}${id}:${side}`;
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
    window.dispatchEvent(new Event(changeEvent));
    return true;
  } catch {
    return false;
  }
}
