import sqlite3, datetime, time

# Check system timezone
print('=' * 50)
print('SYSTEM TIMEZONE INFO')
print('=' * 50)
print(f'  Timezone     : {time.tzname}')
print(f'  UTC Offset   : UTC{-time.timezone//3600:+d}')
print(f'  Current Local: {datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")}')
print(f'  Current UTC  : {datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")}')

# Check all reports
print()
print('=' * 50)
print('ALL REPORTS - STORED TIMES')
print('=' * 50)
conn = sqlite3.connect(r'C:\safety\safety.db')
conn.row_factory = sqlite3.Row
rows = conn.execute('SELECT id, user_name, pothole_count, date_time FROM reports ORDER BY id DESC').fetchall()
for r in rows:
    print(f'  Report #{r["id"]:2d} | {r["date_time"]} | User: {r["user_name"]} | Potholes: {r["pothole_count"]}')
conn.close()
