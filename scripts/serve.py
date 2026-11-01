"""Local-only static preview with room for parallel ES-module requests."""
import argparse
import errno
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class PreviewServer(ThreadingHTTPServer):
    request_queue_size = 128


def port_number(value):
    try:
        port = int(value)
    except ValueError:
        raise argparse.ArgumentTypeError('port must be an integer from 0 to 65535')
    if not 0 <= port <= 65535:
        raise argparse.ArgumentTypeError('port must be an integer from 0 to 65535')
    return port


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=port_number, default=8000)
    parser.add_argument('--fallback-port', action='store_true',
                        help='use a free local port if the requested port is unavailable')
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    handler = partial(SimpleHTTPRequestHandler, directory=str(root))
    try:
        server = PreviewServer(('127.0.0.1', args.port), handler)
    except OSError as error:
        port_unavailable = (error.errno in (errno.EADDRINUSE, errno.EACCES)
                            or getattr(error, 'winerror', None) in (10013, 10048))
        if not args.fallback_port or args.port == 0 or not port_unavailable:
            print('Cannot start server on port {}: {}'.format(args.port, error), file=sys.stderr)
            return 1
        print('Port {} is unavailable; selecting a free local port.'.format(args.port), flush=True)
        try:
            server = PreviewServer(('127.0.0.1', 0), handler)
        except OSError as fallback_error:
            print('Cannot start local server: {}'.format(fallback_error), file=sys.stderr)
            return 1
    print('Project preview: http://127.0.0.1:{}/'.format(server.server_port), flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == '__main__':
    sys.exit(main())
