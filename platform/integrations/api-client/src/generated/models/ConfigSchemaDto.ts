/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type ConfigSchemaDto = {
    /**
     * Identifier for the schema bundle.
     */
    id: string;
    /**
     * Semantic version of the schema bundle.
     */
    version: string;
    /**
     * JSON Schema describing the resolved Eddie configuration.
     */
    schema: Record<string, any>;
    /**
     * JSON Schema describing the configuration file input.
     */
    inputSchema: Record<string, any>;
};

