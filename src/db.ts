import Dexie, { type Table } from 'dexie';
import type { Beautifier, CharacterCard, ChatMessage, ChatSession, Persona, RegexRule, StatusBarPreset, WorldBook } from './types';
import { defaultStatusBars, STATUSBAR_VER } from './lib/statusbar';
import { defaultBeautifiers } from './lib/beautify';
import { uid } from './db-util';

class TavernDB extends Dexie {
  characters!: Table<CharacterCard, string>;
  sessions!: Table<ChatSession, string>;
  messages!: Table<ChatMessage, string>;
  worldbooks!: Table<WorldBook, string>;
  regexRules!: Table<RegexRule, string>;
  personas!: Table<Persona, string>;
  statusBars!: Table<StatusBarPreset, string>;
  beautifiers!: Table<Beautifier, string>;

  constructor() {
    super('ai-tavern');
    this.version(1).stores({
      characters: 'id, updatedAt',
      sessions: 'id, characterId, updatedAt',
      messages: 'id, sessionId, [sessionId+ts]',
      worldbooks: 'id, name',
    });
    this.version(2).stores({
      characters: 'id, updatedAt',
      sessions: 'id, characterId, updatedAt',
      messages: 'id, sessionId, [sessionId+ts]',
      worldbooks: 'id, name',
      regexRules: 'id, name',
    });
    this.version(3).stores({
      characters: 'id, updatedAt',
      sessions: 'id, characterId, updatedAt',
      messages: 'id, sessionId, [sessionId+ts]',
      worldbooks: 'id, name',
      regexRules: 'id, name',
      personas: 'id, name',
      statusBars: 'id, name',
    });
    this.version(4).stores({
      characters: 'id, updatedAt',
      sessions: 'id, characterId, updatedAt',
      messages: 'id, sessionId, [sessionId+ts]',
      worldbooks: 'id, name',
      regexRules: 'id, name',
      personas: 'id, name',
      statusBars: 'id, name',
      beautifiers: 'id, name',
    });
  }
}

export const db = new TavernDB();

export { uid } from './db-util';

export const now = () => Date.now();

/** 首次启动时写入内置状态栏预设，并把旧版本内置预设升级到最新（幂等；用户自建的同名预设不受影响） */
export async function ensureStatusBarPresets() {
  for (const d of defaultStatusBars) {
    const found = await db.statusBars.where('name').equals(d.name).toArray();
    if (found.length === 0) {
      await db.statusBars.add({ ...d, id: uid() });
    } else {
      const stale = found.filter((r) => (r.ver ?? 0) < STATUSBAR_VER);
      if (stale.length) await db.statusBars.bulkPut(stale.map((r) => ({ ...r, ...d, ver: STATUSBAR_VER })));
    }
  }
}

/** 首次启动时写入内置美化预设（默认未认可，需在正则页预览后开启） */
export async function ensureBeautifiers() {
  const count = await db.beautifiers.count();
  if (count === 0) {
    await db.beautifiers.bulkAdd(defaultBeautifiers.map((b) => ({ ...b, id: uid() })));
  }
}

export async function createSessionWithGreeting(characterId: string): Promise<string> {
  const char = await db.characters.get(characterId);
  if (!char) throw new Error('角色不存在');
  const greetings = [char.firstMes, ...(char.altGreetings ?? [])].filter((g) => g && g.trim());
  const greeting = greetings.length ? greetings[Math.floor(Math.random() * greetings.length)] : '';
  const sid = uid();
  await db.transaction('rw', db.sessions, db.messages, async () => {
    await db.sessions.add({ id: sid, characterId, title: char.name || '新聊天', createdAt: now(), updatedAt: now() });
    if (greeting) {
      await db.messages.add({ id: uid(), sessionId: sid, role: 'assistant', content: greeting, swipes: [greeting], activeSwipe: 0, ts: now() });
    }
  });
  return sid;
}

export async function deleteSession(id: string) {
  await db.transaction('rw', db.sessions, db.messages, async () => {
    await db.messages.where('sessionId').equals(id).delete();
    await db.sessions.delete(id);
  });
}

export async function deleteCharacter(id: string) {
  const sessions = await db.sessions.where('characterId').equals(id).toArray();
  for (const s of sessions) await deleteSession(s.id);
  await db.characters.delete(id);
}
