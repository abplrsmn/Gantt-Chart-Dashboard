import paramiko
import time
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

BASTION_HOST = "202.83.121.155"
BASTION_PORT = 22
BASTION_USER = "ahg-admin"
BASTION_PASS = "Ahg@2026*"

TARGET_HOST = "10.21.38.102"
TARGET_USER = "ahgadmin"
TARGET_PASS = "LontongMedan"


def run_cmd(shell, cmd, wait=5, label=None):
    if label:
        print(f"\n>>> {label}")
        print("-" * 50)
    shell.send(cmd + "\n")
    time.sleep(wait)
    out = ""
    while shell.recv_ready():
        chunk = shell.recv(65535).decode("utf-8", errors="replace")
        out += chunk
    # strip ANSI escape codes for cleaner output
    import re
    clean = re.sub(r'\x1b\[[0-9;?]*[a-zA-Z]', '', out)
    clean = re.sub(r'\x1b\][^\x07]*\x07', '', clean)
    clean = re.sub(r'\r', '', clean)
    lines = [l for l in clean.splitlines() if l.strip()]
    result = "\n".join(lines)
    if label:
        print(result or "(no output)")
    return result


def main():
    print("=== Connecting to bastion ===")
    bastion = paramiko.SSHClient()
    bastion.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    bastion.connect(BASTION_HOST, port=BASTION_PORT, username=BASTION_USER,
                    password=BASTION_PASS, timeout=15)
    print(f"Connected: {BASTION_HOST}")

    transport = bastion.get_transport()
    channel = transport.open_channel("direct-tcpip", (TARGET_HOST, 22), (BASTION_HOST, 22))

    target = paramiko.SSHClient()
    target.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    target.connect(TARGET_HOST, username=TARGET_USER, password=TARGET_PASS,
                   sock=channel, timeout=15)
    print(f"Connected: {TARGET_HOST}")

    shell = target.invoke_shell(width=220, height=50)
    time.sleep(2)
    shell.recv(65535)  # clear banner

    # Step 1: Check current state
    run_cmd(shell, "cd /home/ahgadmin/clickup-dashboard && ls -la", wait=3,
            label="Project directory")

    run_cmd(shell, "ls -la .next/ 2>&1 | head -20 || echo '.next directory missing'", wait=3,
            label=".next folder check")

    # Step 2: Stop PM2 to free resources
    run_cmd(shell, "pm2 stop clickup-dashboard 2>&1", wait=5,
            label="Stop PM2 app")

    # Step 3: Install deps if needed
    run_cmd(shell, "cat package.json | grep -E '\"node|\"next'", wait=3,
            label="Node/Next version check")

    run_cmd(shell, "node --version && npm --version", wait=3,
            label="Node/npm versions")

    # Step 4: Build
    print("\n>>> Running npm run build (this may take 2-5 minutes...)")
    print("-" * 50)
    shell.send("npm run build 2>&1\n")

    # Wait for build - poll every 15s up to 5 minutes
    build_output = ""
    for i in range(20):
        time.sleep(15)
        while shell.recv_ready():
            chunk = shell.recv(65535).decode("utf-8", errors="replace")
            build_output += chunk
        # Print progress
        import re
        clean = re.sub(r'\x1b\[[0-9;?]*[a-zA-Z]', '', build_output)
        last_lines = [l.strip() for l in clean.splitlines() if l.strip()]
        if last_lines:
            print(f"[{(i+1)*15}s] {last_lines[-1]}")
        # Check if build done
        if any(x in build_output for x in ["Route (app)", "compiled successfully", "Build error", "FAILED", "$"]):
            if "Route (app)" in build_output or "compiled successfully" in build_output:
                print("\nBuild completed successfully!")
            elif "Build error" in build_output or "FAILED" in build_output:
                print("\nBuild FAILED!")
            break

    # Print final build output
    import re
    clean = re.sub(r'\x1b\[[0-9;?]*[a-zA-Z]', '', build_output)
    clean = re.sub(r'\x1b\][^\x07]*\x07', '', clean)
    clean = re.sub(r'\r', '', clean)
    print("\n--- Full build output (last 60 lines) ---")
    lines = [l for l in clean.splitlines() if l.strip()]
    for l in lines[-60:]:
        print(l)

    # Step 5: Verify .next exists
    run_cmd(shell, "ls /home/ahgadmin/clickup-dashboard/.next/ 2>&1", wait=3,
            label=".next after build")

    # Step 6: Restart PM2
    run_cmd(shell, "pm2 restart clickup-dashboard 2>&1", wait=5,
            label="Restart PM2")

    time.sleep(5)
    run_cmd(shell, "pm2 list 2>&1", wait=3, label="PM2 status after restart")

    run_cmd(shell, "pm2 logs clickup-dashboard --lines 20 --nostream 2>&1", wait=5,
            label="PM2 logs after restart")

    # Step 7: Verify port 3000
    run_cmd(shell, "ss -tlnp | grep 3000", wait=3,
            label="Port 3000 check")

    # Step 8: Quick HTTP test
    run_cmd(shell, "curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/ 2>&1", wait=5,
            label="HTTP test localhost:3000")

    print("\n=== Fix completed ===")
    shell.close()
    target.close()
    bastion.close()


if __name__ == "__main__":
    main()
