import { type Workspace, initialWorkspace, validateBoard } from "./model";
export const storageKey = "rtboard.workspace.v1";
export function readLegacy(): Workspace {
  try {
    const data = JSON.parse(localStorage.getItem(storageKey) || "null");
    if (data && Array.isArray(data.boards)) {
      const boards = data.boards.map((b: unknown) => {
        const board = validateBoard(b);
        return { ...board, id: (b as { id: string }).id };
      });
      return {
        boards,
        active: boards.some((b: { id: string }) => b.id === data.active)
          ? data.active
          : boards[0]?.id || "",
      };
    }
  } catch {}
  return initialWorkspace();
}
const openDB = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open("rtboard", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("workspace");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
export async function readWorkspace() {
  try {
    const db = await openDB();
    const data = await new Promise<Workspace>((resolve, reject) => {
      const req = db
        .transaction("workspace")
        .objectStore("workspace")
        .get("current");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (data && Array.isArray(data.boards)) {
      const boards = data.boards.map((b) => ({
        ...validateBoard(b),
        id: b.id,
      }));
      return {
        boards,
        active: boards.some((b) => b.id === data.active)
          ? data.active
          : boards[0]?.id || "",
      };
    }
  } catch {}
  return readLegacy();
}
export async function saveWorkspace(workspace: Workspace) {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("workspace", "readwrite");
      tx.objectStore("workspace").put(workspace, "current");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
    try {
      localStorage.removeItem(storageKey);
    } catch {}
  } catch {
    localStorage.setItem(storageKey, JSON.stringify(workspace));
  }
}
