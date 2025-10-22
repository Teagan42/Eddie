import { SelectHTMLAttributes } from 'react';

interface WithChild {
  asChild?: boolean;
  children?: ReactNode | undefined;
}

declare module '@radix-ui/themes' {
  export interface SelectProps extends WithChild, SelectHTMLAttributes { }
  export interface SelectTriggerProps extends WithChild, SelectHTMLAttributes { };

  export interface CalloutProps extends WithChild, SelectHTMLAttributes { };

  interface DropdownMenuTriggerProps extends WithChild, SelectHTMLAttributes { };
  export interface DropdownMenuRootProps extends WithChild, SelectHTMLAttributes { };
}