import { bashTool } from "./bash";
import { fileReadTool } from "./file_read";
import { fileWriteTool } from "./file_write";
import { fileSearchTool } from "./file_search";
import { getFolderTreeStructureTool } from "./get_folder_tree_structure";
import { getPlanTool } from "./get_plan";
import { completeTaskTool } from "./complete_task";
import { updatePlanTool } from "./update_plan";
import { agentNewTaskListTool } from "./agent__new_task_list";
import { agentNewTaskTool } from "./agent__new_task";

export const builtinTools = [
  bashTool,
  fileReadTool,
  fileWriteTool,
  fileSearchTool,
  getFolderTreeStructureTool,
  getPlanTool,
  completeTaskTool,
  updatePlanTool,
  agentNewTaskListTool,
  agentNewTaskTool,
];
