#!/usr/bin/env python3
import argparse
import json
import os
import platform
import shutil
import ssl
import sys
import tarfile
import tempfile
import urllib.request
import zipfile
from pathlib import Path

RELEASE_API = "https://api.github.com/repos/bblanchon/pdfium-binaries/releases/latest"
TARGETS = {
    "darwin-arm64": {
        "match": "mac-arm64",
        "lib": "libpdfium.dylib",
    },
    "darwin-x86_64": {
        "match": "mac-x64",
        "lib": "libpdfium.dylib",
    },
    "linux-x86_64": {
        "match": "linux-x64",
        "lib": "libpdfium.so",
    },
    "linux-aarch64": {
        "match": "linux-arm64",
        "lib": "libpdfium.so",
    },
    "windows-x86_64": {
        "match": "win-x64",
        "lib": "pdfium.dll",
    },
    "windows-i686": {
        "match": "win-x86",
        "lib": "pdfium.dll",
    },
}


def detect_current_target() -> str:
    system = platform.system().lower()
    machine = platform.machine().lower()

    if system == "darwin":
        if machine in ("arm64", "aarch64"):
            return "darwin-arm64"
        if machine in ("x86_64", "amd64"):
            return "darwin-x86_64"
    elif system == "linux":
        if machine in ("x86_64", "amd64"):
            return "linux-x86_64"
        if machine in ("aarch64", "arm64"):
            return "linux-aarch64"
    elif system == "windows":
        if machine in ("x86_64", "amd64"):
            return "windows-x86_64"
        if machine in ("x86", "i386", "i686"):
            return "windows-i686"

    raise RuntimeError(f"Unsupported platform: {system}/{machine}")


def make_ssl_context() -> ssl.SSLContext:
    # Try certifi first (pip install certifi), then fall back to default.
    # On macOS python.org builds the default store is often empty; certifi fixes that.
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        pass
    return ssl.create_default_context()


def fetch_latest_release() -> dict:
    req = urllib.request.Request(RELEASE_API)
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("User-Agent", "report-checker-pdfium-setup")
    token = os.environ.get("GITHUB_TOKEN")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(req, context=make_ssl_context()) as resp:
        return json.loads(resp.read().decode())


def find_asset_url(release: dict, target: str) -> tuple[str, str]:
    spec = TARGETS[target]
    marker = spec["match"]

    candidates = []
    for asset in release.get("assets", []):
        name = asset.get("name", "")
        url = asset.get("browser_download_url", "")
        if marker in name and (name.endswith(".tgz") or name.endswith(".zip")):
            candidates.append((name, url))

    if not candidates:
        raise RuntimeError(f"No release asset found for target {target} ({marker})")

    candidates.sort(key=lambda pair: len(pair[0]))
    return candidates[0]


def extract_archive(archive_path: Path, output_dir: Path) -> None:
    if archive_path.suffix == ".zip":
        with zipfile.ZipFile(archive_path, "r") as zf:
            zf.extractall(output_dir)
        return

    if archive_path.suffix == ".tgz" or archive_path.name.endswith(".tar.gz"):
        with tarfile.open(archive_path, "r:gz") as tf:
            tf.extractall(output_dir)
        return

    raise RuntimeError(f"Unsupported archive format: {archive_path.name}")


def find_file(root: Path, filename: str) -> Path:
    matches = [path for path in root.rglob(filename) if path.is_file()]
    if not matches:
        raise RuntimeError(f"Could not find {filename} in extracted archive")
    matches.sort(key=lambda path: len(str(path)))
    return matches[0]


def install_target(root: Path, release: dict, target: str) -> None:
    asset_name, asset_url = find_asset_url(release, target)
    target_dir = root / "src-tauri" / "vendor" / "pdfium" / target
    target_dir.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix=f"pdfium-{target}-") as tmp:
        tmp_dir = Path(tmp)
        archive_path = tmp_dir / asset_name
        extracted_dir = tmp_dir / "extract"
        extracted_dir.mkdir(parents=True, exist_ok=True)

        print(f"[{target}] downloading {asset_name}")
        req = urllib.request.Request(asset_url)
        req.add_header("User-Agent", "report-checker-pdfium-setup")
        with urllib.request.urlopen(req, context=make_ssl_context()) as resp:
            archive_path.write_bytes(resp.read())

        print(f"[{target}] extracting")
        extract_archive(archive_path, extracted_dir)

        lib_name = TARGETS[target]["lib"]
        lib_src = find_file(extracted_dir, lib_name)
        lib_dest = target_dir / lib_name

        shutil.copy2(lib_src, lib_dest)

        version_file = target_dir / "VERSION.txt"
        version_file.write_text(
            f"release_tag={release.get('tag_name', 'unknown')}\nasset={asset_name}\n",
            encoding="utf-8",
        )

        print(f"[{target}] installed {lib_dest}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Download portable PDFium binaries")
    parser.add_argument(
        "--all",
        action="store_true",
        help="install all supported targets",
    )
    parser.add_argument(
        "--target",
        action="append",
        choices=sorted(TARGETS.keys()),
        help="install a specific target (repeatable)",
    )

    args = parser.parse_args()

    root = Path(__file__).resolve().parent.parent
    release = fetch_latest_release()

    targets = []
    if args.all:
        targets = sorted(TARGETS.keys())
    elif args.target:
        targets = args.target
    else:
        targets = [detect_current_target()]

    print(f"Using release: {release.get('tag_name', 'unknown')}")

    for target in targets:
        install_target(root, release, target)

    print("Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
