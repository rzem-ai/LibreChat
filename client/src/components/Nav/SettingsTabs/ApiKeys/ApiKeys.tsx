import { useState } from 'react';
import { Plus } from 'lucide-react';
import {
  Label,
  Input,
  Button,
  OGDialog,
  OGDialogTitle,
  OGDialogHeader,
  InfoHoverCard,
  OGDialogTrigger,
  OGDialogContent,
} from '@librechat/client';
import CreateKeyDialog from './CreateKeyDialog';
import { useLocalize } from '~/hooks';
import Admin from './Admin';
import List from './List';

export default function ApiKeys() {
  const localize = useLocalize();
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [serviceAccountEmail, setServiceAccountEmail] = useState('');
  const [selectedAccountEmail, setSelectedAccountEmail] = useState('');

  return (
    <div className="flex items-center justify-between">
      <Label id="agent-api-keys-label">{localize('com_ui_agent_api_keys')}</Label>
      <OGDialog open={open} onOpenChange={setOpen}>
        <OGDialogTrigger asChild>
          <Button variant="outline" aria-labelledby="agent-api-keys-label">
            {localize('com_ui_manage')}
          </Button>
        </OGDialogTrigger>
        <OGDialogContent
          className="w-11/12 max-w-2xl bg-background text-text-primary shadow-2xl"
          aria-describedby={undefined}
        >
          <OGDialogHeader className="space-y-0 pr-8 text-left">
            <div className="flex items-center gap-1.5">
              <OGDialogTitle>{localize('com_ui_agent_api_keys')}</OGDialogTitle>
              <InfoHoverCard text={localize('com_ui_api_keys_description')} />
            </div>
          </OGDialogHeader>
          {/* Deloitte Custom Change: administrators manage keys on behalf of a service account. */}
          <form
            className="flex items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              setSelectedAccountEmail(serviceAccountEmail.trim());
            }}
          >
            <div className="min-w-0 flex-1 space-y-2">
              <Label htmlFor="service-account-email">{localize('com_auth_email_address')}</Label>
              <Input
                id="service-account-email"
                type="email"
                value={serviceAccountEmail}
                onChange={(event) => {
                  setServiceAccountEmail(event.target.value);
                  setSelectedAccountEmail('');
                }}
                placeholder={localize('com_auth_email_address')}
                required
              />
            </div>
            <Button type="submit" variant="outline" size="sm">
              {localize('com_ui_select')}
            </Button>
          </form>
          {selectedAccountEmail ? (
            <List userEmail={selectedAccountEmail} onCreate={() => setCreateOpen(true)} />
          ) : null}
          <div className="flex items-center gap-2">
            <Admin />
            <Button
              size="sm"
              className="ml-auto gap-1.5"
              onClick={() => setCreateOpen(true)}
              disabled={!selectedAccountEmail}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {localize('com_ui_create_api_key')}
            </Button>
          </div>
          <CreateKeyDialog
            open={createOpen}
            onOpenChange={setCreateOpen}
            userEmail={selectedAccountEmail}
          />
        </OGDialogContent>
      </OGDialog>
    </div>
  );
}
