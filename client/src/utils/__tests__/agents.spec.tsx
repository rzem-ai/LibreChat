import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import type t from 'librechat-data-provider';
import { getAgentAvatarUrl, renderAgentAvatar, getContactDisplayName } from '../agents';

// Mock the Feather icon from lucide-react
jest.mock('lucide-react', () => ({
  Feather: ({ className, strokeWidth, ...props }: any) => (
    <svg
      data-testid="feather-icon"
      className={className}
      data-stroke-width={strokeWidth}
      {...props}
    >
      <title>{/* eslint-disable-line i18next/no-literal-string */}Feather Icon</title>
    </svg>
  ),
}));

describe('Agent Utilities', () => {
  describe('getAgentAvatarUrl', () => {
    it('should return null for null agent', () => {
      expect(getAgentAvatarUrl(null)).toBeNull();
    });

    it('should return null for undefined agent', () => {
      expect(getAgentAvatarUrl(undefined)).toBeNull();
    });

    it('should return null for agent without avatar', () => {
      const agent = { id: '1', name: 'Test Agent' } as t.Agent;
      expect(getAgentAvatarUrl(agent)).toBeNull();
    });

    it('should return string avatar directly', () => {
      const agent = {
        id: '1',
        name: 'Test Agent',
        avatar: '/path/to/avatar.png',
      } as unknown as t.Agent;
      expect(getAgentAvatarUrl(agent)).toBe('/path/to/avatar.png');
    });

    it('should extract filepath from object avatar', () => {
      const agent = {
        id: '1',
        name: 'Test Agent',
        avatar: { filepath: '/path/to/object-avatar.png' },
      } as t.Agent;
      expect(getAgentAvatarUrl(agent)).toBe('/path/to/object-avatar.png');
    });

    // Deloitte Custom Change: keep legacy private Azure avatar URLs on the authenticated route.
    it('proxies private Azure Blob avatar URLs through the authenticated avatar route', () => {
      const agent = {
        id: 'agent-123',
        name: 'Test Agent',
        avatar: {
          filepath:
            'https://storage.blob.core.windows.net/private-container/images/0123456789abcdef01234567/agent-agent-123-avatar-1730000000000.png',
        },
      } as t.Agent;
      const blobPath = 'images/0123456789abcdef01234567/agent-agent-123-avatar-1730000000000.png';
      const encodedPath = btoa(blobPath).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

      expect(getAgentAvatarUrl(agent)).toBe(`/api/files/images/avatar?file=${encodedPath}`);
    });

    // Deloitte Custom Change: cover the sovereign Azure clouds the platform deploys to.
    it('proxies Azure Blob avatar URLs from sovereign cloud hosts', () => {
      const agent = {
        id: 'agent-123',
        name: 'Test Agent',
        avatar: {
          filepath:
            'https://storage.blob.core.usgovcloudapi.net/files/images/0123456789abcdef01234567/agent-agent-123-avatar-1730000000000.png',
        },
      } as t.Agent;
      const blobPath = 'images/0123456789abcdef01234567/agent-agent-123-avatar-1730000000000.png';
      const encodedPath = btoa(blobPath).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

      expect(getAgentAvatarUrl(agent)).toBe(`/api/files/images/avatar?file=${encodedPath}`);
    });

    // Deloitte Custom Change: drop the SAS query string, the proxy authenticates on its own.
    it('proxies Azure Blob avatar URLs that carry a SAS query string', () => {
      const agent = {
        id: 'agent-123',
        name: 'Test Agent',
        avatar: {
          filepath:
            'https://storage.blob.core.windows.net/files/images/0123456789abcdef01234567/agent-agent-123-avatar-1730000000000.png?sv=2021-08-06&sig=secret',
        },
      } as t.Agent;
      const blobPath = 'images/0123456789abcdef01234567/agent-agent-123-avatar-1730000000000.png';

      expect(getAgentAvatarUrl(agent)).toBe(
        `/api/files/images/avatar?file=${Buffer.from(blobPath).toString('base64url')}`,
      );
    });

    // Deloitte Custom Change: encode the blob path from its UTF-8 bytes, as the server decodes it.
    it('encodes blob paths that contain characters outside Latin-1', () => {
      const blobPath = 'images/0123456789abcdef01234567/agent-agent-ü-avatar-1730000000000.png';
      const agent = {
        id: 'agent-123',
        name: 'Test Agent',
        avatar: {
          filepath: `https://storage.blob.core.windows.net/files/${blobPath}`,
        },
      } as t.Agent;
      const proxied = getAgentAvatarUrl(agent);

      expect(proxied).not.toBeNull();
      const encodedPath = new URL(proxied as string, 'http://localhost').searchParams.get('file');
      expect(encodedPath).not.toBeNull();
      expect(Buffer.from(encodedPath as string, 'base64url').toString('utf8')).toBe(blobPath);
    });

    // Deloitte Custom Change: only avatar blobs are proxied, other Azure files keep their URL.
    it('leaves Azure Blob URLs that are not agent avatars unchanged', () => {
      const agent = {
        id: 'agent-123',
        name: 'Test Agent',
        avatar: {
          filepath:
            'https://storage.blob.core.windows.net/files/documents/0123456789abcdef01234567/report.pdf',
        },
      } as t.Agent;

      expect(getAgentAvatarUrl(agent)).toBe(
        'https://storage.blob.core.windows.net/files/documents/0123456789abcdef01234567/report.pdf',
      );
    });

    // Deloitte Custom Change: preserve CDN URLs and prevent double-proxying.
    it('leaves non-Azure URLs and already proxied avatars unchanged', () => {
      const cdnAgent = {
        id: '1',
        name: 'CDN Agent',
        avatar: { filepath: 'https://cdn.example.com/avatar.png' },
      } as t.Agent;
      const proxiedAgent = {
        id: '2',
        name: 'Proxied Agent',
        avatar: { filepath: '/api/files/images/avatar?file=YWJj' },
      } as t.Agent;

      expect(getAgentAvatarUrl(cdnAgent)).toBe('https://cdn.example.com/avatar.png');
      expect(getAgentAvatarUrl(proxiedAgent)).toBe('/api/files/images/avatar?file=YWJj');
    });

    it('should return null for object avatar without filepath', () => {
      const agent = {
        id: '1',
        name: 'Test Agent',
        avatar: { someOtherProperty: 'value' },
      } as any;
      expect(getAgentAvatarUrl(agent)).toBeNull();
    });
  });

  describe('renderAgentAvatar', () => {
    it('should render image when avatar URL exists', () => {
      const agent = {
        id: '1',
        name: 'Test Agent',
        avatar: '/test-avatar.png',
      } as unknown as t.Agent;

      render(<div>{renderAgentAvatar(agent)}</div>);

      const img = screen.getByAltText('Test Agent avatar');
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('src', '/test-avatar.png');
      expect(img).toHaveClass('rounded-full', 'object-cover', 'shadow-lg');
    });

    it('should render Feather icon fallback when no avatar', () => {
      const agent = {
        id: '1',
        name: 'Test Agent',
      } as t.Agent;

      render(<div>{renderAgentAvatar(agent)}</div>);

      const featherIcon = screen.getByTestId('feather-icon');
      expect(featherIcon).toBeInTheDocument();
      expect(featherIcon).toHaveAttribute('data-stroke-width', '1.5');
    });

    it('should apply different size classes', () => {
      const agent = {
        id: '1',
        name: 'Test Agent',
        avatar: '/test-avatar.png',
      } as unknown as t.Agent;

      const { rerender } = render(<div>{renderAgentAvatar(agent, { size: 'sm' })}</div>);
      expect(screen.getByAltText('Test Agent avatar')).toHaveClass('h-12', 'w-12');

      rerender(<div>{renderAgentAvatar(agent, { size: 'lg' })}</div>);
      expect(screen.getByAltText('Test Agent avatar')).toHaveClass('h-20', 'w-20');

      rerender(<div>{renderAgentAvatar(agent, { size: 'xl' })}</div>);
      expect(screen.getByAltText('Test Agent avatar')).toHaveClass('h-24', 'w-24');
    });

    it('should apply custom className', () => {
      const agent = {
        id: '1',
        name: 'Test Agent',
        avatar: '/test-avatar.png',
      } as unknown as t.Agent;

      render(<div>{renderAgentAvatar(agent, { className: 'custom-class' })}</div>);

      const container = screen.getByAltText('Test Agent avatar').parentElement;
      expect(container).toHaveClass('custom-class');
    });

    it('should handle showBorder option', () => {
      const agent = {
        id: '1',
        name: 'Test Agent',
        avatar: '/test-avatar.png',
      } as unknown as t.Agent;

      const { rerender } = render(<div>{renderAgentAvatar(agent, { showBorder: true })}</div>);
      expect(screen.getByAltText('Test Agent avatar')).toHaveClass('border-1');

      rerender(<div>{renderAgentAvatar(agent, { showBorder: false })}</div>);
      expect(screen.getByAltText('Test Agent avatar')).not.toHaveClass('border-1');
    });
  });

  describe('getContactDisplayName', () => {
    it('should return null for null agent', () => {
      expect(getContactDisplayName(null)).toBeNull();
    });

    it('should return null for undefined agent', () => {
      expect(getContactDisplayName(undefined)).toBeNull();
    });

    it('should prioritize support_contact name', () => {
      const agent = {
        id: '1',
        support_contact: { name: 'Support Team', email: 'support@example.com' },
        authorName: 'John Doe',
      } as any;
      expect(getContactDisplayName(agent)).toBe('Support Team');
    });

    it('should use authorName when support_contact name is missing', () => {
      const agent = {
        id: '1',
        support_contact: { email: 'support@example.com' },
        authorName: 'John Doe',
      } as any;
      expect(getContactDisplayName(agent)).toBe('John Doe');
    });

    it('should use support_contact email when both name and authorName are missing', () => {
      const agent = {
        id: '1',
        support_contact: { email: 'support@example.com' },
      } as any;
      expect(getContactDisplayName(agent)).toBe('support@example.com');
    });

    it('should return null when no contact info is available', () => {
      const agent = {
        id: '1',
        name: 'Test Agent',
      } as any;
      expect(getContactDisplayName(agent)).toBeNull();
    });
  });

  // Tests for hardcoded category functions removed - now using database-driven categories
});
