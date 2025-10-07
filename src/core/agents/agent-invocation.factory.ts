import { Injectable } from "@nestjs/common";
import type { ToolRegistryFactory } from "../tools";
import type { AgentDefinition } from "./agent-definition";
import { AgentInvocation, type AgentInvocationOptions } from "./agent-invocation";

@Injectable()
export class AgentInvocationFactory {
  constructor(
    private readonly toolRegistryFactory: ToolRegistryFactory
  ) {}

  create(
    definition: AgentDefinition,
    options: AgentInvocationOptions,
    parent?: AgentInvocation
  ): AgentInvocation {
    return new AgentInvocation(
      definition,
      options,
      this.toolRegistryFactory,
      parent
    );
  }
}
