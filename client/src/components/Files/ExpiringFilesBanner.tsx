import { Button, useToastContext } from '@librechat/client';
import { useGetFilesExpiringSoonQuery, useRenewFileMutation } from '~/data-provider';
import { useLocalize } from '~/hooks';
import { formatDate } from '~/utils';

export default function ExpiringFilesBanner() {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { data: files } = useGetFilesExpiringSoonQuery();
  const renewFile = useRenewFileMutation({
    onSuccess: () => {
      showToast({ message: localize('com_files_expiring_soon_renewed'), status: 'success' });
    },
  });

  if (!files || files.length === 0) {
    return null;
  }

  return (
    <div
      role="status"
      className="sticky top-0 z-20 flex flex-col gap-2 bg-amber-100 px-4 py-2 text-sm text-text-primary dark:bg-amber-900 md:relative"
    >
      <span className="font-medium">
        {localize(
          files.length === 1
            ? 'com_files_expiring_soon_title_one'
            : 'com_files_expiring_soon_title',
          { count: files.length },
        )}
      </span>
      <ul className="flex flex-col gap-1">
        {files.map((file) => (
          <li key={file.file_id} className="flex items-center justify-between gap-2">
            <span className="truncate">
              {file.filename}
              {file.expiredAt != null && (
                <span className="ml-2 text-text-secondary">
                  {formatDate(new Date(file.expiredAt).toISOString())}
                </span>
              )}
            </span>
            <Button
              size="sm"
              variant="outline"
              aria-label={localize('com_files_expiring_soon_renew')}
              onClick={() => renewFile.mutate(file.file_id)}
              disabled={renewFile.isLoading}
            >
              {localize('com_files_expiring_soon_renew')}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
