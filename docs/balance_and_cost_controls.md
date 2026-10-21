# Balance and Cost Controls

MyAssist tracks a per-user token balance that refills on a schedule. This document covers how the balance is configured, how it is shown to users, and the feature flags that control the display.

## Configuration

Balance is configured in the `balance:` block of `librechat.yaml`. The values that differ per environment come from environment variables:

```yaml
balance:
  enabled: '${CHECK_BALANCE}'
  startBalance: '${START_BALANCE}'
  autoRefillEnabled: true
  refillIntervalValue: 1
  refillIntervalUnit: "days"
  refillAmount: '${BALANCE_REFILL_AMOUNT}'
```

| Variable | Purpose |
|---|---|
| `CHECK_BALANCE` | `true`/`false` turns balance tracking on or off |
| `START_BALANCE` | Starting token credits for new users |
| `BALANCE_REFILL_AMOUNT` | Credits added per refill cycle |

Locally these are set in `.env`; for deployed environments they are set in `charts/values-{dev,uat,prd}.yaml` (10,000,000 credits = $10 per day).

Credits are priced at **1,000,000 credits = $1 USD**.

### How `${VAR}` placeholders are resolved

`balanceSchema` (`packages/data-provider/src/config.ts`) resolves `${VAR}` placeholders for `enabled`, `startBalance` and `refillAmount`, converting them to booleans and numbers. The backend parses the `balance` block through this schema in `loadBalanceConfig` (`packages/data-schemas/src/app/service.ts`).

Previously the raw block was used, so the literal string `${BALANCE_REFILL_AMOUNT}` reached Mongoose and failed with `Cast to Number failed ... at path "refillAmount"` when a user logged in. If the block is missing or invalid, `loadBalanceConfig` logs a warning and falls back to the legacy `CHECK_BALANCE` / `START_BALANCE` variables.

## Refill behaviour

A refill happens automatically only when both are true:

1. The refill interval has passed since the user's last refill.
2. Sending a prompt would take the balance below zero.

The refill adds `refillAmount` credits. The balance is therefore not topped up on a fixed clock; the time shown in Settings is the earliest it can happen.

## Feature flags

These live under `interface.customDeloitteFeatureFlags` in `librechat.yaml` and are defined in `interfaceSchema` (`packages/data-provider/src/config.ts`). All are optional and off when unset.

| Flag | Effect |
|---|---|
| `showBalanceAsCurrency` | Shows the balance in USD (e.g. `$19.04`) instead of raw credits. Applies to the gauge and to Settings → Balance. |
| `showBalanceGauge` | Shows a small circular gauge above the account avatar in the desktop sidebar. Requires `balance.enabled`. |
| `showBalanceHelperText` | Adds refill and cost-saving guidance to the gauge hover card. |

The balance readout that used to appear in the account menu has been removed; the gauge replaces it.

### The gauge

`BalanceGauge` (`client/src/components/Nav/BalanceGauge.tsx`) reuses the chat context-usage `Gauge`. The ring fills as the refill allowance is **used**.

| Used | Remaining | Colour |
|---|---|---|
| up to 75% | 100–25% | Grey |
| above 75% | below 25% | Amber |
| above 90% | below 10% | Red |

The thresholds come from `getGaugeTone` in `Gauge.tsx`, shared with the context gauge. They are not configurable. If the user has no refill amount (auto-refill disabled), the gauge is an empty dashed ring because there is no limit to measure against.

Hovering or focusing the gauge opens a hover card containing:

- **Balance line.**
  - With `showBalanceAsCurrency` on and a refill amount: `<Period> Balance: $19.04/$20.00 remaining`.
  - With a currency but no refill amount: `Balance: $19.04 remaining`.
  - With currency off: `Balance: 2,000,000`.
- **`z% remaining`**, coloured to match the ring (grey, amber or red). Hidden when there is no refill amount.
- **Helper text** (only with `showBalanceHelperText`): a tip to use a cheaper model to conserve balance, pointing users at the model selector tooltips for per-model cost. Below it, a small caption shows when the next refill is available:
  - `Next refill: Available immediately when balance is exhausted` once the refill interval has elapsed since the last refill.
  - `Next refill: Available 2:00pm on Mon 12 Oct 2026` while the interval is still running. Time and date are shown in the user's local time zone with a 12-hour clock and a short weekday, with no zone label.
  - Hidden when auto-refill details are unavailable.

### Period wording

The period prefix follows the user's refill interval:

| Interval | Prefix |
|---|---|
| every 1 day | Daily Balance |
| every 1 week | Weekly Balance |
| every 1 month | Monthly Balance |
| anything else | Balance |

### Currency formatting

`formatBalance` (`client/src/utils/tokens.ts`) converts credits to USD and reuses `formatCost`, so `interface.currency` (display currency and rate) is honoured. Browsers in non-US locales render USD as `US$`; for the balance this is shown as plain `$`.

## Translation keys

All user-facing text is in `client/src/locales/en/translation.json`:

- `com_nav_balance_period_remaining`, `com_nav_balance_remaining`, `com_nav_balance_percent_remaining`
- `com_nav_balance_daily`, `com_nav_balance_weekly`, `com_nav_balance_monthly`
- `com_nav_balance_next_refill_now`, `com_nav_balance_next_refill_at`
- `com_nav_balance_conserve_info`

## Where the code lives

| Area | Files |
|---|---|
| Schema, env resolution, flags | `packages/data-provider/src/config.ts` |
| Backend balance config | `packages/data-schemas/src/app/service.ts` |
| Gauge component and hook | `client/src/components/Nav/BalanceGauge.tsx`, `client/src/hooks/Nav/useBalanceGauge.ts` |
| Shared gauge tones | `client/src/components/Chat/Input/TokenUsage/Gauge.tsx` |
| Placement | `client/src/components/UnifiedSidebar/ExpandedPanel.tsx` |
| Currency formatting | `client/src/utils/tokens.ts` |
| Settings → Balance row | `client/src/components/Nav/SettingsTabs/Balance/TokenCreditsItem.tsx` |
| Env var tests | `packages/data-provider/src/balance-env.spec.ts` |

## Limitations

- The gauge appears only in the desktop sidebar, not the mobile header.
- The Settings → Balance tab still lists "Refill Amount" in raw credits.
- Gauge thresholds are fixed.
- The balance can exceed the refill amount (e.g. `START_BALANCE` higher than `BALANCE_REFILL_AMOUNT`), in which case the gauge shows 0% used.
