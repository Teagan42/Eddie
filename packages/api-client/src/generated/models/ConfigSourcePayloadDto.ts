/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type ConfigSourcePayloadDto = {
    /**
     * Configuration source contents.
     */
    content: string;
    /**
     * Format of the configuration payload.
     */
    format: ConfigSourcePayloadDto.format;
};
export namespace ConfigSourcePayloadDto {
    /**
     * Format of the configuration payload.
     */
    export enum format {
        YAML = 'yaml',
        JSON = 'json',
    }
}

