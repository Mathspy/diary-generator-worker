import { assertEquals } from "https://deno.land/std@0.119.0/testing/asserts.ts";
import * as fetch from "https://deno.land/x/mock_fetch@0.3.0/mod.ts";

type waitUntilFn = (promise: Promise<unknown>) => void;

// Pass a waitUntil function which collects a punch of promises
//
// withWaitUntil's returned promise will only resolve once all
// passed promises resolve
export async function withWaitUntil<T>(
  fn: (w: waitUntilFn) => T | Promise<T>,
): Promise<T> {
  const promises: Promise<unknown>[] = [];
  const waitUntil = (promise: Promise<unknown>) => {
    promises.push(promise);
  };

  const response = await fn(waitUntil);

  return Promise.all(promises).then(() => response);
}

export function setupMock(
  { succeed, msg = "" }: { succeed: boolean; msg?: string },
) {
  const requests: Request[] = [];
  const logs: Request[] = [];
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
  fetch.mock(
    "POST@/api/webhooks/:webhook_id/:webhook_token",
    (req, _match) => {
      logs.push(req);

      return new Response(msg, {
        status: 200,
      });
    },
  );

  return { requests, logs, destroy: fetch.uninstall };
}

interface LoggingEnv {
  DISCORD_WEBHOOK_ID: string;
  DISCORD_WEBHOOK_TOKEN: string;
}

export function makeAssertLog(env: LoggingEnv) {
  return async (log: Request, data: unknown) => {
    assertEquals(
      log.url,
      `https://discord.com/api/webhooks/${env.DISCORD_WEBHOOK_ID}/${env.DISCORD_WEBHOOK_TOKEN}`,
    );

    const { content }: { content: string } = await log.json();
    assertEquals(
      content.slice(0, 8),
      "```json\n",
    );
    assertEquals(
      content.slice(-3),
      "```",
    );
    const parsed = JSON.parse(content.slice(8, -3));

    assertEquals(parsed, data);
  };
}
