import { useRef, useCallback, useState } from 'react';
import { Upload } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { OGDialog, OGDialogContent, Spinner, useToastContext } from '@librechat/client';
import {
  megabyte,
  mergeFileConfig,
  fileConfig as defaultFileConfig,
} from 'librechat-data-provider';
import type { TSkillWarning } from 'librechat-data-provider';
import { useGetFileConfig, useImportSkillMutation } from '~/data-provider';
import { cn, formatSkillScanError } from '~/utils';
import { useLocalize } from '~/hooks';

interface UploadSkillDialogProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

function formatMegabytes(bytes: number): string {
  const value = bytes / megabyte;
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}

export default function UploadSkillDialog({ isOpen, setIsOpen }: UploadSkillDialogProps) {
  const localize = useLocalize();
  const navigate = useNavigate();
  const { showToast } = useToastContext();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const {
    data: skillFileConfig = { configuredSizeLimitMb: undefined, fileConfig: defaultFileConfig },
  } = useGetFileConfig({
    select: (data) => ({
      configuredSizeLimitMb: data?.skills?.fileSizeLimit,
      fileConfig: mergeFileConfig(data),
    }),
  });
  const { configuredSizeLimitMb, fileConfig } = skillFileConfig;
  const skillImportSizeLimit =
    fileConfig.skills?.fileSizeLimit ?? defaultFileConfig.skills?.fileSizeLimit ?? 0;
  const displayedSizeLimit =
    configuredSizeLimitMb !== undefined
      ? `${configuredSizeLimitMb}`
      : formatMegabytes(skillImportSizeLimit);

  // Deloitte Custom Change: Keep scanner failures visible inline while the upload dialog remains open.
  const [scanError, setScanError] = useState<string | null>(null);

  const importMutation = useImportSkillMutation({
    onSuccess: (skill) => {
      const warnings: TSkillWarning[] | undefined = skill.warnings;
      showToast({
        status: warnings && warnings.length > 0 ? 'warning' : 'success',
        message:
          warnings && warnings.length > 0
            ? warnings.map((w) => w.message).join('\n')
            : localize('com_ui_skill_created'),
      });
      // Deloitte Custom Change: Clear any previous inline scanner failure after a successful upload.
      setScanError(null);
      setIsOpen(false);
      navigate(`/skills/${skill._id}`);
    },
    onError: (error: unknown) => {
      // Deloitte Custom Change: Surface the scanner's validation error inline so it stays on screen
      // until the user retries, instead of an auto-dismissing toast.
      setScanError(formatSkillScanError(error, localize('com_ui_create_skill_upload_error')));
    },
  });

  const handleFile = useCallback(
    (file: File) => {
      if (importMutation.isLoading) {
        return;
      }
      // Deloitte Custom Change: Clear stale scanner output before retrying upload.
      setScanError(null);
      if (file.size > skillImportSizeLimit) {
        showToast({
          status: 'error',
          message: localize('com_ui_skill_upload_size_error', { 0: displayedSizeLimit }),
        });
        return;
      }
      const formData = new FormData();
      formData.append('file', file, file.name);
      importMutation.mutate(formData);
    },
    [displayedSizeLimit, importMutation, localize, showToast, skillImportSizeLimit],
  );

  const handleFileInput = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        handleFile(file);
      }
      event.target.value = '';
    },
    [handleFile],
  );

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setIsDragging(false);
      const file = event.dataTransfer.files?.[0];
      if (file) {
        handleFile(file);
      }
    },
    [handleFile],
  );

  // Deloitte Custom Change: Reset inline scanner output when the upload dialog closes.
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setScanError(null);
    }
    setIsOpen(open);
  };

  // Deloitte Custom Change: Render scanner failures inline with preserved line breaks for readability.
  const scanErrorMessage = scanError ? (
    <p className="whitespace-pre-line text-xs text-red-500" role="alert">
      {scanError}
    </p>
  ) : null;

  return (
    <OGDialog open={isOpen} onOpenChange={handleOpenChange}>
      <OGDialogContent className="w-11/12 max-w-lg overflow-hidden">
        <div className="flex flex-col gap-6 p-1 sm:p-2">
          <h2 className="text-lg font-bold text-text-primary">
            {localize('com_ui_skill_upload_title')}
          </h2>

          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              disabled={importMutation.isLoading}
              className={cn(
                'flex h-[120px] w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-sm text-text-secondary transition-colors',
                isDragging
                  ? 'border-border-heavy bg-surface-hover'
                  : 'border-border-medium hover:bg-surface-hover',
                importMutation.isLoading && 'cursor-wait opacity-50',
              )}
            >
              {importMutation.isLoading ? (
                <Spinner className="size-8" />
              ) : (
                <Upload className="size-8 text-text-secondary" aria-hidden="true" />
              )}
              {localize('com_ui_skill_upload_drag')}
            </button>

            <div className="flex flex-col gap-3 text-xs text-text-secondary">
              <div>
                <p className="font-medium">{localize('com_ui_skill_upload_requirements')}</p>
                <ul className="mt-1 list-inside list-disc">
                  <li>{localize('com_ui_skill_upload_req_md')}</li>
                  <li>{localize('com_ui_skill_upload_req_zip')}</li>
                  <li>{localize('com_ui_skill_upload_req_size', { 0: displayedSizeLimit })}</li>
                  <li>{localize('com_ui_skill_upload_req_no_spaces')}</li>
                </ul>
              </div>
            </div>

            {scanErrorMessage}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".zip,.skill,.md"
            className="hidden"
            onChange={handleFileInput}
          />
        </div>
      </OGDialogContent>
    </OGDialog>
  );
}
