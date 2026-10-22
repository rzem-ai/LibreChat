import type { JSX } from 'react/jsx-runtime';
import type { ComponentProps } from 'react';
import { slugify } from '../../../content/headings';

type HeadingProps = ComponentProps<'h2'>;

/** Only plain-text headings get an anchor id; a code span or link in the heading yields none. */
const sectionHeading = (Tag: 'h2' | 'h3'): ((props: HeadingProps) => JSX.Element) =>
  function SectionHeading({ children, ...props }: HeadingProps): JSX.Element {
    const id = typeof children === 'string' ? slugify(children) : undefined;
    return (
      <Tag id={id} {...props}>
        {children}
      </Tag>
    );
  };

export const H2 = sectionHeading('h2');
export const H3 = sectionHeading('h3');
