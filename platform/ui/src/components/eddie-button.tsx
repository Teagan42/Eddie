import { Button } from '@radix-ui/themes';
import type { ButtonProps } from '@radix-ui/themes';

import { combineClassNames } from '../utils/class-names';

const BASE_BUTTON_CLASSES = [
  'bg-gradient-to-r',
  'from-[hsl(var(--hero-cta-from))] via-[hsl(var(--hero-cta-via))] to-[hsl(var(--hero-cta-to))]',
  'text-[color:var(--hero-cta-foreground)]',
  'shadow-[var(--hero-cta-shadow)]',
  'dark:from-[hsl(var(--hero-cta-from-dark))] dark:via-[hsl(var(--hero-cta-via-dark))] dark:to-[hsl(var(--hero-cta-to-dark))]',
  'dark:text-[color:var(--hero-cta-foreground-dark)]',
  'dark:shadow-[var(--hero-cta-shadow-dark)]',
].join(' ');

export type EddieButtonProps = ButtonProps;

export function EddieButton({
  className,
  children,
  size = '3',
  variant = 'solid',
  asChild = true,
  ...props
}: EddieButtonProps): JSX.Element {
  const buttonClasses = combineClassNames(BASE_BUTTON_CLASSES, className);

  return (
    <Button
      {...props}
      size={size}
      variant={variant}
      asChild={asChild}
      className={buttonClasses}
    >
      {children}
    </Button>
  );
}
