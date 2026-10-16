import type { Settings } from '../types';
import { loadSettings } from './settings';

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface StreamReq {
  messages: LlmMessage[];
  characterName: string;
  signal?: AbortSignal;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 合并外部 signal 与超时：网络挂起时最多等 timeout 毫秒 */
function withTimeout(signal: AbortSignal | undefined, timeout: number): AbortSignal {
  const timer = AbortSignal.timeout(timeout);
  if (signal && 'any' in AbortSignal) return AbortSignal.any([signal, timer]);
  return timer;
}

/** 流式对话：统一 OpenAI 兼容接口与演示模式，逐段 yield 增量文本 */
export async function* streamChat(req: StreamReq): AsyncGenerator<string> {
  const s = loadSettings();
  if (s.provider === 'mock') {
    yield* mockStream(req);
    return;
  }
  const base = s.baseUrl.replace(/\/+$/, '');
  if (!base || !s.model) {
    throw new Error('未配置接口地址或模型名，请到「设置 → 模型接入」填写');
  }
  if (!s.apiKey.trim()) {
    throw new Error('还没有填写 API Key——到「设置 → 模型接入」填入密钥，或切回演示模式');
  }
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${s.apiKey}`,
    },
    body: JSON.stringify({
      model: s.model,
      messages: req.messages,
      temperature: s.temperature,
      stream: true,
    }),
    signal: withTimeout(req.signal, 60000),
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}：${text.slice(0, 300) || '请求失败'}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return;
      try {
        const j = JSON.parse(data) as { choices?: { delta?: { content?: string } }[] };
        const delta = j.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      } catch {
        // 忽略无法解析的行（如注释行）
      }
    }
  }
}

async function* mockStream(req: StreamReq): AsyncGenerator<string> {
  const lastUser = [...req.messages].reverse().find((m) => m.role === 'user')?.content ?? '';
  const reply =
    `（${req.characterName} 放下手中的杯子，饶有兴致地打量着你）\n\n` +
    `这是**演示模式**的回复——还没有接入真实模型。\n\n` +
    `> 你刚才说：${lastUser.slice(0, 100) || '……'}\n\n` +
    `打开「设置 → 模型接入」，填入任意 OpenAI 兼容接口（DeepSeek、Kimi、通义、OpenAI 等）的地址与密钥，` +
    `我就能真正开始扮演啦。`;
  for (let i = 0; i < reply.length; i += 3) {
    if (req.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    yield reply.slice(i, i + 3);
    await sleep(16);
  }
}

/** 一次性生成完整文本（AI 生成按钮用）。演示模式下返回示例文案，方便离线体验 */
export async function generateOnce(messages: LlmMessage[], mockFallback?: string): Promise<string> {
  const s = loadSettings();
  if (s.provider === 'mock') {
    await sleep(600);
    return mockFallback ?? '（演示模式生成的示例）一位喜欢穿米色风衣的旅行者，说话不紧不慢，总是随身带着一本写满了半个大陆的旧笔记。' +
      '偶尔冷幽默，习惯在句尾停顿半秒再抛出关键的那句话；相信地图之外还有值得迷路的地方。';
  }
  let acc = '';
  for await (const chunk of streamChat({ messages, characterName: '助手' })) acc += chunk;
  return acc.trim();
}

export interface SuggestionCtx {
  charName: string;
  charBrief: string;
  userName: string;
  userBrief: string;
  lastReply: string;
}

const SUGGESTION_PROMPT =
  '你是角色扮演的回复建议器。根据角色设定、用户人设和角色的最新回复，为用户想3条贴合双方人设、能推动剧情的下一句回复。' +
  '要求：每条一行，以"1. "、"2. "、"3. "开头；每条不超过40字；语气贴合用户人设；只输出这3行，不要任何解释。';

/** 生成 3 条候选回答（AI 回复后自动触发） */
export async function generateSuggestions(ctx: SuggestionCtx): Promise<string[]> {
  const mock = [
    `（小心翼翼地走近）这些发光的书……我可以碰吗？`,
    `（打量四周）你是这座书馆唯一的管理员吗？`,
    `（压低声音）老实说，我自己也不知道是怎么进来的。`,
  ];
  const text = await generateOnce(
    [
      { role: 'system', content: SUGGESTION_PROMPT },
      {
        role: 'user',
        content:
          `【${ctx.charName}的设定】\n${ctx.charBrief || '（无）'}\n\n` +
          `【${ctx.userName}的人设】\n${ctx.userBrief || '（无）'}\n\n` +
          `【${ctx.charName}的最新回复】\n${ctx.lastReply}`,
      },
    ],
    mock.join('\n'),
  );
  return text
    .split(/\n+/)
    .map((l) => l.replace(/^\s*\d+\s*[.、)）]\s*/, '').trim())
    .filter((l) => l.length > 0 && l.length <= 120)
    .slice(0, 3);
}

export async function testConnection(s: Settings): Promise<string> {
  if (s.provider === 'mock') return '演示模式无需连接真实模型';
  const base = s.baseUrl.replace(/\/+$/, '');
  if (!s.apiKey.trim()) throw new Error('请先填写 API Key');
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${s.apiKey}`,
    },
    body: JSON.stringify({ model: s.model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 5, stream: false }),
    signal: withTimeout(undefined, 20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}：${(await res.text()).slice(0, 200)}`);
  const j = (await res.json()) as { model?: string };
  return `连接成功：${j.model ?? s.model}`;
}
