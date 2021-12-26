import { assertEquals } from "https://deno.land/std@0.119.0/testing/asserts.ts";

import worker from "../src/worker.ts";
import { withWaitUntil } from "./utils.ts";

const env = {
  ACCOUNT_ID: "abc",
  PROJECT_NAME: "game-dev-diary",
  EMAIL: "email@example.com",
  AUTH_KEY: "iliketrains",
  WEBHOOK_SECRET: "verysecret",
};

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
