import { assertEquals } from "https://deno.land/std@0.119.0/testing/asserts.ts";

import { setupMock, withWaitUntil } from "./utils.ts";

import worker from "../src/worker.ts";

Deno.test("successful schedule trigger", async () => {
  const { requests, logs, destroy } = setupMock({ succeed: true });

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

  assertEquals(logs.length, 1);
  assertEquals(
    logs[0].url,
    `https://discord.com/api/webhooks/${env.DISCORD_WEBHOOK_ID}/${env.DISCORD_WEBHOOK_TOKEN}`,
  );
  assertEquals(await logs[0].json(), {
    content:
      '```json\n{\n  "msg": "Successfully redeployed",\n  "cause": "cronjob"\n}```',
  });

  destroy();
});

Deno.test("failed schedule trigger", async () => {
  const { requests, logs, destroy } = setupMock({
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

  assertEquals(logs.length, 1);
  assertEquals(
    logs[0].url,
    `https://discord.com/api/webhooks/${env.DISCORD_WEBHOOK_ID}/${env.DISCORD_WEBHOOK_TOKEN}`,
  );
  assertEquals(await logs[0].json(), {
    content:
      '```json\n{\n  "msg": "Failed to start new deployment",\n  "cause": "something went horribly wrong"\n}```',
  });

  destroy();
});
