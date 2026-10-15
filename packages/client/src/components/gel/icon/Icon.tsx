import { cva } from 'class-variance-authority';
import type { LucideProps } from 'lucide-react';
import type { JSX } from 'react/jsx-runtime';
import type { IconName } from './registry';
import { registry } from './registry';
import { cn } from '~/utils';

type IconProps = Omit<LucideProps, 'size'> & {
  name: IconName;
  size?: 'sm' | 'md' | 'lg' | null;
};

const iconVariants = cva('shrink-0 stroke-2', {
  variants: {
    size: {
      sm: 'size-4',
      md: 'size-[1.125rem]',
      lg: 'size-6',
    },
  },
});

export function Icon({ name, size, className, ...props }: IconProps): JSX.Element {
  const Glyph = registry[name];
  return <Glyph className={cn(iconVariants({ size }), className)} {...props} />;
}
