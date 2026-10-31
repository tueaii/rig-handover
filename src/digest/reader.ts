import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, Night, ReadNight, RunStatus } from './types.js';

// Plan morning-digest § 1. One JSON object per line: at, job, status, owner, optional error.
type RunLine = { at: string; job: string; status: RunStatus; owner: string | null; error?: string };

const STATUSES: readonly RunStatus[] = ['ok', 'retry', 'fail'];

// Parse at the edge: anything that isn't a well-formed run line is null, and counted by the caller.
export function parseLine(line: string): RunLine | null {
  let v: unknown;
  try {
    v = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.at !== 'string' || typeof o.job !== 'string') return null;
  if (!STATUSES.includes(o.status as RunStatus)) return null;
  if (o.owner !== null && typeof o.owner !== 'string') return null;
  if (o.error !== undefined && typeof o.error !== 'string') return null;
  return { at: o.at, job: o.job, status: o.status as RunStatus, owner: o.owner, error: o.error as string | undefined };
}

// Lines in file order are the night's order; the last line of a job decides its last status.
export function foldNight(night: string, text: string): Night {
  const rows = new Map<string, DigestRow>();
  let badLines = 0;
  for (const raw of text.split('\n')) {
    if (raw.trim() === '') continue;
    const l = parseLine(raw);
    if (!l) {
      badLines++;
      continue;
    }
    const r = rows.get(l.job);
    if (!r) {
      rows.set(l.job, {
        job: l.job,
        owner: l.owner,
        runs: 1,
        retries: l.status === 'retry' ? 1 : 0,
        lastStatus: l.status,
        lastError: l.error ?? null,
        first: l.at,
        last: l.at,
      });
      continue;
    }
    r.runs++;
    if (l.status === 'retry') r.retries++;
    r.lastStatus = l.status;
    r.lastError = l.error ?? null;
    r.owner = l.owner ?? r.owner;
    r.last = l.at;
  }
  return { night, rows: [...rows.values()].sort((a, b) => a.job.localeCompare(b.job)), badLines };
}

export const readNight: ReadNight = (runsDir, night) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(night)) return null;
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch {
    return null;
  }
  return foldNight(night, text);
};
