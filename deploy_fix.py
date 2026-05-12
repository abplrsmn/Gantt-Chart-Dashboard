import paramiko
import time
import sys
import io
import re

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

BASTION_HOST = "202.83.121.155"
BASTION_USER = "ahg-admin"
BASTION_PASS = "Ahg@2026*"
TARGET_HOST  = "10.21.38.102"
TARGET_USER  = "ahgadmin"
TARGET_PASS  = "LontongMedan"


def strip_ansi(text):
    text = re.sub(r'\x1b\[[0-9;?]*[a-zA-Z]', '', text)
    text = re.sub(r'\x1b\][^\x07]*\x07', '', text)
    return text.replace('\r', '')


def run(shell, cmd, wait=5, label=None):
    if label:
        print(f"\n>>> {label}")
        print("-" * 50)
    shell.send(cmd + "\n")
    time.sleep(wait)
    out = ""
    while shell.recv_ready():
        out += shell.recv(65535).decode("utf-8", errors="replace")
    clean = strip_ansi(out)
    lines = [l for l in clean.splitlines() if l.strip()]
    result = "\n".join(lines)
    if label:
        print(result or "(no output)")
    return result


def main():
    bastion = paramiko.SSHClient()
    bastion.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    bastion.connect(BASTION_HOST, port=22, username=BASTION_USER, password=BASTION_PASS, timeout=15)

    transport = bastion.get_transport()
    channel = transport.open_channel("direct-tcpip", (TARGET_HOST, 22), (BASTION_HOST, 22))

    target = paramiko.SSHClient()
    target.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    target.connect(TARGET_HOST, username=TARGET_USER, password=TARGET_PASS, sock=channel, timeout=15)
    print(f"Connected to {TARGET_HOST}")

    shell = target.invoke_shell(width=220, height=50)
    time.sleep(2)
    shell.recv(65535)

    run(shell, "cd /home/ahgadmin/clickup-dashboard", wait=2)

    # Pull latest code
    run(shell, "git pull origin master 2>&1", wait=15, label="git pull")

    # Stop PM2
    run(shell, "pm2 stop clickup-dashboard 2>&1", wait=5, label="PM2 stop")

    # Build
    print("\n>>> npm run build (wait up to 5 min...)")
    print("-" * 50)
    shell.send("npm run build 2>&1\n")

    build_out = ""
    for i in range(25):
        time.sleep(15)
        while shell.recv_ready():
            build_out += shell.recv(65535).decode("utf-8", errors="replace")
        clean = strip_ansi(build_out)
        last = [l.strip() for l in clean.splitlines() if l.strip()]
        if last:
            print(f"[{(i+1)*15}s] {last[-1]}")
        if any(x in build_out for x in ["Route (app)", "compiled successfully", "Build error", "FAILED", "exiting the build"]):
            break

    clean = strip_ansi(build_out)
    print("\n--- Build output (last 40 lines) ---")
    for l in [x for x in clean.splitlines() if x.strip()][-40:]:
        print(l)

    # Check prerender-manifest.json exists now
    run(shell, "ls .next/prerender-manifest.json 2>&1", wait=3, label="prerender-manifest check")

    # Restart PM2
    run(shell, "pm2 restart clickup-dashboard 2>&1", wait=8, label="PM2 restart")
    time.sleep(5)
    run(shell, "pm2 list 2>&1", wait=3, label="PM2 status")

    # Verify port and HTTP
    run(shell, "ss -tlnp | grep 3000", wait=3, label="Port 3000")
    run(shell, "curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/", wait=8, label="HTTP status")

    shell.close()
    target.close()
    bastion.close()
    print("\n=== Deploy done ===")


if __name__ == "__main__":
    main()
