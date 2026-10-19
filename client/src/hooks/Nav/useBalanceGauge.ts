// Deloitte Custom Change: derives the balance gauge label, usage percent and refill wording from the balance API
import { getRefillEligibilityDate } from 'librechat-data-provider';
import type { RefillIntervalUnit, TBalanceResponse } from 'librechat-data-provider';
import type { GaugeTone } from '~/components/Chat/Input/TokenUsage/Gauge';
import type { TranslationKeys } from '~/hooks/useLocalize';
import { useGetStartupConfig, useGetUserBalance } from '~/data-provider';
import { getGaugeTone } from '~/components/Chat/Input/TokenUsage/Gauge';
import { useAuthContext } from '~/hooks/AuthContext';
import useLocalize from '~/hooks/useLocalize';
import { formatBalance } from '~/utils';

interface BalanceGauge {
  label: string;
  /** Share of the refill allowance already used (0–100); unknown without a refill amount */
  percent: number;
  indeterminate: boolean;
  showHelperText: boolean;
  /** Localized next-refill caption; null when auto-refill details are unavailable */
  nextRefillText: string | null;
  tone: GaugeTone;
  /** Whole percent of the allowance still available; null without a refill amount */
  remainingPercent: number | null;
}

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

const TIME_FORMAT = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});
const DATE_FORMAT = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/** Compacts "2:00 PM" to "2:00pm". Local time, so no zone label. */
function formatRefillTime(date: Date): string {
  return TIME_FORMAT.format(date).replace(/\s?([ap]m)/i, (_match, period: string) =>
    period.toLowerCase(),
  );
}

/** Assembled from parts so the order is always "Mon 12 Oct 2026" regardless of locale punctuation. */
function formatRefillDate(date: Date): string {
  const parts = Object.fromEntries(DATE_FORMAT.formatToParts(date).map((p) => [p.type, p.value]));
  return `${parts.weekday} ${parts.day} ${parts.month} ${parts.year}`;
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

  const getNextRefillText = (): string | null => {
    const { autoRefillEnabled, lastRefill, refillIntervalValue, refillIntervalUnit } = balance;
    if (!autoRefillEnabled || !lastRefill || refillIntervalValue == null || !refillIntervalUnit) {
      return null;
    }
    const eligibleAt = getRefillEligibilityDate(
      new Date(lastRefill),
      refillIntervalValue,
      refillIntervalUnit,
    );
    if (eligibleAt.getTime() <= Date.now()) {
      return localize('com_nav_balance_next_refill_now');
    }
    return localize('com_nav_balance_next_refill_at', {
      0: formatRefillTime(eligibleAt),
      1: formatRefillDate(eligibleAt),
    });
  };

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
    nextRefillText: getNextRefillText(),
    tone: getGaugeTone(percent, !hasLimit),
    remainingPercent: hasLimit ? Math.round(100 - percent) : null,
  };
}
