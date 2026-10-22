import { getCourseSteps } from '../registry';

describe('getCourseSteps', () => {
  it('throws for an unregistered course id', () => {
    expect(() => getCourseSteps('not-a-real-course')).toThrow(
      'No tour steps registered for course "not-a-real-course"',
    );
  });

  describe('getting-started-guide', () => {
    const steps = getCourseSteps('getting-started-guide');

    it('starts with separate welcome and new chat steps', () => {
      expect(steps[0]).toEqual({
        element: '#new-chat-button',
        title: 'Welcome to MyAssist',
        description:
          "Welcome to the new and improved MyAssist! We've rebuilt from the ground up to give you access to more powerful AI tools.<br><br>In this guided tour, we'll take you through the chat interface and side panel, so you are comfortable navigating through the platform.",
        side: 'right',
      });
      expect(steps[1].title).toBe('New Chat');
      expect(steps[2].title).toBe('Model');
    });

    it('defines 24 steps, unconditionally including the agent-selection steps', () => {
      expect(steps).toHaveLength(25);
      expect(steps.slice(13, 16).map((step) => step.title)).toEqual([
        'Agent Builder',
        'Agent Library',
        'Switch Back to a Model',
      ]);
      expect(steps[15]).toEqual({
        id: 'switch-back-to-model',
        element: '#model-selector-button',
        title: 'Switch Back to a Model',
        description:
          'If you are using an agent and want to return to a general model, open this selector and choose a standard model instead.',
        side: 'bottom',
      });
    });

    it('tags the two agent-selection steps for conditional filtering', () => {
      expect(steps[14].id).toBe('agent-marketplace');
      expect(steps[15].id).toBe('switch-back-to-model');
    });

    it('flags the Conversations step to expand the sidebar', () => {
      const conversationsStep = steps.find((step) => step.title === 'Conversations');
      expect(conversationsStep?.expandSidebarBefore).toBe(true);
      expect(steps.filter((step) => step.expandSidebarBefore).map((step) => step.title)).toEqual([
        'Conversations',
      ]);
    });

    it('ends with the individual library/connector/panel steps, MyAssist Academy, Balance, Account Menu', () => {
      expect(steps.slice(16).map((step) => step.title)).toEqual([
        'Skill Library',
        'Prompt Library',
        'Memories',
        'Files',
        'Parameters',
        'Connectors',
        'MyAssist Academy',
        'Balance',
        'Account Menu',
      ]);
    });
  });
});
