import type { Plugin } from "vite";

/** No-op Vite plugin stub — original error interceptor not present in this checkout. */
export function errorInterceptorPlugin(): Plugin {
  return { name: "error-interceptor-stub" };
}
