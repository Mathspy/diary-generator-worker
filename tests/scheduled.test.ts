import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.119.0/testing/asserts.ts";

import * as fetch from "https://deno.land/x/mock_fetch@0.3.0/mod.ts";
import { withWaitUntil } from "./utils.ts";

import worker from "../src/worker.ts";

function setupMock({ succeed, msg = "" }: { succeed: boolean; msg?: string }) {
  const responses: { req: Request; match: Record<string, string> }[] = [];
  const errors: unknown[] = [];
  fetch.install();
  fetch.mock(
    "POST@/client/v4/accounts/:account_id/pages/projects/:project_name/deployments",
    (req, match) => {
      responses.push({ req, match });

      return new Response(msg, {
        status: succeed ? 200 : 400,
      });
    },
  );
  window.console.error = (...error: unknown[]) => {
    errors.push([...error]);
  };

  return { responses, errors, destroy: fetch.uninstall };
}

Deno.test("successful schedule trigger", async () => {
  const { responses, destroy } = setupMock({ succeed: true });

  const env = {
    ACCOUNT_ID: "abc",
    PROJECT_NAME: "game-dev-diary",
    EMAIL: "email@example.com",
    AUTH_KEY: "iliketrains",
    WEBHOOK_SECRET: "verysecret",
  };

  await withWaitUntil((waitUntil) =>
    worker.scheduled?.(
      { scheduledTime: Date.now(), cron: "0 0 * * *", noRetry() {} },
      env,
      { waitUntil, passThroughOnException() {} },
    )
  );

  assertEquals(responses.length, 1);
  assertEquals(responses[0].match["account_id"], env.ACCOUNT_ID);
  assertEquals(responses[0].match["project_name"], env.PROJECT_NAME);
  assert(
    responses[0].req.url.startsWith("https://api.cloudflare.com/"),
    "Request was not made to CloudFlare API",
  );
  assertEquals(responses[0].req.headers.get("x-auth-email"), env.EMAIL);
  assertEquals(responses[0].req.headers.get("x-auth-key"), env.AUTH_KEY);

  destroy();
});

Deno.test("failed schedule trigger", async () => {
  const { responses, errors, destroy } = setupMock({
    succeed: false,
    msg: "something went horribly wrong",
  });

  const env = {
    ACCOUNT_ID: "abc",
    PROJECT_NAME: "game-dev-diary",
    EMAIL: "email@example.com",
    AUTH_KEY: "iliketrains",
    WEBHOOK_SECRET: "verysecret",
  };

  await withWaitUntil((waitUntil) =>
    worker.scheduled?.(
      { scheduledTime: Date.now(), cron: "0 0 * * *", noRetry() {} },
      env,
      {
        waitUntil,
        passThroughOnException() {},
      },
    )
  );

  assertEquals(responses.length, 1);
  assertEquals(responses[0].match["account_id"], env.ACCOUNT_ID);
  assertEquals(responses[0].match["project_name"], env.PROJECT_NAME);
  assert(
    responses[0].req.url.startsWith("https://api.cloudflare.com/"),
    "Request was not made to CloudFlare API",
  );
  assertEquals(responses[0].req.headers.get("x-auth-email"), env.EMAIL);
  assertEquals(responses[0].req.headers.get("x-auth-key"), env.AUTH_KEY);

  assertEquals(errors[0], [
    `Failed to start new deployment.\nCaused by: something went horribly wrong`,
  ]);

  destroy();
});
