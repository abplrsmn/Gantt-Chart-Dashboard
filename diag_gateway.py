"""
Diagnose openclaw gateway: find correct HTTP endpoints + CLI path.
"""
import paramiko, time, re, sys, io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

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


def run(shell, cmd, wait=4, label=None):
    if label:
        print(f"\n>>> {label}")
        print("-" * 60)
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


def connect():
    bastion = paramiko.SSHClient()
    bastion.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    bastion.connect(BASTION_HOST, port=22, username=BASTION_USER, password=BASTION_PASS, timeout=15)
    transport = bastion.get_transport()
    channel = transport.open_channel("direct-tcpip", (TARGET_HOST, 22), (BASTION_HOST, 22))
    target = paramiko.SSHClient()
    target.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    target.connect(TARGET_HOST, username=TARGET_USER, password=TARGET_PASS, sock=channel, timeout=15)
    print(f"Connected to {TARGET_HOST}")
    return bastion, target


def main():
    bastion, target = connect()
    shell = target.invoke_shell(width=220, height=50)
    time.sleep(2)
    shell.recv(65535)

    # 1. Gateway service status
    run(shell, "systemctl --user status openclaw-gateway --no-pager 2>&1 | head -20",
        wait=3, label="Gateway service status")

    # 2. Port check
    run(shell, "ss -tlnp | grep 18789",
        wait=3, label="Port 18789")

    # 3. Find openclaw binary
    run(shell, "which openclaw 2>&1; ls ~/.local/bin/openclaw 2>&1; ls /usr/local/bin/openclaw 2>&1",
        wait=3, label="openclaw binary location")

    # 4. Try all common HTTP endpoints
    endpoints = [
        "/health", "/status",
        "/api/health", "/api/status",
        "/api/v1/health", "/api/v1/status",
        "/v1/health", "/v1/status",
        "/", "/ping",
    ]
    for ep in endpoints:
        run(shell, f'curl -s -o /dev/null -w "%{{http_code}} {ep}" http://127.0.0.1:18789{ep} 2>&1',
            wait=2)

    # 5. Full curl on whichever responded
    run(shell, "curl -s http://127.0.0.1:18789/health 2>&1 | head -50",
        wait=3, label="GET /health response")
    run(shell, "curl -s http://127.0.0.1:18789/api/health 2>&1 | head -50",
        wait=3, label="GET /api/health response")

    # 6. CLI test with full PATH
    run(shell,
        "export PATH=$HOME/.local/bin:/usr/local/bin:/usr/bin:$PATH && "
        "openclaw gateway call health --json 2>&1 | head -60",
        wait=5, label="openclaw gateway call health --json")

    # 7. PM2 env PATH
    run(shell, "pm2 env clickup-dashboard 2>&1 | grep -i path | head -5",
        wait=3, label="PM2 PATH env")

    # 8. What user is PM2 running as
    run(shell, "pm2 list 2>&1 | grep clickup",
        wait=3, label="PM2 process user")

    shell.close()
    target.close()
    bastion.close()
    print("\n=== Diag done ===")


if __name__ == "__main__":
    main()
