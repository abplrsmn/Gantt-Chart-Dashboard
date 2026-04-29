import os
import re
import requests
import psycopg2
from psycopg2.extras import RealDictCursor

DB_HOST = os.environ.get('DB_HOST', '202.83.121.156')
DB_PORT = int(os.environ.get('DB_PORT', '5433'))
DB_USER = os.environ.get('DB_USER', 'cici')
DB_PASSWORD = os.environ.get('DB_PASSWORD', 'clickup123')
DB_NAME = os.environ.get('DB_NAME', 'cici')
CLICKUP_API_TOKEN = os.environ.get('CLICKUP_API_TOKEN', '').strip() or 'pk_306777589_KZKIDKJHJIP0YC65PFPJZZ385KUDUQXU'
CLICKUP_API_BASE_URL = 'https://api.clickup.com/api/v2'

FIELDS = [
    'Commence Date',
    'End Contract',
    'Actual Completion',
    'Current Site Progress',
    'deviation : delay(-) / +',
    'Deviation',
]

def extract_field(description: str, label: str):
    if not description:
        return None
    pattern = re.compile(rf"{re.escape(label)}:\s*(.+)", re.IGNORECASE)
    match = pattern.search(description)
    if not match:
        return None
    value = match.group(1).strip()
    if value in ('', '-', 'null', 'NULL'):
        return None
    return value

def normalize_date(value):
    if not value:
        return None
    value = str(value).strip()
    if not value or value == '-':
        return None
    # keep ISO dates directly
    if re.match(r'^\d{4}-\d{2}-\d{2}$', value):
        return value
    months = {
        'jan': '01', 'january': '01', 'feb': '02', 'february': '02', 'mar': '03', 'march': '03',
        'apr': '04', 'april': '04', 'mei': '05', 'may': '05', 'jun': '06', 'june': '06',
        'jul': '07', 'july': '07', 'agu': '08', 'aug': '08', 'august': '08', 'sep': '09', 'september': '09',
        'oct': '10', 'okt': '10', 'october': '10', 'nov': '11', 'november': '11', 'dec': '12', 'des': '12', 'december': '12'
    }
    m = re.match(r'^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$', value)
    if m:
        day, mon, year = m.groups()
        mon_num = months.get(mon.lower())
        if mon_num:
            return f"{year}-{mon_num}-{int(day):02d}"
    return None

def normalize_int(value):
    if value is None:
        return None
    text = str(value).strip().replace('+', '')
    m = re.search(r'-?\d+', text)
    return int(m.group(0)) if m else None

def fetch_task(task_id: str):
    headers = {'Authorization': CLICKUP_API_TOKEN}
    r = requests.get(f'{CLICKUP_API_BASE_URL}/task/{task_id}', headers=headers, timeout=60)
    r.raise_for_status()
    return r.json()

def main():
    conn = psycopg2.connect(host=DB_HOST, port=DB_PORT, user=DB_USER, password=DB_PASSWORD, dbname=DB_NAME)
    conn.autocommit = False
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT pp.id, pp.clickup_task_id, mu.unit_code, p.project_name,
                       pp.commence_date, pp.end_contract_date, pp.actual_phase_completion_date,
                       pp.current_site_progress, pp.deviation_days
                FROM project_phases pp
                JOIN projects p ON p.id = pp.project_id
                JOIN master_units mu ON mu.id = p.unit_id
                JOIN master_phases mp ON mp.id = pp.phase_id
                WHERE mp.phase_name = 'Project Management'
                  AND pp.clickup_task_id IS NOT NULL
                ORDER BY mu.unit_code, p.project_name;
            """)
            rows = cur.fetchall()

        updated = []
        for row in rows:
            task = fetch_task(row['clickup_task_id'])
            desc = task.get('description') or ''
            commence = row['commence_date'] or normalize_date(extract_field(desc, 'Commence Date'))
            end_contract = row['end_contract_date'] or normalize_date(extract_field(desc, 'End Contract'))
            actual_completion = row['actual_phase_completion_date'] or normalize_date(extract_field(desc, 'Actual Completion'))
            current_progress = row['current_site_progress'] or extract_field(desc, 'Current Site Progress')
            deviation = row['deviation_days'] if row['deviation_days'] is not None else (
                normalize_int(extract_field(desc, 'deviation : delay(-) / +')) or normalize_int(extract_field(desc, 'Deviation'))
            )

            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE project_phases
                    SET commence_date = COALESCE(commence_date, %s),
                        end_contract_date = COALESCE(end_contract_date, %s),
                        actual_phase_completion_date = COALESCE(actual_phase_completion_date, %s),
                        current_site_progress = COALESCE(current_site_progress, %s),
                        deviation_days = COALESCE(deviation_days, %s)
                    WHERE id = %s
                    """,
                    (commence, end_contract, actual_completion, current_progress, deviation, row['id'])
                )
            updated.append((row['unit_code'], row['project_name'], commence, end_contract, actual_completion, current_progress, deviation))

        conn.commit()
        print(f'UPDATED_ROWS={len(updated)}')
        for item in updated:
            print(' | '.join('' if v is None else str(v) for v in item))
    finally:
        conn.close()

if __name__ == '__main__':
    main()
