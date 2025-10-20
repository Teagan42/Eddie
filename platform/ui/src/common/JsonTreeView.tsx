import { useId, useState } from 'react';

import { cn } from './cn';

type JsonValue = unknown;

export interface JsonTreeViewProps {
  value: JsonValue;
  className?: string;
  collapsedByDefault?: boolean;
  rootLabel?: string;
}

export function JsonTreeView({
  value,
  className,
  collapsedByDefault = true,
  rootLabel,
}: JsonTreeViewProps): JSX.Element {
  const labelId = useId();
  const resolvedLabelId = rootLabel ? `${labelId}-label` : undefined;
  const labelledBy = rootLabel ? resolvedLabelId : undefined;
  const rootLabelNode = rootLabel ? (
    <div
      id={resolvedLabelId}
      data-testid="json-tree-view-root-label"
      className="mb-2 font-mono text-xs text-foreground/80"
    >
      {rootLabel}
    </div>
  ) : null;

  return (
    <div
      className={cn(
        'rounded-lg border border-muted/40 bg-background/80 p-3',
        className,
      )}
      data-testid="json-tree-view"
      aria-labelledby={labelledBy}
    >
      {rootLabelNode}

      <JsonChildren
        value={value}
        path=""
        collapsedByDefault={collapsedByDefault}
      />
    </div>
  );
}

interface JsonChildrenProps {
  value: JsonValue;
  path: string;
  collapsedByDefault: boolean;
}

function JsonChildren({
  value,
  path,
  collapsedByDefault,
}: JsonChildrenProps): JSX.Element {
  const testId = getTestId(path);
  const containerTestId = testId ?? undefined;

  if (Array.isArray(value)) {
    return (
      <ul className="space-y-1" data-testid={containerTestId}>
        {value.map((item, index) => {
          const childPath = `${path}[${index}]`;
          return (
            <JsonEntry
              key={childPath}
              name={`${index}`}
              value={item}
              path={childPath}
              collapsedByDefault={collapsedByDefault}
            />
          );
        })}
      </ul>
    );
  }

  if (isPlainObject(value)) {
    const entries = Object.entries(value);

    return (
      <ul className="space-y-1" data-testid={containerTestId}>
        {entries.map(([key, child]) => {
          const childPath = path ? `${path}.${key}` : key;
          return (
            <JsonEntry
              key={childPath}
              name={key}
              value={child}
              path={childPath}
              collapsedByDefault={collapsedByDefault}
            />
          );
        })}
      </ul>
    );
  }

  return (
    <div
      className="font-mono text-xs"
      data-testid={testId ?? 'json-entry-root'}
      data-type={getPrimitiveType(value)}
    >
      {formatPrimitive(value)}
    </div>
  );
}

interface JsonEntryProps {
  name: string;
  value: JsonValue;
  path: string;
  collapsedByDefault: boolean;
}

function JsonEntry({
  name,
  value,
  path,
  collapsedByDefault,
}: JsonEntryProps): JSX.Element {
  const expandable = isPlainObject(value) || Array.isArray(value);
  const [expanded, setExpanded] = useState<boolean>(!collapsedByDefault);
  const testId = getTestId(path);
  const containerTestId = testId ?? undefined;
  const summaryLabel = expandable ? getSummaryLabel(value) : '';
  const state = getEntryState(expandable, expanded);

  return (
    <li className="space-y-1" data-testid={containerTestId} data-state={state}>
      <div className="flex items-center gap-2 font-mono text-xs">
        {expandable ? (
          <button
            type="button"
            aria-label={`Toggle ${name}`}
            aria-expanded={expanded}
            className="h-4 w-4 rounded border border-muted/50 text-[10px]"
            onClick={() => setExpanded((current) => !current)}
          >
            {expanded ? '−' : '+'}
          </button>
        ) : (
          <span className="inline-block h-4 w-4" aria-hidden="true" />
        )}
        <span className="text-foreground/90">&quot;{name}&quot;</span>
        <span className="text-foreground/70">:</span>
        {expandable ? (
          <span className="text-foreground/70">{summaryLabel}</span>
        ) : (
          <span
            className="text-foreground/80"
            data-type={getPrimitiveType(value)}
          >
            {formatPrimitive(value)}
          </span>
        )}
      </div>

      {expandable && expanded ? (
        <div className="ml-5 border-l border-dashed border-muted/40 pl-3">
          <JsonChildren
            value={value}
            path={path}
            collapsedByDefault={collapsedByDefault}
          />
        </div>
      ) : null}
    </li>
  );
}

function formatPrimitive(value: JsonValue): string {
  if (typeof value === 'string') {
    return `"${value}"`;
  }

  if (value === null) {
    return 'null';
  }

  return String(value);
}

function isPlainObject(value: JsonValue): value is Record<string, JsonValue> {
  return Boolean(value) && Object.prototype.toString.call(value) === '[object Object]';
}

function getTestId(path: string): string | null {
  if (!path) {
    return null;
  }

  return `json-entry-${path.replace(/[^a-zA-Z0-9]+/g, '-')}`;
}

function getPrimitiveType(value: JsonValue): string {
  if (value === null) {
    return 'null';
  }

  return typeof value;
}

function getEntryState(expandable: boolean, expanded: boolean): string {
  if (!expandable) {
    return 'leaf';
  }

  return expanded ? 'expanded' : 'collapsed';
}

function getSummaryLabel(value: JsonValue): string {
  if (Array.isArray(value)) {
    return `${value.length} items`;
  }

  if (isPlainObject(value)) {
    return `${Object.keys(value).length} keys`;
  }

  return '';
}
