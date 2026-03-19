from __future__ import annotations

import argparse
import os
import shutil
import socket
import subprocess
import sys
import time
import webbrowser
from pathlib import Path


def find_java_home() -> Path | None:
    candidates: list[Path] = []
    if os.environ.get("JAVA_HOME"):
        candidates.append(Path(os.environ["JAVA_HOME"]))

    program_files_java = Path("C:/Program Files/Java")
    candidates.append(program_files_java / "latest")
    candidates.extend(sorted(program_files_java.glob("jdk-*"), reverse=True))

    for candidate in candidates:
        if (candidate / "bin" / "java.exe").exists():
            return candidate
    return None


def wait_for_port(host: str, port: int, timeout_seconds: float = 30.0) -> bool:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        try:
            with socket.create_connection((host, port), timeout=1):
                return True
        except OSError:
            time.sleep(0.25)
    return False


def resolve_npm_command() -> str:
    if os.name == "nt":
        npm_cmd = shutil.which("npm.cmd")
        if npm_cmd:
            return npm_cmd

    npm = shutil.which("npm")
    if npm:
        return npm

    raise RuntimeError("npm was not found on PATH. Install Node.js and try again.")


def terminate_process(process: subprocess.Popen[bytes]) -> None:
    if process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Start the local OpenDataLoader PDF UI.")
    parser.add_argument("--open", action="store_true", help="Open the UI in a browser once ready")
    parser.add_argument("--backend-port", type=int, default=8008)
    parser.add_argument("--frontend-port", type=int, default=5173)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    repo_root = Path(__file__).resolve().parents[3]
    backend_dir = repo_root / "apps" / "ui" / "backend"
    frontend_dir = repo_root / "apps" / "ui" / "frontend"
    backend_python = backend_dir / ".venv" / "Scripts" / "python.exe"
    python_executable = str(backend_python if backend_python.exists() else Path(sys.executable))

    env = os.environ.copy()
    env.setdefault("PYTHONUNBUFFERED", "1")
    env.setdefault("VITE_API_BASE_URL", f"http://127.0.0.1:{args.backend_port}")
    java_home = find_java_home()
    if java_home:
        env["JAVA_HOME"] = str(java_home)
        env["PATH"] = f"{java_home / 'bin'};{env['PATH']}"

    backend_cmd = [
        python_executable,
        "-m",
        "uvicorn",
        "app.main:create_app",
        "--factory",
        "--host",
        "127.0.0.1",
        "--port",
        str(args.backend_port),
        "--app-dir",
        str(backend_dir),
    ]
    frontend_cmd = [
        resolve_npm_command(),
        "run",
        "dev",
        "--",
        "--host",
        "127.0.0.1",
        "--port",
        str(args.frontend_port),
    ]

    backend = subprocess.Popen(backend_cmd, cwd=backend_dir, env=env)
    frontend = subprocess.Popen(frontend_cmd, cwd=frontend_dir, env=env)

    return_code = 0
    try:
        if not wait_for_port("127.0.0.1", args.backend_port):
            raise RuntimeError("Backend did not start in time")
        if not wait_for_port("127.0.0.1", args.frontend_port):
            raise RuntimeError("Frontend did not start in time")

        url = f"http://127.0.0.1:{args.frontend_port}"
        print(f"Backend ready at http://127.0.0.1:{args.backend_port}")
        print(f"Frontend ready at {url}")
        if args.open:
            webbrowser.open(url)

        while True:
            time.sleep(1)
            if backend.poll() is not None:
                raise RuntimeError("Backend stopped unexpectedly")
            if frontend.poll() is not None:
                raise RuntimeError("Frontend stopped unexpectedly")
    except KeyboardInterrupt:
        pass
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return_code = 1
    finally:
        terminate_process(frontend)
        terminate_process(backend)

    return return_code


if __name__ == "__main__":
    raise SystemExit(main())
