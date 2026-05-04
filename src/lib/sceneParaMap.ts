/**
 * 把章节内容按 \n+ 拆段,过滤掉空白段。
 * 与后端 services.ts:330 splitTextIntoScenes 中的拆段规则保持一致,
 * 保证前后端段落数对齐。
 */
export function splitParagraphs(content: string): string[] {
  return content.split(/\n+/).filter((p) => p.trim().length > 0);
}

/**
 * 建立 sceneIdx → paragraphIdx 的映射表。
 *
 * 后端 splitTextIntoScenes 把每段按 ≤500 字 → 1 个 scene、
 * >500 字 → 按句号切分多个 scene。所以 scenes 与 paragraphs 顺序一致,
 * 且每段对应连续若干个 scene。
 *
 * 用 running cursor 的 indexOf,可以正确处理:
 *   - 同一文本片段在章节内重复出现
 *   - 长段被拆成多 scene 时,后续 scene 的起点也能精确定位
 *
 * 找不到精确匹配时,降级用当前 cursor — 段索引仍单调前进,不卡死。
 */
export function buildSceneToPara(
  content: string,
  scenes: { text: string }[],
  paragraphs: string[]
): number[] {
  // 1. 算每段在 content 中的起始下标
  const paraStarts: number[] = [];
  let cursor = 0;
  for (const p of paragraphs) {
    const idx = content.indexOf(p, cursor);
    const start = idx >= 0 ? idx : cursor;
    paraStarts.push(start);
    cursor = start + p.length;
  }

  // 2. 顺序扫 scenes,每个 scene 落在哪段
  const map: number[] = [];
  cursor = 0;
  let pIdx = 0;
  for (const s of scenes) {
    const t = s.text.trim();
    let start = content.indexOf(t, cursor);
    if (start < 0) start = cursor;
    while (pIdx < paragraphs.length - 1 && start >= paraStarts[pIdx + 1]) {
      pIdx++;
    }
    map.push(pIdx);
    cursor = start + t.length;
  }
  return map;
}
