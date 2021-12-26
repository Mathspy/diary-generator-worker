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
