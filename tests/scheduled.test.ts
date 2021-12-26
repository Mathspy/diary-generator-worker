import { assertEquals } from "https://deno.land/std@0.119.0/testing/asserts.ts";

import * as fetch from "https://deno.land/x/mock_fetch@0.3.0/mod.ts";
import { withWaitUntil } from "./utils.ts";

import worker from "../src/worker.ts";

function setupMock({ succeed, msg = "" }: { succeed: boolean; msg?: string }) {
  const requests: Request[] = [];
  const errors: unknown[] = [];
  fetch.install();
  fetch.mock(
    "POST@/client/v4/accounts/:account_id/pages/projects/:project_name/deployments",
    (req, _match) => {
      requests.push(req);

      return new Response(msg, {
        status: succeed ? 200 : 400,
      });
    },
  );
  window.console.error = (...error: unknown[]) => {
    errors.push([...error]);
  };

  return { requests, errors, destroy: fetch.uninstall };
}

Deno.test("successful schedule trigger", async () => {
  const { requests, destroy } = setupMock({ succeed: true });

  const env = {
    ACCOUNT_ID: "abc",
    PROJECT_NAME: "game-dev-diary",
    EMAIL: "email@example.com",
    AUTH_KEY: "iliketrains",
    WEBHOOK_SECRET: "verysecret",
    DISCORD_WEBHOOK_ID: "12345",
    DISCORD_WEBHOOK_TOKEN: "moresecret",
  };

  await withWaitUntil((waitUntil) =>
    worker.scheduled?.(
      { scheduledTime: Date.now(), cron: "0 0 * * *", noRetry() {} },
      env,
      { waitUntil, passThroughOnException() {} },
    )
  );

  assertEquals(requests.length, 1);
  assertEquals(
    requests[0].url,
    `https://api.cloudflare.com/client/v4/accounts/${env.ACCOUNT_ID}/pages/projects/${env.PROJECT_NAME}/deployments`,
  );
  assertEquals(requests[0].headers.get("x-auth-email"), env.EMAIL);
  assertEquals(requests[0].headers.get("x-auth-key"), env.AUTH_KEY);

  destroy();
});

Deno.test("failed schedule trigger", async () => {
  const { requests, errors, destroy } = setupMock({
    succeed: false,
    msg: "something went horribly wrong",
  });

  const env = {
    ACCOUNT_ID: "abc",
    PROJECT_NAME: "game-dev-diary",
    EMAIL: "email@example.com",
    AUTH_KEY: "iliketrains",
    WEBHOOK_SECRET: "verysecret",
    DISCORD_WEBHOOK_ID: "12345",
    DISCORD_WEBHOOK_TOKEN: "moresecret",
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

  assertEquals(requests.length, 1);
  assertEquals(
    requests[0].url,
    `https://api.cloudflare.com/client/v4/accounts/${env.ACCOUNT_ID}/pages/projects/${env.PROJECT_NAME}/deployments`,
  );
  assertEquals(requests[0].headers.get("x-auth-email"), env.EMAIL);
  assertEquals(requests[0].headers.get("x-auth-key"), env.AUTH_KEY);

  assertEquals(errors[0], [
    `Failed to start new deployment.\nCaused by: something went horribly wrong`,
  ]);

  destroy();
});
