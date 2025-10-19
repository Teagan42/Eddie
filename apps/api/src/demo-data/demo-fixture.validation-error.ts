export class DemoFixtureValidationError extends Error {
  constructor(
    readonly fixturePath: string,
    readonly failurePath: string,
    readonly reason: string,
  ) {
    super(
      `Invalid demo fixture "${fixturePath}" at ${failurePath}: ${reason}`,
    );
    this.name = "DemoFixtureValidationError";
  }
}
