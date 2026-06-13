import { startSyncPositions } from '../../src/jobs/syncPositions';

describe('syncPositions job', () => {
  it('returns null when disabled', () => {
    const t = startSyncPositions({ enabled: false, cronExpr: '* * * * *', quantity: 1000 });
    expect(t).toBeNull();
  });

  it('returns a scheduled task when enabled and stops cleanly', () => {
    const t = startSyncPositions({ enabled: true, cronExpr: '0 0 1 1 *', quantity: 100 });
    expect(t).not.toBeNull();
    t!.stop();
  });
});
