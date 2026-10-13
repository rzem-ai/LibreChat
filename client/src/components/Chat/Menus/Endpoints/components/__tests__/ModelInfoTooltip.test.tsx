/* eslint-disable i18next/no-literal-string */
// Deloitte Custom Change: render coverage for the ModelInfoTooltip wrapper — this layer only
// resolves spec/pricing/context data into props; the presentational rendering (HoverCard,
// rating meters, alignment) lives in and is covered by @librechat/client's gel ModelInfoTooltip.
import { render, screen } from '@testing-library/react';
import type { ModelInfoTooltipProps } from '@librechat/client';
import type { TModelSpec } from 'librechat-data-provider';
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

// Deloitte Custom Change: stub out the shared presentational component so these tests assert
// on the props the wrapper computes, not on @librechat/client's own rendering (tested there).
jest.mock('@librechat/client', () => ({
  ...jest.requireActual('@librechat/client'),
  ModelInfoTooltip: ({ children, ...props }: ModelInfoTooltipProps) => (
    <div data-testid="gel-tooltip">
      <span data-testid="group">{props.group}</span>
      <span data-testid="label">{props.label}</span>
      {props.description}
      {props.speed != null && (
        <span data-testid="speed">{`${props.labels.speed}:${props.speed}`}</span>
      )}
      {props.intelligence != null && (
        <span data-testid="intelligence">{`${props.labels.intelligence}:${props.intelligence}`}</span>
      )}
      {props.cost && (
        <span data-testid="cost">
          {`${props.labels.cost}:${props.cost.tier}:${props.cost.inputText}:${props.cost.outputText}`}
        </span>
      )}
      {props.contextLabel && (
        <span data-testid="context">{`${props.labels.context}:${props.contextLabel}`}</span>
      )}
      {props.supports && props.supports.length > 0 && (
        <span data-testid="supports">{`${props.labels.supports}:${props.supports.join(',')}`}</span>
      )}
      {children}
    </div>
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
    expect(screen.queryByTestId('gel-tooltip')).not.toBeInTheDocument();
  });

  it('passes the stacked group name and spec label through as props', () => {
    render(
      <ModelInfoTooltip spec={{ ...baseSpec, details: { speed: 3 } }} endpointsConfig={{}}>
        <button>Row</button>
      </ModelInfoTooltip>,
    );
    expect(screen.getByTestId('group')).toHaveTextContent('OpenAI Global');
    expect(screen.getByTestId('label')).toHaveTextContent('My Spec');
  });

  it('passes speed and intelligence through as raw N-of-5 values', () => {
    render(
      <ModelInfoTooltip
        spec={{ ...baseSpec, details: { speed: 3, intelligence: 5 } }}
        endpointsConfig={{}}
      >
        <button>Row</button>
      </ModelInfoTooltip>,
    );
    expect(screen.getByTestId('speed')).toHaveTextContent('com_ui_model_details_speed:3');
    expect(screen.getByTestId('intelligence')).toHaveTextContent(
      'com_ui_model_details_intelligence:5',
    );
  });

  it('resolves pricing into a cost prop with tier and localized price lines', () => {
    mockModelPricing = { 'openAI:gpt-5': { tier: 2, inputPer1M: 1, outputPer1M: 6 } };
    render(
      <ModelInfoTooltip spec={baseSpec} endpointsConfig={{}}>
        <button>Row</button>
      </ModelInfoTooltip>,
    );
    expect(screen.getByTestId('cost')).toHaveTextContent(
      'com_ui_model_details_cost:2:com_ui_model_details_cost_input:$1.00:com_ui_model_details_cost_output:$6.00',
    );
  });

  it('formats context tokens into a contextLabel prop', () => {
    mockTokenConfig = { openAI: { 'gpt-5': { context: 128000 } } };
    render(
      <ModelInfoTooltip spec={baseSpec} endpointsConfig={{}}>
        <button>Row</button>
      </ModelInfoTooltip>,
    );
    expect(screen.getByTestId('context')).toHaveTextContent('com_ui_model_details_context:128K');
  });

  it('passes a supports list containing only the enabled capabilities', () => {
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
    expect(screen.getByTestId('supports')).toHaveTextContent(
      'com_ui_model_details_supports:com_ui_web_search,com_ui_model_details_image_generation',
    );
  });

  it('omits the supports prop entirely when no capabilities are enabled', () => {
    render(
      <ModelInfoTooltip
        spec={{ ...baseSpec, details: { speed: 3, supports: {} } }}
        endpointsConfig={{}}
      >
        <button>Row</button>
      </ModelInfoTooltip>,
    );
    expect(screen.queryByTestId('supports')).not.toBeInTheDocument();
  });
});
