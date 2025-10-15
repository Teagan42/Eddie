import { IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { ToolCallStore, type ToolCallState } from "../tool-call.store";
import { GetToolCallsQuery } from "./get-tool-calls.query";

@QueryHandler(GetToolCallsQuery)
export class GetToolCallsHandler implements IQueryHandler<GetToolCallsQuery, ToolCallState[]> {
  constructor(private readonly store: ToolCallStore) {}

  async execute(query: GetToolCallsQuery): Promise<ToolCallState[]> {
    return this.store.list(query.filter.sessionId);
  }
}
