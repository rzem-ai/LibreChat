/* eslint-disable i18next/no-literal-string */
// Deloitte Custom Change: new file — render coverage for the rebuilt model info tooltip
// (Figma node 855:37722): header stacking, rating meters, cost lines, and deferred supports.
import { render, screen } from '@testing-library/react';
import type { TModelSpec } from 'librechat-data-provider';
import type { ReactNode } from 'react';
import ModelInfoTooltip from '../ModelInfoTooltip';

let mockModelPricing: Record<string, { tier: number; inputPer1M: number; outputPer1M: number }> =
  {};
let mockTokenConfig: Record<string, Record<string, { context?: number }>> | undefined;

jest.mock('~/components/Chat/Menus/Endpoints/ModelSelectorContext', () => ({
  useModelSelectorContext: () => ({ modelPricing: mockModelPricing }),
}));

jest.mock('~/data-provider', () => ({
  useTokenConfigQuery: () => ({ data: mockTokenConfig }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, vars?: Record<string, string>) =>
    vars ? `${key}:${Object.values(vars).join(',')}` : key,
}));

jest.mock('../SpecIcon', () => ({
  __esModule: true,
  default: () => <span data-testid="spec-icon" />,
}));

// Deloitte Custom Change: Radix HoverCard only mounts content on hover/focus; render it open
// always so these tests can assert on ModelInfoTooltip's own markup.
jest.mock('@librechat/client', () => ({
  ...jest.requireActual('@librechat/client'),
  HoverCard: ({ children }: { children: ReactNode }) => <>{children}</>,
  HoverCardTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  HoverCardPortal: ({ children }: { children: ReactNode }) => <>{children}</>,
  HoverCardContent: ({ children, ...rest }: { children: ReactNode }) => (
    <div {...rest}>{children}</div>
  ),
}));

const baseSpec: TModelSpec = {
  name: 'my-spec',
  label: 'My Spec',
  group: 'OpenAI Global',
  preset: {
    endpoint: 'openAI',
    model: 'gpt-5',
  },
};

describe('ModelInfoTooltip', () => {
  beforeEach(() => {
    mockModelPricing = {};
    mockTokenConfig = undefined;
  });

  it('renders children without a hover card when there are no details to show', () => {
    render(
      <ModelInfoTooltip spec={baseSpec} endpointsConfig={{}}>
        <button>Row</button>
      </ModelInfoTooltip>,
    );
    expect(screen.getByText('Row')).toBeInTheDocument();
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  it('renders stacked group name and spec label in the header', () => {
    render(
      <ModelInfoTooltip spec={{ ...baseSpec, details: { speed: 3 } }} endpointsConfig={{}}>
        <button>Row</button>
      </ModelInfoTooltip>,
    );
    expect(screen.getByText('OpenAI Global')).toBeInTheDocument();
    expect(screen.getByText('My Spec')).toBeInTheDocument();
  });

  it('renders Speed and Intelligence as N-of-5 rating meters', () => {
    render(
      <ModelInfoTooltip
        spec={{ ...baseSpec, details: { speed: 3, intelligence: 5 } }}
        endpointsConfig={{}}
      >
        <button>Row</button>
      </ModelInfoTooltip>,
    );
    const meters = screen.getAllByRole('img');
    expect(meters).toHaveLength(2);
    expect(meters[0]).toHaveAccessibleName('3 of 5');
    expect(meters[1]).toHaveAccessibleName('5 of 5');
  });

  it('renders a cost meter with input/output price lines and no tier badge', () => {
    mockModelPricing = { 'gpt-5': { tier: 2, inputPer1M: 1, outputPer1M: 6 } };
    render(
      <ModelInfoTooltip spec={baseSpec} endpointsConfig={{}}>
        <button>Row</button>
      </ModelInfoTooltip>,
    );
    expect(screen.getByRole('img', { name: '2 of 5' })).toBeInTheDocument();
    expect(screen.getByText(/com_ui_model_details_cost_input/)).toBeInTheDocument();
    expect(screen.getByText(/com_ui_model_details_cost_output/)).toBeInTheDocument();
    expect(
      screen.queryByText(/com_ui_model_details_cost_low|_medium|_high/),
    ).not.toBeInTheDocument();
  });

  it('renders context as plain text with no meter', () => {
    mockTokenConfig = { openAI: { 'gpt-5': { context: 128000 } } };
    render(
      <ModelInfoTooltip spec={baseSpec} endpointsConfig={{}}>
        <button>Row</button>
      </ModelInfoTooltip>,
    );
    expect(screen.getByText('128K')).toBeInTheDocument();
  });

  it('does not render a supports section', () => {
    render(
      <ModelInfoTooltip
        spec={{
          ...baseSpec,
          details: {
            speed: 3,
            supports: { webSearch: true, imageGeneration: true, fileIngestion: true },
          },
        }}
        endpointsConfig={{}}
      >
        <button>Row</button>
      </ModelInfoTooltip>,
    );
    expect(screen.queryByText('com_ui_model_details_supports')).not.toBeInTheDocument();
  });
});
