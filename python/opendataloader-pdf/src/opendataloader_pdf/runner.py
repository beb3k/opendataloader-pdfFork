"""
Low-level JAR runner for opendataloader-pdf.
"""
import importlib.resources as resources
import locale
import os
from pathlib import Path
import shutil
import subprocess
import sys
from typing import List

# The consistent name of the JAR file bundled with the package
_JAR_NAME = "opendataloader-pdf-cli.jar"


def resolve_java_command() -> str:
    java_from_home = java_command_from_home(os.environ.get("JAVA_HOME"))
    if java_from_home:
        return java_from_home

    discovered_java = find_installed_java_command()
    if discovered_java:
        return discovered_java

    java_on_path = shutil.which("java")
    if java_on_path:
        return java_on_path

    raise FileNotFoundError("java")


def java_command_from_home(java_home: str | None) -> str | None:
    if not java_home:
        return None

    java_command = Path(java_home) / "bin" / java_binary_name()
    if not java_command.exists():
        return None

    return str(java_command)


def find_installed_java_command() -> str | None:
    if os.name != "nt":
        return None

    candidates: list[Path] = []

    program_files_java = Path("C:/Program Files/Java")
    candidates.append(program_files_java / "latest")
    candidates.extend(sorted(program_files_java.glob("jdk-*"), reverse=True))

    zulu_root = Path("C:/Program Files/Zulu")
    candidates.extend(sorted(zulu_root.glob("zulu-*"), reverse=True))

    for candidate in candidates:
        java_command = java_command_from_home(str(candidate))
        if java_command:
            return java_command

    return None


def java_binary_name() -> str:
    if os.name == "nt":
        return "java.exe"

    return "java"


def ensure_supported_java_version(java_command: str) -> None:
    version_result = subprocess.run(
        [java_command, "-version"],
        capture_output=True,
        text=True,
        check=True,
        encoding=locale.getpreferredencoding(False),
    )
    version_output = version_result.stderr or version_result.stdout
    major_version = parse_java_major_version(version_output)

    if major_version is None or major_version >= 11:
        return

    raise RuntimeError(
        f"OpenDataLoader PDF needs Java 11 or newer. Found Java {major_version} at {java_command}."
    )


def parse_java_major_version(version_output: str) -> int | None:
    for line in version_output.splitlines():
        if '"' not in line:
            continue

        version = line.split('"')[1]
        if version.startswith("1."):
            parts = version.split(".")
            if len(parts) > 1 and parts[1].isdigit():
                return int(parts[1])
            return None

        major_token = version.split(".", 1)[0]
        if major_token.isdigit():
            return int(major_token)
        return None

    return None


def run_jar(args: List[str], quiet: bool = False) -> str:
    """Run the opendataloader-pdf JAR with the given arguments."""
    try:
        java_command = resolve_java_command()
        ensure_supported_java_version(java_command)

        # Access the embedded JAR inside the package
        jar_ref = resources.files("opendataloader_pdf").joinpath("jar", _JAR_NAME)
        with resources.as_file(jar_ref) as jar_path:
            command = [java_command, "-jar", str(jar_path), *args]

            if quiet:
                # Quiet mode → capture all output
                result = subprocess.run(
                    command,
                    capture_output=True,
                    text=True,
                    check=True,
                    encoding=locale.getpreferredencoding(False),
                )
                return result.stdout

            # Streaming mode → live output
            with subprocess.Popen(
                command,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding=locale.getpreferredencoding(False),
            ) as process:
                output_lines: List[str] = []
                for line in process.stdout:
                    sys.stdout.write(line)
                    output_lines.append(line)

                return_code = process.wait()
                captured_output = "".join(output_lines)

                if return_code:
                    raise subprocess.CalledProcessError(
                        return_code, command, output=captured_output
                    )
                return captured_output

    except FileNotFoundError:
        print(
            "Error: 'java' command not found. Please ensure Java is installed and in your system's PATH.",
            file=sys.stderr,
        )
        raise

    except subprocess.CalledProcessError as error:
        print("Error running opendataloader-pdf CLI.", file=sys.stderr)
        print(f"Return code: {error.returncode}", file=sys.stderr)
        if error.output:
            print(f"Output: {error.output}", file=sys.stderr)
        if error.stderr:
            print(f"Stderr: {error.stderr}", file=sys.stderr)
        if error.stdout:
            print(f"Stdout: {error.stdout}", file=sys.stderr)
        raise
