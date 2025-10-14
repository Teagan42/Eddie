import { bashTool } from "./bash";
import { fileReadTool } from "./file_read";
import { fileWriteTool } from "./file_write";
import { getFolderTreeStructureTool } from "./get_folder_tree_structure";
import { getPlanTool } from "./get_plan";
import { updatePlanTool } from "./update_plan";

export const builtinTools = [
  bashTool,
  fileReadTool,
  fileWriteTool,
  getFolderTreeStructureTool,
  getPlanTool,
  updatePlanTool,
];
