import { getCourseSteps } from '../registry';

describe('getCourseSteps', () => {
  it('throws for an unregistered course id', () => {
    expect(() => getCourseSteps('not-a-real-course')).toThrow(
      'No tour steps registered for course "not-a-real-course"',
    );
  });

  describe('getting-started-guide', () => {
    const steps = getCourseSteps('getting-started-guide');

    it('starts with the merged welcome / new chat step', () => {
      expect(steps[0]).toEqual({
        element: '#new-chat-button',
        title: 'Welcome to MyAssist',
        description:
          "Welcome to the new and improved MyAssist! We've rebuilt from the ground up to give you access to more powerful AI tools, and this guided tour will get you comfortable navigating the chat interface and side panel.<br><br>This button starts a brand new conversation any time — your current chat is saved automatically, so nothing is lost.",
        side: 'right',
      });
      expect(steps[1].title).toBe('Model');
    });

    it('defines 16 steps, unconditionally including the agent-selection steps', () => {
      expect(steps).toHaveLength(16);
      expect(steps.slice(9, 12).map((step) => step.title)).toEqual([
        'Agent Builder',
        'Agent Marketplace',
        'Switch Back to a Model',
      ]);
      expect(steps[11]).toEqual({
        id: 'switch-back-to-model',
        element: '#model-selector-button',
        title: 'Switch Back to a Model',
        description:
          'If you are using an agent and want to return to a general model, open this selector and choose a standard model instead.',
        side: 'bottom',
      });
    });

    it('tags the two agent-selection steps for conditional filtering', () => {
      expect(steps[10].id).toBe('agent-marketplace');
      expect(steps[11].id).toBe('switch-back-to-model');
    });

    it('flags the Conversations step to expand the sidebar', () => {
      const conversationsStep = steps.find((step) => step.title === 'Conversations');
      expect(conversationsStep?.expandSidebarBefore).toBe(true);
      expect(steps.filter((step) => step.expandSidebarBefore).map((step) => step.title)).toEqual([
        'Conversations',
      ]);
    });

    it('ends with Library & Connectors, Personalize & Manage, MyAssist Academy, Account Menu', () => {
      expect(steps.slice(12).map((step) => step.title)).toEqual([
        'Library & Connectors',
        'Personalize & Manage',
        'MyAssist Academy',
        'Account Menu',
      ]);
    });
  });
});
