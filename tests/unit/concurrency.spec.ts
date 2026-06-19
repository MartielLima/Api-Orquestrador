import { runWithConcurrency } from '../../src/lib/concurrency';

describe('runWithConcurrency', () => {
  it('runs all tasks and returns results in input order', async () => {
    const tasks = [1, 2, 3, 4, 5].map((n) => async () => n * 10);
    const results = await runWithConcurrency(tasks, 3, async (t) => t());
    expect(results).toEqual([10, 20, 30, 40, 50]);
  });

  it('never has more than `concurrency` tasks in flight at once', async () => {
    const concurrency = 3;
    const total = 12;
    let active = 0;
    let peak = 0;
    const tasks = Array.from({ length: total }, (_, i) => async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 20));
      active -= 1;
      return i;
    });

    const results = await runWithConcurrency(tasks, concurrency, async (t) => t());

    expect(results).toHaveLength(total);
    expect(peak).toBe(concurrency);
  });

  it('rejects with the first failing task error', async () => {
    const tasks = [
      async () => 'ok',
      async () => {
        throw new Error('boom');
      },
      async () => 'never-runs',
    ];
    await expect(runWithConcurrency(tasks, 2, async (t) => t())).rejects.toThrow('boom');
  });

  it('handles an empty input list', async () => {
    const results = await runWithConcurrency<number, number>([], 5, async () => 0);
    expect(results).toEqual([]);
  });

  it('is faster than sequential when tasks are slow', async () => {
    type Task = () => Promise<number>;
    const tasks: Task[] = Array.from({ length: 6 }, () => async () => {
      await new Promise((r) => setTimeout(r, 50));
      return 1;
    });
    const start = Date.now();
    await runWithConcurrency<Task, number>(tasks, 6, async (t) => t());
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(6 * 50);
    expect(elapsed).toBeGreaterThanOrEqual(50);
  });
});
