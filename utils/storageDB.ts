
const DB_NAME = 'SapaSafetyDB';
const STORE_NAME = 'keyval';

export const StorageDB = {
  db: null as IDBDatabase | null,
  initPromise: null as Promise<void> | null,
  
  async init() {
    // 1. If DB is already open, reuse it.
    if (this.db) return;
    
    // 2. If initialization is currently running, wait for that same promise (Singleton).
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      
      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        
        // Handle unexpected closures
        this.db.onclose = () => {
            this.db = null;
            this.initPromise = null;
        };
        
        resolve();
      };
      
      request.onerror = (event) => {
          this.initPromise = null;
          console.error("IndexedDB Open Error:", (event.target as IDBOpenDBRequest).error);
          reject((event.target as IDBOpenDBRequest).error);
      };
    });

    return this.initPromise;
  },

  // [NEW] Explicitly close connection. 
  // This is crucial during bulk restores to force the browser to flush changes to disk.
  async close() {
      if (this.db) {
          this.db.close();
          this.db = null;
          this.initPromise = null;
      }
  },

  async get<T>(key: string): Promise<T | null> {
    await this.init();
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error("Database not initialized"));
      try {
          const tx = this.db.transaction(STORE_NAME, 'readonly');
          const store = tx.objectStore(STORE_NAME);
          const req = store.get(key);
          req.onsuccess = () => resolve(req.result === undefined ? null : req.result);
          req.onerror = () => reject(req.error);
      } catch (e) {
          reject(e);
      }
    });
  },

  async set(key: string, value: any) {
    await this.init();
    return new Promise<void>((resolve, reject) => {
      if (!this.db) return reject(new Error("Database not initialized"));
      try {
          const tx = this.db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          const req = store.put(value, key);
          
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          req.onerror = () => reject(req.error);
      } catch (e) {
          reject(e);
      }
    });
  },
  
  async del(key: string) {
    await this.init();
    return new Promise<void>((resolve, reject) => {
      if (!this.db) return reject(new Error("Database not initialized"));
      try {
          const tx = this.db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          const req = store.delete(key);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          req.onerror = () => reject(req.error);
      } catch (e) {
          reject(e);
      }
    });
  },

  async clear() {
    await this.init();
    return new Promise<void>((resolve, reject) => {
      if (!this.db) return reject(new Error("Database not initialized"));
      try {
          const tx = this.db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          const req = store.clear();
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          req.onerror = () => reject(req.error);
      } catch (e) {
          reject(e);
      }
    });
  }
};
