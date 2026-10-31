import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const FULL = '2026-10-20';
const EMPTY = '2026-10-21';
const BAD = '2026-10-22';
const MISSING = '2026-10-23';

const line = (o: Record<string, unknown>) => JSON.stringify(o);
const at = (m: string) => `2026-10-20T02:${m}:00+01:00`;

let dir: string;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-digest-'));
  // Written out of job order on purpose: rows must come back sorted by job.
  const full = [
    line({ at: at('00'), job: 'zeta-sync', status: 'ok', owner: 'sam' }),
    line({ at: at('01'), job: 'alpha-backup', status: 'retry', owner: 'kim', error: 'timeout' }),
    line({ at: at('02'), job: 'alpha-backup', status: 'retry', owner: 'kim', error: 'timeout' }),
    line({ at: at('03'), job: 'alpha-backup', status: 'retry', owner: 'kim', error: 'timeout' }),
    line({ at: at('04'), job: 'alpha-backup', status: 'ok', owner: 'kim' }),
    line({ at: at('05'), job: 'mid-report', status: 'fail', owner: 'sam', error: 'disk full' }),
    line({ at: at('06'), job: 'nobody-job', status: 'ok', owner: null }),
  ].join('\n');
  fs.writeFileSync(path.join(dir, `${FULL}.jsonl`), `${full}\n`);
  fs.writeFileSync(path.join(dir, `${EMPTY}.jsonl`), '');
  fs.writeFileSync(
    path.join(dir, `${BAD}.jsonl`),
    [line({ at: at('00'), job: 'only-job', status: 'ok', owner: 'sam' }), 'this is not json'].join('\n') + '\n',
  );
  app = createApp({
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir: dir,
  });
});

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

type ApiBody = {
  night: string;
  rows: { job: string; owner: string | null }[];
  badLines: number;
};

function bodyRows(html: string): string[] {
  const tbody = /<tbody[^>]*>([\s\S]*?)<\/tbody>/.exec(html);
  const scope = tbody ? tbody[1]! : html;
  return scope.match(/<tr[\s\S]*?<\/tr>/g) ?? [];
}

describe('GET /digest/:night', () => {
  it('renders the full night with one sorted row per job', async () => {
    const res = await app.request(`/digest/${FULL}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain(`digest · ${FULL}`);
    const rows = bodyRows(html);
    const jobs = ['alpha-backup', 'mid-report', 'nobody-job', 'zeta-sync'];
    const matching = rows.filter((r) => jobs.some((j) => r.includes(j)));
    expect(matching).toHaveLength(4);
    const order = matching.map((r) => jobs.find((j) => r.includes(j)));
    expect(order).toEqual(jobs);
  });

  it('marks rows with 3+ retries or a fail as warn, and only those', async () => {
    const html = await (await app.request(`/digest/${FULL}`)).text();
    const rows = bodyRows(html);
    const row = (job: string) => rows.find((r) => r.includes(job))!;
    expect(row('alpha-backup')).toMatch(/class="[^"]*\bwarn\b/);
    expect(row('mid-report')).toMatch(/class="[^"]*\bwarn\b/);
    expect(row('zeta-sync')).not.toMatch(/\bwarn\b/);
    expect(row('nobody-job')).not.toMatch(/\bwarn\b/);
  });

  it('renders a null owner as an em dash', async () => {
    const html = await (await app.request(`/digest/${FULL}`)).text();
    const row = bodyRows(html).find((r) => r.includes('nobody-job'))!;
    expect(row).toContain('—');
  });

  it('says "nothing ran" for an empty night', async () => {
    const res = await app.request(`/digest/${EMPTY}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it("still renders 200 and says \"didn't parse\" when a line is bad", async () => {
    const res = await app.request(`/digest/${BAD}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('only-job');
    // JSX may escape the apostrophe.
    expect(html.replace(/&#39;|&apos;/g, "'")).toContain("didn't parse");
  });

  it('404s with "no run log for <night>" when there is no file', async () => {
    const res = await app.request(`/digest/${MISSING}`);
    expect(res.status).toBe(404);
    expect(await res.text()).toContain(`no run log for ${MISSING}`);
  });
});

describe('GET /api/digest/:night', () => {
  it('returns night, rows sorted by job, and badLines 0', async () => {
    const res = await app.request(`/api/digest/${FULL}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiBody;
    expect(body.night).toBe(FULL);
    expect(body.badLines).toBe(0);
    expect(body.rows.map((r) => r.job)).toEqual(['alpha-backup', 'mid-report', 'nobody-job', 'zeta-sync']);
  });

  it('keeps a null owner null', async () => {
    const body = (await (await app.request(`/api/digest/${FULL}`)).json()) as ApiBody;
    expect(body.rows.find((r) => r.job === 'nobody-job')?.owner).toBeNull();
  });

  it('returns no rows and badLines 0 for an empty night', async () => {
    const res = await app.request(`/api/digest/${EMPTY}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiBody;
    expect(body.rows).toEqual([]);
    expect(body.badLines).toBe(0);
  });

  it('counts a bad line in badLines', async () => {
    const res = await app.request(`/api/digest/${BAD}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiBody;
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['only-job']);
  });

  it('404s with a JSON error when there is no file', async () => {
    const res = await app.request(`/api/digest/${MISSING}`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no run log', night: MISSING });
  });
});

describe('page and JSON agree', () => {
  it('list the same jobs in the same order', async () => {
    const html = await (await app.request(`/digest/${FULL}`)).text();
    const body = (await (await app.request(`/api/digest/${FULL}`)).json()) as ApiBody;
    const jobs = body.rows.map((r) => r.job);
    const fromHtml = bodyRows(html)
      .map((r) => jobs.find((j) => r.includes(j)))
      .filter((j): j is string => j !== undefined);
    expect(fromHtml).toEqual(jobs);
  });
});
