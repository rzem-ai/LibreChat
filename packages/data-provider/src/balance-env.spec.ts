import { balanceSchema } from './config';

describe('balanceSchema env var resolution', () => {
  afterEach(() => {
    delete process.env.CHECK_BALANCE;
    delete process.env.START_BALANCE;
    delete process.env.BALANCE_REFILL_AMOUNT;
  });

  it('resolves startBalance and refillAmount placeholders from env', () => {
    process.env.START_BALANCE = '10000000';
    process.env.BALANCE_REFILL_AMOUNT = '10000000';
    const result = balanceSchema.parse({
      startBalance: '${START_BALANCE}',
      refillAmount: '${BALANCE_REFILL_AMOUNT}',
    });
    expect(result.startBalance).toBe(10000000);
    expect(result.refillAmount).toBe(10000000);
  });

  it('accepts plain numbers and applies defaults', () => {
    const result = balanceSchema.parse({ startBalance: 5 });
    expect(result.startBalance).toBe(5);
    expect(result.refillAmount).toBe(10000);
  });

  it('rejects placeholders whose env var is unset', () => {
    expect(balanceSchema.safeParse({ startBalance: '${START_BALANCE}' }).success).toBe(false);
  });

  it.each([
    ['true', true],
    ['FALSE', false],
  ])('resolves enabled from CHECK_BALANCE=%s', (value: string, expected: boolean) => {
    process.env.CHECK_BALANCE = value;
    expect(balanceSchema.parse({ enabled: '${CHECK_BALANCE}' }).enabled).toBe(expected);
  });

  it('rejects enabled when CHECK_BALANCE is unset or not a boolean', () => {
    expect(balanceSchema.safeParse({ enabled: '${CHECK_BALANCE}' }).success).toBe(false);
    process.env.CHECK_BALANCE = 'maybe';
    expect(balanceSchema.safeParse({ enabled: '${CHECK_BALANCE}' }).success).toBe(false);
  });
});
