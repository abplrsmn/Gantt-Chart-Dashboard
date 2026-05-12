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


def run_cmd(shell, cmd, wait=2):
    shell.send(cmd + "\n")
    time.sleep(wait)
    out = ""
    while shell.recv_ready():
        out += shell.recv(65535).decode("utf-8", errors="replace")
    return out


def main():
    print("=== Connecting to bastion host ===")
    bastion = paramiko.SSHClient()
    bastion.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    bastion.connect(
        BASTION_HOST,
        port=BASTION_PORT,
        username=BASTION_USER,
        password=BASTION_PASS,
        timeout=15,
    )
    print(f"Connected to bastion {BASTION_HOST}")

    print(f"=== Jumping to target {TARGET_HOST} ===")
    transport = bastion.get_transport()
    dest_addr = (TARGET_HOST, 22)
    src_addr = (BASTION_HOST, 22)
    channel = transport.open_channel("direct-tcpip", dest_addr, src_addr)

    target = paramiko.SSHClient()
    target.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    target.connect(
        TARGET_HOST,
        username=TARGET_USER,
        password=TARGET_PASS,
        sock=channel,
        timeout=15,
    )
    print(f"Connected to target {TARGET_HOST}")

    shell = target.invoke_shell(width=200, height=50)
    time.sleep(2)
    shell.recv(65535)  # clear banner

    checks = [
        ("Uptime & load",         "uptime"),
        ("Disk usage",            "df -h"),
        ("Memory usage",          "free -h"),
        ("Nginx status",          "sudo systemctl status nginx --no-pager -l 2>&1 || systemctl status nginx --no-pager -l 2>&1"),
        ("Nginx error log (50)",  "sudo tail -n 50 /var/log/nginx/error.log 2>&1"),
        ("PHP-FPM status",        "sudo systemctl status php*-fpm --no-pager -l 2>&1 || systemctl status php*-fpm --no-pager -l 2>&1"),
        ("Apache status",         "sudo systemctl status apache2 --no-pager -l 2>&1 || systemctl status apache2 --no-pager -l 2>&1"),
        ("Node/PM2 status",       "pm2 list 2>&1 || echo 'PM2 not found'"),
        ("Node/PM2 logs",         "pm2 logs --lines 30 --nostream 2>&1 || echo 'N/A'"),
        ("Docker status",         "sudo docker ps -a 2>&1 || echo 'Docker not found'"),
        ("Docker logs (web)",     "sudo docker ps --format '{{.Names}}' 2>&1 | head -5 | xargs -I{} sudo docker logs --tail 30 {} 2>&1 || echo 'N/A'"),
        ("Listening ports",       "ss -tlnp | grep -E ':(80|443|8080|3000|8000|8443)'"),
        ("Active services",       "systemctl list-units --state=failed --no-pager 2>&1"),
        ("Recent syslog",         "sudo tail -n 30 /var/log/syslog 2>&1 || sudo tail -n 30 /var/log/messages 2>&1"),
    ]

    print("\n" + "=" * 60)
    for label, cmd in checks:
        print(f"\n>>> {label}")
        print("-" * 40)
        out = run_cmd(shell, cmd, wait=3)
        cleaned = "\n".join(
            line for line in out.splitlines()
            if not line.strip().startswith("$") and line.strip()
        )
        print(cleaned or "(no output)")

    shell.close()
    target.close()
    bastion.close()
    print("\n=== Done ===")


if __name__ == "__main__":
    main()
