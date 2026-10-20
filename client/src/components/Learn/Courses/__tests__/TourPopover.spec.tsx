import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import TourPopover from '../TourPopover';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

const baseProps = {
  title: 'Step title',
  progressText: '1 of 3',
  nextLabel: 'com_ui_next',
  canGoPrevious: false,
  onPrevious: jest.fn(),
  onNext: jest.fn(),
  onClose: jest.fn(),
};

describe('TourPopover', () => {
  it('renders <br>/<strong> description markup instead of literal tag text', () => {
    render(
      <TourPopover
        {...baseProps}
        description="First line.<br/><br/><strong>Bold</strong> second line."
      />,
    );

    expect(screen.getByText('Bold').tagName).toBe('STRONG');
    expect(screen.queryByText(/<br/)).not.toBeInTheDocument();
    expect(screen.queryByText(/<strong/)).not.toBeInTheDocument();
  });

  it('strips a disallowed tag from the description instead of rendering it', () => {
    render(<TourPopover {...baseProps} description="<img src=x onerror=alert(1) />Safe text" />);

    expect(screen.getByText('Safe text')).toBeInTheDocument();
    expect(document.querySelector('img')).not.toBeInTheDocument();
  });
});
