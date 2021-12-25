// Based on the @CloudFlare/worker-types
// https://github.com/cloudflare/workers-types
//
// Reused under the terms and conditions of BSD 3-Clause License
//
// Copyright (c) 2020, Cloudflare, Inc. and contributors

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

interface ExportedHandler<Env = unknown> {
  fetch?: ExportedHandlerFetchHandler<Env>;
  scheduled?: ExportedHandlerScheduledHandler<Env>;
}

declare type ExportedHandlerFetchHandler<Env = unknown> = (
  request: Request,
  env: Env,
  ctx: ExecutionContext,
) => Response | Promise<Response>;

declare type ExportedHandlerScheduledHandler<Env = unknown> = (
  controller: ScheduledController,
  env: Env,
  ctx: ExecutionContext,
) => void | Promise<void>;

interface ScheduledController {
  readonly scheduledTime: number;
  readonly cron: string;
  noRetry(): void;
}
