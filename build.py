"""Repeatable, fail-fast Android build. Python 3, JDK 17+, Android SDK 36."""
import argparse, datetime, hashlib, json, os, pathlib, re, shutil, subprocess, zipfile

ROOT = pathlib.Path(__file__).resolve().parent
def run(args):
    subprocess.run([str(x) for x in args], cwd=ROOT, check=True)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--code', type=int, default=137)
    parser.add_argument('--version', default='3.5.12')
    parser.add_argument('--sdk', default=os.getenv('ANDROID_SDK_ROOT', 'D:/android-build/sdk'))
    parser.add_argument('--jdk', default=os.getenv('JAVA_HOME', 'D:/android-build/jdk-21.0.2'))
    parser.add_argument('--name', default='Hexu-v3.5.12.apk')
    parser.add_argument('--debug', action='store_true')
    args = parser.parse_args()
    sdk, jdk = pathlib.Path(args.sdk), pathlib.Path(args.jdk)
    bt = sdk/'build-tools/36.0.0'
    aj = sdk/'platforms/android-36/android.jar'
    jsoup = ROOT/'tools/jsoup-1.23.2.jar'
    d8 = ROOT/'tools/r8-8.6.27.jar'
    exe = '.exe' if os.name == 'nt' else ''
    java, javac = jdk/f'bin/java{exe}', jdk/f'bin/javac{exe}'
    keydir=pathlib.Path(os.getenv('JXAU_SIGNING_DIR', str(pathlib.Path.home()/'.jxau-pocket-signing')))
    if not os.getenv('JXAU_RELEASE_PASSWORD'):raise SystemExit('Set JXAU_RELEASE_PASSWORD in the build process environment; never place signing secrets in source.')
    for p in [java, javac, aj, bt/f'aapt2{exe}', d8, jsoup, keydir/'legacy.keystore', keydir/'release-v2.p12',keydir/'release.lineage']:
        if not p.exists(): raise SystemExit(f'Missing build prerequisite: {p}')
    build = ROOT/'build'
    if build.exists(): shutil.rmtree(build)
    for name in ['assets', 'classes', 'dex', 'gen', 'readback']:
        (build/name).mkdir(parents=True)
    shutil.copytree(ROOT/'assets', build/'assets', dirs_exist_ok=True)
    stamp = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).strftime('%Y-%m-%d %H:%M:%S UTC+08:00')
    index = build/'assets/index.html'
    content = index.read_text(encoding='utf-8')
    content = re.sub(r'window\.__VER__="[^"]*";window\.__BUILD__="[^"]*";',
                     f'window.__VER__={json.dumps(args.version)};window.__BUILD__={json.dumps(stamp)};', content)
    # Fingerprint APK resources so a rebuild also invalidates changed WebView files.
    asset_root = build/'assets'
    cache_digest = hashlib.sha256()
    for directory in ('css', 'js', 'img'):
        for asset in sorted((asset_root/directory).rglob('*')):
            if asset.is_file():
                cache_digest.update(asset.relative_to(asset_root).as_posix().encode('utf-8'))
                cache_digest.update(b'\0' + hashlib.sha256(asset.read_bytes()).digest())
    asset_version = f'{args.code}-{cache_digest.hexdigest()[:16]}'
    (asset_root/'asset-version.txt').write_text(asset_version, encoding='ascii')
    content = re.sub(r'((?:src|href)="(?:css|js|img)/[^"?]+)"',
                     lambda match: f'{match[1]}?v={asset_version}"', content)
    index.write_text(content, encoding='utf-8')
    manifest = (ROOT/'AndroidManifest.xml').read_text(encoding='utf-8')
    if args.debug: manifest = manifest.replace('<application', '<application android:debuggable="true"', 1)
    manifest = re.sub(r'android:versionCode="[^"]*"', f'android:versionCode="{args.code}"', manifest)
    manifest = re.sub(r'android:versionName="[^"]*"', f'android:versionName="{args.version}"', manifest)
    (build/'AndroidManifest.xml').write_text(manifest, encoding='utf-8')
    run([bt/f'aapt2{exe}', 'compile', '--dir', ROOT/'res', '-o', build/'res.zip'])
    run([bt/f'aapt2{exe}', 'link', '-o', build/'base.apk', '-I', aj, '--manifest', build/'AndroidManifest.xml',
         '-A', build/'assets', '--java', build/'gen', build/'res.zip'])
    sources = sorted((ROOT/'java').rglob('*.java')) + sorted((build/'gen').rglob('*.java'))
    # Java response files need quoted Windows paths when the workspace contains apostrophes/spaces.
    response = build/'sources.txt'
    response.write_text('\n'.join('"'+str(p).replace('\\','/')+'"' for p in sources), encoding='utf-8')
    run([javac, '--release', '8', '-g', '-encoding', 'UTF-8', '-classpath', str(aj)+os.pathsep+str(jsoup),
         '-d', build/'classes', '@'+str(response)])
    run([java, '-cp', d8, 'com.android.tools.r8.D8', '--min-api', '24', '--release',
         '--lib', aj, '--output', build/'dex', *sorted((build/'classes').rglob('*.class')), jsoup])
    dex = (build/'dex/classes.dex').read_bytes()
    if dex[:8] != b'dex\n037\0': raise SystemExit(f'Unexpected DEX version: {dex[:8]!r}')
    run([java, '-cp', d8, 'com.android.tools.r8.D8', '--min-api', '24',
         '--output', build/'readback', build/'dex/classes.dex'])
    # Store resources and dex uncompressed. zipalign runs after every ZIP mutation.
    with zipfile.ZipFile(build/'base.apk') as src, zipfile.ZipFile(build/'package.apk', 'w') as dst:
        for item in src.infolist():
            stored = item.filename == 'resources.arsc' or item.filename.endswith(('.png','.so','.dex'))
            dst.writestr(item.filename, src.read(item.filename), compress_type=zipfile.ZIP_STORED if stored else zipfile.ZIP_DEFLATED)
        dst.writestr('classes.dex', dex, compress_type=zipfile.ZIP_STORED)
    run([bt/f'zipalign{exe}', '-p', '-f', '4', build/'package.apk', build/'aligned.apk'])
    output = ROOT.parent/args.name
    run([java, '-jar', bt/'lib/apksigner.jar', 'sign', '--ks', keydir/'legacy.keystore',
         '--ks-pass', 'pass:android', '--key-pass', 'pass:android', '--ks-key-alias', 'androiddebugkey',
         '--next-signer','--ks',keydir/'release-v2.p12','--ks-pass','env:JXAU_RELEASE_PASSWORD','--ks-key-alias','jxau-release',
         '--lineage',keydir/'release.lineage','--rotation-min-sdk-version','28',
         '--min-sdk-version', '24', '--v1-signing-enabled', 'true', '--v2-signing-enabled', 'true',
         '--v3-signing-enabled', 'true', '--out', output, build/'aligned.apk'])
    run([java, '-jar', bt/'lib/apksigner.jar', 'verify', '--verbose', '--print-certs', output])
    # API 24+ prefers v2/v3, so check v1 independently at API 23 as well.
    run([java, '-jar', bt/'lib/apksigner.jar', 'verify', '--verbose', '--min-sdk-version', '23', '--max-sdk-version', '23', output])
    run([bt/f'zipalign{exe}', '-c', '-v', '4', output])
    with zipfile.ZipFile(output) as z:
        final = z.read('assets/index.html').decode('utf-8')
        scripts = re.findall(r'<script(?:\s[^>]*)?>([\s\S]*?)</script>', final)
        for i, script in enumerate(scripts):
            check = build/f'check-inline-{i}.js'; check.write_text(script, encoding='utf-8'); run(['node', '--check', check])
        for name in z.namelist():
            if name.startswith('assets/') and name.endswith('.js'):
                check = build/('check-'+pathlib.Path(name).name); check.write_bytes(z.read(name)); run(['node', '--check', check])
    report = {'version':args.version, 'versionCode':args.code, 'builtAt':stamp,
              'sha256':hashlib.sha256(output.read_bytes()).hexdigest(), 'dex':'037', 'apk':output.name,
              'signatureRotationMinApi':28,'signerSha256':re.findall(r'certificate SHA-256 digest: ([a-f0-9]+)',subprocess.check_output([str(java),'-jar',str(bt/'lib/apksigner.jar'),'verify','--print-certs',str(output)],text=True))}
    (ROOT.parent/(output.stem+'-build.json')).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False, indent=2))

if __name__ == '__main__': main()
