import { Callout } from '@radix-ui/themes'
import { PropsWithChildren, SelectHTMLAttributes } from 'react'

declare module '@radix-ui/react-tabs' {
  export interface TabsProps extends PropsWithChildren { }
  export interface TabsListProps extends PropsWithChildren { }
  export interface TabsTriggerProps extends PropsWithChildren { }
  export interface TabsContentProps extends PropsWithChildren { }
}

declare module '@radix-ui/themes' {
  export module DropDownMenu {
    export interface DropdownMenuProps extends PropsWithChildren { }
    export interface DropdownMenuItemProps extends PropsWithChildren { }
  }
  export module Callout {
    export interface CalloutProps extends PropsWithChildren { }
  }
  export module Text {
    export interface SelectTriggerProps extends PropsWithChildren { }
  }
  export module Select {
    export interface SelectTriggerProps extends PropsWithChildren, SelectHTMLAttributes { }
  }
  export interface SelectProps extends PropsWithChildren, SelectHTMLAttributes { }
  export interface SelectTriggerProps extends PropsWithChildren, SelectHTMLAttributes { }
}