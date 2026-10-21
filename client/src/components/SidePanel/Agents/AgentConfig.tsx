import { Input, Label } from '@librechat/client';
import { Constants } from 'librechat-data-provider';
import { Controller, useWatch, useFormContext } from 'react-hook-form';
import type { AgentForm } from '~/common';
import { ResolvedProviderIcon } from '~/components/Endpoints/ResolvedProviderIcon';
import { useLocalize, useAgentCapabilities, useModelLabel } from '~/hooks';
import AgentCategorySelector from './AgentCategorySelector';
import { useAgentFileEntries } from './Tools/hooks';
import { useAgentPanelContext } from '~/Providers';
import { useProviderIcon } from '~/hooks/Endpoint';
import ToolsSection from './Tools/ToolsSection';
import { validateEmail, cn } from '~/utils';
import Instructions from './Instructions';
import FileContext from './FileContext';
import AgentAvatar from './AgentAvatar';
import { Panel } from '~/common';

const fieldClass = 'h-9';

export default function AgentConfig() {
  const localize = useLocalize();
  const methods = useFormContext<AgentForm>();
  const { setActivePanel, endpointsConfig, agentsConfig } = useAgentPanelContext();
  const { contextEnabled } = useAgentCapabilities(agentsConfig?.capabilities);

  const {
    control,
    formState: { errors },
  } = methods;
  const provider = useWatch({ control, name: 'provider' });
  const model = useWatch({ control, name: 'model' });
  const agent = useWatch({ control, name: 'agent' });
  const agent_id = useWatch({ control, name: 'id' });
  const { contextFiles } = useAgentFileEntries();

  const providerValue = typeof provider === 'string' ? provider : provider?.value;
  // Deloitte Custom Change: show the model spec label instead of the raw model ID.
  const getModelLabel = useModelLabel(providerValue as string);
  const { provider: providerId, imageURL } = useProviderIcon({
    endpoint: providerValue as string,
    endpointsConfig,
  });

  return (
    <div className="h-auto pt-1">
      {/* IDENTITY — flat header, always visible, avatar inline */}
      <div className="mb-3 mt-1 flex items-center gap-3">
        <div className="flex-shrink-0">
          <AgentAvatar avatar={agent?.['avatar'] ?? null} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Controller
            name="name"
            rules={{
              required: localize('com_ui_agent_name_is_required'),
              maxLength: {
                value: Number(Constants.AGENT_NAME_MAX_LENGTH),
                message: localize('com_ui_field_max_length', {
                  field: localize('com_ui_agent_name'),
                  length: Constants.AGENT_NAME_MAX_LENGTH,
                }),
              },
            }}
            control={control}
            render={({ field }) => {
              // Deloitte Custom Change: live character counter against the configurable
              // agent-name length limit.
              const nameLength = (field.value ?? '').length;
              const isAtLimit = nameLength >= Constants.AGENT_NAME_MAX_LENGTH;
              return (
                <div className="flex flex-col">
                  <div className="relative">
                    <Input
                      {...field}
                      value={field.value ?? ''}
                      maxLength={Number(Constants.AGENT_NAME_MAX_LENGTH)}
                      className={cn(fieldClass, 'pr-12 font-medium')}
                      id="name"
                      type="text"
                      placeholder={localize('com_agents_name_placeholder')}
                      aria-label={localize('com_ui_agent_name')}
                      aria-invalid={!!errors.name}
                      aria-describedby={errors.name ? 'agent-name-error' : 'agent-name-counter'}
                    />
                    <span
                      id="agent-name-counter"
                      className={cn(
                        'pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs',
                        isAtLimit ? 'text-amber-500' : 'text-text-secondary',
                      )}
                    >
                      {`${nameLength}/${Constants.AGENT_NAME_MAX_LENGTH}`}
                    </span>
                  </div>
                  {errors.name && (
                    <div
                      id="agent-name-error"
                      className="mt-1 text-xs text-text-destructive"
                      role="alert"
                    >
                      {errors.name.message}
                    </div>
                  )}
                </div>
              );
            }}
          />
          <Controller
            name="description"
            control={control}
            render={({ field }) => (
              <Input
                {...field}
                value={field.value ?? ''}
                maxLength={512}
                className={fieldClass}
                id="description"
                type="text"
                placeholder={localize('com_agents_description_placeholder')}
                aria-label={localize('com_ui_agent_description')}
              />
            )}
          />
        </div>
      </div>

      {/* MODEL + CATEGORY — balanced 2-column grid */}
      <div className="mb-3 grid grid-cols-2 gap-2">
        <div className="flex min-w-0 flex-col">
          <Label
            className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-text-secondary"
            htmlFor="provider"
          >
            {localize('com_ui_model')} <span className="text-text-destructive">*</span>
          </Label>
          <button
            id="provider"
            type="button"
            onClick={() => setActivePanel(Panel.model)}
            title={model ? getModelLabel(model) : undefined}
            className={cn(
              'relative flex h-9 w-full min-w-0 items-center overflow-hidden rounded-lg border border-border-light bg-surface-secondary text-sm font-medium text-text-primary transition-colors hover:bg-surface-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary',
              model != null && model ? 'px-1' : 'px-3',
            )}
          >
            <div className="flex w-full min-w-0 items-center gap-2">
              {providerValue !== undefined && (
                <div className="shadow-stroke relative flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-white text-black dark:bg-white">
                  <ResolvedProviderIcon
                    provider={providerId}
                    imageURL={imageURL}
                    size={16}
                    className="h-2/3 w-2/3"
                  />
                </div>
              )}
              <span className="truncate">
                {model != null && model ? getModelLabel(model) : localize('com_ui_select_model')}
              </span>
            </div>
          </button>
        </div>
        <div className="flex flex-col">
          <Label
            className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-text-secondary"
            htmlFor="category-selector"
          >
            {localize('com_ui_category')} <span className="text-text-destructive">*</span>
          </Label>
          <AgentCategorySelector className="w-full rounded-lg" />
        </div>
      </div>

      {/* INSTRUCTIONS */}
      <Instructions />

      {/* TOOLS — unified built-ins / tools / actions / mcp / skills */}
      <ToolsSection agentId={agent_id} />

      {/* FILE CONTEXT — standalone section, separate from the tool library */}
      {/* Deloitte Custom Change: hide File Context section when hideFileContext is set */}
      {contextEnabled && !agentsConfig?.hideFileContext && (
        <div className="mb-3">
          <FileContext agent_id={agent_id} files={contextFiles} />
        </div>
      )}

      {/* SUPPORT CONTACT */}
      <div className="mb-3 flex flex-col">
        <Label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-text-secondary">
          {localize('com_ui_support_contact')}
        </Label>
        <div className="space-y-2">
          <Controller
            name="support_contact.name"
            control={control}
            rules={{
              minLength: {
                value: 3,
                message: localize('com_ui_support_contact_name_min_length', { minLength: 3 }),
              },
            }}
            render={({ field, fieldState: { error } }) => (
              <div className="flex flex-col">
                <Input
                  {...field}
                  value={field.value ?? ''}
                  className={cn(fieldClass, error && 'border-2 border-border-destructive')}
                  id="support-contact-name"
                  type="text"
                  placeholder={localize('com_ui_support_contact_name_placeholder')}
                  aria-label={localize('com_ui_support_contact_name')}
                  aria-invalid={error ? 'true' : 'false'}
                  aria-describedby={error ? 'support-contact-name-error' : undefined}
                />
                {error && (
                  <span
                    id="support-contact-name-error"
                    className="mt-1 text-xs text-text-destructive"
                    role="alert"
                    aria-live="polite"
                  >
                    {error.message}
                  </span>
                )}
              </div>
            )}
          />
          <Controller
            name="support_contact.email"
            control={control}
            rules={{
              validate: (value) =>
                validateEmail(value ?? '', localize('com_ui_support_contact_email_invalid')),
            }}
            render={({ field, fieldState: { error } }) => (
              <div className="flex flex-col">
                <Input
                  {...field}
                  value={field.value ?? ''}
                  className={cn(fieldClass, error && 'border-2 border-border-destructive')}
                  id="support-contact-email"
                  type="email"
                  placeholder={localize('com_ui_support_contact_email_placeholder')}
                  aria-label={localize('com_ui_support_contact_email')}
                  aria-invalid={error ? 'true' : 'false'}
                  aria-describedby={error ? 'support-contact-email-error' : undefined}
                />
                {error && (
                  <span
                    id="support-contact-email-error"
                    className="mt-1 text-xs text-text-destructive"
                    role="alert"
                    aria-live="polite"
                  >
                    {error.message}
                  </span>
                )}
              </div>
            )}
          />
        </div>
      </div>
    </div>
  );
}
