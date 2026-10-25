import { mkdir, open, readFile, rename, stat, lstat, unlink, chmod, chown } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { normaliseStore } from '../shared/model.js';

const locks = new Map();
async function locked(filename, operation) {
  const previous = locks.get(filename) || Promise.resolve();
  let release;
  const current = new Promise(resolve => { release = resolve; });
  locks.set(filename, current);
  await previous;
  try { return await operation(); } finally {
    release();
    if (locks.get(filename) === current) locks.delete(filename);
  }
}

export class JsonStore {
  constructor(directory) { this.directory = path.resolve(directory); }

  async readFile(name, tolerateInvalid = false) {
    return locked(path.join(this.directory, name), () => this.readUnlocked(name, tolerateInvalid));
  }

  async readUnlocked(name, tolerateInvalid = false) {
    try {
      const text = await readFile(path.join(this.directory, name), 'utf8');
      let data;
      try { data = JSON.parse(text); } catch (error) {
        if (tolerateInvalid) return {};
        throw error;
      }
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new TypeError(`Invalid ${name} object`);
      return data;
    } catch (error) {
      if (error.code === 'ENOENT') return {};
      throw error;
    }
  }

  async writeFile(name, data) {
    await mkdir(this.directory, { recursive: true });
    const filename = path.join(this.directory, name);
    const original = await stat(filename).catch(error => { if (error.code !== 'ENOENT') throw error; });
    const link = await lstat(filename).catch(error => { if (error.code !== 'ENOENT') throw error; });
    const serialized = JSON.stringify(data, null, 4);
    const inPlace = async () => {
      const file = await open(filename, 'w', 0o644);
      try { await file.writeFile(serialized, 'utf8'); await file.sync(); }
      finally { await file.close(); }
    };
    if (link?.isSymbolicLink()) return inPlace();
    const temporary = path.join(this.directory, `.${name}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`);
    let handle;
    let created = false;
    try {
      handle = await open(temporary, 'wx', original ? original.mode & 0o777 : 0o644);
      created = true;
      await handle.writeFile(serialized, 'utf8');
      await handle.sync();
      await handle.close(); handle = null;
      if (original) {
        await chmod(temporary, original.mode & 0o777);
        if (process.getuid?.() === 0) await chown(temporary, original.uid, original.gid).catch(error => {
          if (!['EPERM', 'EACCES', 'EINVAL'].includes(error.code)) throw error;
        });
      }
      await rename(temporary, filename);
    } catch (error) {
      if (original && ['EBUSY', 'EXDEV', 'EACCES', 'EPERM', 'EROFS'].includes(error.code)) {
        // A separately bind-mounted file cannot be replaced with rename. Match
        // the old backend's in-place write, under the same read/write mutex.
        return await inPlace();
      }
      throw error;
    } finally {
      if (handle) await handle.close();
      if (created) await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
    }
  }

  async data(unlocked = false) { return normaliseStore(await (unlocked ? this.readUnlocked('data.json', true) : this.readFile('data.json', true))); }

  async read(keys) {
    const result = {};
    if (keys.includes('users')) result.users = await this.readFile('users.json');
    if (keys.some(key => key !== 'users')) {
      const data = await this.data();
      for (const key of keys) if (key !== 'users' && Object.hasOwn(data, key)) result[key] = data[key];
    }
    return result;
  }

  async update(changes) {
    if (Object.hasOwn(changes, 'users')) {
      await locked(path.join(this.directory, 'users.json'), async () => {
        const users = await this.readUnlocked('users.json');
        await this.writeFile('users.json', { ...users, ...changes.users });
      });
    }
    const settings = Object.fromEntries(Object.entries(changes).filter(([key]) => key !== 'users'));
    if (Object.keys(settings).length) {
      await locked(path.join(this.directory, 'data.json'), async () => {
        const data = await this.data(true);
        await this.writeFile('data.json', { ...data, ...settings });
      });
    }
  }

  async state() {
    const { accesskey, key_md5, groups } = await this.data();
    return { data: { accesskey, key_md5, groups } };
  }
  async isNew() {
    try { await stat(path.join(this.directory, 'data.json')); return false; }
    catch (error) { if (error.code === 'ENOENT') return true; throw error; }
  }
  async subscription(groupName) {
    const data = await this.data();
    return { key_md5: data.key_md5, links: data.groups.find(group => group.name === groupName)?.links || [] };
  }
}
