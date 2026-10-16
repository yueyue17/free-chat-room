export type Role = 'user' | 'assistant' | 'system';

export interface CharacterCard {
  id: string;
  name: string;
  avatar?: string; // dataURL
  description: string;
  personality: string;
  scenario: string;
  firstMes: string;
  altGreetings: string[];
  exampleDialogs: string;
  creatorNotes: string;
  tags: string[];
  worldBookIds: string[];
  personaId?: string; // 绑定的用户人设：与该角色聊天时默认使用
  createdAt: number;
  updatedAt: number;
}

/** 用户人设（可建多份，绑定到角色） */
export interface Persona {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * 状态栏预设：启用后 (a) 每次对话注入 prompt 指示 AI 输出状态块；
 * (b) 显示层正则把状态块渲染成样式化面板；(c) 提示词层正则清理历史中的旧状态块
 */
export interface StatusBarPreset {
  id: string;
  name: string;
  enabled: boolean;
  prompt: string; // 注入到系统提示的指令
  marker: string; // AI 输出的标记行，如 【状态栏】
  displayFind: string; // 显示层正则
  displayReplace: string;
  promptFind: string; // 提示词层正则（清理历史）
  promptReplace: string;
  ver?: number; // 内置预设版本号，用于自动升级
}

/** 美化预设：注入提示词供 AI 在剧情中选用，显示层把标记渲染成富卡片；需在正则页预览认可后才可挂载 */
export interface Beautifier {
  id: string;
  name: string;
  prompt: string; // 注入的指令（AI 自行决定是否使用）
  sample: string; // 预览用示例输出
  rules: { find: string; replace: string }[]; // 显示层正则（顺序执行）
  approved: boolean; // 用户预览认可后才能在聊天中挂载
}

export interface WorldEntry {
  id: string;
  keys: string[];
  content: string;
  constant: boolean; // 常驻：每次都注入
  enabled: boolean;
  order: number; // 优先级，越小越靠前
}

export interface WorldBook {
  id: string;
  name: string;
  entries: WorldEntry[];
}

export type RegexScope = 'display' | 'prompt' | 'both';
export type RegexTarget = 'ai' | 'user' | 'both';

/** 自定义正则规则（参考 SillyTavern Regex 扩展：显示层替换 / 提示词层替换） */
export interface RegexRule {
  id: string;
  name: string;
  find: string; // 支持 "/pattern/flags" 或裸模式
  replace: string; // 支持 $1 捕获组引用
  scope: RegexScope; // 作用层：仅显示 / 仅发给AI / 两者
  target: RegexTarget; // 应用对象：AI回复 / 用户消息 / 两者
  enabled: boolean;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: Role;
  content: string;
  swipes?: string[]; // 重新生成的多个备选回复
  activeSwipe?: number;
  suggestions?: string[]; // AI 回复后生成的候选回答
  ts: number;
}

export interface ChatSession {
  id: string;
  characterId: string;
  title: string;
  // ---- 聊天设置（抽屉页 A）----
  replyLength?: string; // 回复字数要求，如 "150-400字"，空为不限
  styleText?: string; // 文风要求（自定义文本，预设 chips 仅作快捷填充）
  styleId?: string; // 最近选中的文风预设 id（仅用于高亮）
  plotDirection?: string; // 剧情走向
  assistOn?: boolean; // 辅助回复（候选回答）开关，默认开
  // ---- 扩展（抽屉页 B）----
  mountedIds?: string[]; // 挂载的美化预设（提示词注入，AI 选用）
  bubbleStyle?: string; // 气泡样式：default / qq / wx / paper
  bgImage?: string; // 聊天背景图 dataURL
  createdAt: number;
  updatedAt: number;
}

export type ProviderType = 'mock' | 'openai';
export type ThemeId = 'mono' | 'green' | 'blue' | 'red';

export interface Settings {
  provider: ProviderType;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxHistory: number; // 参与上下文的最大历史消息数
  worldBookBudget: number; // 世界书注入的最大字符数
  userName: string;
  userDescription: string;
  theme: ThemeId;
  customCss: string;
}
