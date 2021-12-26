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
    ctx.waitUntil(deploy(env, logger(env, ctx.waitUntil)));
  },
} as ExportedHandler<Env>;

async function deploy(env: Env, log: Logger) {
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
    log({
      msg: "Failed to start new deployment",
      cause: await response.text(),
    });
  } else {
    log({ msg: "Successfully redeployed", cause: "cronjob" });
  }
}

type Logger = (message: unknown) => void;
function logger(env: Env, waitUntil: (promise: Promise<unknown>) => void) {
  return (message: unknown) => {
    const body = JSON.stringify({
      content: "```json\n" + JSON.stringify(message, null, 2) + "```",
    });

    waitUntil(
      fetch(
        `https://discord.com/api/webhooks/${env.DISCORD_WEBHOOK_ID}/${env.DISCORD_WEBHOOK_TOKEN}`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json;charset=UTF-8",
          },
          body,
        },
      ),
    );
  };
}
