import type { CharacterCard } from '../types';

// ---------- base64 工具（按 UTF-8 字节） ----------

export function utf8ToBase64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

// ---------- 角色卡 JSON 导入 / 导出 ----------

type Raw = Record<string, unknown>;

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}
function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/** 兼容 V2 卡（data 包裹）与裸 JSON */
export function parseCardJson(obj: Raw): Partial<CharacterCard> {
  const v2 = obj.data && typeof obj.data === 'object' ? (obj.data as Raw) : obj;
  return {
    name: str(v2.name).trim(),
    description: str(v2.description),
    personality: str(v2.personality),
    scenario: str(v2.scenario),
    firstMes: str(v2.first_mes),
    altGreetings: arr(v2.alternate_greetings).map(str).filter(Boolean),
    exampleDialogs: str(v2.mes_example),
    creatorNotes: str(v2.creator_notes),
    tags: arr(v2.tags).map(str).filter(Boolean),
  };
}

export function cardToJson(c: CharacterCard): Raw {
  return {
    spec: 'chara_card_v2',
    spec_version: '2.0',
    data: {
      name: c.name,
      description: c.description,
      personality: c.personality,
      scenario: c.scenario,
      first_mes: c.firstMes,
      mes_example: c.exampleDialogs,
      creator_notes: c.creatorNotes,
      tags: c.tags,
      alternate_greetings: c.altGreetings,
      extensions: {},
    },
  };
}

export async function importCardFromFile(file: File): Promise<Partial<CharacterCard>> {
  const card = parseCardJson(JSON.parse(await file.text()));
  if (!card.name) throw new Error('角色卡缺少名称字段（需为酒馆 V2 JSON 或含 name 的 JSON）');
  return card;
}

export function exportCardJson(c: CharacterCard): string {
  return JSON.stringify(cardToJson(c), null, 2);
}

export function downloadCardJson(c: CharacterCard) {
  const dataUrl = 'data:application/json;base64,' + utf8ToBase64(exportCardJson(c));
  downloadDataUrl(dataUrl, `${c.name || 'character'}.json`);
}
