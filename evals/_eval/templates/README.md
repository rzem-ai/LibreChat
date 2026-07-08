# `templates` — Eval Case YAML Templates

Starter templates for manually authoring `eval_cases.yaml` files. Each template targets one eval category and includes annotated single-turn and multi-turn case skeletons.

Copy the template that matches your skill's category to `evals/skills/<Skill Name>/eval_cases.yaml` and fill in the `TODO` placeholders.

> **Tip:** Use the eval-scaffolder skill instead of editing a template by hand — it generates 8 grounded cases across 4 documents automatically:
> *"Use the eval-scaffolder skill to create eval cases for the `<Skill Name>` skill."*

---

## Available Templates

| File | Category | Typical Skills |
|------|----------|---------------|
| [`content_generation.yaml`](content_generation.yaml) | Content Generation & Transformation | Meeting Summariser, Article Builder, CV Builder |
| [`knowledge_retrieval.yaml`](knowledge_retrieval.yaml) | Knowledge Retrieval & Q&A | Research Assistant, Industry Trends Analyser, Policy Q&A |
| [`data_classification.yaml`](data_classification.yaml) | Data Classification & Extraction | Contract Analyser, Document Redactor |
| [`decision_support.yaml`](decision_support.yaml) | Decision Support & Recommendation | Scenario Planning, Cost Benefit Analyser |
| [`tool_orchestration.yaml`](tool_orchestration.yaml) | Tool-Orchestrated Workflow Execution | PowerPoint Generator, Process Map Generator |
| [`governance_compliance.yaml`](governance_compliance.yaml) | Governance / Control / Compliance | Audit RFP Response Generator, NDA Reviewer |

---

## Template Structure

Every template includes:

- **`case_1`** — Single-turn (`invoke_text`) with gating metrics and leading questions
- **`case_2`** — Multi-turn (`invoke_sequential`) with `turns`, `turn_assertions`, and `conversation_completeness`

### Category-Specific Differences

**`knowledge_retrieval.yaml`** includes two patterns:
- *Pattern A* — Document Q&A: source provided inline via `attach_source: true`
- *Pattern B* — KB-backed RAG: no `source_material`; agent retrieves from its own knowledge base. Uses retrieval metrics (`contextual_precision`, `contextual_recall`, `contextual_relevancy`)

**`data_classification.yaml`** and **`governance_compliance.yaml`** emphasise extraction accuracy and instruction adherence over creative generation, so their leading questions focus on completeness, schema compliance, and absence of hallucinated fields.

**`tool_orchestration.yaml`** uses `tool_correctness` as a gating metric and `expected_tools` assertions on every turn to verify the agent's tool-calling sequence.

---

## Usage

```bash
# 1. Copy the template
cp evals/_eval/templates/content_generation.yaml \
   evals/skills/My\ Skill/eval_cases.yaml

# 2. Edit the YAML — fill in all TODO fields

# 3. Run a single case to verify the setup
uv run eval-run --config "evals/skills/My Skill/eval_cases.yaml" --case case_1
```

See the [top-level `_eval` README](../README.md#eval_casesyaml-schema) for the full YAML schema reference.
