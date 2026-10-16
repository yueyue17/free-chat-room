export interface StylePreset {
  id: string;
  label: string;
  prompt: string;
}

/** 文风预设：作为快捷填充写入自定义文风框 */
export const STYLE_PRESETS: StylePreset[] = [
  {
    id: 'youth',
    label: '青春文艺',
    prompt:
      '青春文艺风：描写清新细腻，多用短句与意象（光、风、雨、季节、旧物），情感克制而真挚，' +
      '对话自然、带一点懵懂与心动，避免华丽辞藻堆砌。',
  },
  {
    id: 'bingxin',
    label: '仿冰心',
    prompt:
      '仿冰心文风：语言温婉清丽、平实而含深情，善用柔和慈爱的笔调与第二人称倾诉，' +
      '叙事间常嵌入一句繁星春水式的哲思短句，多用"罢""么"等温和语气词，整体如月光般澄澈。',
  },
  {
    id: 'dostoevsky',
    label: '仿陀思妥耶夫斯基',
    prompt:
      '仿陀思妥耶夫斯基文风：心理描写浓烈绵密，长句与内心独白交错，' +
      '人物在自我拷问、矛盾与狂热中挣扎，情绪陡然转折，带有强烈的哲学追问与情感张力，对话常带辩经式的往复。',
  },
];

export const REPLY_LENGTH_PRESETS = ['', '50-150字', '150-400字', '400-800字'];
