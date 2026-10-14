import React from 'react';
import '@testing-library/jest-dom';
import { act, render, screen, fireEvent } from '@testing-library/react';
import TutorialPromptModal from '../TutorialPromptModal';

const mockStartGettingStartedTour = jest.fn();
const mockMarkPromptSeen = jest.fn();
const mockUseTutorialPrompt = jest.fn();
const mockSetSidebarExpanded = jest.fn();
const mockUseMediaQuery = jest.fn();
let mockSidebarExpanded = false;

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('@librechat/client', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  useMediaQuery: () => mockUseMediaQuery(),
  GEL: { Icon: { Academy: () => null } },
}));

jest.mock('recoil', () => ({
  useRecoilState: () => [mockSidebarExpanded, mockSetSidebarExpanded],
}));

jest.mock('~/store', () => ({
  __esModule: true,
  default: { sidebarExpanded: 'sidebarExpanded' },
}));

jest.mock('../LearningTourContext', () => ({
  useLearningTour: () => ({ startGettingStartedTour: mockStartGettingStartedTour }),
}));

jest.mock('~/hooks/Learning/useTutorialPrompt', () => ({
  __esModule: true,
  default: () => mockUseTutorialPrompt(),
}));

describe('TutorialPromptModal', () => {
  beforeEach(() => {
    // Use fake timers so the 400ms readyToShow delay can be controlled in tests.
    jest.useFakeTimers();
    mockUseMediaQuery.mockReturnValue(false);
    mockSidebarExpanded = false;
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('does not render its content when the gate says not to show it', () => {
    mockUseTutorialPrompt.mockReturnValue({
      shouldShowPrompt: false,
      markPromptSeen: mockMarkPromptSeen,
    });
    render(<TutorialPromptModal />);
    // Advance past the delay — even so, shouldShowPrompt=false means nothing renders.
    act(() => {
      jest.advanceTimersByTime(400);
    });
    expect(screen.queryByText('com_learning_prompt_body')).not.toBeInTheDocument();
  });

  it('renders the prompt and starts the tour on accept', () => {
    mockUseTutorialPrompt.mockReturnValue({
      shouldShowPrompt: true,
      markPromptSeen: mockMarkPromptSeen,
    });
    render(<TutorialPromptModal chatReady />);
    // Advance past the 400ms readyToShow delay so isVisible becomes true.
    act(() => {
      jest.advanceTimersByTime(400);
    });

    expect(screen.getByText('com_learning_prompt_body')).toBeInTheDocument();

    fireEvent.click(screen.getByText('com_learning_prompt_accept'));

    expect(mockStartGettingStartedTour).toHaveBeenCalledTimes(1);
  });

  it('marks the prompt seen without switching panels on decline', () => {
    mockUseTutorialPrompt.mockReturnValue({
      shouldShowPrompt: true,
      markPromptSeen: mockMarkPromptSeen,
    });
    render(<TutorialPromptModal chatReady />);
    // Advance past the 400ms readyToShow delay so isVisible becomes true.
    act(() => {
      jest.advanceTimersByTime(400);
    });

    fireEvent.click(screen.getByText('com_learning_prompt_decline'));

    expect(mockMarkPromptSeen).toHaveBeenCalledTimes(1);
    expect(mockStartGettingStartedTour).not.toHaveBeenCalled();
  });

  it('opens the mobile sidebar before rendering the prompt', () => {
    mockUseMediaQuery.mockReturnValue(true);
    mockUseTutorialPrompt.mockReturnValue({
      shouldShowPrompt: true,
      markPromptSeen: mockMarkPromptSeen,
    });
    render(<TutorialPromptModal chatReady />);

    act(() => {
      jest.advanceTimersByTime(400);
    });

    expect(mockSetSidebarExpanded).toHaveBeenCalledWith(true);
    expect(screen.queryByText('com_learning_prompt_body')).not.toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(screen.getByText('com_learning_prompt_body')).toBeInTheDocument();
  });

  describe('sidebar overlay clip-path cutout (Decision D1)', () => {
    function renderVisible() {
      mockUseTutorialPrompt.mockReturnValue({
        shouldShowPrompt: true,
        markPromptSeen: mockMarkPromptSeen,
      });
      render(<TutorialPromptModal chatReady />);
      act(() => {
        jest.advanceTimersByTime(400);
      });
    }

    it('renders a solid sidebar overlay (no clip-path) when the icon element is absent', () => {
      // Default jsdom DOM has no #nav-panel-learning — iconRect stays null.
      renderVisible();
      // Find the sidebar overlay (the bg-black/10 fixed div).

      const overlays = document.querySelectorAll<HTMLElement>('[aria-hidden="true"]');
      const sidebarOverlay = Array.from(overlays).find((el) =>
        el.className.includes('bg-black/10'),
      );
      expect(sidebarOverlay).toBeTruthy();
      // No clip-path applied when iconRect is null (fallback to prior behaviour).
      expect(sidebarOverlay?.style.clipPath).toBeFalsy();
    });

    it('applies a clip-path cutout when the icon element has a valid bounding rect', () => {
      // Inject a stub icon element with a realistic rect so iconRect is non-null/non-zero.
      const iconEl = document.createElement('button');
      iconEl.id = 'nav-panel-learning';
      document.body.appendChild(iconEl);

      const ICON_TOP = 400;
      const ICON_LEFT = 6;
      const ICON_W = 36;
      const ICON_H = 36;
      jest.spyOn(iconEl, 'getBoundingClientRect').mockReturnValue({
        top: ICON_TOP,
        left: ICON_LEFT,
        width: ICON_W,
        height: ICON_H,
        right: ICON_LEFT + ICON_W,
        bottom: ICON_TOP + ICON_H,
        x: ICON_LEFT,
        y: ICON_TOP,
        toJSON: () => ({}),
      } as DOMRect);

      renderVisible();

      const overlays = document.querySelectorAll<HTMLElement>('[aria-hidden="true"]');
      const sidebarOverlay = Array.from(overlays).find((el) =>
        el.className.includes('bg-black/10'),
      );
      expect(sidebarOverlay).toBeTruthy();

      const clipPath = sidebarOverlay?.style.clipPath ?? '';
      expect(clipPath).toContain('polygon(');
      // The cutout's top-left corner must appear in the polygon string.
      expect(clipPath).toContain(`${ICON_LEFT}px ${ICON_TOP}px`);
      // The cutout's bottom-right corner must appear.
      expect(clipPath).toContain(`${ICON_LEFT + ICON_W}px ${ICON_TOP + ICON_H}px`);

      document.body.removeChild(iconEl);
    });

    it('falls back to a solid overlay when the icon rect is degenerate (zero-size)', () => {
      const iconEl = document.createElement('button');
      iconEl.id = 'nav-panel-learning';
      document.body.appendChild(iconEl);

      // jsdom default: all-zero rect — should trigger the degenerate-rect guard.
      jest.spyOn(iconEl, 'getBoundingClientRect').mockReturnValue({
        top: 0,
        left: 0,
        width: 0,
        height: 0,
        right: 0,
        bottom: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect);

      renderVisible();

      const overlays = document.querySelectorAll<HTMLElement>('[aria-hidden="true"]');
      const sidebarOverlay = Array.from(overlays).find((el) =>
        el.className.includes('bg-black/10'),
      );
      expect(sidebarOverlay?.style.clipPath).toBeFalsy();

      document.body.removeChild(iconEl);
    });

    it('updates the clip-path on window resize', () => {
      const iconEl = document.createElement('button');
      iconEl.id = 'nav-panel-learning';
      document.body.appendChild(iconEl);

      const mockGetBoundingClientRect = jest.spyOn(iconEl, 'getBoundingClientRect');
      mockGetBoundingClientRect.mockReturnValue({
        top: 400,
        left: 6,
        width: 36,
        height: 36,
        right: 42,
        bottom: 436,
        x: 6,
        y: 400,
        toJSON: () => ({}),
      } as DOMRect);

      renderVisible();

      // Simulate resize — icon moves down (e.g. user zooms in).
      mockGetBoundingClientRect.mockReturnValue({
        top: 500,
        left: 6,
        width: 36,
        height: 36,
        right: 42,
        bottom: 536,
        x: 6,
        y: 500,
        toJSON: () => ({}),
      } as DOMRect);

      act(() => {
        window.dispatchEvent(new Event('resize'));
      });

      const overlays = document.querySelectorAll<HTMLElement>('[aria-hidden="true"]');
      const sidebarOverlay = Array.from(overlays).find((el) =>
        el.className.includes('bg-black/10'),
      );
      // After resize, clip-path should reflect the new icon position (top=500).
      expect(sidebarOverlay?.style.clipPath).toContain('6px 500px');

      document.body.removeChild(iconEl);
    });
  });
});
