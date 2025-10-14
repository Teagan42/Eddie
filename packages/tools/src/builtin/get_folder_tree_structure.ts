import type { Dirent } from "fs";
import fs from "fs/promises";
import path from "path";
import type { ToolDefinition } from "@eddie/types";

type TreeEntry =
  | {
      name: string;
      path: string;
      type: "file";
    }
  | {
      name: string;
      path: string;
      type: "directory";
      entries: TreeEntry[];
    };

interface BuildOptions {
  includeHidden: boolean;
  maxDepth: number;
}

interface PaginationSummary {
  limit: number | null;
  offset: number;
  returnedEntries: number;
  totalEntries: number;
  hasMore: boolean;
  nextOffset: number | null;
}

const joinRelativePath = (base: string, segment: string) =>
  base ? `${base}/${segment}` : segment;

const toPosix = (value: string) =>
  path.sep === "/" ? value : value.split(path.sep).join("/");

const normalizeRootDisplay = (value: string) =>
  value.length === 0 ? "." : value;

const sortDirents = (a: Dirent, b: Dirent) =>
  a.name.localeCompare(b.name, "en", { sensitivity: "base" });

const shouldInclude = (name: string, includeHidden: boolean) =>
  includeHidden || !name.startsWith(".");

async function buildTreeEntries(
  absolutePath: string,
  relativePath: string,
  depth: number,
  options: BuildOptions,
): Promise<TreeEntry[]> {
  const dirents = await fs.readdir(absolutePath, { withFileTypes: true });
  const visible = dirents
    .filter((dirent) => shouldInclude(dirent.name, options.includeHidden))
    .sort(sortDirents);

  const results: TreeEntry[] = [];
  for (const dirent of visible) {
    const childRelative = joinRelativePath(relativePath, dirent.name);
    const childAbsolute = path.join(absolutePath, dirent.name);
    if (dirent.isDirectory()) {
      const entries =
        depth < options.maxDepth
          ? await buildTreeEntries(childAbsolute, childRelative, depth + 1, options)
          : [];
      results.push({
        name: dirent.name,
        path: childRelative,
        type: "directory",
        entries,
      });
    } else {
      results.push({
        name: dirent.name,
        path: childRelative,
        type: "file",
      });
    }
  }
  return results;
}

const flattenEntries = (entries: TreeEntry[]): string[] => {
  const items: string[] = [];
  for (const entry of entries) {
    if (entry.type === "directory") {
      items.push(`${entry.path}/`);
      items.push(...flattenEntries(entry.entries));
    } else {
      items.push(entry.path);
    }
  }
  return items;
};

const formatContent = (
  root: string,
  pageEntries: string[],
  pagination: PaginationSummary,
): string => {
  const shouldAnnotate =
    pagination.limit !== null || pagination.offset > 0 || pagination.hasMore;
  let header = `Tree for ${root}`;
  if (shouldAnnotate) {
    const details =
      pagination.offset > 0
        ? `showing ${pagination.returnedEntries} of ${pagination.totalEntries} entries starting at offset ${pagination.offset}`
        : `showing ${pagination.returnedEntries} of ${pagination.totalEntries} entries`;
    header = `${header} (${details})`;
  }
  if (pageEntries.length === 0) {
    return header;
  }
  return [header, ...pageEntries].join("\n");
};

export const getFolderTreeStructureTool: ToolDefinition = {
  name: "get_folder_tree_structure",
  description: "List the directory tree relative to the workspace.",
  jsonSchema: {
    type: "object",
    properties: {
      path: { type: "string", default: "." },
      maxDepth: { type: "number", minimum: 0 },
      includeHidden: { type: "boolean" },
      maxEntries: { type: "number", minimum: 1 },
      offset: { type: "number", minimum: 0 },
    },
    additionalProperties: false,
  },
  outputSchema: {
    $id: "eddie.tool.get_folder_tree_structure.result.v1",
    type: "object",
    properties: {
      root: { type: "string" },
      entries: {
        type: "array",
        items: {
          anyOf: [
            {
              type: "object",
              properties: {
                name: { type: "string" },
                path: { type: "string" },
                type: { const: "file" },
              },
              required: ["name", "path", "type"],
              additionalProperties: false,
            },
            {
              type: "object",
              properties: {
                name: { type: "string" },
                path: { type: "string" },
                type: { const: "directory" },
                entries: { $ref: "#/properties/entries" },
              },
              required: ["name", "path", "type", "entries"],
              additionalProperties: false,
            },
          ],
        },
      },
      pageEntries: {
        type: "array",
        items: { type: "string" },
      },
      pagination: {
        type: "object",
        properties: {
          limit: { type: ["number", "null"] },
          offset: { type: "number" },
          returnedEntries: { type: "number" },
          totalEntries: { type: "number" },
          hasMore: { type: "boolean" },
          nextOffset: { type: ["number", "null"] },
        },
        required: [
          "limit",
          "offset",
          "returnedEntries",
          "totalEntries",
          "hasMore",
          "nextOffset",
        ],
        additionalProperties: false,
      },
    },
    required: ["root", "entries", "pageEntries", "pagination"],
    additionalProperties: false,
  },
  async handler(args, ctx) {
    const requestedPath = String(args.path ?? ".");
    const rootDisplay = normalizeRootDisplay(requestedPath);
    const absolute = path.resolve(ctx.cwd, requestedPath);
    const workspaceRelative = path.relative(ctx.cwd, absolute);
    const initialRelative = workspaceRelative ? toPosix(workspaceRelative) : "";
    const maxDepth =
      typeof args.maxDepth === "number" && Number.isFinite(args.maxDepth)
        ? Math.max(0, Math.floor(args.maxDepth))
        : Number.POSITIVE_INFINITY;
    const includeHidden = Boolean(args.includeHidden);
    const rawMaxEntries =
      typeof args.maxEntries === "number" && Number.isFinite(args.maxEntries)
        ? Math.max(1, Math.floor(args.maxEntries))
        : Number.POSITIVE_INFINITY;
    const rawOffset =
      typeof args.offset === "number" && Number.isFinite(args.offset)
        ? Math.max(0, Math.floor(args.offset))
        : 0;

    const entries = await buildTreeEntries(absolute, initialRelative, 0, {
      includeHidden,
      maxDepth,
    });
    const flattened = flattenEntries(entries);
    const totalEntries = flattened.length;
    const offset = Math.min(rawOffset, totalEntries);
    const limitValue = Number.isFinite(rawMaxEntries) ? rawMaxEntries : null;
    const pageEntries = Number.isFinite(rawMaxEntries)
      ? flattened.slice(offset, offset + rawMaxEntries)
      : flattened.slice(offset);
    const returnedEntries = pageEntries.length;
    const hasMore = offset + returnedEntries < totalEntries;
    const nextOffset = hasMore ? offset + returnedEntries : null;

    const pagination: PaginationSummary = {
      limit: limitValue,
      offset,
      returnedEntries,
      totalEntries,
      hasMore,
      nextOffset,
    };

    return {
      schema: "eddie.tool.get_folder_tree_structure.result.v1",
      content: formatContent(rootDisplay, pageEntries, pagination),
      data: {
        root: rootDisplay,
        entries,
        pageEntries,
        pagination,
      },
    };
  },
};
