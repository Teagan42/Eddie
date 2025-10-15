import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import { TracesService } from "../traces.service";
import { GetTraceQuery } from "./get-trace.query";

type GetTraceResult = Awaited<ReturnType<TracesService["get"]>>;

@QueryHandler(GetTraceQuery)
export class GetTraceHandler implements IQueryHandler<
  GetTraceQuery,
  GetTraceResult
> {
  constructor(private readonly tracesService: TracesService) {}

  async execute({ id }: GetTraceQuery): Promise<GetTraceResult> {
    return this.tracesService.get(id);
  }
}
