"""Generate per-company install assets: icon, QR, install page, privacy, hashes, manifest.

Outputs placed under pipeline_output/apps/{company_number}/
"""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
import qrcode


def _initials(name: str) -> str:
    parts = [p for p in name.replace('-', ' ').split() if p]
    if not parts:
        return "?"
    if len(parts) == 1:
        return parts[0][:2].upper()
    return (parts[0][0] + parts[1][0]).upper()


def make_icon_png(dest: Path, color: str, name: str, size: int = 512) -> None:
    img = Image.new("RGBA", (size, size), (255, 255, 255, 0))
    draw = ImageDraw.Draw(img)
    # Fill background circle with brand primary
    rgb = tuple(int(color.lstrip('#')[i:i+2], 16) for i in (0, 2, 4))
    draw.ellipse([(0, 0), (size - 1, size - 1)], fill=rgb)

    initials = _initials(name)
    try:
        font = ImageFont.truetype("arial.ttf", size // 3)
    except Exception:
        font = ImageFont.load_default()

    try:
        bbox = draw.textbbox((0, 0), initials, font=font)
        w = bbox[2] - bbox[0]
        h = bbox[3] - bbox[1]
    except Exception:
        w, h = draw.textsize(initials, font=font)
    draw.text(((size - w) / 2, (size - h) / 2), initials, fill=(255, 255, 255), font=font)
    dest.parent.mkdir(parents=True, exist_ok=True)
    img.save(dest, format="PNG")


def make_qr(dest: Path, url: str, size: int = 512) -> None:
    qr = qrcode.QRCode(box_size=10, border=4)
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white").convert("RGBA")
    img = img.resize((size, size))
    dest.parent.mkdir(parents=True, exist_ok=True)
    img.save(dest, format="PNG")


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def make_install_page(dest: Path, apk_name: str, company: dict[str, str]) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    html = f"""
    <!doctype html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <title>Install {company.get('display_name','App')}</title>
    </head>
    <body>
      <h1>Install {company.get('display_name','App')}</h1>
      <p>Download and install the APK below:</p>
      <p><a href="{apk_name}">Download APK</a></p>
      <p>SHA-256: <code>{company.get('apk_sha256','')}</code></p>
      <p>Support: {company.get('support_email','support@example.uk')}</p>
    </body>
    </html>
    """
    dest.write_text(html, encoding="utf-8")


def make_privacy_page(dest: Path, company: dict[str, str]) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    html = f"""
    <!doctype html>
    <html lang="en">
    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Privacy</title></head>
    <body>
    <h1>Privacy policy for {company.get('display_name','App')}</h1>
    <p>This app collects no personal data. It stores user preferences locally on the device.</p>
    <p>Contact: {company.get('support_email','support@example.uk')}</p>
    </body>
    </html>
    """
    dest.write_text(html, encoding="utf-8")


def write_manifest(dest: Path, metadata: dict) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(metadata, indent=2), encoding="utf-8")


def backup_keystore(dest_dir: Path, keystore_path: Path, keystore_password: str, alias: str) -> None:
    dest_dir.mkdir(parents=True, exist_ok=True)
    # Copy keystore file
    dst = dest_dir / keystore_path.name
    if keystore_path.exists():
        from shutil import copy2
        copy2(keystore_path, dst)
    # Write signing.json with minimal metadata (password is written locally)
    signing = {
        "keystore": dst.name,
        "alias": alias,
        "store_password": keystore_password,
    }
    (dest_dir / "signing.json").write_text(json.dumps(signing, indent=2), encoding="utf-8")


def generate_all(company: dict, apk_path: Path | None, aab_path: Path | None, out_dir: Path, primary_color: str) -> None:
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    # icon
    make_icon_png(out_dir / "icon-512.png", primary_color, company.get("display_name", "App"))
    # qr -> point to /app/install.html on domain if present else to local path
    install_page = "install.html"
    apk_name = Path(apk_path).name if apk_path else ""
    # metadata
    metadata = {
        "company": company.get("display_name"),
        "package": company.get("application_id"),
        "apk": apk_name,
        "aab": Path(aab_path).name if aab_path else None,
    }
    # compute sha
    if apk_path and apk_path.exists():
        metadata["apk_sha256"] = sha256_file(apk_path)
        (out_dir / "apk.sha256").write_text(metadata["apk_sha256"], encoding="utf-8")
    if aab_path and aab_path.exists():
        metadata["aab_sha256"] = sha256_file(aab_path)
        (out_dir / "aab.sha256").write_text(metadata["aab_sha256"], encoding="utf-8")

    metadata.update({"support_email": company.get("support_email"), "application_id": company.get("application_id")})
    write_manifest(out_dir / "manifest.json", metadata)

    make_install_page(out_dir / install_page, apk_name, metadata)
    make_privacy_page(out_dir / "privacy.html", metadata)
    # QR pointing to install page at domain if provided, else point to local file
    if company.get("domain"):
        url = f"https://{company['domain']}/app/{install_page}"
    else:
        url = install_page
    make_qr(out_dir / "qr.png", url)
