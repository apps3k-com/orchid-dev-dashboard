#!/usr/bin/env python3
"""Set local-only runtime values after 1Password injection and launch the child."""
import hashlib
import hmac
import os
import sys
from urllib.parse import urlsplit


def main():
    """Keep local database and bridge credentials separate from production."""
    env = dict(os.environ)
    env.pop('OP_SERVICE_ACCOUNT_TOKEN', None)
    env.update(DATABASE_URL='postgres://orchid:orchid@127.0.0.1:5433/orchid',
               APP_URL='http://localhost:3000', NEXT_TELEMETRY_DISABLED='1')
    # Purpose-separated local tokens are reproducible across app/bridge restarts
    # and never stored in a plaintext env file. Remote endpoints need real tokens.
    bridge = urlsplit(env.get('WORKFLOW_BRIDGE_URL', ''))
    if bridge.hostname in ('127.0.0.1', 'localhost') and env.get('SESSION_SECRET'):
        key = env['SESSION_SECRET'].encode()
        for name, purpose in [('BRIDGE_READ_TOKEN', b'orchid-local-bridge-read-v1'),
                              ('BRIDGE_OPERATOR_TOKEN', b'orchid-local-bridge-operator-v1')]:
            env[name] = hmac.new(key, purpose, hashlib.sha256).hexdigest()
    os.execvpe(sys.argv[1], sys.argv[1:], env)


if __name__ == '__main__':
    main()
