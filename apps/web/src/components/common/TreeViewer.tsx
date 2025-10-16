import { forwardRef } from 'react';
import type { HTMLAttributes } from 'react';

import { cn } from '@/vendor/lib/utils';

import { JsonTreeView } from './JsonTreeView';

type BaseProps = {
  /**
   * Data structure rendered in the tree viewer. Accepts JSON-compatible
   * structures as well as arbitrary JS objects.
   */
  data: unknown;
  /**
   * When true the tree renders with all nodes collapsed initially.
   */
  defaultCollapsed?: boolean;
  /**
   * Optional text label describing the data being rendered. Also used for the
   * accessible name of the tree container.
   */
  label?: string;
  /**
   * Additional class names passed to the viewer container.
   */
  className?: string;
};

export type TreeViewerProps = BaseProps &
  Omit<HTMLAttributes<HTMLDivElement>, 'children'>;

export const TreeViewer = forwardRef<HTMLDivElement, TreeViewerProps>(
  (
    {
      data,
      defaultCollapsed = true,
      label,
      className,
      tabIndex = 0,
      ...rest
    },
    ref,
  ) => {
    const { ['aria-label']: ariaLabelOverride, ...restProps } = rest;
    const ariaLabel = ariaLabelOverride ?? label;

    return (
      <div
        {...restProps}
        ref={ref}
        tabIndex={tabIndex}
        data-testid="tree-viewer"
        aria-label={ariaLabel}
        className={cn('focus:outline-none focus-visible:ring-2', className)}
      >
        <JsonTreeView
          value={data}
          collapsedByDefault={defaultCollapsed}
          className="text-left"
          rootLabel={label}
        />
      </div>
    );
  },
);

TreeViewer.displayName = 'TreeViewer';
