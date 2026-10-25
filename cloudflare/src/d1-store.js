import { MAX_STORE_BYTES, RequestError } from '../../shared/limits.js';
import { normaliseStore } from '../../shared/model.js';

export class D1Store {
  constructor(db, initial = [], metadataOnly = [], maxStoreBytes = MAX_STORE_BYTES) {
    this.db = db;
    this.initial = initial;
    this.metadataOnly = new Set(metadataOnly);
    this.rows = new Map();
    this.loaded = new Set();
    this.maxStoreBytes = maxStoreBytes;
  }

  async load(keys) {
    const missing = keys.filter(key => !this.loaded.has(key));
    if (!missing.length) return;
    const hidden = missing.filter(key => this.metadataOnly.has(key));
    const visible = hidden.length ? `key NOT IN (${hidden.map(() => '?').join(',')}) AND ` : '';
    let result;
    try {
      result = await this.db.prepare(
        `SELECT key, length(CAST(value AS BLOB)) AS bytes, ` +
        `CASE WHEN ${visible}length(CAST(value AS BLOB)) <= ${this.maxStoreBytes} THEN value END AS value ` +
        `FROM settings WHERE key IN (${missing.map(() => '?').join(',')})`,
      ).bind(...hidden, ...missing).all();
    } catch (error) {
      if (String(error.cause?.message || error.message).includes('no such table: settings')) {
        throw new RequestError(503, 'Database setup is not finished. Complete the deployment setup first.');
      }
      throw error;
    }
    for (const key of missing) this.loaded.add(key);
    for (const row of result.results) this.rows.set(row.key, row);
  }

  async read(keys) {
    await this.load([...this.initial, ...keys]);
    const result = {};
    for (const key of keys) {
      const row = this.rows.get(key);
      if (!row) continue;
      if (row.bytes > this.maxStoreBytes) throw new RequestError(413, 'Stored data exceeds the selected mode limit. Switch back to the previous mode and reduce it before switching down. No data was deleted.');
      result[key] = JSON.parse(row.value);
    }
    return result;
  }

  async update(changes) {
    await this.db.batch(Object.entries(changes).map(([key, value]) => this.db.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    ).bind(key, JSON.stringify(value))));
  }

  async state() {
    const saved = await this.read(['accesskey', 'key_md5', 'groups']);
    return { data: normaliseStore(saved) };
  }

  async subscription(groupName) {
    const row = await this.db.prepare(
      "SELECT (SELECT value FROM settings WHERE key = 'key_md5') AS key_value, " +
      "(SELECT length(CAST(value AS BLOB)) FROM settings WHERE key = 'groups') AS bytes, " +
      `(SELECT CASE WHEN length(CAST(value AS BLOB)) <= ${this.maxStoreBytes} THEN (` +
      "SELECT json_extract(g.value, '$.links') FROM json_each(settings.value) AS g " +
      "WHERE json_extract(g.value, '$.name') = ? ORDER BY CAST(g.key AS INTEGER) LIMIT 1" +
      ") END FROM settings WHERE key = 'groups') AS links",
    ).bind(groupName).first();
    if (row.bytes > this.maxStoreBytes) throw new RequestError(413, 'Stored data exceeds the selected mode limit. Switch back to the previous mode to reduce it. No data was deleted.');
    return { key_md5: row.key_value ? JSON.parse(row.key_value) : '', links: row.links ? JSON.parse(row.links) : [] };
  }

  async isNew() {
    await this.load(['accesskey', 'key_md5', 'groups']);
    return !['accesskey', 'key_md5', 'groups'].some(key => this.rows.has(key));
  }
}

