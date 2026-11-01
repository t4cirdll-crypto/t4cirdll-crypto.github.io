"""Real Windows BAT and HTTP integration checks; only Python's standard library."""
import os
import queue
import re
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
BAT = ROOT / 'serve.bat'
COMSPEC = os.environ.get('COMSPEC', 'cmd.exe')
WINDOWS = os.name == 'nt'


def batch_command(path, *args):
    # Explicit outer quotes are needed by cmd /s for a BAT path containing spaces.
    inner = subprocess.list2cmdline([str(path), *map(str, args)])
    return '"{}" /d /s /c "{}"'.format(COMSPEC, inner)


class LauncherTests(unittest.TestCase):
    def start_server(self, command, env=None):
        process = subprocess.Popen(
            command, cwd=ROOT / 'scripts', env=env, stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, encoding='utf-8',
            errors='replace', creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if WINDOWS else 0,
        )
        output, events = [], queue.Queue()

        def read_output():
            for line in process.stdout:
                output.append(line)
                events.put(line)
            events.put(None)

        reader = threading.Thread(target=read_output, daemon=True)
        reader.start()

        def stop_server():
            if process.poll() is None:
                if WINDOWS:
                    os.kill(process.pid, signal.CTRL_BREAK_EVENT)
                else:
                    process.terminate()
                process.wait(timeout=10)
            reader.join(timeout=2)
            process.stdout.close()

        self.addCleanup(stop_server)
        deadline = time.monotonic() + 15
        while time.monotonic() < deadline:
            try:
                line = events.get(timeout=0.5)
            except queue.Empty:
                continue
            if line is None:
                self.fail('Launcher exited before serving HTTP:\n' + ''.join(output))
            match = re.search(r'Project preview: (http://127\.0\.0\.1:\d+/)', line)
            if match:
                return match.group(1), output
        self.fail('Launcher did not report its URL:\n' + ''.join(output))

    def assert_game(self, url):
        for relative in ('index.html', 'src/main.js', 'vendor/three.module.js'):
            with urlopen(url + relative, timeout=5) as response:
                self.assertEqual(response.status, 200)
                self.assertEqual(response.read(), (ROOT / relative).read_bytes())
                if relative.endswith('.js'):
                    self.assertIn('javascript', response.headers.get_content_type())
        with urlopen(url, timeout=5) as response:
            self.assertEqual(response.read(), (ROOT / 'index.html').read_bytes())

    def run_batch(self, *args, env=None, path=BAT):
        return subprocess.run(
            batch_command(path, *args), cwd=ROOT / 'scripts', env=env,
            stdin=subprocess.DEVNULL, capture_output=True, encoding='utf-8',
            errors='replace', timeout=15,
        )

    def test_server_serves_project_from_another_working_directory(self):
        url, _ = self.start_server([sys.executable, '-u', str(ROOT / 'scripts/serve.py'), '--port', '0'])
        self.assert_game(url)

    @unittest.skipUnless(WINDOWS, 'cmd.exe integration requires Windows')
    def test_default_bat_uses_a_free_port_when_8000_is_unavailable(self):
        # Reserve 8000 if free; if already occupied, leave its owner untouched.
        reservation = socket.socket()
        try:
            reservation.bind(('127.0.0.1', 8000))
            reservation.listen()
        except OSError:
            reservation.close()
        else:
            self.addCleanup(reservation.close)
        url, output = self.start_server(batch_command(BAT))
        self.assertNotIn(':8000/', url)
        self.assertIn('Port 8000 is unavailable', ''.join(output))
        self.assertIn('Запуск через python', ''.join(output))
        self.assert_game(url)

    @unittest.skipUnless(WINDOWS, 'cmd.exe integration requires Windows')
    def test_explicit_port_and_py_launcher_fallback(self):
        launcher = shutil.which('py')
        if not launcher:
            self.skipTest('Windows py launcher is not installed')
        env = os.environ.copy()
        system32 = str(Path(env['SYSTEMROOT']) / 'System32')
        env['PATH'] = os.pathsep.join((system32, str(Path(launcher).parent)))
        if shutil.which('python', path=env['PATH']):
            self.skipTest('Cannot isolate py from python on this machine')
        url, output = self.start_server(batch_command(BAT, '0'), env)
        self.assertIn('Запуск через py -3', ''.join(output))
        self.assert_game(url)

    @unittest.skipUnless(WINDOWS, 'cmd.exe integration requires Windows')
    def test_missing_python_is_clear_and_nonzero(self):
        env = os.environ.copy()
        env['PATH'] = str(Path(env['SYSTEMROOT']) / 'System32')
        if shutil.which('python', path=env['PATH']) or shutil.which('py', path=env['PATH']):
            self.skipTest('Cannot isolate a PATH without Python on this machine')
        result = self.run_batch(env=env)
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn('Не найден работающий Python 3.7', result.stdout)
        self.assertNotIn('is not recognized', result.stderr)
        self.assertNotIn('Project preview:', result.stdout)

    @unittest.skipUnless(WINDOWS, 'cmd.exe integration requires Windows')
    def test_explicit_busy_port_reports_failure_without_fallback(self):
        with socket.socket() as reservation:
            reservation.bind(('127.0.0.1', 0))
            reservation.listen()
            port = reservation.getsockname()[1]
            result = self.run_batch(str(port))
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn('Cannot start server on port {}'.format(port), result.stderr)
        self.assertIn('Сервер завершился с ошибкой', result.stdout)
        self.assertNotIn('Project preview:', result.stdout)
        self.assertNotIn('Traceback', result.stderr)

    @unittest.skipUnless(WINDOWS, 'cmd.exe integration requires Windows')
    def test_invalid_port_is_rejected(self):
        for value in ('-1', '65536', 'abc'):
            with self.subTest(port=value):
                result = self.run_batch(value)
                self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
                self.assertIn('port must be an integer from 0 to 65535', result.stderr)
                self.assertNotIn('Project preview:', result.stdout)
                self.assertNotIn('Traceback', result.stderr)

    @unittest.skipUnless(WINDOWS, 'cmd.exe integration requires Windows')
    def test_misplaced_bat_explains_missing_server(self):
        with tempfile.TemporaryDirectory(prefix='launcher-', dir=ROOT) as directory:
            copy = Path(directory) / 'serve.bat'
            shutil.copyfile(BAT, copy)
            result = self.run_batch(path=copy)
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn('Не найден scripts\\serve.py', result.stdout)
        self.assertNotIn('Project preview:', result.stdout)


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    unittest.main(verbosity=2)
