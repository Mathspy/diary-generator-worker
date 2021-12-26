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
  async fetch(req, env, ctx) {
    const log = logger(env, ctx.waitUntil);

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

    const body = await req.arrayBuffer();

    const signature = await verifySignature(
      body,
      req.headers.get("X-Hub-Signature-256"),
      env.WEBHOOK_SECRET,
    );

    switch (signature.status) {
      case "valid":
        break;
      case "missing":
        log({
          msg: "Received request with a missing signature",
          headers: Object.fromEntries(req.headers.entries()),
        });
        return new Response("MISSING_SIGNATURE", {
          status: 400,
        });
      case "invalid_algorithm":
        log({
          msg: "Received request with an unexpected hash algorithm",
          headers: Object.fromEntries(req.headers.entries()),
        });
        return new Response("INVALID_SIGNATURE_HASH", {
          status: 400,
        });
      case "invalid_digest":
        log({
          msg: "Received request with an invalid digest",
          headers: Object.fromEntries(req.headers.entries()),
        });
        return new Response("INVALID_DIGEST", {
          status: 401,
        });
      default:
        unreachable(signature);
    }

    const event = req.headers.get("X-GitHub-Event");
    if (event !== "release") {
      log({
        msg: "Received unexpected GitHub event",
        event,
      });

      return new Response("OK");
    }

    const { action } = JSON.parse(new TextDecoder().decode(body));

    // published is the action we care about so if it is `published`
    // we will redeploy
    if (action === "published") {
      ctx.waitUntil(deploy(env, log, "GitHub webhook for a release event"));
    }

    return new Response("OK");
  },
  scheduled(_event, env, ctx) {
    ctx.waitUntil(deploy(env, logger(env, ctx.waitUntil), "cronjob"));
  },
} as ExportedHandler<Env>;

function decodeHex(hex: string) {
  const match = hex.match(/.{1,2}/g);
  if (match) {
    return new Uint8Array(match.map((byte) => parseInt(byte, 16)));
  }

  return null;
}

function unreachable(_: never) {}

type ValidSignature = {
  status: "valid";
  body: ArrayBuffer;
};
type InvalidSignature = {
  status: "missing" | "invalid_algorithm" | "invalid_digest";
};
type Signature = ValidSignature | InvalidSignature;
async function verifySignature(
  body: ArrayBuffer,
  signature: string | null,
  secret: string,
): Promise<Signature> {
  if (!signature) {
    return {
      status: "missing",
    };
  }

  const [hash, rawDigest] = signature.split("=");
  if (hash !== "sha256") {
    return { status: "invalid_algorithm" };
  }

  const digest = decodeHex(rawDigest);
  if (!digest) {
    return { status: "invalid_digest" };
  }

  const enc = new TextEncoder();
  const algorithm = { name: "HMAC", hash: "SHA-256" };
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    algorithm,
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(algorithm, key, digest, body);

  return valid ? { status: "valid", body } : { status: "invalid_digest" };
}

async function deploy(env: Env, log: Logger, cause: string) {
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
    log({ msg: "Successfully redeployed", cause });
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
