/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type RuntimeConfigDto = {
  /**
   * Public HTTP API URL
   */
  apiUrl: string;
  /**
   * Public WebSocket URL
   */
  websocketUrl: string;
  /**
   * Feature flags
   */
  features: Record<string, any>;
  /**
   * Active theme
   */
  theme: RuntimeConfigDto.theme[ number ];
};
export namespace RuntimeConfigDto {
  /**
   * Active theme
   */
  export enum theme {
    LIGHT = 'light',
    DARK = 'dark',
    MIDNIGHT = 'midnight',
    AURORA = 'aurora',
  }
}

