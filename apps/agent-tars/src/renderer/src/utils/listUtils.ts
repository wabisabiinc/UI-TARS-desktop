// 箇条書きリストを抽出するユーティリティ
export function extractBulletList(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^(\d+\.)\s+|^[-*]\s+/.test(line))
    .map((line) => line.replace(/^(\d+\.)\s+|^[-*]\s+/, ''));
}
