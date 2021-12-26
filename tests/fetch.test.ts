import { assertEquals } from "https://deno.land/std@0.119.0/testing/asserts.ts";

import worker from "../src/worker.ts";
import { makeAssertLog, setupMock, withWaitUntil } from "./utils.ts";

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

Deno.test("unknown route", async () => {
  const response = await withWaitUntil((waitUntil) =>
    worker.fetch?.(
      new Request("https://api.gamediary.dev/unknown"),
      env,
      { waitUntil, passThroughOnException() {} },
    )
  );

  assertEquals(response?.status, 404);
});

Deno.test("unknown method", async () => {
  const response = await withWaitUntil((waitUntil) =>
    worker.fetch?.(
      new Request("https://api.gamediary.dev/github"),
      env,
      { waitUntil, passThroughOnException() {} },
    )
  );

  assertEquals(response?.status, 405);
  assertEquals(response?.headers.get("Allow"), "POST");
});

Deno.test("github webhook > missing signature", async () => {
  const { requests, logs, destroy } = setupMock({ succeed: false });

  const response = await withWaitUntil((waitUntil) =>
    worker.fetch?.(
      new Request("https://api.gamediary.dev/github", {
        method: "POST",
        headers: {
          "content-type": "application/json;charset=UTF-8",
        },
      }),
      env,
      { waitUntil, passThroughOnException() {} },
    )
  );

  assertEquals(response?.status, 400);

  assertEquals(requests.length, 0);

  assertEquals(logs.length, 1);
  assertLog(logs[0], {
    msg: "Received request with a missing signature",
    headers: { "content-type": "application/json;charset=UTF-8" },
  });

  destroy();
});

Deno.test("github webhook > incorrect hashing algorithm", async () => {
  const { requests, logs, destroy } = setupMock({ succeed: false });

  const response = await withWaitUntil((waitUntil) =>
    worker.fetch?.(
      new Request("https://api.gamediary.dev/github", {
        method: "POST",
        headers: {
          "content-type": "application/json;charset=UTF-8",
          "X-Hub-Signature-256": "md5=wrong-signature",
        },
      }),
      env,
      { waitUntil, passThroughOnException() {} },
    )
  );

  assertEquals(response?.status, 400);

  assertEquals(requests.length, 0);

  assertEquals(logs.length, 1);
  assertLog(logs[0], {
    msg: "Received request with an unexpected hash algorithm",
    headers: {
      "content-type": "application/json;charset=UTF-8",
      "x-hub-signature-256": "md5=wrong-signature",
    },
  });

  destroy();
});

Deno.test("github webhook > invalid digest", async () => {
  const { requests, logs, destroy } = setupMock({ succeed: false });

  const body = { action: "published" };
  const response = await withWaitUntil((waitUntil) =>
    worker.fetch?.(
      new Request("https://api.gamediary.dev/github", {
        method: "POST",
        headers: {
          "content-type": "application/json;charset=UTF-8",
          "X-Hub-Signature-256": "sha256=random-nonsense",
        },
        body: JSON.stringify(body),
      }),
      env,
      { waitUntil, passThroughOnException() {} },
    )
  );

  assertEquals(response?.status, 401);

  assertEquals(requests.length, 0);

  assertEquals(logs.length, 1);
  assertLog(logs[0], {
    msg: "Received request with an invalid digest",
    headers: {
      "content-type": "application/json;charset=UTF-8",
      "x-hub-signature-256": "sha256=random-nonsense",
    },
  });

  destroy();
});

