import { useContext } from 'react';
import { TStartupConfig } from 'librechat-data-provider';
import { ThemeSelector, ThemeContext, isDark } from '@librechat/client';
import { DeloitteLogo } from '~/components/DeloitteComponents/DeloitteLogo';
import { ErrorMessage } from '~/components/Auth/ErrorMessage';
import { TranslationKeys, useLocalize } from '~/hooks';
import SocialLoginRender from './SocialLoginRender';
import { Banner } from '../Banners';
import Footer from './Footer';

function AuthLayout({
  children,
  header,
  isFetching,
  startupConfig,
  startupConfigError,
  pathname,
  error,
}: {
  children: React.ReactNode;
  header: React.ReactNode;
  isFetching: boolean;
  startupConfig: TStartupConfig | null | undefined;
  startupConfigError: unknown | null | undefined;
  pathname: string;
  error: TranslationKeys | null;
}) {
  const localize = useLocalize();
  const { theme } = useContext(ThemeContext);

  const bgImage = isDark(theme)
    ? 'url(/assets/AI-Secondary-dark.jpg)'
    : 'url(/assets/AI-Secondary-light.jpg)';
  const bgColor = isDark(theme) ? '#000000' : undefined;

  const hasStartupConfigError = startupConfigError !== null && startupConfigError !== undefined;
  const DisplayError = () => {
    if (hasStartupConfigError) {
      return (
        <div className="mx-auto sm:max-w-sm">
          <ErrorMessage>{localize('com_auth_error_login_server')}</ErrorMessage>
        </div>
      );
    } else if (error === 'com_auth_error_invalid_reset_token') {
      return (
        <div className="mx-auto sm:max-w-sm">
          <ErrorMessage>
            {localize('com_auth_error_invalid_reset_token')}{' '}
            <a className="font-medium text-primary hover:underline" href="/forgot-password">
              {localize('com_auth_click_here')}
            </a>{' '}
            {localize('com_auth_to_try_again')}
          </ErrorMessage>
        </div>
      );
    } else if (error != null && error) {
      return (
        <div className="mx-auto sm:max-w-sm">
          <ErrorMessage>{localize(error)}</ErrorMessage>
        </div>
      );
    }
    return null;
  };

  return (
    <div
      className="relative flex min-h-screen flex-col bg-left bg-no-repeat"
      style={{
        backgroundImage: bgImage,
        backgroundSize: 'auto 180vh',
        backgroundPosition: 'left -37.5vh top -47.7vh',
        backgroundColor: bgColor,
      }}
    >
      <Banner />

      <DisplayError />
      <div className="absolute bottom-0 left-0 md:m-4">
        <ThemeSelector />
      </div>

      <main className="flex flex-grow items-center justify-center">
        <div
          className="w-authPageWidth overflow-hidden border border-border-light p-6 sm:max-w-md"
          style={{
            backgroundColor: 'var(--card)',
            borderRadius: 'var(--radius-rounded-xl, 14.4px)',
          }}
        >
          {!hasStartupConfigError && !isFetching && (
            <div className="mb-3 flex justify-center">
              <div className="h-6 w-24 bg-cover">
                <DeloitteLogo className="h-full w-full text-foreground" />
              </div>
            </div>
          )}
          {!hasStartupConfigError && !isFetching && header && (
            <h1
              className="mb-4 text-center text-xl font-medium leading-none text-text-primary"
              style={{ userSelect: 'none', letterSpacing: '-0.6px' }}
            >
              {header}
            </h1>
          )}
          {children}
          {!pathname.includes('2fa') &&
            (pathname.includes('login') || pathname.includes('register')) && (
              <SocialLoginRender startupConfig={startupConfig} />
            )}
        </div>
      </main>
      <Footer startupConfig={startupConfig} />
    </div>
  );
}

export default AuthLayout;
