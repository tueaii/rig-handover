import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseLine } from './reader.js';

export type NightCounts = { ok: number; retry: number; fail: number };

// Run lines by status for one night. Bad lines are not counted. null when the file can't be read.
export function countNight(runsDir: string, night: string): NightCounts | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(night)) return null;
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch {
    return null;
  }
  const counts: NightCounts = { ok: 0, retry: 0, fail: 0 };
  for (const raw of text.split('\n')) {
    if (raw.trim() === '') continue;
    const l = parseLine(raw);
    if (l) counts[l.status]++;
  }
  return counts;
}
