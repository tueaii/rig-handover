// Plan morning-digest § 1. The shape every part of the digest builds against.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One job's night, folded from its run lines.
export type DigestRow = {
  job: string;
  owner: string | null; // rendered as `—` when null
  runs: number;
  retries: number;
  lastStatus: RunStatus;
  lastError: string | null;
  first: string; // `at` as logged, offset kept
  last: string;
};

export type Night = {
  night: string; // YYYY-MM-DD
  rows: DigestRow[]; // sorted by job
  badLines: number; // lines that didn't parse, counted, never thrown
};

// null when runs/<night>.jsonl doesn't exist.
export type ReadNight = (runsDir: string, night: string) => Night | null;
