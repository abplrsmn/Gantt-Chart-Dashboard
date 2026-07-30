import cron from "node-cron";

/** Registers server-only background work. Never import this from Edge code. */
export function registerNodeInstrumentation() {
  cron.schedule(
    "30 8 * * *",
    async () => {
      try {
        const { runAlertNotification } = await import("@/lib/alert-notify");
        await runAlertNotification();
      } catch (err) {
        console.error("[cron] alert-notify failed:", err);
      }
    },
    { timezone: "Asia/Jakarta" }
  );

  console.log("[cron] Daily alert scheduled at 08:30 WIB (Asia/Jakarta)");
}
