import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  OGDialog,
  Spinner,
  OGDialogContent,
  TextareaAutosize,
  useToastContext,
} from '@librechat/client';
import {
  SKILL_NAME_PATTERN,
  SKILL_NAME_MAX_LENGTH,
  SKILL_DESCRIPTION_MAX_LENGTH,
} from 'librechat-data-provider';
import type { TSkill, TSkillWarning } from 'librechat-data-provider';
import type { FormEvent } from 'react';
import { useCreateSkillMutation } from '~/data-provider';
import { cn, formatSkillScanError } from '~/utils';
import { useLocalize } from '~/hooks';

interface CreateSkillDialogProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  defaultName?: string;
  defaultDescription?: string;
  defaultBody?: string;
  /**
   * Called with the created skill instead of navigating to its page. Lets the
   * dialog be reused in-context (e.g. the agent-builder skill picker) so creating
   * a skill keeps the user in place rather than routing to `/skills/:id`.
   */
  onCreated?: (skill: TSkill) => void;
}

interface FormValues {
  name: string;
  description: string;
  body: string;
}

/**
 * Minimal create-skill dialog matching Claude.ai's "Write skill instructions"
 * modal: name, description, instructions. No category, no invocation mode.
 */
export default function CreateSkillDialog({
  isOpen,
  setIsOpen,
  defaultName = '',
  defaultDescription = '',
  defaultBody = '',
  onCreated,
}: CreateSkillDialogProps) {
  const localize = useLocalize();
  const navigate = useNavigate();
  const { showToast } = useToastContext();
  // Deloitte Custom Change: Keep scanner failures visible inline while the create dialog remains open.
  const [scanError, setScanError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { isValid, isSubmitting, errors },
  } = useForm<FormValues>({
    defaultValues: { name: defaultName, description: defaultDescription, body: defaultBody },
    mode: 'onChange',
  });

  const createSkill = useCreateSkillMutation({
    onSuccess: (skill) => {
      const warnings: TSkillWarning[] | undefined = skill.warnings;
      // Deloitte Custom Change: Show the scanner's warnings (if present) alongside the success toast, instead of a plain success message.
      showToast({
        status: warnings && warnings.length > 0 ? 'warning' : 'success',
        message:
          warnings && warnings.length > 0
            ? warnings.map((w) => w.message).join('\n')
            : localize('com_ui_skill_created'),
      });
      // Deloitte Custom Change: Clear any previous inline scanner failure after a successful create.
      setScanError(null);
      setIsOpen(false);
      reset();
      if (onCreated) {
        onCreated(skill);
        return;
      }
      navigate(`/skills/${skill._id}`);
    },
    onError: (error: unknown) => {
      // Deloitte Custom Change: Surface the scanner's validation error inline so it
      // stays on screen until the user retries, instead of an auto-dismissing toast.
      setScanError(formatSkillScanError(error, localize('com_ui_skill_create_error')));
    },
  });

  const onSubmit = (data: FormValues) => {
    if (createSkill.isLoading) {
      return;
    }
    // Deloitte Custom Change: Clear stale scanner output before retrying creation.
    setScanError(null);
    createSkill.mutate({
      name: data.name.trim(),
      description: data.description.trim(),
      body: data.body,
    });
  };

  // Deloitte Custom Change: Reset inline scanner output when any dialog close path fires.
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setScanError(null);
      reset();
    }
    setIsOpen(open);
  };

  const handleFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    /**
     * This dialog can be portaled from inside Agent Builder's form. React
     * events still bubble through the component tree across a portal, so an
     * unguarded submit also submits (and prematurely creates) the agent.
     */
    event.stopPropagation();
    return handleSubmit(onSubmit)(event);
  };

  const submitDisabled = !isValid || isSubmitting || createSkill.isLoading;
  // Deloitte Custom Change: Render scanner failures inline with preserved line breaks for readability.
  const scanErrorMessage = scanError ? (
    <p className="whitespace-pre-line text-xs text-red-500" role="alert">
      {scanError}
    </p>
  ) : null;
  // Deloitte Custom Change: Route Cancel through the shared close handler so inline scanner output resets.
  const handleCancel = () => handleOpenChange(false);

  return (
    <OGDialog open={isOpen} onOpenChange={handleOpenChange}>
      <OGDialogContent className="w-11/12 max-w-5xl overflow-hidden" showCloseButton={false}>
        <form
          onSubmit={handleFormSubmit}
          className="flex max-h-[80vh] min-w-0 flex-col gap-3 overflow-hidden p-1 sm:gap-4 sm:p-2"
        >
          <h2 className="text-lg font-bold text-text-primary">
            {localize('com_ui_skill_write_instructions')}
          </h2>

          {/* Skill name */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="create-skill-name" className="text-sm font-medium text-text-secondary">
              {localize('com_ui_name')}
            </label>
            <input
              id="create-skill-name"
              placeholder={localize('com_ui_skill_name_placeholder')}
              aria-invalid={errors.name ? 'true' : 'false'}
              autoComplete="off"
              className="flex h-10 w-full rounded-xl border border-border-medium bg-transparent px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary disabled:cursor-not-allowed disabled:opacity-50"
              {...register('name', {
                required: localize('com_ui_skill_name_required'),
                pattern: {
                  value: SKILL_NAME_PATTERN,
                  message: localize('com_ui_skill_name_invalid'),
                },
                maxLength: {
                  value: SKILL_NAME_MAX_LENGTH,
                  message: localize('com_ui_skill_name_too_long', {
                    0: String(SKILL_NAME_MAX_LENGTH),
                  }),
                },
              })}
            />
            {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="create-skill-description"
              className="text-sm font-medium text-text-secondary"
            >
              {localize('com_ui_description')}
            </label>
            <TextareaAutosize
              id="create-skill-description"
              minRows={2}
              maxRows={4}
              placeholder={localize('com_ui_skill_description_placeholder')}
              aria-label={localize('com_ui_description')}
              className="w-full resize-none rounded-xl border border-border-medium bg-transparent px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
              {...register('description', {
                required: localize('com_ui_skill_description_required'),
                maxLength: {
                  value: SKILL_DESCRIPTION_MAX_LENGTH,
                  message: localize('com_ui_skill_description_too_long', {
                    0: String(SKILL_DESCRIPTION_MAX_LENGTH),
                  }),
                },
              })}
            />
          </div>

          {/* Instructions (body) */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="create-skill-body" className="text-sm font-medium text-text-secondary">
              {localize('com_ui_skill_instructions')}
            </label>
            <TextareaAutosize
              id="create-skill-body"
              minRows={6}
              maxRows={12}
              placeholder={localize('com_ui_skill_instructions_placeholder')}
              aria-label={localize('com_ui_skill_instructions')}
              className="w-full resize-none rounded-xl border border-border-medium bg-transparent px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
              {...register('body')}
            />
          </div>

          {scanErrorMessage}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={handleCancel}>
              {localize('com_ui_cancel')}
            </Button>
            <Button
              type="submit"
              disabled={submitDisabled}
              aria-busy={createSkill.isLoading || undefined}
              className={cn('gap-2', submitDisabled && 'opacity-50')}
            >
              {/* Deloitte Custom Change: Show a loading indicator while the skill scanner runs. */}
              {createSkill.isLoading && <Spinner className="size-4" aria-hidden="true" />}
              {createSkill.isLoading
                ? localize('com_ui_skill_scanning')
                : localize('com_ui_create')}
            </Button>
          </div>
        </form>
      </OGDialogContent>
    </OGDialog>
  );
}
