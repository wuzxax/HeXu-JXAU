"""Package only source/build inputs; never export private signing material or runtime captures."""
from pathlib import Path
import argparse,zipfile
ROOT=Path(__file__).resolve().parent
PRIVATE={'.keystore','.jks','.p12','.pfx','.key','.pem','.har','.dpapi','.apk','.idsig','.pyc'}
def blocked(p):
 return p.suffix.lower()in PRIVATE or any(x in {'build','__pycache__','.git','.idea','node_modules'}or x.endswith('-classes')for x in p.parts) or p.name.startswith('.env')
def main():
 ap=argparse.ArgumentParser();ap.add_argument('output',type=Path);args=ap.parse_args();output=args.output.resolve()
 if output.is_relative_to(ROOT):raise SystemExit('Source archive must be outside source tree')
 allowed_dirs={'assets','java','res','tools','tests'}
 allowed_root={'AndroidManifest.xml','build.py','build-secure.ps1','package_source.py','README.md','SECURITY.md','THIRD_PARTY_NOTICES.md','LICENSE_AUDIT.json','.gitignore'}
 files=[p for p in ROOT.rglob('*')if p.is_file()and not blocked(p.relative_to(ROOT))and(p.relative_to(ROOT).parts[0]in allowed_dirs or p.name in allowed_root)]
 for p in files:
  data=p.read_bytes()
  if any(b'-----BEGIN '+kind+b' PRIVATE KEY-----' in data for kind in [b'',b'RSA',b'ENCRYPTED',b'EC'])or b'-----BEGIN '+b'PRIVATE KEY-----' in data:raise SystemExit('Private-key content found; export refused')
 output.parent.mkdir(parents=True,exist_ok=True)
 with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED)as z:
  for p in files:z.write(p,Path(ROOT.name)/p.relative_to(ROOT))
 with zipfile.ZipFile(output)as z:
  assert not any(blocked(Path(n))for n in z.namelist())
 print(f'Exported {len(files)} source files; no signing material, APK, HAR or generated build output.')
if __name__=='__main__':main()
