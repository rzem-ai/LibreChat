// Deloitte Custom Change: hover-card balance gauge shown above the account avatar (showBalanceGauge)
import { memo } from 'react';
import * as Ariakit from '@ariakit/react';
import type { GaugeTone } from '~/components/Chat/Input/TokenUsage/Gauge';
import Gauge from '~/components/Chat/Input/TokenUsage/Gauge';
import useBalanceGauge from '~/hooks/Nav/useBalanceGauge';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

const TONE_CLASSES: Record<GaugeTone, string> = {
  neutral: 'text-text-tertiary',
  warning: 'text-status-warning',
  error: 'text-status-error',
};

function BalanceGauge() {
  const localize = useLocalize();
  const gauge = useBalanceGauge();

  if (gauge == null) {
    return null;
  }

  return (
    <Ariakit.HovercardProvider placement="right" showTimeout={100} hideTimeout={150}>
      <Ariakit.HovercardAnchor
        role="meter"
        tabIndex={0}
        aria-label={`${localize('com_nav_balance')}: ${gauge.label}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={gauge.indeterminate ? undefined : Math.round(gauge.percent)}
        data-testid="balance-gauge"
        className="flex size-9 items-center justify-center self-center rounded-lg hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary"
      >
        <Gauge percent={gauge.percent} indeterminate={gauge.indeterminate} />
      </Ariakit.HovercardAnchor>
      <Ariakit.Hovercard
        gutter={8}
        portal
        className="z-[200] w-72 space-y-2 rounded-xl border border-border-medium bg-surface-secondary p-3 text-sm text-text-primary shadow-lg"
      >
        <p className="font-medium">{gauge.label}</p>
        {gauge.remainingPercent != null && (
          <p className={cn('text-xs', TONE_CLASSES[gauge.tone])}>
            {localize('com_nav_balance_percent_remaining', { 0: gauge.remainingPercent })}
          </p>
        )}
        {gauge.showHelperText && (
          <>
            <p className="text-text-secondary">{localize('com_nav_balance_conserve_info')}</p>
            {gauge.nextRefillText != null && (
              <p className="border-t border-border-light pt-2 text-xs text-text-tertiary">
                {gauge.nextRefillText}
              </p>
            )}
          </>
        )}
      </Ariakit.Hovercard>
    </Ariakit.HovercardProvider>
  );
}

export default memo(BalanceGauge);
