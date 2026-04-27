"""End-to-end APK factory.

    python -m apps.generator.generate --count 3

Steps:
  1. Load N companies from pipeline_output/companies_pipeline.xlsx
  2. For each: synth palette, mint keystore, write per-flavor res overlay
  3. Write flavors.gradle.kts
  4. Ensure local.properties points at the Android SDK
  5. Run `gradlew :app:assembleRelease`
  6. Copy signed APKs to pipeline_output/apps/{company_number}/
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import time
from typing import Iterable
from pathlib import Path

from .brand_synth import palette_for
from .catalog import Company, load_companies, summarize
from .flavor_writer import BuiltFlavor, clean_stale_flavors, write_flavor_resources, write_flavors_gradle
from .keystore_mint import mint as mint_keystore
from . import assets

# Project layout
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TEMPLATE_ROOT = os.path.join(ROOT, "apps", "template-shift-journal")
APP_DIR = os.path.join(TEMPLATE_ROOT, "app")
KEYSTORES_DIR = os.path.join(APP_DIR, "keystores")
OUTPUT_DIR = os.path.join(ROOT, "pipeline_output", "apps")

SDK_DIR_DEFAULT = os.environ.get(
    "ANDROID_HOME",
    os.path.expanduser("~/Android/Sdk"),
)


def _ensure_local_properties(sdk_dir: str = SDK_DIR_DEFAULT) -> None:
    path = os.path.join(TEMPLATE_ROOT, "local.properties")
    escaped = sdk_dir.replace("\\", "\\\\").replace(":", "\\:")
    with open(path, "w", encoding="utf-8") as f:
        f.write(f"sdk.dir={escaped}\n")


def build_flavors(companies: Iterable[Company]) -> list[BuiltFlavor]:
    companies = list(companies)
    built: list[BuiltFlavor] = []
    for c in companies:
        palette = palette_for(c.company_name)
        write_flavor_resources(c, palette, APP_DIR)
        ks = mint_keystore(c.company_number, c.company_name, KEYSTORES_DIR)
        built.append(BuiltFlavor(company=c, palette=palette, keystore=ks, flavor_dir=""))
    write_flavors_gradle(built, APP_DIR)
    clean_stale_flavors(APP_DIR, keep_flavors={b.company.flavor for b in built})
    return built


def run_gradle(built: list[BuiltFlavor], variant: str = "Release") -> int:
    """Invoke the Gradle wrapper to assemble all flavors in one go."""
    gradlew = os.path.join(TEMPLATE_ROOT, "gradlew.bat")
    if not os.path.exists(gradlew):
        print(f"  ERROR: {gradlew} not found")
        return 1

    tasks = [f":app:assemble{b.company.flavor.capitalize()}{variant}" for b in built]
    cmd = [gradlew, "--no-daemon", "--console=plain", "--stacktrace", *tasks]
    print(f"\n  Gradle: {' '.join(tasks)}")
    t0 = time.time()
    # Run from the template root so gradlew resolves relative paths correctly.
    res = subprocess.run(cmd, cwd=TEMPLATE_ROOT)
    dt = time.time() - t0
    print(f"  Gradle exit={res.returncode} in {dt:.1f}s")
    return res.returncode


def collect_apks(built: list[BuiltFlavor], variant: str = "release") -> dict[str, str]:
    """Copy built APKs to pipeline_output/apps/{company_number}/. Returns cn -> dest path."""
    out: dict[str, str] = {}
    for b in built:
        c = b.company
        src = os.path.join(
            APP_DIR, "build", "outputs", "apk", c.flavor, variant,
            f"app-{c.flavor}-{variant}.apk",
        )
        if not os.path.exists(src):
            print(f"  [{c.company_number}] MISSING {src}")
            continue
        dst_dir = os.path.join(OUTPUT_DIR, c.company_number)
        os.makedirs(dst_dir, exist_ok=True)
        slug = c.display_name.lower().replace(" ", "-")
        slug = "".join(ch for ch in slug if ch.isalnum() or ch == "-")[:40] or c.company_number
        dst = os.path.join(dst_dir, f"{slug}-{variant}.apk")
        shutil.copy2(src, dst)
        out[c.company_number] = dst
        size_kb = os.path.getsize(dst) // 1024
        print(f"  [{c.company_number}] {dst}  ({size_kb} KB)")
    return out


def backup_and_make_assets(built: list[BuiltFlavor], collected: dict[str, str]) -> None:
    """For each built flavor, copy keystore, generate assets, and write manifest."""
    for b in built:
        c = b.company
        out_dir = os.path.join(ROOT, "pipeline_output", "apps", c.company_number)
        apk_path = collected.get(c.company_number)
        # backup keystore into output
        ks_src = os.path.join(APP_DIR, "keystores", f"{c.company_number}.jks")
        if os.path.exists(ks_src):
            assets.backup_keystore(Path(out_dir), Path(ks_src), mint_keystore(c.company_number, c.company_name, KEYSTORES_DIR).store_password, "upload")
        # generate assets (use palette to pick primary color)
        palette = palette_for(c.company_name)
        assets.generate_all({
            "display_name": c.display_name,
            "support_email": c.support_email,
            "application_id": c.application_id,
            "domain": c.domain,
        }, Path(apk_path) if apk_path else None, None, Path(out_dir), palette.primary)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Android APK factory")
    p.add_argument("--count", type=int, default=3, help="Number of companies to build")
    p.add_argument("--variant", default="Release", choices=["Release", "Debug"])
    p.add_argument("--sdk", default=SDK_DIR_DEFAULT)
    p.add_argument("--skip-build", action="store_true", help="Generate flavors but don't run Gradle")
    args = p.parse_args(argv)

    companies = load_companies(limit=args.count)
    if not companies:
        print("No companies loaded. Bail.")
        return 2
    print("=" * 72)
    print(f"APK FACTORY — {len(companies)} companies, variant={args.variant}")
    print("=" * 72)
    print(summarize(companies))

    print("\n[1] Writing brand overlays + minting keystores…")
    built = build_flavors(companies)
    print(f"  wrote {len(built)} flavor overlays + flavors.gradle.kts + keystores")

    _ensure_local_properties(args.sdk)
    print(f"  local.properties -> sdk.dir={args.sdk}")

    if args.skip_build:
        print("\n[SKIPPED] Gradle build. Generating assets and keystore backups anyway.")
        # Generate assets and backup keystores even when skipping the actual Gradle build
        backup_and_make_assets(built, {})
        return 0

    print("\n[2] Running Gradle…")
    rc = run_gradle(built, variant=args.variant)
    if rc != 0:
        print("\nBuild failed. See Gradle output above.")
        return rc

    print("\n[3] Collecting APKs…")
    got = collect_apks(built, variant=args.variant.lower())
    if len(got) != len(built):
        print(f"\n  WARN: only {len(got)}/{len(built)} APKs collected.")
    else:
        print(f"\n  OK: all {len(got)} APKs in {OUTPUT_DIR}")

    print("\n[4] Backing up keystores and generating install assets…")
    backup_and_make_assets(built, got)

    return 0 if len(got) == len(built) else 1


if __name__ == "__main__":
    sys.exit(main())
