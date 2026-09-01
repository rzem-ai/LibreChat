import React from 'react';

const SocialButton = ({ id, enabled, serverDomain, oauthPath, Icon, label }) => {
  if (!enabled) {
    return null;
  }

  return (
    <div className="mt-6 flex justify-center">
      <a
        aria-label={`${label}`}
        className="flex h-10 w-fit items-center justify-center space-x-2 rounded-md border border-border bg-foreground px-8 text-background transition-opacity duration-200 hover:opacity-90"
        href={`${serverDomain}/oauth/${oauthPath}`}
        data-testid={id}
      >
        <Icon />
        <span className="text-sm">{label}</span>
      </a>
    </div>
  );
};

export default SocialButton;
