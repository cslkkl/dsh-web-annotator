/** Large screenshot queues belong in IndexedDB, outside localStorage's small shared quota. */
const databaseName = 'dsh-web-annotator';
const table = 'queues';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let blocked = false;
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(table);
    request.onsuccess = () => {
      if (blocked) request.result.close();
      else resolve(request.result);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      blocked = true;
      reject(new Error('annotation-storage-blocked'));
    };
  });
}

/** Read or atomically replace one session queue, closing the connection after the transaction.
 * @param key - framework-resolved session identity.
 * @param operation - read, replace or delete.
 * @param value - queue data to replace.
 * @returns previously stored data for reads.
 */
export async function annotationStorage(
  key: string,
  operation: 'read' | 'write' | 'delete',
  value?: unknown,
): Promise<unknown> {
  const database = await open();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(
        table,
        operation === 'read' ? 'readonly' : 'readwrite',
      );
      const store = transaction.objectStore(table);
      const request =
        operation === 'read'
          ? store.get(key)
          : operation === 'write'
            ? store.put(value, key)
            : store.delete(key);
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(transaction.error || request.error);
      transaction.onerror = () => reject(transaction.error || request.error);
    });
  } finally {
    database.close();
  }
}
