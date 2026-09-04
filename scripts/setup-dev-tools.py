#!/usr/bin/env python3
"""Install pinned local tools without replacing system Node or 1Password CLI."""
import hashlib
from pathlib import Path
import platform
import subprocess
import tarfile
import urllib.request
import zipfile

NODE_VERSION = '22.23.2'
NODE_SHA256 = '61130f394c1630d211dd50aecc4353d379480f36d3ac913cd85dbba1aed585c6'
OP_VERSION = '2.39.1-beta.01'


def main():
    """Fetch official binaries; verify Node checksum and the 1Password signature."""
    if platform.system() != 'Darwin' or platform.machine() != 'arm64':
        raise SystemExit('This workstation setup targets macOS arm64.')
    root = Path.home() / '.cache/orchid-tools'
    root.mkdir(parents=True, exist_ok=True)
    filename = f'node-v{NODE_VERSION}-darwin-arm64.tar.gz'
    archive = root / filename
    if not archive.exists():
        urllib.request.urlretrieve(f'https://nodejs.org/dist/v{NODE_VERSION}/{filename}', archive)
    if hashlib.sha256(archive.read_bytes()).hexdigest() != NODE_SHA256:
        raise SystemExit('Node download checksum mismatch; no extraction performed.')
    with tarfile.open(archive) as source:
        source.extractall(root, filter='data')
    node_bin = root / f'node-v{NODE_VERSION}-darwin-arm64/bin'
    subprocess.run([str(node_bin / 'node'), str(node_bin / 'corepack'),
                    'enable', '--install-directory', str(node_bin), 'pnpm'], check=True)
    archive = root / f'op-{OP_VERSION}.zip'
    if not archive.exists():
        urllib.request.urlretrieve(f'https://cache.agilebits.com/dist/1P/op2/pkg/v{OP_VERSION}/op_darwin_arm64_v{OP_VERSION}.zip', archive)
    target = root / f'op-{OP_VERSION}'
    target.mkdir(exist_ok=True)
    with zipfile.ZipFile(archive) as source:
        (target / 'op').write_bytes(source.read('op'))
    (target / 'op').chmod(0o755)
    subprocess.run(['codesign', '--verify', '--strict', str(target / 'op')], check=True)
    subprocess.run([str(target / 'op'), '--version'], check=True)
    print(f'Local tools installed in {root}')


if __name__ == '__main__':
    main()
