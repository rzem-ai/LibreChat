# Model Tooltips

## Model Pricing

Model pricing indicators display `$` to `$$$$$` based on the blended cost of input and output tokens. Enable them with `interface.customDeloitteFeatureFlags.showModelPricingIndicator: true` in `librechat.yaml`. Configure the four thresholds with `interface.customDeloitteFeatureFlags.modelPricingTierBreakpoints`; when unset, they default to `[2, 5, 8, 15]`.

## Detailed Model Information

When you hover over a model in the selector, a tooltip will appear showing detailed information about the model, driven by the optional `details` field on a `modelSpecs.list[]` entry in `librechat.yaml`:

```yaml
modelSpecs:
  list:
    - name: 'claude-opus'
      label: 'Claude Opus'
      artificialAnalysisBenchmarkModelName: 'claude-opus-4-5' # opts this spec into the sync below
      details:
        speed: 3 # 1-5, 1 = slowest
        intelligence: 5 # 1-5, 1 = least capable
        supports:
          webSearch: true
          imageGeneration: false
          fileIngestion: true
```

- `speed` and `intelligence` are each rendered as a 1-5 rating meter, on the same scale as the cost `$` tier described above.
- `supports` renders a row of the capabilities the model has (web search, image generation, file ingestion); omitted or `false` capabilities are not shown.
- All three fields are optional — a spec with no `details` simply shows its header (icon, group, label, description) and cost/context rows with no ratings or supports row.

## Automatic Speed/Intelligence Sync

`speed` and `intelligence` don't have to be set by hand. The `deloitte.sync-model-metadata` CI workflow (`.github/workflows/deloitte.sync-model-metadata.yml`, logic in `.github/scripts/deloitte.sync-model-metadata.mjs`) runs on PRs to `develop` that touch `librechat.yaml`:

1. For every spec with an `artificialAnalysisBenchmarkModelName`, it looks up the matching model in the [Artificial Analysis](https://artificialanalysis.ai/) catalog.
2. It computes `details.speed` (from median response time, inverted so faster is higher) and `details.intelligence` (from the Artificial Analysis intelligence index), each scaled into a 1-5 tier relative only to the other matched specs in the file, and writes both back onto the spec.
3. It commits and pushes the updated `librechat.yaml` straight to the PR branch.

Specs without an `artificialAnalysisBenchmarkModelName` are left untouched (a deliberate opt-out, no warning). Specs whose benchmark name has no catalog match are also left untouched, but logged as a workflow warning so the mismatch doesn't go unnoticed. `details.supports` is never touched by the sync — it's editorial and must be set by hand.

Every `speed`/`intelligence` line the workflow writes gets a trailing comment recording when it was last synced:

```yaml
details:
  speed: 3 # updated by deloitte.sync-model-metadata workflow on 12 October 2026
  intelligence: 5 # updated by deloitte.sync-model-metadata workflow on 12 October 2026
```

The date is computed at run time, so it always reflects the most recent sync, not when the workflow file itself was last edited.