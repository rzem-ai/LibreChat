import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import ModelSelector from '../ModelSelector';

const mockSetSearchValue = jest.fn();
const mockSetSelectedValues = jest.fn();
const mockOnOpenChange = jest.fn();

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('../ModelSelectorContext', () => ({
  ModelSelectorProvider: ({ children }: { children: React.ReactNode }) => children,
  useModelSelectorContext: () => ({
    agentsMap: new Map<string, string>(),
    modelSpecs: [],
    mappedEndpoints: [],
    endpointsConfig: {},
    searchValue: '',
    searchResults: null,
    selectedValues: { endpoint: 'openAI', model: '', modelSpec: '' },
    setSearchValue: mockSetSearchValue,
    setSelectedValues: mockSetSelectedValues,
    keyDialogOpen: false,
    onOpenChange: mockOnOpenChange,
    keyDialogEndpoint: undefined,
  }),
}));

jest.mock('../ModelSelectorChatContext', () => ({
  ModelSelectorChatProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('../CustomMenu', () => ({
  CustomMenu: ({ children, trigger }: { children: React.ReactNode; trigger: React.ReactNode }) => (
    <div>
      {trigger}
      {children}
    </div>
  ),
}));

jest.mock('../DialogManager', () => () => null);

jest.mock('../components', () => ({
  renderModelSpecs: () => null,
  renderEndpoints: () => null,
  renderSearchResults: () => null,
  renderCustomGroups: () => null,
}));

jest.mock('../utils', () => ({
  getSelectedIcon: () => null,
  getDisplayValue: () => 'Claude Sonnet 5',
}));

jest.mock('@librechat/client', () => ({
  TooltipAnchor: ({ render }: { render: React.ReactNode }) => render,
}));

describe('ModelSelector', () => {
  it('renders the trigger with the stable model-selector-button id', () => {
    render(<ModelSelector startupConfig={undefined} />);

    expect(screen.getByRole('button', { name: 'com_ui_select_model' })).toHaveAttribute(
      'id',
      'model-selector-button',
    );
  });
});
