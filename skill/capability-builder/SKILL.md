---
name: capability-builder
description: A skill that generates capability themes and behavioural indicators across four proficiency levels (Foundational, Experienced, Advanced, Transformational) for a given Job Family Group. Use when a user needs to build capability frameworks, write behavioural indicators, or develop workforce capability architecture aligned to a technical domain.
---

# Capability Framework Builder

Invoke this skill when a user needs to:

- Generate capability architecture for a Job Family Group
- Identify representative technical capabilities for a Job Family Group
- Generate capability themes for capabilities
- Write behavioural indicators across four proficiency levels (Foundational, Experienced, Advanced, Transformational)
- Develop workforce capability frameworks using Bloom's Taxonomy
- Create capability theme tables and behavioural indicator outputs ready for workforce planning, capability assessment, learning and development and workforce transformation activities

---

# Required Inputs

The user must provide at least:

| Job Family Group |
| --- |

# Step 1 — Generate Capabilities

## Goal

Establish the core technical capabilities that collectively describe the Job Family Group.

## Instructions

Ask the user for the Job Family Group.

If the user does not provide a capabilities table, automatically generate one.

Generate **5–6 representative technical capabilities** that collectively describe the Job Family Group.

Capabilities must:

- Be technical and domain-specific
- Represent the major disciplines within the Job Family Group
- Be mutually exclusive and collectively exhaustive where practical
- Avoid duplication or overlap
- Avoid generic enterprise capabilities such as:
  - Communication
  - Stakeholder Management
  - Leadership
  - Teamwork
  - Problem Solving
  - Strategic Thinking

Each capability must contain:

| Field | Requirement |
|---------|---------|
| Capability | Short capability title |
| Description | Maximum 40 words |

Descriptions should explain:

- What the capability does
- What outcomes it supports
- What technical discipline it represents

## Capability Generation Guidance

When generating capabilities:

- Think like a workforce consultant establishing a capability architecture
- Cover the entire Job Family Group
- Ensure capabilities remain relevant despite future changes to systems, processes and organisational structures
- Focus on enduring technical capability domains
- Generate exactly **5–6 capabilities** unless the Job Family Group is highly specialised and genuinely requires fewer

## Example Output Format

### Finance and Accounting

| Capability | Description |
|-----------|-------------|
| Financial Reporting | Prepares and communicates financial information to satisfy regulatory, statutory and management reporting requirements. |
| Management Accounting | Produces financial analysis and performance insights to support operational and strategic decision-making. |
| Budgeting and Forecasting | Develops budgets, forecasts and financial projections to support planning and resource allocation decisions. |
| Financial Control and Compliance | Maintains governance frameworks, controls and compliance with accounting standards and organisational policies. |
| Treasury and Cash Management | Manages liquidity, funding requirements and financial risk exposures to support financial stability. |
| Taxation Management | Administers taxation obligations and provides advice to ensure compliance with applicable taxation requirements. |

Present the table and ask the user whether they would like to make any adjustments before proceeding.

---

# Step 2 — Generate Capability Themes

## Goal

Generate 3–5 capability themes for each capability.

---

## Definitions

### Capability Definition

The capability description generated or provided in Step 1.

### Capability Theme Definition

Capability themes detail the unique technical components that collectively make up a capability.

Themes must:

- Be mutually exclusive and collectively exhaustive
- Follow a logical lifecycle
- Be technical in nature
- Be independent of specific roles
- Be independent of specific systems or technologies
- Remain relevant over time
- Be written at a level that can support behavioural indicators across four proficiency levels

---

## Prompt Logic

For each capability:

> Act as a workforce consultant. I would like to write a list of 3–5 capability themes for the listed capability. The definition of the capability is [INSERT CAPABILITY DESCRIPTION] and the definition of a capability theme is:
>
> Themes detail the unique components that make up the capability. Themes must be defined at a high enough level so they can be built out across four proficiency levels. Themes should not overlap, should be mutually exclusive and collectively exhaustive, follow a logical lifecycle, and remain relevant despite future changes to roles, technologies, systems and processes.
>
> Please make each theme technical in nature and written in a descriptive format rather than a short label.
>
> Please showcase the full lifecycle of the capability using 3–5 themes. Each theme must:
>
> - Be 10–12 words long
> - Be mutually exclusive and collectively exhaustive
> - Follow a logical process flow
> - Be technical in nature
> - Avoid role-specific language
>
> Generate one theme per row. If a capability has multiple themes, repeat the capability and description on each row.

### Example

**Capability:** Financial Reporting

**Description:** Prepares and communicates financial information to satisfy regulatory, statutory and management reporting requirements.

| Capability | Description | Theme |
|-----------|-------------|---------|
| Financial Reporting | Prepares and communicates financial information to satisfy regulatory, statutory and management reporting requirements. | Collects and validates financial data from multiple business sources |
| Financial Reporting | Prepares and communicates financial information to satisfy regulatory, statutory and management reporting requirements. | Analyses financial information to identify trends, variances and insights |
| Financial Reporting | Prepares and communicates financial information to satisfy regulatory, statutory and management reporting requirements. | Prepares compliant financial statements aligned with reporting obligations |
| Financial Reporting | Prepares and communicates financial information to satisfy regulatory, statutory and management reporting requirements. | Communicates financial performance insights to support organisational decision-making |

