import fs from "fs/promises";
import path from "path";
import type { ToolDefinition } from "@eddie/types";

interface LineMatch {
  lineNumber: number;
  line: string;
  matches: Array<{
    match: string;
    start: number;
    end: number;
    groups: string[];
  }>;
}

interface SearchResult {
  path: string;
  lineMatches: LineMatch[];
}

const toPosix = (value: string) =>
  path.sep === "/" ? value : value.split(path.sep).join("/");

const cloneRegExp = (pattern: RegExp): RegExp =>
  new RegExp(pattern.source, pattern.flags);

const matchesAny = (patterns: RegExp[], value: string): boolean =>
  patterns.some((pattern) => pattern.test(value));

const coercePositiveInteger = (value: unknown): number | undefined => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return undefined;
  }

  return Math.max(1, Math.floor(numeric));
};

async function listFiles(root: string): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const results: string[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      const nested = await listFiles(absolutePath);
      results.push(...nested);
    } else if (entry.isFile()) {
      results.push(absolutePath);
    }
  }

  return results;
}

const buildContentRegex = (pattern: string | undefined): RegExp | null => {
  if (!pattern) {
    return null;
  }

  try {
    return new RegExp(pattern, "gu");
  } catch (error) {
    throw new Error(`Invalid content regex: ${String(error)}`);
  }
};

const buildNameRegex = (pattern: string | undefined): RegExp | null => {
  if (!pattern) {
    return null;
  }

  try {
    return new RegExp(pattern, "u");
  } catch (error) {
    throw new Error(`Invalid name regex: ${String(error)}`);
  }
};

const buildPatternList = (
  patterns: unknown,
  label: "include" | "exclude",
): RegExp[] => {
  if (!Array.isArray(patterns)) {
    return [];
  }

  return patterns.map((pattern) => {
    if (typeof pattern !== "string") {
      throw new Error(`${label} pattern must be a string`);
    }

    try {
      return new RegExp(pattern, "u");
    } catch (error) {
      throw new Error(`Invalid ${label} regex: ${String(error)}`);
    }
  });
};

const findContentMatches = (
  content: string,
  pattern: RegExp,
): LineMatch[] => {
  const matches: LineMatch[] = [];
  const lines = content.split(/\r?\n/);

  lines.forEach((line, index) => {
    const perLine = cloneRegExp(pattern);
    const lineMatches = [...line.matchAll(perLine)];
    if (lineMatches.length === 0) {
      return;
    }

    matches.push({
      lineNumber: index + 1,
      line,
      matches: lineMatches.map((match) => ({
        match: match[0] ?? "",
        start: match.index ?? 0,
        end: (match.index ?? 0) + (match[0]?.length ?? 0),
        groups: match.slice(1).map((value) => value ?? ""),
      })),
    });
  });

  return matches;
};

export const fileSearchTool: ToolDefinition = {
  name: "file_search",
  description: "Search for files matching content patterns relative to the workspace.",
  jsonSchema: {
    type: "object",
    properties: {
      root: { type: "string", default: "." },
      content: { type: "string" },
      name: { type: "string" },
      include: { type: "array", items: { type: "string" } },
      exclude: { type: "array", items: { type: "string" } },
      page: { type: "number", minimum: 1 },
      pageSize: { type: "number", minimum: 1 },
    },
    additionalProperties: false,
  },
  outputSchema: {
    $id: "eddie.tool.file_search.result.v1",
    type: "object",
    properties: {
      results: {
        type: "array",
        items: {
          type: "object",
          properties: {
            path: { type: "string" },
            lineMatches: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  lineNumber: { type: "number" },
                  line: { type: "string" },
                  matches: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        match: { type: "string" },
                        start: { type: "number" },
                        end: { type: "number" },
                        groups: {
                          type: "array",
                          items: { type: "string" },
                        },
                      },
                      required: ["match", "start", "end", "groups"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["lineNumber", "line", "matches"],
                additionalProperties: false,
              },
            },
          },
          required: ["path", "lineMatches"],
          additionalProperties: false,
        },
      },
      totalResults: { type: "number" },
      page: { type: "number" },
      pageSize: { type: "number" },
      totalPages: { type: "number" },
    },
    required: ["results", "totalResults", "page", "pageSize", "totalPages"],
    additionalProperties: false,
  },
  async handler(args, ctx) {
    const root = String(args.root ?? ".");
    const absoluteRoot = path.resolve(ctx.cwd, root);
    const contentRegex = buildContentRegex(args.content);
    const nameRegex = buildNameRegex(args.name);
    const includePatterns = buildPatternList(args.include, "include");
    const excludePatterns = buildPatternList(args.exclude, "exclude");

    const files = await listFiles(absoluteRoot);
    const entries = files
      .map((filePath) => {
        const relativePath = toPosix(path.relative(ctx.cwd, filePath));
        return {
          absolutePath: filePath,
          relativePath,
          basename: path.basename(filePath),
        };
      })
      .sort((a, b) => a.relativePath.localeCompare(b.relativePath, "en"));

    const matches: SearchResult[] = [];

    for (const entry of entries) {
      if (
        includePatterns.length > 0 &&
        !matchesAny(includePatterns, entry.relativePath)
      ) {
        continue;
      }

      if (matchesAny(excludePatterns, entry.relativePath)) {
        continue;
      }

      if (nameRegex && !nameRegex.test(entry.basename)) {
        continue;
      }

      if (!contentRegex && !nameRegex) {
        continue;
      }

      let lineMatches: LineMatch[] = [];
      if (contentRegex) {
        const fileContent = await fs.readFile(entry.absolutePath, "utf-8");
        lineMatches = findContentMatches(fileContent, contentRegex);
        if (lineMatches.length === 0) {
          continue;
        }
      }

      matches.push({
        path: entry.relativePath,
        lineMatches,
      });
    }

    const totalResults = matches.length;
    const rawPage = coercePositiveInteger(args.page) ?? 1;
    const defaultPageSize = totalResults > 0 ? totalResults : 1;
    const pageSize = coercePositiveInteger(args.pageSize) ?? defaultPageSize;
    const totalPages = pageSize > 0 ? Math.ceil(totalResults / pageSize) : 0;
    const maxPage = Math.max(totalPages, 1);
    const page = Math.min(rawPage, maxPage);
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const pagedResults = matches.slice(startIndex, endIndex);

    return {
      schema: "eddie.tool.file_search.result.v1",
      content:
        totalResults === 0
          ? "No matches found."
          : `Found ${totalResults} matching file${totalResults === 1 ? "" : "s"}.`,
      data: {
        results: pagedResults,
        totalResults,
        page,
        pageSize,
        totalPages,
      },
    };
  },
};
