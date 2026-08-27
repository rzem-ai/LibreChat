import { TStartupConfig } from 'librechat-data-provider';
import { ThemeSelector } from '@librechat/client';
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
    <div className="relative flex min-h-screen flex-col bg-[url('/assets/AI-Secondary-light.jpg')] bg-[length:auto_180vh] bg-[position:left_-37.5vh_top_-47.7vh] bg-no-repeat dark:bg-[url('/assets/AI-Secondary-dark.jpg')] dark:bg-black">
      <Banner />

      <DisplayError />
      <div className="absolute bottom-0 left-0 md:m-4">
        <ThemeSelector />
      </div>

      <main className="flex flex-grow items-center justify-center">
        <div
          className="w-authPageWidth rounded-xl overflow-hidden border border-border-light bg-card p-6 sm:max-w-md"
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
              className="mb-4 select-none text-center text-xl font-medium leading-none tracking-tight text-text-primary"
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
