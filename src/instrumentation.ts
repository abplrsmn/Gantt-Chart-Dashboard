// Keep Node-only dependencies in instrumentation-node.ts. Next compiles this
// entry point for multiple runtimes, and the PostgreSQL driver used by the
// scheduler is not available in the Edge runtime.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerNodeInstrumentation } = await import("./instrumentation-node");
    registerNodeInstrumentation();
  }
}
