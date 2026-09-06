import * as Popover from '@radix-ui/react-popover';
import { FileText, Bot, ScrollText, HelpCircle } from 'lucide-react';
import type { ElementType } from 'react';
import type { TranslationKeys } from '~/hooks';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

interface DiffRow {
  icon: ElementType;
  colour: string;
  nameKey: TranslationKeys;
  whatKey: TranslationKeys;
  whenKey: TranslationKeys;
  triggerKey: TranslationKeys;
}

const DIFF_ROWS: DiffRow[] = [
  {
    icon: FileText,
    colour: 'text-blue-500 bg-blue-500/10',
    nameKey: 'com_learning_diff_prompt',
    whatKey: 'com_learning_diff_prompt_what',
    whenKey: 'com_learning_diff_prompt_when',
    triggerKey: 'com_learning_diff_prompt_trigger',
  },
  {
    icon: Bot,
    colour: 'text-purple-500 bg-purple-500/10',
    nameKey: 'com_learning_diff_agent',
    whatKey: 'com_learning_diff_agent_what',
    whenKey: 'com_learning_diff_agent_when',
    triggerKey: 'com_learning_diff_agent_trigger',
  },
  {
    icon: ScrollText,
    colour: 'text-amber-500 bg-amber-500/10',
    nameKey: 'com_learning_diff_skill',
    whatKey: 'com_learning_diff_skill_what',
    whenKey: 'com_learning_diff_skill_when',
    triggerKey: 'com_learning_diff_skill_trigger',
  },
];

function DiffPopoverContent() {
  const localize = useLocalize();
  return (
    <div className="w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border-light bg-surface-primary shadow-2xl">
      <div className="border-b border-border-light px-4 py-3">
        <p className="text-sm font-bold text-text-primary">{localize('com_learning_diff_title')}</p>
        <p className="mt-0.5 text-[11px] text-text-tertiary">
          {localize('com_learning_diff_subtitle')}
        </p>
      </div>

      <div className="flex flex-col gap-2.5 p-3">
        {DIFF_ROWS.map((row) => {
          const Icon = row.icon;
          return (
            <div
              key={row.nameKey}
              className="flex gap-3 rounded-lg border border-border-light bg-surface-secondary p-2.5"
            >
              <div
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                  row.colour,
                )}
              >
                <Icon className="h-3.5 w-3.5" />
              </div>
              <div className="flex min-w-0 flex-col gap-0.5">
                <p className="text-xs font-semibold text-text-primary">{localize(row.nameKey)}</p>
                <p className="text-[11px] leading-snug text-text-secondary">
                  {localize(row.whatKey)}
                </p>
                <p className="mt-0.5 text-[10px] text-text-tertiary">
                  <span className="font-medium text-text-secondary">
                    {localize('com_learning_diff_use_when')}
                  </span>{' '}
                  {localize(row.whenKey)}
                </p>
                <p className="text-[10px] text-text-tertiary">
                  <span className="font-medium text-text-secondary">
                    {localize('com_learning_diff_triggered_by')}
                  </span>{' '}
                  {localize(row.triggerKey)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function DiffPopoverButton() {
  const localize = useLocalize();
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          data-testid="learning-diff-popover-button"
          className="flex shrink-0 items-center gap-1 rounded-lg border border-border-light px-2 py-1 text-[10px] font-medium text-text-tertiary transition-colors hover:border-border-medium hover:text-text-secondary"
          title={localize('com_learning_diff_button_title')}
        >
          <HelpCircle className="h-3 w-3" />
          <span>{localize('com_learning_diff_button')}</span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="end"
          sideOffset={6}
          className="z-[300] outline-none"
          avoidCollisions
        >
          <DiffPopoverContent />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
