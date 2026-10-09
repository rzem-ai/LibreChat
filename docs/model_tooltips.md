# Model Tooltips

## Model Pricing

Model pricing indicators display `$` to `$$$$$` based on the blended cost of input and output tokens. Configure the four thresholds with `interface.customDeloitteFeatureFlags.modelPricingTierBreakpoints` in `librechat.yaml`; when unset, they default to `[2, 5, 8, 15]`.

## Detailed Model Information

When you hover over a model in the selector, a tooltip will appear showing detailed information about the model.