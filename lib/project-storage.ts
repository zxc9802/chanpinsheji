const DATABASE_NAME = "packaging-agent";
const DATABASE_VERSION = 1;
const STORE_NAME = "project-state";
const CURRENT_PROJECT_KEY = "current";
const PROJECT_INDEX_KEY = "project-index";
const projectKey = (projectId: string) => `project:${projectId}`;

export interface StoredProjectSummary {
  projectId: string;
  name: string;
  brandName: string;
  productName: string;
  completedSteps: number[];
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StoredProjectIndex {
  activeProjectId: string;
  projects: StoredProjectSummary[];
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("无法打开 IndexedDB"));
    request.onblocked = () => reject(new Error("项目数据库正在被其他页面占用，请关闭旧页面后重试"));
  });
}

export async function loadProjectState<T>(projectId?: string) {
  const database = await openDatabase();
  try {
    return await new Promise<T | null>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(projectId ? projectKey(projectId) : CURRENT_PROJECT_KEY);
      request.onsuccess = () => resolve((request.result as T | undefined) || null);
      request.onerror = () => reject(request.error || new Error("读取项目失败"));
    });
  } finally { database.close(); }
}

export async function saveProjectState<T>(state: T, projectId?: string) {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(state, projectId ? projectKey(projectId) : CURRENT_PROJECT_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("保存项目失败"));
      transaction.onabort = () => reject(transaction.error || new Error("项目保存事务被中止"));
    });
  } finally { database.close(); }
}

export async function loadProjectIndex() {
  const database = await openDatabase();
  try {
    return await new Promise<StoredProjectIndex | null>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(PROJECT_INDEX_KEY);
      request.onsuccess = () => resolve((request.result as StoredProjectIndex | undefined) || null);
      request.onerror = () => reject(request.error || new Error("读取项目列表失败"));
    });
  } finally { database.close(); }
}

export async function saveProjectIndex(index: StoredProjectIndex) {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(index, PROJECT_INDEX_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("保存项目列表失败"));
      transaction.onabort = () => reject(transaction.error || new Error("项目列表保存事务被中止"));
    });
  } finally { database.close(); }
}

export async function requestPersistentProjectStorage() {
  try {
    if (navigator.storage?.persist) await navigator.storage.persist();
  } catch { /* 浏览器不支持持久化授权时仍可正常使用 IndexedDB。 */ }
}
