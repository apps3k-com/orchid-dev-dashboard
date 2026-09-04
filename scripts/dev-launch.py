#!/usr/bin/env python3
"""Launch local development using a scoped 1Password Environment, never a FIFO."""
import os
from pathlib import Path
import re
import subprocess
import sys


def main():
    """Read only bootstrap configuration, inject secrets, then run the dev command."""
    root = Path(__file__).resolve().parent.parent
    os.chdir(root)
    if (root / '.env').exists() and not (root / '.env').is_file():
        raise SystemExit('Use a worktree without a mounted .env: Next.js reads FIFOs itself.')
    tools = Path(os.environ.get('ORCHID_DEV_TOOLCHAIN_DIR', Path.home() / '.cache/orchid-tools'))
    node_bin = tools / 'node-v22.23.2-darwin-arm64/bin'
    op = Path(os.environ.get('ORCHID_OP_BIN', tools / 'op-2.39.1-beta.01/op'))
    if not op.is_file() or not (node_bin / 'node').is_file():
        raise SystemExit('Run python3 scripts/setup-dev-tools.py first (macOS arm64).')
    common = Path(subprocess.check_output(['git', 'rev-parse', '--path-format=absolute', '--git-common-dir'], text=True).strip())
    bootstrap = Path(os.environ.get('ORCHID_BOOTSTRAP_ENV_FILE', common.parent / '.env.local'))
    if not bootstrap.is_file():
        raise SystemExit('ORCHID_BOOTSTRAP_ENV_FILE must point to a regular .env.local containing the service-account token.')
    config = {}
    for line in bootstrap.read_text().splitlines():
        match = re.fullmatch(r'\s*(?:export\s+)?(OP_SERVICE_ACCOUNT_TOKEN|OP_EN_UUID)\s*=\s*(.*?)\s*', line)
        if match:
            config[match[1]] = match[2].strip('\"\'')
    token = config.get('OP_SERVICE_ACCOUNT_TOKEN')
    if not token:
        raise SystemExit('Bootstrap is missing OP_SERVICE_ACCOUNT_TOKEN.')
    env = dict(os.environ, OP_SERVICE_ACCOUNT_TOKEN=token)
    env['PATH'] = str(node_bin) + os.pathsep + env.get('PATH', '')
    environment = os.environ.get('OP_EN_UUID', config.get('OP_EN_UUID', 'did6rpqt5bxv3wzep6a47qtc7u'))
    command = sys.argv[1:] or ['pnpm', 'exec', 'next', 'dev', '--hostname', '127.0.0.1', '--port', '3000']
    # Overrides are deliberately applied AFTER op injection: this launcher can
    # only target the local database and callback, even if remote config drifts.
    args = [str(op), 'run', '--environment', environment, '--',
            'python3', str(root / 'scripts/dev-process.py'), *command]
    os.execve(op, args, env)


if __name__ == '__main__':
    main()
