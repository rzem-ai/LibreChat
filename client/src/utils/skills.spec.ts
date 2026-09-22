import { formatSkillScanError } from './skills';

function withIssues(issues: unknown[]) {
  return { response: { data: { issues } } };
}

describe('formatSkillScanError', () => {
  test('renders a friendly issue message as-is, without a severity/code prefix', () => {
    const error = withIssues([
      {
        code: 'COMMAND_INJECTION_EVAL',
        severity: 'critical',
        message: 'Critical — Command Injection Eval: Pattern detected: exec(',
        friendly: true,
      },
    ]);
    expect(formatSkillScanError(error, 'fallback')).toBe(
      'Critical — Command Injection Eval: Pattern detected: exec(',
    );
  });

  test('prefixes a non-friendly issue message with severity and code', () => {
    const error = withIssues([
      { code: 'DANGEROUS_EXEC', severity: 'critical', message: 'exec() call detected' },
    ]);
    expect(formatSkillScanError(error, 'fallback')).toBe(
      'severity=CRITICAL code=DANGEROUS_EXEC — exec() call detected',
    );
  });

  test('sorts multiple issues by severity, highest risk first', () => {
    const error = withIssues([
      { severity: 'medium', message: 'medium issue', friendly: true },
      { severity: 'critical', message: 'critical issue', friendly: true },
      { severity: 'high', message: 'high issue', friendly: true },
    ]);
    expect(formatSkillScanError(error, 'fallback')).toBe(
      ['critical issue', 'high issue', 'medium issue'].join('\n'),
    );
  });

  test('falls back to the top-level message when there are no issues', () => {
    const error = { response: { data: { message: 'top-level failure' } } };
    expect(formatSkillScanError(error, 'fallback')).toBe('top-level failure');
  });

  test('falls back to the caller-provided default when nothing else is available', () => {
    expect(formatSkillScanError({}, 'fallback')).toBe('fallback');
  });
});
