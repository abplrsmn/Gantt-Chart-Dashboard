"""
Deploy script: git pull → npm run build → pm2 restart
Via bastion host using Paramiko.
"""
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
APP_DIR      = "/home/ahgadmin/clickup-dashboard"


def strip_ansi(text):
    text = re.sub(r'\x1b\[[0-9;?]*[a-zA-Z]', '', text)
    text = re.sub(r'\x1b\][^\x07]*\x07', '', text)
    return text.replace('\r', '')


def run(shell, cmd, wait=5, label=None):
    if label:
        print(f"\n  [{label}]")
    shell.send(cmd + "\n")
    time.sleep(wait)
    out = ""
    while shell.recv_ready():
        out += shell.recv(65535).decode("utf-8", errors="replace")
    clean = strip_ansi(out)
    lines = [l for l in clean.splitlines() if l.strip()]
    result = "\n".join(lines)
    if label and result:
        for line in lines:
            print(f"    {line}")
    return result


def section(title):
    print(f"\n{'='*55}")
    print(f"  {title}")
    print(f"{'='*55}")


def ok(msg):  print(f"  [OK] {msg}")
def err(msg): print(f"  [!!] {msg}"); sys.exit(1)


def main():
    section("1/4  Connecting to server")
    try:
        bastion = paramiko.SSHClient()
        bastion.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        bastion.connect(BASTION_HOST, port=22, username=BASTION_USER,
                        password=BASTION_PASS, timeout=15)
        ok(f"Bastion {BASTION_HOST}")

        transport = bastion.get_transport()
        channel = transport.open_channel(
            "direct-tcpip", (TARGET_HOST, 22), (BASTION_HOST, 22)
        )
        target = paramiko.SSHClient()
        target.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        target.connect(TARGET_HOST, username=TARGET_USER, password=TARGET_PASS,
                       sock=channel, timeout=15)
        ok(f"Target    {TARGET_HOST}")
    except Exception as e:
        err(f"Connection failed: {e}")

    shell = target.invoke_shell(width=220, height=50)
    time.sleep(2)
    shell.recv(65535)

    run(shell, f"cd {APP_DIR}", wait=2)

    # ── 2. git pull ──────────────────────────────────────────
    section("2/4  Pulling latest code")
    out = run(shell, "git pull origin master 2>&1", wait=15, label="git pull")
    if "error" in out.lower() and "fatal" in out.lower():
        err("git pull failed — check remote or branch name")
    ok("Code updated")

    # ── 3. Build ─────────────────────────────────────────────
    section("3/4  Building (this takes ~1-3 min)")
    run(shell, "pm2 stop clickup-dashboard 2>&1", wait=5)
    ok("PM2 stopped")

    shell.send("npm run build 2>&1\n")
    build_out = ""
    for i in range(25):
        time.sleep(15)
        while shell.recv_ready():
            build_out += shell.recv(65535).decode("utf-8", errors="replace")
        clean = strip_ansi(build_out)
        last = [l.strip() for l in clean.splitlines() if l.strip()]
        if last:
            print(f"    [{(i+1)*15:>3}s] {last[-1][:90]}")
        if any(x in build_out for x in [
            "Route (app)", "compiled successfully",
            "Build error", "FAILED", "exiting the build"
        ]):
            break

    if "exiting the build" in build_out or "FAILED" in build_out:
        clean = strip_ansi(build_out)
        print("\n  --- Build errors ---")
        for l in [x for x in clean.splitlines() if x.strip()][-20:]:
            print(f"    {l}")
        err("Build FAILED — fix the errors above then retry")

    ok("Build succeeded")

    # ── 4. Restart & verify ───────────────────────────────────
    section("4/4  Restarting & verifying")
    run(shell, "pm2 restart clickup-dashboard 2>&1", wait=8)
    time.sleep(6)

    status = run(shell, "pm2 list 2>&1", wait=3, label="PM2 status")

    port = run(shell, "ss -tlnp | grep 3000", wait=3)
    if "3000" in port:
        ok("Port 3000 is listening")
    else:
        err("Port 3000 not listening — app may have crashed")

    http = run(shell, "curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/", wait=8)
    code = [l for l in http.splitlines() if l.strip().isdigit()]
    status_code = code[0] if code else http.strip()
    if status_code.startswith("2") or status_code.startswith("3"):
        ok(f"HTTP {status_code} — website is UP")
    else:
        err(f"HTTP {status_code} — website still down")

    shell.close()
    target.close()
    bastion.close()

    print(f"\n{'='*55}")
    print("  DEPLOY SUKSES!")
    print(f"{'='*55}\n")


if __name__ == "__main__":
    main()
