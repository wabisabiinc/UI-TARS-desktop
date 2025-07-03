// sessionTitle.ts
export function generateSessionTitle(prompt: string): string {
  if (!prompt) return '新しいセッション';
  return prompt.trim().slice(0, 24) + (prompt.length > 24 ? '...' : '');
}
