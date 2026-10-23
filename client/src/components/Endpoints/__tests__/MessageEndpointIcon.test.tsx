import React from 'react';
import '@testing-library/jest-dom';
import { EModelEndpoint, request } from 'librechat-data-provider';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import MessageEndpointIcon from '../MessageEndpointIcon';

// Deloitte Custom Change: intercept and clean up the authenticated agent-avatar request.
jest.mock('librechat-data-provider', () => ({
  ...jest.requireActual('librechat-data-provider'),
  request: {
    ...jest.requireActual('librechat-data-provider').request,
    getResponse: jest.fn(),
  },
}));

const originalCreateObjectURL = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
const originalRevokeObjectURL = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');

describe('MessageEndpointIcon agent avatar', (): void => {
  // Deloitte Custom Change: unmount the avatar hook before restoring object URL APIs.
  afterEach((): void => {
    cleanup();
    if (originalCreateObjectURL) {
      Object.defineProperty(URL, 'createObjectURL', originalCreateObjectURL);
    } else {
      Reflect.deleteProperty(URL, 'createObjectURL');
    }
    if (originalRevokeObjectURL) {
      Object.defineProperty(URL, 'revokeObjectURL', originalRevokeObjectURL);
    } else {
      Reflect.deleteProperty(URL, 'revokeObjectURL');
    }
    (request.getResponse as jest.Mock).mockReset();
  });

  // Deloitte Custom Change: verify message agent icons use the shared authenticated avatar loader once.
  it('fetches a private avatar once through the shared helper', async (): Promise<void> => {
    const blobPath = 'images/0123456789abcdef01234567/agent-agent-123-avatar-1730000000000.png';
    const proxyUrl = `/api/files/images/avatar?file=${Buffer.from(blobPath).toString('base64url')}`;
    const getResponse = request.getResponse as jest.Mock;
    getResponse.mockResolvedValue({ data: new Blob(['avatar'], { type: 'image/png' }) });
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: jest.fn(() => 'blob:message-agent-avatar'),
      writable: true,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: jest.fn(),
      writable: true,
    });

    render(
      <MessageEndpointIcon
        isCreatedByUser={false}
        endpoint={EModelEndpoint.agents}
        iconURL={proxyUrl}
        agentName="Private Agent"
        size={28}
      />,
    );

    await waitFor(() =>
      expect(screen.getByAltText('Private Agent')).toHaveAttribute(
        'src',
        'blob:message-agent-avatar',
      ),
    );
    expect(getResponse).toHaveBeenCalledTimes(1);
    expect(getResponse).toHaveBeenCalledWith(proxyUrl, { responseType: 'blob' });
  });
});
