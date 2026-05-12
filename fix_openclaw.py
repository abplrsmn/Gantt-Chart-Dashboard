import paramiko, time, re, sys, io

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


def run(shell, cmd, wait=4, label=None):
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

    # ── Diagnose ──────────────────────────────────────────────
    run(shell, "which openclaw 2>&1 || echo 'not in PATH'",           wait=3, label="openclaw location")
    run(shell, "openclaw --version 2>&1 || openclaw version 2>&1",    wait=3, label="openclaw version")
    run(shell, "ps aux | grep -i 'openclaw\\|gateway' | grep -v grep",wait=3, label="running processes")
    run(shell, "ss -tlnp | grep 18789",                                wait=3, label="port 18789 check")
    run(shell, "systemctl list-units | grep -i 'openclaw\\|gateway'", wait=3, label="systemd units")
    run(shell, "sudo systemctl status openclaw* 2>&1 | head -40",     wait=3, label="openclaw service status")
    run(shell, "sudo systemctl status openclaw-gateway* 2>&1 | head -40", wait=3, label="openclaw-gateway status")
    run(shell, "ls ~/.config/openclaw/ 2>&1 || ls /etc/openclaw/ 2>&1 || echo 'no config dir found'",
        wait=3, label="config dirs")
    run(shell, "find / -name 'openclaw*' -not -path '*/proc/*' 2>/dev/null | head -20",
        wait=8, label="find openclaw files")
    run(shell, "journalctl -u openclaw* --no-pager -n 30 2>&1",       wait=3, label="journal logs")
    run(shell, "cat ~/.config/openclaw/config* 2>&1 || cat /etc/openclaw/config* 2>&1 || echo 'no config'",
        wait=3, label="config file")
    run(shell, "pm2 list 2>&1 | grep -i 'openclaw\\|gateway'",        wait=3, label="PM2 openclaw")

    shell.close()
    target.close()
    bastion.close()
    print("\n=== Diagnose done ===")


if __name__ == "__main__":
    main()
