export interface GetToolCallsFilter {
  sessionId?: string;
}

export class GetToolCallsQuery {
  constructor(public readonly filter: GetToolCallsFilter) {}
}
