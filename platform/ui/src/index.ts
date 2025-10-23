/**
 * Shared metadata for the Eddie UI package.
 */
export const UI_PACKAGE_NAME = '@eddie/ui';

export type UiSurface = 'cli' | 'web' | 'api';

export interface UiPackageMetadata {
  /**
   * Name of the consuming surface, used for display purposes.
   */
  surface: UiSurface;
  /**
   * Semver version string for the UI feature set.
   */
  version: string;
}

export type UiMetadata = Readonly<UiPackageMetadata>;

/**
 * Creates a metadata record for UI consumers to advertise their surface.
 */
export function createUiMetadata(metadata: UiPackageMetadata): UiMetadata {
  return { ...metadata };
}

export { EddieButton, type EddieButtonProps } from './components/EddieButton';
export { EddieIcon, type EddieIconProps } from './components/EddieIcon';
export { AuroraBackground, JsonTreeView, Panel } from './common';
export type {
  AuroraBackgroundProps,
  JsonTreeViewProps,
  PanelProps,
} from './common';
export { AppHeader } from './layout';
export type { AppHeaderProps } from './layout';
export { NavigationLink } from './navigation';
export type { NavigationLinkProps } from './navigation';

export * from './chat';
export * from './overview';
export * from './theme';
export { useToast, toast } from './vendor/hooks/use-toast';
export { cn } from './vendor/lib/utils';
export { Accordion } from './vendor/components/ui/accordion';
export { AccordionTrigger } from './vendor/components/ui/accordion';
export { AnimatedBeam } from './vendor/components/ui/animated-beam';
export type { AnimatedBeamProps } from './vendor/components/ui/animated-beam';
export { AnimatedGradientText } from './vendor/components/ui/animated-gradient-text';
export type { AnimatedGradientTextProps } from './vendor/components/ui/animated-gradient-text';
export { AnimatedGridPattern } from './vendor/components/ui/animated-grid-pattern';
export type { AnimatedGridPatternProps } from './vendor/components/ui/animated-grid-pattern';
export { AuroraText } from './vendor/components/ui/aurora-text';
export { Badge } from './vendor/components/ui/badge';
export type { BadgeProps } from './vendor/components/ui/badge';
export { BentoGrid } from './vendor/components/ui/bento-grid';
export { BorderBeam } from './vendor/components/ui/border-beam';
export { ButtonGroup } from './vendor/components/ui/button-group';
export { Button } from './vendor/components/ui/button';
export type { ButtonProps } from './vendor/components/ui/button';
export { Checkbox } from './vendor/components/ui/checkbox';
export { CodeComparison } from './vendor/components/ui/code-comparison';
export { Collapsible } from './vendor/components/ui/collapsible';
export { Command } from './vendor/components/ui/command';
export { Dialog } from './vendor/components/ui/dialog';
export { Dock } from './vendor/components/ui/dock';
export type { DockProps } from './vendor/components/ui/dock';
export { Drawer } from './vendor/components/ui/drawer';
export { Tree, Folder, File } from './vendor/components/ui/file-tree';
export type { TreeViewElement } from './vendor/components/ui/file-tree';
export { InteractiveHoverButton } from './vendor/components/ui/interactive-hover-button';
export { Kbd } from './vendor/components/ui/kbd';
export { MagicCard } from './vendor/components/ui/magic-card';
export { Pagination } from './vendor/components/ui/pagination';
export { Popover } from './vendor/components/ui/popover';
export { Progress } from './vendor/components/ui/progress';
export { ResizablePanelGroup, ResizablePanel, ResizableHandle } from './vendor/components/ui/resizable';
export { ScrollArea } from './vendor/components/ui/scroll-area';
export { Separator } from './vendor/components/ui/separator';
export {
  Sheet, SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from './vendor/components/ui/sheet';
export { ShimmerButton } from './vendor/components/ui/shimmer-button';
export type { ShimmerButtonProps } from './vendor/components/ui/shimmer-button';
export { Slider } from './vendor/components/ui/slider';
export { Spinner } from './vendor/components/ui/spinner';
export { Switch } from './vendor/components/ui/switch';
export { Table } from './vendor/components/ui/table';
export { Tabs } from './vendor/components/ui/tabs';
export { Textarea } from './vendor/components/ui/textarea';
export { Toast } from './vendor/components/ui/toast';
export type { ToastProps } from './vendor/components/ui/toast';
export { Toaster } from './vendor/components/ui/toaster';