import { Lockup } from './LogoLockup';

export const DeloitteHeader = () => {
  return (
    <header className="flex h-[var(--header-height)] select-none items-center border-b border-border-light bg-surface-primary-alt px-4">
      <Lockup title="MyAssist" />
    </header>
  );
};
