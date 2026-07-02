import sqlite3
conn = sqlite3.connect(r'C:\safety\safety.db')
cursor = conn.cursor()

# Get all records
rows = cursor.execute('SELECT id, date_time FROM reports').fetchall()

for row in rows:
    report_id = row[0]
    date_time = row[1]
    # If the time is in the future (after 19:00 today), subtract 5.5 hours to fix it
    if date_time > '2026-05-31 19:00:00':
        cursor.execute("UPDATE reports SET date_time = datetime(date_time, '-5 hours', '-30 minutes') WHERE id = ?", (report_id,))

conn.commit()
conn.close()
print("Fixed future timestamps!")
