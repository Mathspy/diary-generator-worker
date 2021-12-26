import "./types.ts";

type Env = {
  ACCOUNT_ID: string;
  PROJECT_NAME: string;
  EMAIL: string;
  AUTH_KEY: string;
  WEBHOOK_SECRET: string;
  DISCORD_WEBHOOK_ID: string;
  DISCORD_WEBHOOK_TOKEN: string;
};

export default {
  fetch(req, _env, _ctx) {
    const url = new URL(req.url);
    if (url.pathname !== "/github") {
      return new Response("Not Found", {
        status: 404,
      });
    }
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: {
          Allow: "POST",
        },
      });
    }

    return new Response("OK");
  },
  scheduled(_event, env, ctx) {
    ctx.waitUntil(deploy(env));
  },
} as ExportedHandler<Env>;

async function deploy(env: Env) {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.ACCOUNT_ID}/pages/projects/${env.PROJECT_NAME}/deployments`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json;charset=UTF-8",
        "X-Auth-Email": env.EMAIL,
        "X-Auth-Key": env.AUTH_KEY,
      },
    },
  );

  if (!response.ok) {
    console.error(
      `Failed to start new deployment.\nCaused by: ${await response.text()}`,
    );
  }
}
