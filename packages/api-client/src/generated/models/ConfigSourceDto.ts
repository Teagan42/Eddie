/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type ConfigSourceDto = {
    /**
     * Absolute path to the configuration file when available.
     */
    path: Record<string, any> | null;
    /**
     * Format used for the configuration file.
     */
    format: ConfigSourceDto.format;
    /**
     * Raw configuration source.
     */
    content: string;
    /**
     * Parsed configuration input object.
     */
    input: Record<string, any>;
    /**
     * Resolved Eddie configuration.
     */
    config?: Record<string, any> | null;
    /**
     * Configuration validation error when the source cannot be composed.
     */
    error?: Record<string, any> | null;
};
export namespace ConfigSourceDto {
    /**
     * Format used for the configuration file.
     */
    export enum format {
        YAML = 'yaml',
        JSON = 'json',
    }
}

