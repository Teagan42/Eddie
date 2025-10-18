import { IQuery } from '@nestjs/cqrs';

export class GetTraceQuery implements IQuery {
  constructor(public readonly id: string) {}
}
