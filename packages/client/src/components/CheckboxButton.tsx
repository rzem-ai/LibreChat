import * as React from 'react';
import { useEffect } from 'react';
import { Checkbox, useStoreState, useCheckboxStore } from '@ariakit/react';
import { cn } from '~/utils';

const CheckboxButton: React.ForwardRefExoticComponent<
  {
    icon?: React.ReactNode;
    id?: string;
    label: string;
    className?: string;
    checked?: boolean;
    defaultChecked?: boolean;
    isCheckedClassName?: string;
    // Deloitte Custom Change: testId prop added as a stable anchor for guided tour spotlights
    testId?: string;
    setValue?: (values: {
      e?: React.ChangeEvent<HTMLInputElement>;
      value: boolean | string;
    }) => void;
  } & React.RefAttributes<HTMLInputElement>
> = React.forwardRef<
  HTMLInputElement,
  {
    icon?: React.ReactNode;
    id?: string;
    label: string;
    className?: string;
    checked?: boolean;
    defaultChecked?: boolean;
    isCheckedClassName?: string;
    testId?: string;
    setValue?: (values: {
      e?: React.ChangeEvent<HTMLInputElement>;
      value: boolean | string;
    }) => void;
  }
>(
  (
    { icon, id, label, setValue, className, checked, defaultChecked, isCheckedClassName, testId },
    ref,
  ) => {
    const checkbox = useCheckboxStore();
    const isChecked = useStoreState(checkbox, (state) => state?.value);
    const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      e.stopPropagation();
      if (typeof isChecked !== 'boolean') {
        return;
      }
      setValue?.({ e, value: !isChecked });
    };

    // Sync with controlled checked prop
    useEffect(() => {
      if (checked !== undefined) {
        checkbox.setValue(checked);
      }
    }, [checked, checkbox]);

    // Set initial value from defaultChecked
    useEffect(() => {
      if (defaultChecked !== undefined && checked === undefined) {
        checkbox.setValue(defaultChecked);
      }
    }, [defaultChecked, checked, checkbox]);

    return (
      <Checkbox
        ref={ref}
        store={checkbox}
        onChange={onChange}
        className={cn(
          // Base styling from MultiSelect's selectClassName
          'group relative inline-flex items-center justify-center gap-1.5',
          'rounded-full border border-border-medium text-sm font-medium',
          'size-9 p-2 transition-all md:w-full md:p-3',
          'bg-transparent shadow-sm hover:bg-surface-hover hover:shadow-md active:shadow-inner',

          // Checked state styling
          isChecked && isCheckedClassName && isCheckedClassName,

          // Additional custom classes
          className,
        )}
        render={<button type="button" id={id} aria-label={label} data-testid={testId} />}
      >
        {/* Icon if provided */}
        {icon && <span className="icon-md text-text-primary">{icon as React.JSX.Element}</span>}

        {/* Show the label on larger screens */}
        <span className="hidden truncate md:block">{label}</span>
      </Checkbox>
    );
  },
);

CheckboxButton.displayName = 'CheckboxButton';

export default CheckboxButton;
