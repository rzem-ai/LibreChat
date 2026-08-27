import React from 'react';

const SocialButton = ({ id, enabled, serverDomain, oauthPath, Icon, label }) => {
  if (!enabled) {
    return null;
  }

  return (
    <div className="mt-6 flex justify-center">
      <a
        aria-label={`${label}`}
        className="flex h-10 w-fit items-center justify-center space-x-2 rounded-md bg-[#0A0A0A] px-8 text-white transition-colors duration-200 hover:bg-[#1A1A1A] dark:bg-white dark:text-[#0A0A0A] dark:hover:bg-gray-200"
        style={{ border: 'var(--border-width-w-100, 1px) solid var(--input, #D4D4D4)' }}
        href={`${serverDomain}/oauth/${oauthPath}`}
        data-testid={id}
      >
        <Icon />
        <p className="text-sm">{label}</p>
      </a>
    </div>
  );
};

export default SocialButton;
