"""
Wizard API routes — bolt onto the existing app.py Flask server.

Add to the bottom of app.py (before `if __name__ == "__main__":`)
or import via:  from wizard_routes import register_wizard_routes
                register_wizard_routes(app)
"""
from flask import Blueprint, request, jsonify
import os
import json
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment
from datetime import datetime

wizard = Blueprint("wizard", __name__)

EXCEL_FILE = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "pipeline_output", "companies_pipeline.xlsx",
)

# ──────────────────────────────────────────────────────────────
# The canonical header row — must match run_pipeline.py + new cols
# ──────────────────────────────────────────────────────────────
HEADERS = [
    "No.", "Company Number", "Company Name", "Short Name",
    "Status", "Type", "Date of Creation", "SIC Codes", "Address",
    "Directors", "Director Nationalities",
    "DUNS Number", "DUNS Status", "DUNS Email Used",
    "Certificate Downloaded", "Certificate Path",
    "Domain", "Domain Status", "Domain Cost",
    "Assigned Email", "Account Name",
]


def _col_index(header_row, name):
    """Find column index by header name (case-insensitive)."""
    for i, h in enumerate(header_row):
        if h and str(h).strip().lower() == name.lower():
            return i
    return None


def _ensure_excel():
    """Create the pipeline Excel if it doesn't exist."""
    os.makedirs(os.path.dirname(EXCEL_FILE), exist_ok=True)
    if os.path.exists(EXCEL_FILE):
        return
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Companies Pipeline"
    ws.append(HEADERS)
    # Style headers
    hdr_fill = PatternFill(start_color="003078", end_color="003078", fill_type="solid")
    hdr_font = Font(color="FFFFFF", bold=True, size=11)
    for cell in ws[1]:
        cell.fill = hdr_fill
        cell.font = hdr_font
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    ws.freeze_panes = "A2"
    wb.save(EXCEL_FILE)


# ──────────────────────────────────────────────────────────────
# POST /api/pipeline/add — add a company from the wizard
# ──────────────────────────────────────────────────────────────
@wizard.route("/api/pipeline/add", methods=["POST"])
def pipeline_add():
    data = request.get_json(force=True)

    cn = (data.get("company_number") or "").strip()
    if not cn:
        return jsonify({"success": False, "error": "company_number is required"}), 400

    _ensure_excel()

    wb = openpyxl.load_workbook(EXCEL_FILE)
    ws = wb.active

    # Read header to find columns dynamically
    header = [cell.value for cell in ws[1]]

    # Check for duplicate
    col_cn = _col_index(header, "Company Number")
    if col_cn is not None:
        for row in ws.iter_rows(min_row=2, values_only=False):
            if row[col_cn].value and str(row[col_cn].value).strip() == cn:
                wb.close()
                return jsonify({"success": False, "error": f"Company {cn} already exists in the pipeline."}), 409

    # If "Short Name" column doesn't exist yet, add it
    col_sn = _col_index(header, "Short Name")
    if col_sn is None:
        # Insert after "Company Name"
        col_name = _col_index(header, "Company Name")
        insert_at = (col_name + 2) if col_name is not None else (len(header) + 1)
        ws.insert_cols(insert_at)
        ws.cell(row=1, column=insert_at, value="Short Name")
        # Re-read header
        header = [cell.value for cell in ws[1]]
        col_sn = _col_index(header, "Short Name")

    # Determine row number
    next_row = ws.max_row + 1
    row_num = next_row - 1  # 1-indexed company number

    def put(col_name, value):
        idx = _col_index(header, col_name)
        if idx is not None:
            ws.cell(row=next_row, column=idx + 1, value=value)

    put("No.", row_num)
    put("Company Number", cn)
    put("Company Name", data.get("company_name", ""))
    put("Short Name", data.get("short_name", ""))
    put("Status", data.get("status", ""))
    put("Type", data.get("type", ""))
    put("Date of Creation", data.get("date_of_creation", ""))
    put("SIC Codes", data.get("sic_codes", ""))
    put("Address", data.get("address", ""))
    put("Directors", data.get("directors", ""))
    put("Director Nationalities", data.get("nationalities", ""))
    put("DUNS Number", data.get("duns_number", ""))
    put("DUNS Status", "submitted" if data.get("duns_email") and not data.get("duns_number") else ("found" if data.get("duns_number") else ""))
    put("DUNS Email Used", data.get("duns_email", ""))
    put("Domain", data.get("domain", ""))
    put("Domain Status", "pending" if data.get("domain") else "")
    put("Assigned Email", data.get("email", ""))

    # Auto-width
    for col in ws.columns:
        max_len = 0
        letter = col[0].column_letter
        for cell in col:
            try:
                if cell.value:
                    max_len = max(max_len, len(str(cell.value)))
            except Exception:
                pass
        ws.column_dimensions[letter].width = min(max_len + 2, 50)

    wb.save(EXCEL_FILE)
    wb.close()

    return jsonify({
        "success": True,
        "row": row_num,
        "company_number": cn,
        "message": f"Added {data.get('company_name', cn)} to pipeline."
    })


