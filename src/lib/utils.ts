export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(" ");
}

export function detectEncoding(buffer: Buffer): string {
  const jschardet = require("jschardet");
  const result = jschardet.detect(buffer);
  const encoding = result.encoding || "utf-8";
  // jschardet sometimes misdetects GBK as ISO-8859 — if confidence is low or encoding is ascii/iso-8859,
  // try decoding as GBK and verify by checking if the result contains valid CJK characters
  if (!encoding.match(/^(utf-?8|gbk|gb2312|gb18030|big5)$/i) && encoding !== "euc-kr" && encoding !== "shift_jis") {
    const iconv = require("iconv-lite");
    try {
      const gbkText = iconv.decode(buffer, "gbk");
      // Count CJK characters — if more than 10%, it's likely GBK
      const cjkCount = (gbkText.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
      if (cjkCount > gbkText.length * 0.1) {
        return "gbk";
      }
    } catch {}
    // Also try UTF-8 as fallback
    try {
      const utf8Text = iconv.decode(buffer, "utf-8");
      const cjkCount = (utf8Text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
      if (cjkCount > utf8Text.length * 0.1) {
        return "utf-8";
      }
    } catch {}
  }
  return encoding;
}

function stripAds(text: string): string {
  // Remove download site banners from the beginning of the file
  const AD_PATTERNS = [
    /^.*?(?:txt\d*\.com|txt80|八零电子书).*?[\r\n]+/i,
    /^.*?声明[：:]\s*本书为.*?(?:上传|存储|下载).*?[\r\n]+/,
    /^.*?本站只提供.*?(?:存储|下载).*?[\r\n]+/,
    /^.*?(?:版权|之版权).*?(?:无关|不负).*?[\r\n]+/,
    /^-{10,}.*?(?:上传|内容).*?-{10,}[\r\n]+/,
  ];
  for (const pattern of AD_PATTERNS) {
    text = text.replace(pattern, "");
  }
  // Remove leading empty lines after ad removal
  return text.replace(/^[\r\n\s]+/, "");
}

export function splitTxtIntoChapters(text: string): { title: string; content: string }[] {
  // Strip ads first
  text = stripAds(text);

  // Combined chapter marker: numbered chapters (第X章/节/回/卷/幕) and special markers (序幕/楔子/etc.)
  const CHAPTER_MARKER = /^\s*(?:第\s*[零一二三四五六七八九十百千万\d]+\s*[章节回卷幕]|序幕|楔子|序章|序言|前言|引子|尾声|终章|后记|番外)/gm;

  // Find all chapter marker positions
  const markers: { index: number; title: string }[] = [];
  let match: RegExpExecArray | null;
  while ((match = CHAPTER_MARKER.exec(text)) !== null) {
    const titleLine = match[0].trim();
    // Extract title (first line of the matched section start)
    const lineEnd = text.indexOf("\n", match.index);
    const title = lineEnd > match.index ? text.slice(match.index, lineEnd).trim() : titleLine;
    markers.push({ index: match.index, title });
  }

  if (markers.length > 1) {
    const chapters: { title: string; content: string }[] = [];

    // Content before first chapter marker — skip if it's just book metadata
    if (markers[0].index > 0) {
      const preContent = text.slice(0, markers[0].index).trim();
      // Skip metadata-only content: short + has author/intro patterns
      const isMetadata = preContent.length < 500 &&
        /作者|简介|内容|前言|目录/.test(preContent.split("\n").slice(0, 5).join("\n"));
      if (preContent.length > 50 && !isMetadata) {
        const preLines = preContent.split("\n").filter((l) => l.trim());
        const preTitle = preLines.length > 0 ? preLines[0].trim().slice(0, 30) : "前言";
        chapters.push({ title: preTitle, content: preContent });
      }
    }

    for (let i = 0; i < markers.length; i++) {
      const start = markers[i].index;
      const end = i + 1 < markers.length ? markers[i + 1].index : text.length;
      const chunk = text.slice(start, end).trim();
      const lines = chunk.split("\n");
      const title = markers[i].title;
      const content = lines.slice(1).join("\n").trim();
      if (content.length > 0) {
        chapters.push({ title, content });
      }
    }

    return chapters;
  }

  // Fallback: split by double-newline paragraphs, group into ~3000-char chapters
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim().length > 0);
  const blocks: { title: string; content: string }[] = [];
  let buffer = "";
  for (const p of paragraphs) {
    if (buffer && buffer.length + p.length > 3000) {
      blocks.push({ title: `第${blocks.length + 1}段`, content: buffer.trim() });
      buffer = p;
    } else {
      buffer = buffer ? buffer + "\n\n" + p : p;
    }
  }
  if (buffer.trim()) {
    blocks.push({ title: `第${blocks.length + 1}段`, content: buffer.trim() });
  }
  return blocks;
}

export function getRandomCoverColor(): string {
  const palette = [
    "#e8d5c4", "#d4c5b9", "#c9b8a8", "#e0d0c0",
    "#d9c7b8", "#ede0d4", "#c4b5a5", "#e5d5c5",
  ];
  return palette[Math.floor(Math.random() * palette.length)];
}

export function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}
