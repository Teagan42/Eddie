export interface TemplateVariables {
  [key: string]: unknown;
}

export interface TemplateDescriptor {
  /**
   * Relative or absolute path to the template file on disk.
   */
  file: string;
  /**
   * Optional directory used to resolve {@link file} when it is relative.
   * Defaults to {@link process.cwd} when omitted.
   */
  baseDir?: string;
  /**
   * Encoding used to read the template file. Defaults to `utf-8`.
   */
  encoding?: BufferEncoding;
  /**
   * Default variables applied whenever the template renders.
   */
  variables?: TemplateVariables;
}
