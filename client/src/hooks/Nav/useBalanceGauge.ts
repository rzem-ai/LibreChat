import type { RefillIntervalUnit, TBalanceResponse } from 'librechat-data-provider';
import type { TranslationKeys } from '~/hooks/useLocalize';
import { useGetStartupConfig, useGetUserBalance } from '~/data-provider';
import { useAuthContext } from '~/hooks/AuthContext';
import useLocalize from '~/hooks/useLocalize';
import { getGaugeTone } from '~/components/Chat/Input/TokenUsage/Gauge';
import type { GaugeTone } from '~/components/Chat/Input/TokenUsage/Gauge';
import { formatBalance } from '~/utils';

interface BalanceGauge {
  label: string;
  /** Share of the refill allowance already used (0–100); unknown without a refill amount */
  percent: number;
  indeterminate: boolean;
  showHelperText: boolean;
  /** Localized refill interval (e.g. "1 day"); null when auto-refill details are unavailable */
  intervalText: string | null;
  intervalIsSingular: boolean;
  tone: GaugeTone;
  /** Whole percent of the allowance still available; null without a refill amount */
  remainingPercent: number | null;
}

const UNIT_KEYS: Record<RefillIntervalUnit, [singular: TranslationKeys, plural: TranslationKeys]> = {
  seconds: ['com_nav_balance_second', 'com_nav_balance_seconds'],
  minutes: ['com_nav_balance_minute', 'com_nav_balance_minutes'],
  hours: ['com_nav_balance_hour', 'com_nav_balance_hours'],
  days: ['com_nav_balance_day', 'com_nav_balance_days'],
  weeks: ['com_nav_balance_week', 'com_nav_balance_weeks'],
  months: ['com_nav_balance_month', 'com_nav_balance_months'],
};

/** Only a single day, week or month gets a named period; anything else reads as plain "Balance". */
const PERIOD_KEYS: Partial<Record<RefillIntervalUnit, TranslationKeys>> = {
  days: 'com_nav_balance_daily',
  weeks: 'com_nav_balance_weekly',
  months: 'com_nav_balance_monthly',
};

function getPeriodKey(balance: TBalanceResponse): TranslationKeys {
  const { refillIntervalValue, refillIntervalUnit } = balance;
  if (refillIntervalValue !== 1 || refillIntervalUnit == null) {
    return 'com_nav_balance';
  }
  return PERIOD_KEYS[refillIntervalUnit] ?? 'com_nav_balance';
}

export default function useBalanceGauge(): BalanceGauge | null {
  const localize = useLocalize();
  const { isAuthenticated } = useAuthContext();
  const { data: startupConfig } = useGetStartupConfig();
  const flags = startupConfig?.interface?.customDeloitteFeatureFlags;
  const enabled = startupConfig?.balance?.enabled === true && flags?.showBalanceGauge === true;
  const { data: balance } = useGetUserBalance({ enabled: !!isAuthenticated && enabled });

  if (!enabled || balance == null) {
    return null;
  }

  const showHelperText = flags?.showBalanceHelperText === true;
  const asCurrency = flags?.showBalanceAsCurrency === true;
  const currency = startupConfig?.interface?.currency;
  const remaining = formatBalance(balance.tokenCredits, asCurrency, currency);
  const limit = balance.refillAmount;
  const hasLimit = limit != null && limit > 0;
  const percent = hasLimit
    ? Math.min(100, Math.max(0, 100 - (balance.tokenCredits / limit) * 100))
    : 0;

  const { refillIntervalValue, refillIntervalUnit } = balance;
  const intervalText =
    refillIntervalValue != null && refillIntervalUnit != null
      ? `${refillIntervalValue} ${localize(UNIT_KEYS[refillIntervalUnit][refillIntervalValue === 1 ? 0 : 1])}`
      : null;

  const getLabel = (): string => {
    if (!asCurrency) {
      return `${localize('com_nav_balance')}: ${remaining}`;
    }
    if (!hasLimit) {
      return localize('com_nav_balance_remaining', { 0: remaining });
    }
    return localize('com_nav_balance_period_remaining', {
      0: remaining,
      1: formatBalance(limit, true, currency),
      2: localize(getPeriodKey(balance)),
    });
  };

  return {
    label: getLabel(),
    percent,
    indeterminate: !hasLimit,
    showHelperText,
    intervalText,
    intervalIsSingular: refillIntervalValue === 1,
    tone: getGaugeTone(percent, !hasLimit),
    remainingPercent: hasLimit ? Math.round(100 - percent) : null,
  };
}
