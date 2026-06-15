import { UsersView } from '../../../../src/tui/views/Users';

describe('UsersView module', () => {
  it('exports the UsersView component', () => {
    expect(typeof UsersView).toBe('function');
  });
});
