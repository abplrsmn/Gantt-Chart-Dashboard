// Runs once when the Next.js server starts (Node.js runtime only).
// Registers the 08:30 daily alert cron job.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const cron = await import("node-cron");

  // 08:30 WIB every day — adjust TZ in your environment if needed
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
