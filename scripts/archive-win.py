"""Archive an already packaged Windows app; no installation or app changes."""
from pathlib import Path
import hashlib
import json
import zipfile

project = Path(__file__).resolve().parent.parent
version = json.loads((project / 'package.json').read_text())['version']
root = project / 'artifacts' / 'Yoru-win32-x64'
if not (root / 'Yoru.exe').is_file():
    raise SystemExit('Run npm run package:win first')
archive = root.parent / f'Yoru-{version}-win-x64.zip'
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED, compresslevel=1) as handle:
    for file in sorted(root.rglob('*')):
        if file.is_file():
            handle.write(file, file.relative_to(root.parent))
with zipfile.ZipFile(archive) as handle:
    if handle.testzip() is not None:
        raise SystemExit('Archive integrity check failed')
    if handle.read('Yoru-win32-x64/Yoru.exe')[:2] != b'MZ':
        raise SystemExit('Missing Windows executable')
with archive.open('rb') as handle:
    digest = hashlib.file_digest(handle, 'sha256').hexdigest()
Path(str(archive) + '.sha256').write_text(f'{digest}  {archive.name}\n')
print(f'Archive verified: {archive.name}, {archive.stat().st_size:,} bytes')
print(f'SHA256: {digest}')