---

## Validation Criteria

Themes must:

- Be 10–12 words long
- Be technical in nature
- Be mutually exclusive and collectively exhaustive
- Follow the lifecycle of the capability
- Avoid duplication or overlap
- Use 3–4 themes where sufficient
- Use 5 themes only where necessary to fully explain the capability

Present all capability themes in a table and invite the user to review or edit before proceeding.

---

# Step 3 — Generate Behavioural Indicators

## Goal

Generate one behavioural indicator at each proficiency level for every capability theme.

---

## Objective

Behavioural indicators define observable actions that demonstrate effective execution of a capability theme at increasing levels of proficiency.

Each behavioural indicator should clearly describe:

- The action performed
- The outcome achieved

Format:

> Does X to achieve Y

---

## Structure

Capabilities are groups of related technical behaviours.

Capability themes break the capability into distinct technical components.

Behavioural indicators describe the observable actions expected at different proficiency levels.

Generate one behavioural indicator for each proficiency level.

---

## Proficiency Definitions

### Foundational

Demonstrates basic knowledge and understanding.

Focus on:

- Applying
- Identifying
- Describing
- Recognising
- Demonstrating

Uses common techniques and concepts.

### Experienced

Works independently.

Focus on:

- Analysing
- Evaluating
- Implementing
- Adapting
- Resolving

Identifies barriers and implements corrective actions.

### Advanced

Demonstrates deep technical specialisation.

Focus on:

- Synthesising
- Integrating
- Optimising
- Architecting
- Leading

Navigates complexity across functions, stakeholders and organisational contexts.

### Transformational

Recognised internal and external expert.

Focus on:

- Pioneering
- Transforming
- Driving
- Championing
- Shaping

Advances organisational capability and industry practice.

---

## Bloom's Taxonomy Guidance

| Proficiency | Example Verbs |
|------------|--------------|
| Foundational | Applies, Identifies, Describes, Demonstrates, Recognises |
| Experienced | Analyses, Evaluates, Implements, Adapts, Resolves |
| Advanced | Synthesises, Integrates, Optimises, Architects, Leads |
| Transformational | Pioneers, Transforms, Champions, Shapes, Drives |

---

## Behavioural Indicator Rules

Each behavioural indicator must:

- Begin with a verb
- Be one sentence only
- Be 20–25 words
- Use Australian/British English
- Describe both an action and an outcome
- Show progression in complexity across proficiency levels
- Align directly to the capability theme
- Avoid generic statements
- Remain relevant regardless of role, system or organisational structure

---

## Behavioural Indicator Prompt

> Act as a workforce consultant and capability specialist.
>
> Generate four behavioural indicators for each capability theme:
>
> - One Foundational
> - One Experienced
> - One Advanced
> - One Transformational
>
> Begin each statement with a Bloom's Taxonomy verb appropriate to the proficiency level.
>
> Each behavioural indicator must:
>
> - Be one sentence
> - Be 20–25 words
> - Describe an action and outcome
> - Demonstrate increasing sophistication between levels
> - Use Australian/British English spelling

---

## Output Format

| Capability | Description | Theme | Foundational | Experienced | Advanced | Transformational |
|-----------|-------------|---------|-------------|-------------|----------|------------------|
| Capability | Description | Theme | Behavioural Indicator | Behavioural Indicator | Behavioural Indicator | Behavioural Indicator |

Generate one row for every capability-theme combination.

---

# Recommended Conversation Flow

1. Ask the user for the Job Family Group.
2. Generate 5–6 representative capabilities if none are supplied.
3. Present capabilities for review and adjustment.
4. Generate capability themes for each capability.
5. Present themes for review and adjustment.
6. Generate behavioural indicators across all four proficiency levels.
7. Present the completed capability framework.
8. Offer the capability framework as:
   - Capability architecture table
   - Capability assessment framework
   - Learning and development framework
   - Workforce planning framework

---

# Output Standards

- Use Australian/British English spelling.
- Use Markdown formatting.
- Capability descriptions must be ≤40 words.
- Capability themes must be 10–12 words.
- Themes must be mutually exclusive and collectively exhaustive.
- Themes must reflect the lifecycle of the capability.
- Behavioural indicators must:
  - Be one sentence
  - Be 20–25 words
  - Begin with a verb
  - Include both an action and outcome
  - Demonstrate progression across proficiency levels
- If the user does not provide a Job Family Group, respond with exactly:

`Please provide more details`

- All outputs should be treated as first drafts requiring practitioner review and client-specific refinement before use.

---

# Additional Quality Rules

When generating capabilities for a Job Family Group:

- Default to generating **exactly 6 capabilities**
- Only generate fewer than 6 capabilities where the Job Family Group is highly specialised
- Ensure the capability set would be suitable for:
  - Workforce planning
  - Capability assessments
  - Learning pathways
  - Career architecture
  - Workforce transformation initiatives

For broad Job Family Groups such as:

- Finance and Accounting
- Data and Analytics
- Technology
- Cyber Security
- Risk and Compliance
- Operations
- Customer Service
- People and Culture

Always generate **6 capabilities** to ensure sufficient coverage of the domain.

Before progressing to the next step:

- Present the capability set for user review.
- Present the theme set for user review.
- Allow edits at both stages.
- Only generate behavioural indicators once capabilities and themes have been confirmed.