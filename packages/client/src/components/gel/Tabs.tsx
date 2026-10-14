import * as React from 'react';
import { cva } from 'class-variance-authority';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import type { ClassProp } from 'class-variance-authority/types';
import { cn } from '~/utils';

type TabsVariantProps = {
  variant?: 'default' | 'underline' | null;
};

const tabsListVariants: (props?: TabsVariantProps & ClassProp) => string = cva(
  'inline-flex items-center justify-center',
  {
    variants: {
      variant: {
        default: 'rounded-md bg-surface-primary',
        underline: 'w-full justify-start gap-4 overflow-x-auto',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

const tabsTriggerVariants: (props?: TabsVariantProps & ClassProp) => string = cva(
  'inline-flex items-center justify-center text-sm font-medium text-text-secondary transition-all disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'min-w-[100px] rounded-[0.185rem] px-3 py-1.5 data-[state=active]:bg-surface-primary data-[state=active]:text-text-primary data-[state=active]:shadow-sm',
        underline:
          '-mb-px border-b-2 border-transparent px-1 pb-3 pt-1 data-[state=active]:border-text-primary data-[state=active]:text-text-primary',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

/** Tab list with a `variant` prop; pair with `Tabs` and `TabsContent` from the base Tabs. */
const TabsList: React.ForwardRefExoticComponent<
  Omit<TabsPrimitive.TabsListProps & React.RefAttributes<HTMLDivElement>, 'ref'> &
    TabsVariantProps &
    React.RefAttributes<HTMLDivElement>
> = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & TabsVariantProps
>(({ className, variant, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(tabsListVariants({ variant }), className)}
    {...props}
  />
));
TabsList.displayName = 'TabsList';

const TabsTrigger: React.ForwardRefExoticComponent<
  Omit<TabsPrimitive.TabsTriggerProps & React.RefAttributes<HTMLButtonElement>, 'ref'> &
    TabsVariantProps &
    React.RefAttributes<HTMLButtonElement>
> = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> & TabsVariantProps
>(({ className, variant, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(tabsTriggerVariants({ variant }), className)}
    {...props}
  />
));
TabsTrigger.displayName = 'TabsTrigger';

export { Tabs, TabsContent } from '../Tabs';
export { TabsList, TabsTrigger };
