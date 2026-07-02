import sqlite3, os
from pathlib import Path

DB = r'C:\safety\safety.db'
conn = sqlite3.connect(DB)
conn.row_factory = sqlite3.Row

print('=' * 50)
print('DATABASE TABLES & ROW COUNTS')
print('=' * 50)
tables = conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
for t in tables:
    name = t['name']
    count = conn.execute("SELECT COUNT(*) FROM " + name).fetchone()[0]
    print(f'  {name}: {count} rows')

print()
print('=' * 50)
print('LATEST 3 REPORTS')
print('=' * 50)
rows = conn.execute('SELECT id, user_name, pothole_count, confidence, address, date_time, status, pdf_path FROM reports ORDER BY id DESC LIMIT 3').fetchall()
if rows:
    for r in rows:
        pdf_exists = os.path.exists(r['pdf_path']) if r['pdf_path'] else False
        print(f'  ID        : {r["id"]}')
        print(f'  User      : {r["user_name"]}')
        print(f'  Potholes  : {r["pothole_count"]}')
        print(f'  Confidence: {r["confidence"]}')
        print(f'  Location  : {r["address"]}')
        print(f'  Date      : {r["date_time"]}')
        print(f'  PDF       : {"EXISTS" if pdf_exists else "MISSING"}')
        print()
else:
    print('  No reports yet.')

print('=' * 50)
print('USERS IN DB')
print('=' * 50)
users = conn.execute('SELECT id, name, email, role FROM users ORDER BY id').fetchall()
for u in users:
    print(f'  [{u["role"].upper()}] {u["name"]} - {u["email"]}')

conn.close()

print()
print('=' * 50)
print('FILE STORAGE')
print('=' * 50)
dirs = {
    'Uploads'   : r'C:\safety\uploads',
    'Detections': r'C:\safety\detections',
    'Reports'   : r'C:\safety\reports',
}
for label, path in dirs.items():
    p = Path(path)
    if p.exists():
        files = [f for f in p.iterdir() if f.is_file()]
        total_size = sum(f.stat().st_size for f in files)
        print(f'  {label}: {len(files)} files ({total_size/1024:.1f} KB)')
    else:
        print(f'  {label}: DIRECTORY MISSING')
