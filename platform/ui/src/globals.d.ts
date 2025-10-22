// src/globals.d.ts (make sure tsconfig include covers this)
import type { PropsWithChildren } from 'react';

// Augment React the right way
declare module 'react' {
  // Do not try to extend type aliases. Add the prop where you actually need it instead.
  // If you insist on a helper, keep it local:
  // type WithAsChild<T> = T & { asChild?: boolean };
}

// Augment Radix tabs (verify the actual interface/type names in the package!)
declare module '@radix-ui/react-tabs' {
  // Example: if Radix exports these exact interfaces
  interface TabsProps { asChild?: boolean }
  interface TabsListProps { asChild?: boolean }
  interface TabsTriggerProps { asChild?: boolean }
  interface TabsContentProps { asChild?: boolean }
}

// Augment Radix Themes (names here MUST match reality)
declare module '@radix-ui/themes' {
  namespace DropdownMenu {
    interface DropdownMenuRootProps { asChild?: boolean }
    interface DropdownMenuItemProps { asChild?: boolean }
    interface DropdownMenuTriggerProps { asChild?: boolean }
  }
  namespace Callout {
    interface RootProps { asChild?: boolean }
  }
  namespace Select {
    interface SelectRootProps { asChild?: boolean }
    interface SelectItemProps { asChild?: boolean }
    interface SelectTriggerProps { asChild?: boolean }
  }
}