import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '~/utils';

/** Underline-style tab list; pair with `Tabs` and `TabsContent` from the base Tabs. */
const UnderlineTabsList: React.ForwardRefExoticComponent<
  Omit<TabsPrimitive.TabsListProps & React.RefAttributes<HTMLDivElement>, 'ref'> &
    React.RefAttributes<HTMLDivElement>
> = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn('inline-flex w-full items-center justify-start gap-4 overflow-x-auto', className)}
    {...props}
  />
));
UnderlineTabsList.displayName = 'UnderlineTabsList';

const UnderlineTabsTrigger: React.ForwardRefExoticComponent<
  Omit<TabsPrimitive.TabsTriggerProps & React.RefAttributes<HTMLButtonElement>, 'ref'> &
    React.RefAttributes<HTMLButtonElement>
> = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      '-mb-px inline-flex items-center justify-center border-b-2 border-transparent px-1 pb-3 pt-1 text-sm font-medium text-text-secondary transition-all disabled:pointer-events-none disabled:opacity-50 data-[state=active]:border-text-primary data-[state=active]:text-text-primary',
      className,
    )}
    {...props}
  />
));
UnderlineTabsTrigger.displayName = 'UnderlineTabsTrigger';

export { UnderlineTabsList, UnderlineTabsTrigger };
