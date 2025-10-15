import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import { TracesService } from "../traces.service";
import { GetTracesQuery } from "./get-traces.query";

type GetTracesResult = Awaited<ReturnType<TracesService["list"]>>;

@QueryHandler(GetTracesQuery)
export class GetTracesHandler implements IQueryHandler<
  GetTracesQuery,
  GetTracesResult
> {
  constructor(private readonly tracesService: TracesService) {}

  async execute(): Promise<GetTracesResult> {
    return this.tracesService.list();
  }
}
