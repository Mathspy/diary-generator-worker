// Pass a waitUntil function which collects a punch of promises
//
// withWaitUntil's returned promise will only resolve once all
// passed promises resolve
export async function withWaitUntil(
  fn: (w: (p: Promise<unknown>) => void) => void | Promise<void>,
) {
  const promises: Promise<unknown>[] = [];
  const waitUntil = (promise: Promise<unknown>) => {
    promises.push(promise);
  };

  await fn(waitUntil);

  return Promise.all(promises);
}