# ──────────────────────────────────────────────────────────────
# GET /api/pipeline/list — list all companies in the pipeline
# ──────────────────────────────────────────────────────────────
@wizard.route("/api/pipeline/list")
def pipeline_list():
    _ensure_excel()
    wb = openpyxl.load_workbook(EXCEL_FILE, read_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    wb.close()

    if not rows:
        return jsonify([])

    header = [str(h).strip() if h else f"col_{i}" for i, h in enumerate(rows[0])]
    companies = []
    for row in rows[1:]:
        entry = {}
        for i, val in enumerate(row):
            if i < len(header):
                entry[header[i]] = val
        companies.append(entry)

    return jsonify(companies)


# ──────────────────────────────────────────────────────────────
# GET /api/email-pool/status — email pool availability
# ──────────────────────────────────────────────────────────────
@wizard.route("/api/email-pool/status")
def email_pool_status():
    try:
        from email_pool import EmailPool
        pool = EmailPool()
        status = pool.status()
        available_emails = [e for e in pool._emails if e not in pool._assignments]
        return jsonify({
            "total": status["total"],
            "used": status["used"],
            "available": status["available"],
            "available_emails": available_emails[:50],  # cap at 50
        })
    except Exception as e:
        return jsonify({"error": str(e), "available_emails": []}), 500


# ──────────────────────────────────────────────────────────────
# GET /api/domains/check — check domain availability via Namecheap
# ──────────────────────────────────────────────────────────────
@wizard.route("/api/domains/check")
def domains_check():
    domains_str = request.args.get("domains", "").strip()
    if not domains_str:
        return jsonify({"error": "provide ?domains=example.co.uk"}), 400

    domain_list = [d.strip() for d in domains_str.split(",") if d.strip()]
    try:
        from namecheap_automation import check_domains
        results = check_domains(domain_list)
        return jsonify(results if isinstance(results, list) else [results])
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ──────────────────────────────────────────────────────────────
# GET  /api/duns/lookup  — quick DUNS lookup
# POST /api/duns/request — submit DUNS request via stealth browser
# ──────────────────────────────────────────────────────────────
@wizard.route("/api/duns/lookup")
def duns_lookup():
    cn = request.args.get("company_number", "").strip()
    if not cn:
        return jsonify({"error": "company_number required"}), 400
    try:
        from duns_automation import lookup_duns
        result = lookup_duns(cn)
        return jsonify(result)
    except Exception as e:
        return jsonify({"found": False, "error": str(e)})


@wizard.route("/api/duns/request", methods=["POST"])
def duns_request():
    data = request.get_json(force=True)
    cn = data.get("company_number", "").strip()
    email = data.get("email", "").strip()
    if not cn or not email:
        return jsonify({"error": "company_number and email required"}), 400
    try:
        from duns_automation import stealth_request_duns
        result = stealth_request_duns(cn, headless=True)
        return jsonify(result)
    except Exception as e:
        return jsonify({"found": False, "error": str(e)})


# ──────────────────────────────────────────────────────────────
# Registration helper
# ──────────────────────────────────────────────────────────────
def register_wizard_routes(app):
    """Call this from app.py to mount all wizard endpoints."""
    app.register_blueprint(wizard)
