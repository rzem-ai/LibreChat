/* eslint-disable i18next/no-literal-string */
// Deloitte Custom Change: new file — render coverage for the rebuilt model info tooltip
// (Figma node 855:37722): header stacking, rating meters, cost lines, context, and supports.
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

  it('renders Speed and Intelligence as N-of-5 rating meters, centered with their label', () => {
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
    expect(screen.getByText('com_ui_model_details_speed').parentElement).toHaveClass(
      'items-center',
    );
    expect(screen.getByText('com_ui_model_details_intelligence').parentElement).toHaveClass(
      'items-center',
    );
  });

  it('renders a cost meter with input/output price lines, top-aligned with its label', () => {
    mockModelPricing = { 'openAI:gpt-5': { tier: 2, inputPer1M: 1, outputPer1M: 6 } };
    render(
      <ModelInfoTooltip spec={baseSpec} endpointsConfig={{}}>
        <button>Row</button>
      </ModelInfoTooltip>,
    );
    expect(screen.getByRole('img', { name: '2 of 5' })).toBeInTheDocument();
    expect(screen.getByText(/com_ui_model_details_cost_input/)).toBeInTheDocument();
    expect(screen.getByText(/com_ui_model_details_cost_output/)).toBeInTheDocument();
    expect(screen.getByText('com_ui_model_details_cost').parentElement).toHaveClass('items-start');
  });

  it('renders context as plain text with no meter, top-aligned with its label', () => {
    mockTokenConfig = { openAI: { 'gpt-5': { context: 128000 } } };
    render(
      <ModelInfoTooltip spec={baseSpec} endpointsConfig={{}}>
        <button>Row</button>
      </ModelInfoTooltip>,
    );
    expect(screen.getByText('128K')).toBeInTheDocument();
    expect(screen.getByText('com_ui_model_details_context').parentElement).toHaveClass(
      'items-start',
    );
  });

  it('renders a supports section listing only the enabled capabilities', () => {
    render(
      <ModelInfoTooltip
        spec={{
          ...baseSpec,
          details: {
            speed: 3,
            supports: { webSearch: true, imageGeneration: true, fileIngestion: false },
          },
        }}
        endpointsConfig={{}}
      >
        <button>Row</button>
      </ModelInfoTooltip>,
    );
    expect(screen.getByText('com_ui_model_details_supports')).toBeInTheDocument();
    expect(screen.getByText('com_ui_web_search')).toBeInTheDocument();
    expect(screen.getByText('com_ui_model_details_image_generation')).toBeInTheDocument();
    expect(screen.queryByText('com_ui_model_details_file_ingestion')).not.toBeInTheDocument();
  });

  it('omits the supports section entirely when no capabilities are enabled', () => {
    render(
      <ModelInfoTooltip
        spec={{ ...baseSpec, details: { speed: 3, supports: {} } }}
        endpointsConfig={{}}
      >
        <button>Row</button>
      </ModelInfoTooltip>,
    );
    expect(screen.queryByText('com_ui_model_details_supports')).not.toBeInTheDocument();
  });
});
