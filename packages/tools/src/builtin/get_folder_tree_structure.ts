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

const formatContent = (root: string, entries: TreeEntry[]): string => {
  const flattened = flattenEntries(entries);
  if (flattened.length === 0) {
    return `Tree for ${root}`;
  }
  return [`Tree for ${root}`, ...flattened].join("\n");
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
    },
    required: ["root", "entries"],
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

    const entries = await buildTreeEntries(absolute, initialRelative, 0, {
      includeHidden,
      maxDepth,
    });

    return {
      schema: "eddie.tool.get_folder_tree_structure.result.v1",
      content: formatContent(rootDisplay, entries),
      data: {
        root: rootDisplay,
        entries,
      },
    };
  },
};
