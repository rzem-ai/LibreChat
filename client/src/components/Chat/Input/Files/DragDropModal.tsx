import React, { useMemo, useEffect } from 'react';
import { OGDialog, OGDialogTemplate } from '@librechat/client';
import { FileSearch, FileType2Icon, TerminalSquareIcon } from 'lucide-react';
import { EToolResources } from 'librechat-data-provider';
import { useLocalize, useUploadOptions, useFileUploadRouter } from '~/hooks';
import { useUploadModalContext } from '~/Providers';

const DragDropModal = () => {
  const localize = useLocalize();
  const { isVisible, files, closeModal } = useUploadModalContext();
  const { getOptions } = useUploadOptions();
  const routeFiles = useFileUploadRouter();

  const getOptionMeta = (value: EToolResources) => {
    switch (value) {
      case EToolResources.file_search:
        return {
          label: localize('com_ui_upload_file_search'),
          icon: <FileSearch className="icon-md" />,
        };
      case EToolResources.execute_code:
        return {
          label: localize('com_ui_upload_code_environment'),
          icon: <TerminalSquareIcon className="icon-md" />,
        };
      case EToolResources.context:
        return {
          label: localize('com_ui_upload_ocr_text'),
          icon: <FileType2Icon className="icon-md" />,
        };
      default:
        return {
          label: localize('com_ui_upload_file_search'),
          icon: <FileSearch className="icon-md" />,
        };
    }
  };

  const options = useMemo(() => getOptions(files), [getOptions, files]);

  // Auto-route to file search if it's the only viable option
  useEffect(() => {
    if (options.length === 1 && options[0] === EToolResources.file_search) {
      routeFiles(files, EToolResources.file_search);
      closeModal();
    }
  }, [options, files, routeFiles, closeModal]);


  if (!isVisible) {
    return null;
  }

  // If no options available, show error
  if (options.length === 0) {
    return (
      <OGDialog open={isVisible} onOpenChange={(open) => !open && closeModal()}>
        <OGDialogTemplate
          title={localize('com_ui_upload_type')}
          main={
            <div className="text-center text-red-500">
              {localize('com_error_files_not_supported')}
            </div>
          }
        />
      </OGDialog>
    );
  }

  return (
    <OGDialog open={isVisible} onOpenChange={(open) => !open && closeModal()}>
      <OGDialogTemplate
        title={localize('com_ui_upload_type')}
        className="w-11/12 sm:w-[440px] md:w-[400px] lg:w-[360px]"
        main={
          <div className="flex flex-col gap-2">
            {options.map((value) => {
              const { label, icon } = getOptionMeta(value);
              return (
                <button
                  key={value}
                  onClick={() => {
                    routeFiles(files, value);
                    closeModal();
                  }}
                  className="flex items-center gap-2 rounded-lg p-2 hover:bg-surface-active-alt"
                >
                  {icon}
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        }
      />
    </OGDialog>
  );
};

export default DragDropModal;
