// Deloitte Custom Change: covers the principal list joiner.
import { joinList } from '../principals';

describe('joinList', () => {
  it('returns an empty string for no items', () => {
    expect(joinList([], 'and')).toBe('');
  });

  it('returns the single item unchanged', () => {
    expect(joinList(['User'], 'and')).toBe('User');
  });

  it('joins two items with the conjunction', () => {
    expect(joinList(['User', 'Role'], 'and')).toBe('User and Role');
  });

  it('comma-separates leading items and uses the conjunction before the last', () => {
    expect(joinList(['users', 'groups', 'roles'], 'or')).toBe('users, groups or roles');
  });
});
