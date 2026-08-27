import { useEffect, useState, useContext } from 'react';
import { ErrorTypes } from 'librechat-data-provider';
import { useToastContext, ThemeContext, isDark } from '@librechat/client';
import { useOutletContext, useSearchParams, useLocation } from 'react-router-dom';
import type { TLoginLayoutContext } from '~/common';
import { persistRedirectToSession } from '~/utils';
import { useLocalize } from '~/hooks';

interface LoginLocationState {
  redirect_to?: string;
}

function Login() {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { startupConfig } = useOutletContext<TLoginLayoutContext>();
  const { theme } = useContext(ThemeContext);
  const darkMode = isDark(theme);

  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const disableAutoRedirect = searchParams.get('redirect') === 'false';

  const [isAutoRedirectDisabled, setIsAutoRedirectDisabled] = useState(disableAutoRedirect);

  useEffect(() => {
    const redirectTo = searchParams.get('redirect_to');
    if (redirectTo) {
      persistRedirectToSession(redirectTo);
    } else {
      const state = location.state as LoginLocationState | null;
      if (state?.redirect_to) {
        persistRedirectToSession(state.redirect_to);
      }
    }

    const oauthError = searchParams?.get('error');
    if (oauthError && oauthError === ErrorTypes.AUTH_FAILED) {
      showToast({
        message: localize('com_auth_error_oauth_failed'),
        status: 'error',
      });
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('error');
      setSearchParams(newParams, { replace: true });
    }
  }, [searchParams, setSearchParams, showToast, localize, location.state]);

  useEffect(() => {
    if (disableAutoRedirect) {
      setIsAutoRedirectDisabled(true);
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('redirect');
      setSearchParams(newParams, { replace: true });
    }
  }, [disableAutoRedirect, searchParams, setSearchParams]);

  const shouldAutoRedirect =
    startupConfig?.openidLoginEnabled &&
    startupConfig?.openidAutoRedirect &&
    startupConfig?.serverDomain &&
    !isAutoRedirectDisabled;

  useEffect(() => {
    if (shouldAutoRedirect) {
      console.log('Auto-redirecting to OpenID provider...');
      window.location.href = `${startupConfig.serverDomain}/oauth/openid`;
    }
  }, [shouldAutoRedirect, startupConfig]);

  if (shouldAutoRedirect) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-4">
        <p className="text-lg font-semibold">
          {localize('com_ui_redirecting_to_provider', { 0: startupConfig.openidLabel })}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="mt-6 flex justify-center">
        <a
          aria-label="Continue with SSO"
          className="flex h-10 w-fit items-center justify-center space-x-2 rounded-md bg-[#0A0A0A] px-8 text-white transition-colors duration-200 hover:bg-[#1A1A1A] dark:bg-white dark:text-[#0A0A0A] dark:hover:bg-gray-200"
          style={{ border: 'var(--border-width-w-100, 1px) solid var(--input, #D4D4D4)' }}
          href={`${startupConfig?.serverDomain}/oauth/openid`}
          data-testid="sso-login-button"
        >
          <img
            src={darkMode ? 'assets/fav-dark.svg' : 'assets/fav-light.svg'}
            alt="Deloitte"
            className="h-5 w-5"
          />
          <p className="text-sm">{localize('com_auth_continue_with_sso')}</p>
        </a>
      </div>
    </>
  );
}

export default Login;
