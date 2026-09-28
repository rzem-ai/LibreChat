import { useEffect, useState } from 'react';
import { useRecoilValue } from 'recoil';
import { Outlet } from 'react-router-dom';
import { useMediaQuery } from '@librechat/client';
import { useGetModelsQuery } from 'librechat-data-provider/react-query';
import type { CSSProperties } from 'react';
import {
  AgentsMapContext,
  AssistantsMapContext,
  FileMapContext,
  ActivePanelProvider,
  PromptGroupsProvider,
  SetConvoProvider,
} from '~/Providers';
import {
  useGetStartupConfig,
  useGetEndpointsQuery,
  useHealthCheck,
  useUserTermsQuery,
} from '~/data-provider';
import {
  useAgentsMap,
  useAssistantsMap,
  useAuthContext,
  useFileMap,
  useSearchEnabled,
} from '~/hooks';
import { DeloitteHeader } from '~/components/DeloitteComponents/DeloitteTopHeader';
import { LearningTourProvider } from '~/components/Learning/LearningTourContext';
import CourseCompletionModal from '~/components/Learning/CourseCompletionModal';
import KeyboardShortcutsDialog from '~/components/Nav/KeyboardShortcutsDialog';
import TutorialPromptModal from '~/components/Learning/TutorialPromptModal';
import KeyboardDeleteDialog from '~/components/Nav/KeyboardDeleteDialog';
import useKeyboardShortcuts from '~/hooks/useKeyboardShortcuts';
import { UnifiedSidebar } from '~/components/UnifiedSidebar';
import { TermsAndConditionsModal } from '~/components/ui';
import { Banner } from '~/components/Banners';
import store from '~/store';

/** Isolates keyboard shortcut listeners so they only mount after auth. */
function KeyboardShortcutsProvider() {
  useKeyboardShortcuts();
  return (
    <>
      <KeyboardShortcutsDialog />
      <KeyboardDeleteDialog />
    </>
  );
}

export default function Root() {
  const [showTerms, setShowTerms] = useState(false);
  const [bannerHeight, setBannerHeight] = useState(0);
  const sidebarExpanded = useRecoilValue(store.sidebarExpanded);
  const isSmallScreen = useMediaQuery('(max-width: 768px)');

  const { isAuthenticated, logout } = useAuthContext();

  useHealthCheck(isAuthenticated);

  const assistantsMap = useAssistantsMap({ isAuthenticated });
  const agentsMap = useAgentsMap({ isAuthenticated });
  const fileMap = useFileMap({ isAuthenticated });

  const { data: config } = useGetStartupConfig();
  const deloitteHeader = config?.interface?.deloitteHeader;
  const workspaceName = import.meta.env.VITE_WORKSPACE_NAME;
  const title =
    deloitteHeader?.title && workspaceName
      ? `${deloitteHeader.title} / ${workspaceName}`
      : deloitteHeader?.title;
  const termsEnabled =
    isAuthenticated && config?.interface?.termsOfService?.modalAcceptance === true;
  const { data: termsData, isLoading: termsLoading } = useUserTermsQuery({
    enabled: termsEnabled,
  });

  // Deloitte Custom Change: chatReady gates the tutorial bubble so it only appears
  // once the main chat UI has finished loading (same queries ChatRoute waits on
  // before rendering — hits the React Query cache, no extra network requests).
  // Read endpoints + models query status so the tutorial bubble only appears
  // after the main chat UI has finished its initial data load (these are the
  // same queries ChatRoute waits on before rendering — reading them here hits
  // the React Query cache; no extra network requests are made).
  const endpointsQuery = useGetEndpointsQuery({ enabled: isAuthenticated });
  const modelsQuery = useGetModelsQuery({ enabled: isAuthenticated });
  const chatReady =
    endpointsQuery.isFetched &&
    endpointsQuery.isSuccess &&
    modelsQuery.isFetched &&
    modelsQuery.isSuccess;

  useSearchEnabled(isAuthenticated);

  useEffect(() => {
    if (termsData) {
      setShowTerms(!termsData.termsAccepted);
    }
  }, [termsData]);

  const handleAcceptTerms = () => {
    setShowTerms(false);
  };

  const handleDeclineTerms = () => {
    setShowTerms(false);
    logout('/login?redirect=false');
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <SetConvoProvider>
      <FileMapContext.Provider value={fileMap}>
        <AssistantsMapContext.Provider value={assistantsMap}>
          <ActivePanelProvider>
            <LearningTourProvider>
              <AgentsMapContext.Provider value={agentsMap}>
                <PromptGroupsProvider>
                  <Banner onHeightChange={setBannerHeight} />
                  {/* Deloitte Custom Change: Add Deloitte Header to top of view */}
                  <div
                    style={
                      {
                        '--header-height': deloitteHeader?.enabled ? '54px' : '0px',
                      } as CSSProperties
                    }
                  >
                    {deloitteHeader?.enabled && <DeloitteHeader title={title} />}
                    <div
                      className="flex"
                      style={{ height: `calc(100dvh - ${bannerHeight}px - var(--header-height))` }}
                    >
                      <div className="relative z-0 flex h-full w-full overflow-hidden">
                        <UnifiedSidebar />
                        <div
                          className="relative flex h-full max-w-full flex-1 flex-col overflow-hidden"
                          style={{
                            transform:
                              isSmallScreen && sidebarExpanded
                                ? 'translateX(min(85vw, 380px))'
                                : 'none',
                            transition: 'transform 300ms cubic-bezier(0.2, 0, 0, 1)',
                          }}
                          inert={isSmallScreen && sidebarExpanded ? '' : undefined}
                        >
                          <Outlet />
                        </div>
                      </div>
                    </div>
                  </div>
                </PromptGroupsProvider>
              </AgentsMapContext.Provider>
              {config?.interface?.termsOfService?.modalAcceptance === true && (
                <TermsAndConditionsModal
                  open={showTerms}
                  onOpenChange={setShowTerms}
                  onAccept={handleAcceptTerms}
                  onDecline={handleDeclineTerms}
                  title={config.interface.termsOfService.modalTitle}
                  modalContent={config.interface.termsOfService.modalContent}
                />
              )}
              {/* Deloitte Custom Change: Learning Hub tutorial prompt bubble and course completion modal */}
              <TutorialPromptModal
                termsVisible={showTerms || (termsEnabled && (termsLoading || !termsData))}
                chatReady={chatReady}
              />
              <CourseCompletionModal />
              <KeyboardShortcutsProvider />
            </LearningTourProvider>
          </ActivePanelProvider>
        </AssistantsMapContext.Provider>
      </FileMapContext.Provider>
    </SetConvoProvider>
  );
}
