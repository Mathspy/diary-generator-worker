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
