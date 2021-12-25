import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.119.0/testing/asserts.ts";

import * as fetch from "https://deno.land/x/mock_fetch@0.3.0/mod.ts";

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

// Pass a waitUntil function which collects a punch of promises
//
// withWaitUntil's returned promise will only resolve once all
// passed promises resolve
async function withWaitUntil(
  fn: (w: (p: Promise<unknown>) => void) => void | Promise<void>,
) {
  const promises: Promise<unknown>[] = [];
  const waitUntil = (promise: Promise<unknown>) => {
    promises.push(promise);
  };

  await fn(waitUntil);

  return Promise.all(promises);
}

Deno.test("successful schedule trigger", async () => {
  const { responses, destroy } = setupMock({ succeed: true });

  const env = {
    ACCOUNT_ID: "abc",
    PROJECT_NAME: "game-dev-diary",
    EMAIL: "email@example.com",
    AUTH_KEY: "iliketrains",
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
