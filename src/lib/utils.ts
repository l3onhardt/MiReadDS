export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(" ");
}

export function detectEncoding(buffer: Buffer): string {
  const jschardet = require("jschardet");
  const result = jschardet.detect(buffer);
  return result.encoding || "utf-8";
}

export function splitTxtIntoChapters(text: string): { title: string; content: string }[] {
  const CHAPTER_PATTERNS = [
    /^\s*第\s*[零一二三四五六七八九十百千万\d]+\s*[章节回卷][\s\S]*?(?=^\s*第\s*[零一二三四五六七八九十百千万\d]+\s*[章节回卷]|$)/gm,
    /^\s*(楔子|序章|序言|前言|引子|尾声|终章|后记|番外)[\s\S]*?(?=^\s*第\s*[零一二三四五六七八九十百千万\d]+\s*[章节回卷]|楔子|序章|尾声|终章|后记|番外|$)/gm,
  ];

  for (const pattern of CHAPTER_PATTERNS) {
    const matches = text.match(pattern);
    if (matches && matches.length > 1) {
      return matches.map((chunk) => {
        const lines = chunk.trim().split("\n");
        const title = lines[0].trim();
        const content = lines.slice(1).join("\n").trim();
        return { title, content };
      });
    }
  }

  // Fallback: split by 5000-character blocks
  const blocks: { title: string; content: string }[] = [];
  for (let i = 0; i < text.length; i += 5000) {
    blocks.push({
      title: `第${blocks.length + 1}段`,
      content: text.slice(i, i + 5000).trim(),
    });
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
