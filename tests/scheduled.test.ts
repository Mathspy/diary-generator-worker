import { assertEquals } from "https://deno.land/std@0.119.0/testing/asserts.ts";

import { makeAssertLog, setupMock, withWaitUntil } from "./utils.ts";

import worker from "../src/worker.ts";

const env = {
  ACCOUNT_ID: "abc",
  PROJECT_NAME: "game-dev-diary",
  EMAIL: "email@example.com",
  AUTH_KEY: "iliketrains",
  WEBHOOK_SECRET: "verysecret",
  DISCORD_WEBHOOK_ID: "12345",
  DISCORD_WEBHOOK_TOKEN: "moresecret",
};
const assertLog = makeAssertLog(env);

Deno.test("successful schedule trigger", async () => {
  const { requests, logs, destroy } = setupMock({ succeed: true });

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

  assertEquals(logs.length, 1);
  assertLog(logs[0], {
    msg: "Successfully redeployed",
    cause: "cronjob",
  });

  destroy();
});

Deno.test("failed schedule trigger", async () => {
  const { requests, logs, destroy } = setupMock({
    succeed: false,
    msg: "something went horribly wrong",
  });

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

  assertEquals(logs.length, 1);
  assertLog(logs[0], {
    msg: "Failed to start new deployment",
    cause: "something went horribly wrong",
  });

  destroy();
});
