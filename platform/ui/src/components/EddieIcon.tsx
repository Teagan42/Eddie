import type { ComponentProps, ComponentType } from 'react';

import { combineClassNames } from '../utils/class-names';

type SvgComponent = ComponentType<ComponentProps<'svg'>>;

export interface EddieIconProps {
  icon: SvgComponent;
  className?: string;
  iconClassName?: string;
}

const BASE_WRAPPER_CLASSES = [
  'flex h-12 w-12 items-center justify-center rounded-2xl',
  'bg-[color:var(--hero-console-icon-bg)]',
  'dark:bg-[color:var(--hero-console-icon-bg-dark)]',
].join(' ');

const BASE_ICON_CLASSES = [
  'h-6 w-6',
  'text-[color:var(--hero-console-icon-fg)]',
  'dark:text-[color:var(--hero-console-icon-fg-dark)]',
].join(' ');

export function EddieIcon({ icon: Icon, className, iconClassName }: EddieIconProps): JSX.Element {
  const wrapperClasses = combineClassNames(BASE_WRAPPER_CLASSES, className);
  const iconClasses = combineClassNames(BASE_ICON_CLASSES, iconClassName);

  return (
    <div className={wrapperClasses}>
      <Icon className={iconClasses} />
    </div>
  );
}
