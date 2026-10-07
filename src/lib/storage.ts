// Local-only persistence: uploaded files go to IndexedDB, project settings to localStorage.

const DB_NAME = 'content-maker';
const STORE = 'files';
const STATE_KEY = 'content-maker:project';

function openDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, 1);
		req.onupgradeneeded = () => req.result.createObjectStore(STORE);
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const req = fn(db.transaction(STORE, mode).objectStore(STORE));
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	}).finally(() => db.close()) as Promise<T>;
}

export async function saveFile(key: string, file: File | null) {
	try {
		await tx('readwrite', (s) => (file ? s.put(file, key) : s.delete(key)));
	} catch (e) {
		console.warn('Could not persist file', e);
	}
}

export async function saveFiles(key: string, files: File[]) {
	try {
		await tx('readwrite', (s) => s.put(files, key));
	} catch (e) {
		console.warn('Could not persist files', e);
	}
}

export async function loadFiles(key: string): Promise<File[]> {
	try {
		return (await tx<File[] | undefined>('readonly', (s) => s.get(key))) ?? [];
	} catch {
		return [];
	}
}

export async function loadFile(key: string): Promise<File | undefined> {
	try {
		return await tx<File | undefined>('readonly', (s) => s.get(key));
	} catch {
		return undefined;
	}
}

export function saveState(state: unknown) {
	try {
		localStorage.setItem(STATE_KEY, JSON.stringify(state));
	} catch {
		/* storage full or unavailable */
	}
}

export function loadState<T>(): Partial<T> | null {
	try {
		const raw = localStorage.getItem(STATE_KEY);
		return raw ? JSON.parse(raw) : null;
	} catch {
		return null;
	}
}