Deno.test("github webhook > incorrect event type", async () => {
  const { requests, logs, destroy } = setupMock({ succeed: false });

  const body = JSON.stringify({ action: "published" });

  const algorithm = { name: "HMAC", hash: "SHA-256" };
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(env.WEBHOOK_SECRET),
    algorithm,
    false,
    ["sign", "verify"],
  );
  const digest = await crypto.subtle.sign(algorithm, key, enc.encode(body));

  function toHexString(buffer: ArrayBuffer) {
    return new Uint8Array(buffer).reduce(
      (str, byte) => str + byte.toString(16).padStart(2, "0"),
      "",
    );
  }

  const response = await withWaitUntil((waitUntil) =>
    worker.fetch?.(
      new Request("https://api.gamediary.dev/github", {
        method: "POST",
        headers: {
          "content-type": "application/json;charset=UTF-8",
          "X-Hub-Signature-256": `sha256=${toHexString(digest)}`,
        },
        body,
      }),
      env,
      { waitUntil, passThroughOnException() {} },
    )
  );

  assertEquals(response?.status, 200);

  assertEquals(requests.length, 0);

  assertEquals(logs.length, 1);
  assertLog(logs[0], {
    msg: "Received unexpected GitHub event",
    event: null,
  });

  destroy();
});

Deno.test("github webhook > non-`published` release action", async () => {
  const { requests, logs, destroy } = setupMock({ succeed: false });

  const body = JSON.stringify({ action: "released" });

  const algorithm = { name: "HMAC", hash: "SHA-256" };
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(env.WEBHOOK_SECRET),
    algorithm,
    false,
    ["sign", "verify"],
  );
  const digest = await crypto.subtle.sign(algorithm, key, enc.encode(body));

  function toHexString(buffer: ArrayBuffer) {
    return new Uint8Array(buffer).reduce(
      (str, byte) => str + byte.toString(16).padStart(2, "0"),
      "",
    );
  }

  const response = await withWaitUntil((waitUntil) =>
    worker.fetch?.(
      new Request("https://api.gamediary.dev/github", {
        method: "POST",
        headers: {
          "content-type": "application/json;charset=UTF-8",
          "X-Hub-Signature-256": `sha256=${toHexString(digest)}`,
          "X-GitHub-Event": "release",
        },
        body,
      }),
      env,
      { waitUntil, passThroughOnException() {} },
    )
  );

  assertEquals(response?.status, 200);

  assertEquals(requests.length, 0);

  // We don't care for released action and we don't wanna spam the logs
  assertEquals(logs.length, 0);

  destroy();
});

Deno.test("github webhook > published release action", async () => {
  const { requests, logs, destroy } = setupMock({ succeed: true });

  const body = JSON.stringify({ action: "published" });

  const algorithm = { name: "HMAC", hash: "SHA-256" };
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(env.WEBHOOK_SECRET),
    algorithm,
    false,
    ["sign", "verify"],
  );
  const digest = await crypto.subtle.sign(algorithm, key, enc.encode(body));

  function toHexString(buffer: ArrayBuffer) {
    return new Uint8Array(buffer).reduce(
      (str, byte) => str + byte.toString(16).padStart(2, "0"),
      "",
    );
  }

  const response = await withWaitUntil((waitUntil) =>
    worker.fetch?.(
      new Request("https://api.gamediary.dev/github", {
        method: "POST",
        headers: {
          "content-type": "application/json;charset=UTF-8",
          "X-Hub-Signature-256": `sha256=${toHexString(digest)}`,
          "X-GitHub-Event": "release",
        },
        body,
      }),
      env,
      { waitUntil, passThroughOnException() {} },
    )
  );

  assertEquals(response?.status, 200);

  assertEquals(requests.length, 1);
  assertEquals(
    requests[0].url,
    `https://api.cloudflare.com/client/v4/accounts/${env.ACCOUNT_ID}/pages/projects/${env.PROJECT_NAME}/deployments`,
  );
  assertEquals(requests[0].headers.get("x-auth-email"), env.EMAIL);
  assertEquals(requests[0].headers.get("x-auth-key"), env.AUTH_KEY);

  assertEquals(logs.length, 1);
  assertLog(logs[0], {
    cause: "GitHub webhook for a release event",
    msg: "Successfully redeployed",
  });

  destroy();
});
