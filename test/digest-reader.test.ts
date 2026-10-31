import { describe, expect, it } from 'vitest';
import { foldNight, readNight } from '../src/digest/reader.js';

describe('digest reader', () => {
  it('reads 2026-10-28: 5 jobs, 1 bad line', () => {
    const n = readNight('runs', '2026-10-28');
    expect(n).not.toBeNull();
    expect(n!.badLines).toBe(1);
    expect(n!.rows.map((r) => r.job)).toEqual(['digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs']);
  });

  it('folds runs, retries and the last status per job', () => {
    const rows = readNight('runs', '2026-10-28')!.rows;
    const refresh = rows.find((r) => r.job === 'fixtures/refresh')!;
    expect(refresh).toMatchObject({ runs: 4, retries: 3, lastStatus: 'ok', lastError: null, first: '2026-10-29T01:30:00+01:00', last: '2026-10-29T01:37:00+01:00' });
    const backup = rows.find((r) => r.job === 'notes/backup')!;
    expect(backup).toMatchObject({ runs: 1, lastStatus: 'fail', lastError: 'quota exceeded', owner: 'lane-07' });
    const sync = rows.find((r) => r.job === 'lane/sync')!;
    expect(sync).toMatchObject({ runs: 8, retries: 1, lastStatus: 'ok' });
  });

  it('keeps a row whose owner is null', () => {
    const render = readNight('runs', '2026-10-28')!.rows.find((r) => r.job === 'digest/render')!;
    expect(render.owner).toBeNull();
  });

  it('returns null for a night with no file', () => {
    expect(readNight('runs', '2026-01-01')).toBeNull();
    expect(readNight('runs', '../etc')).toBeNull();
  });

  it('counts bad lines and still renders an empty night', () => {
    expect(foldNight('x', '')).toEqual({ night: 'x', rows: [], badLines: 0 });
    expect(foldNight('x', 'nope\n{"at":1}\n')).toEqual({ night: 'x', rows: [], badLines: 2 });
  });
});
