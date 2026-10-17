"""Package source only; exclude credentials, databases, dependencies and build outputs."""
from pathlib import Path
import hashlib,json,zipfile
root=Path(__file__).resolve().parents[1]
out=root/'release'/'maxtravel-source-2026-10-18.zip'
skip_dirs={'.git','node_modules','.next','.expo','dist','dist-verification','build','coverage','.turbo','test-results','playwright-report','backups','backup','.cache','tmp','temp','logs','.claude','.codex','.idea','.vscode','.gradle','.runtime','uploads'}
skip_suffixes={'.zip','.log','.tsbuildinfo','.db','.sqlite','.sqlite3','.pem','.key','.p12','.pfx','.jks','.keystore','.mobileprovision','.cer','.der','.bak','.pdf','.xlsx','.csv','.hbc','.apk','.aab','.ipa'}
files=[root/'README.md',root/'PROJECT-SPECIFICATION.md',Path(__file__).resolve()]
for project in ['booking-platform','mobile-app','crm-review']:
 for path in (root/project).rglob('*'):
  if not path.is_file():continue
  relative=path.relative_to(root/project)
  if any(part.lower() in skip_dirs or part.lower().startswith(("dist-",".next")) for part in relative.parts):continue
  name=path.name.lower()
  if name.startswith('.env') and not name.endswith('.example'):continue
  if path.suffix.lower() in skip_suffixes or any(x in name for x in ['.db-wal','.db-shm','.db-journal','.sqlite-journal']):continue
  if name in ['credentials.json','secrets.json','audit-current.json','audit-runtime.json','lint-report.json']:continue
  files.append(path)
files=sorted(set(p for p in files if p.is_file()),key=lambda p:p.relative_to(root).as_posix())
manifest={p.relative_to(root).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED,compresslevel=7) as archive:
 for path in files:archive.write(path,path.relative_to(root).as_posix())
 archive.writestr('SOURCE-SHA256.json',json.dumps(manifest,indent=2)+'\n')
with zipfile.ZipFile(out) as archive:
 assert archive.testzip() is None
 for name,digest in manifest.items():assert hashlib.sha256(archive.read(name)).hexdigest()==digest
 assert not any('/node_modules/' in n or '/.env.local' in n or n.endswith('.db') for n in archive.namelist())
out.with_suffix('.sha256.txt').write_text(hashlib.sha256(out.read_bytes()).hexdigest()+'  '+out.name+'\n',encoding='utf-8')
print(f'Verified source archive: {out.name}; {len(files)} files, {out.stat().st_size} bytes; no private environments/databases/build outputs.')
