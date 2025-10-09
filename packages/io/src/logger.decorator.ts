import { Inject } from "@nestjs/common";
import type { FactoryProvider } from "@nestjs/common";
import type { Logger } from "pino";
import { LoggerService } from "./logger.service";

const LOGGER_TOKEN_PREFIX = "EDDIE_LOGGER_SCOPE";
const ROOT_LOGGER_TOKEN = Symbol.for(`${LOGGER_TOKEN_PREFIX}::root`);

export type LoggerScope = string | undefined;

export const getLoggerToken = (scope?: LoggerScope): symbol =>
  scope ? Symbol.for(`${LOGGER_TOKEN_PREFIX}::${scope}`) : ROOT_LOGGER_TOKEN;

const registeredLoggerProviders = new Map<
  symbol,
  FactoryProvider<Logger>
>();

const ensureLoggerProviderRegistered = (
  scope?: LoggerScope
): FactoryProvider<Logger> => {
  const token = getLoggerToken(scope);
  if (!registeredLoggerProviders.has(token)) {
    registeredLoggerProviders.set(token, {
      provide: token,
      useFactory: (loggerService: LoggerService) =>
        loggerService.getLogger(scope),
      inject: [LoggerService],
    });
  }

  return registeredLoggerProviders.get(token)!;
};

ensureLoggerProviderRegistered();

export const createLoggerProvider = (
  scope?: LoggerScope
): FactoryProvider<Logger> => ensureLoggerProviderRegistered(scope);

export const createLoggerProviders = (): FactoryProvider<Logger>[] =>
  Array.from(registeredLoggerProviders.entries())
    .filter(([token]) => token !== ROOT_LOGGER_TOKEN)
    .map(([, provider]) => provider);

export const InjectLogger = (scope?: LoggerScope) => {
  ensureLoggerProviderRegistered(scope);
  return Inject(getLoggerToken(scope));
};
