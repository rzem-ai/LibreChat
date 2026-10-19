import React from 'react';
import { Label, InfoHoverCard, ESide } from '@librechat/client';
import { useGetStartupConfig } from '~/data-provider';
import { formatBalance } from '~/utils';
import { useLocalize } from '~/hooks';

interface TokenCreditsItemProps {
  tokenCredits?: number;
}

const TokenCreditsItem: React.FC<TokenCreditsItemProps> = ({ tokenCredits }) => {
  const localize = useLocalize();
  // Deloitte Custom Change: show the balance in USD when showBalanceAsCurrency is enabled
  const { data: startupConfig } = useGetStartupConfig();
  const showBalanceAsCurrency =
    startupConfig?.interface?.customDeloitteFeatureFlags?.showBalanceAsCurrency === true;

  return (
    <div className="flex items-center justify-between">
      {/* Left Section: Label */}
      <div className="flex items-center space-x-2">
        <Label className="font-light">{localize('com_nav_balance')}</Label>
        <InfoHoverCard side={ESide.Bottom} text={localize('com_nav_info_balance')} />
      </div>

      {/* Right Section: tokenCredits Value */}
      <span className="text-sm font-medium text-text-primary" role="note">
        {showBalanceAsCurrency
          ? formatBalance(tokenCredits ?? 0, true, startupConfig?.interface?.currency)
          : (tokenCredits ?? 0).toFixed(2)}
      </span>
    </div>
  );
};

export default TokenCreditsItem;
