"""
Namecheap Domain Automation Module
Handles domain availability checking, registration, and DNS TXT record management
via the Namecheap API for the Google Play Developer pipeline.

API Docs: https://www.namecheap.com/support/api/methods/
"""

import os
import re
import requests
import xml.etree.ElementTree as ET
from dotenv import load_dotenv

load_dotenv()

# --- Config ---
API_USER = os.getenv("NAMECHEAP_API_USER", "")
API_KEY = os.getenv("NAMECHEAP_API_KEY", "")
USERNAME = os.getenv("NAMECHEAP_USERNAME", "")
CLIENT_IP = os.getenv("NAMECHEAP_CLIENT_IP", "")

PRODUCTION_URL = "https://api.namecheap.com/xml.response"
SANDBOX_URL = "https://api.sandbox.namecheap.com/xml.response"

# Use production by default; set NAMECHEAP_SANDBOX=1 in .env to use sandbox
USE_SANDBOX = os.getenv("NAMECHEAP_SANDBOX", "0") == "1"
API_URL = SANDBOX_URL if USE_SANDBOX else PRODUCTION_URL

# Cheapest TLDs to check, ordered by actual 1-year price (cheapest first)
# .online/$0.98  .site/$0.98  .xyz/$2.00  .uk/$6.98  .co.uk/~$7  .org.uk/~$7  .com/~$9
CHEAP_TLDS = [".online", ".site", ".xyz", ".uk", ".co.uk", ".org.uk", ".com"]

# XML namespace used in Namecheap responses
NS = {"nc": "http://api.namecheap.com/xml.response"}
NS_HTTPS = {"nc": "https://api.namecheap.com/xml.response"}


def _base_params():
    """Return the global params required for every API call."""
    return {
        "ApiUser": API_USER,
        "ApiKey": API_KEY,
        "UserName": USERNAME,
        "ClientIp": CLIENT_IP,
    }


def _api_call(command, extra_params=None, method="GET"):
    """Make a Namecheap API call and return parsed XML root + status."""
    params = _base_params()
    params["Command"] = f"namecheap.{command}"
    if extra_params:
        params.update(extra_params)

    if method == "GET":
        resp = requests.get(API_URL, params=params, timeout=30)
    else:
        resp = requests.post(API_URL, data=params, timeout=30)

    resp.raise_for_status()
    root = ET.fromstring(resp.text)

    # Detect namespace (http vs https)
    ns = NS
    if "https://api.namecheap.com" in resp.text:
        ns = NS_HTTPS

    status = root.attrib.get("Status", "ERROR")
    errors = []
    for err_container in [root.find("Errors", ns), root.find("nc:Errors", ns),
                          root.find("{http://api.namecheap.com/xml.response}Errors"),
                          root.find("{https://api.namecheap.com/xml.response}Errors")]:
        if err_container is not None:
            for err in err_container:
                errors.append(err.text or err.attrib.get("Number", "Unknown error"))

    return {"root": root, "status": status, "errors": errors, "raw": resp.text, "ns": ns}


# ============================================================
# DOMAIN AVAILABILITY CHECK
# ============================================================

def check_domains(domain_list):
    """
    Check availability of a list of domains (max 50 per call).
    Returns list of dicts with domain, available, is_premium, price info.
    """
    if not domain_list:
        return []

    # Namecheap allows max 50 per call
    results = []
    for i in range(0, len(domain_list), 50):
        batch = domain_list[i:i + 50]
        domain_str = ",".join(batch)
        resp = _api_call("domains.check", {"DomainList": domain_str})

        if resp["status"] != "OK":
            return {"error": f"API error: {resp['errors']}"}

        # Parse results - try both namespace variants
        for node in resp["root"].iter():
            if "DomainCheckResult" in node.tag:
                results.append({
                    "domain": node.attrib.get("Domain", ""),
                    "available": node.attrib.get("Available", "false").lower() == "true",
                    "is_premium": node.attrib.get("IsPremiumName", "false").lower() == "true",
                    "registration_price": node.attrib.get("PremiumRegistrationPrice", "0"),
                    "icann_fee": node.attrib.get("IcannFee", "0"),
                })

    return results


def find_cheapest_domain(company_name):
    """
    Given a company name, generate domain candidates and find the cheapest available one.
    Returns the best option or None.
    """
    # Clean company name for domain use
    clean = _company_name_to_domain(company_name)
    if not clean:
        return {"error": "Could not generate domain name from company name"}

    # Generate candidates with cheap TLDs
    candidates = [f"{clean}{tld}" for tld in CHEAP_TLDS]

    # Also try shorter variants
    if len(clean) > 15:
        # Try abbreviation (first letters of each word)
        words = company_name.upper().replace("LTD", "").replace("LIMITED", "").split()
        abbrev = "".join(w[0] for w in words if w).lower()
        if len(abbrev) >= 2:
            candidates.extend([f"{abbrev}{tld}" for tld in CHEAP_TLDS])

    results = check_domains(candidates)
    if isinstance(results, dict) and "error" in results:
        return results

    available = [r for r in results if r["available"] and not r["is_premium"]]
    if not available:
        return {"error": "No available domains found", "checked": candidates}

    # Sort by TLD preference (cheapest first from our list)
    def tld_priority(d):
        for i, tld in enumerate(CHEAP_TLDS):
            if d["domain"].endswith(tld):
                return i
        return 99

    available.sort(key=tld_priority)
    return {"best": available[0], "alternatives": available[1:5]}


def _company_name_to_domain(company_name):
    """Convert a company name to a valid domain-safe string."""
    name = company_name.upper()
    # Remove common suffixes
    for suffix in ["LIMITED", "LTD", "PLC", "LLP", "INC", "CORP", "LLC"]:
        name = re.sub(rf"\b{suffix}\b", "", name)
    # Lowercase, strip non-alphanumeric, collapse hyphens
    name = name.lower().strip()
    name = re.sub(r"[^a-z0-9]+", "-", name)
    name = name.strip("-")
    # Collapse repeated hyphens
    name = re.sub(r"-+", "-", name)
    return name if len(name) >= 2 else None


# ============================================================
# DOMAIN REGISTRATION
# ============================================================

def register_domain(domain_name, years=1, registrant_info=None):
    """
    Register a domain. registrant_info is a dict with contact fields.
    If not provided, uses minimal defaults from env.

    Required registrant fields:
        FirstName, LastName, Address1, City, StateProvince,
        PostalCode, Country, Phone (+NNN.NNNNNNNNNN), EmailAddress
    """
    if not registrant_info:
        return {"error": "registrant_info dict is required with contact details"}

    sld, tld = _split_domain(domain_name)
    if not sld or not tld:
        return {"error": f"Could not parse domain: {domain_name}"}

    params = {
        "DomainName": domain_name,
        "Years": str(years),
        "AddFreeWhoisguard": "yes",
        "WGEnabled": "yes",
    }

    # Set all 4 contact types to the same info
    for prefix in ["Registrant", "Tech", "Admin", "AuxBilling"]:
        params[f"{prefix}FirstName"] = registrant_info.get("FirstName", "")
        params[f"{prefix}LastName"] = registrant_info.get("LastName", "")
        params[f"{prefix}Address1"] = registrant_info.get("Address1", "")
        params[f"{prefix}City"] = registrant_info.get("City", "")
        params[f"{prefix}StateProvince"] = registrant_info.get("StateProvince", "")
        params[f"{prefix}PostalCode"] = registrant_info.get("PostalCode", "")
        params[f"{prefix}Country"] = registrant_info.get("Country", "GB")
        params[f"{prefix}Phone"] = registrant_info.get("Phone", "")
        params[f"{prefix}EmailAddress"] = registrant_info.get("EmailAddress", "")
        if registrant_info.get("OrganizationName"):
            params[f"{prefix}OrganizationName"] = registrant_info["OrganizationName"]

    resp = _api_call("domains.create", params, method="POST")

    if resp["status"] != "OK":
        return {"error": f"Registration failed: {resp['errors']}", "raw": resp["raw"]}

    # Parse result
    for node in resp["root"].iter():
        if "DomainCreateResult" in node.tag:
            return {
                "registered": node.attrib.get("Registered", "false").lower() == "true",
                "domain": node.attrib.get("Domain", ""),
                "charged": node.attrib.get("ChargedAmount", ""),
                "domain_id": node.attrib.get("DomainID", ""),
                "order_id": node.attrib.get("OrderID", ""),
                "whoisguard": node.attrib.get("WhoisguardEnable", ""),
            }

    return {"error": "Unexpected response format", "raw": resp["raw"]}


def _split_domain(domain_name):
    """Split domain into SLD and TLD. Handles multi-part TLDs like .co.uk."""
    multi_tlds = [".co.uk", ".org.uk", ".me.uk", ".com.au", ".net.au",
                  ".org.au", ".co.in", ".com.es", ".org.es", ".nom.es"]
    for tld in multi_tlds:
        if domain_name.endswith(tld):
            sld = domain_name[:-len(tld)]
            return sld, tld.lstrip(".")
    # Simple TLD
    parts = domain_name.rsplit(".", 1)
    if len(parts) == 2:
        return parts[0], parts[1]
    return None, None


# ============================================================
# DNS MANAGEMENT - TXT RECORDS
# ============================================================

def get_dns_hosts(domain_name):
    """Get current DNS host records for a domain."""
    sld, tld = _split_domain(domain_name)
    if not sld or not tld:
        return {"error": f"Could not parse domain: {domain_name}"}

    resp = _api_call("domains.dns.getHosts", {"SLD": sld, "TLD": tld})

    if resp["status"] != "OK":
        return {"error": f"Failed to get DNS: {resp['errors']}"}

    hosts = []
    for node in resp["root"].iter():
        if "host" in node.tag.lower() and node.attrib.get("Name"):
            hosts.append({
                "host_id": node.attrib.get("HostId", ""),
                "name": node.attrib.get("Name", ""),
                "type": node.attrib.get("Type", ""),
                "address": node.attrib.get("Address", ""),
                "mx_pref": node.attrib.get("MXPref", ""),
                "ttl": node.attrib.get("TTL", ""),
            })

    return {"domain": domain_name, "hosts": hosts}


def set_dns_hosts(domain_name, hosts):
    """
    Set DNS host records for a domain. REPLACES all existing records.
    
    hosts: list of dicts, each with keys: name, type, address, ttl (optional), mx_pref (optional)
    Example: [
        {"name": "@", "type": "TXT", "address": "google-site-verification=xxx", "ttl": "1800"},
        {"name": "@", "type": "URL", "address": "http://example.com", "ttl": "1800"},
    ]
    """
    sld, tld = _split_domain(domain_name)
    if not sld or not tld:
        return {"error": f"Could not parse domain: {domain_name}"}

    params = {"SLD": sld, "TLD": tld}
    for i, host in enumerate(hosts, 1):
        params[f"HostName{i}"] = host["name"]
        params[f"RecordType{i}"] = host["type"]
        params[f"Address{i}"] = host["address"]
        if host.get("mx_pref"):
            params[f"MXPref{i}"] = host["mx_pref"]
        params[f"TTL{i}"] = host.get("ttl", "1800")

    resp = _api_call("domains.dns.setHosts", params, method="POST")

    if resp["status"] != "OK":
        return {"error": f"Failed to set DNS: {resp['errors']}"}

    for node in resp["root"].iter():
        if "DomainDNSSetHostsResult" in node.tag:
            return {
                "domain": node.attrib.get("Domain", domain_name),
                "success": node.attrib.get("IsSuccess", "false").lower() == "true",
            }

    return {"error": "Unexpected response", "raw": resp["raw"]}


def add_txt_record(domain_name, txt_value, hostname="@"):
    """
    Add a TXT record while preserving existing DNS records.
    This is the key method for Google Search Console verification.
    """
    # Get existing records first
    current = get_dns_hosts(domain_name)
    if "error" in current:
        return current

    # Build new host list: existing + new TXT
    hosts = []
    for h in current.get("hosts", []):
        # Skip parking page records if present
        if h["type"] == "URL" and "parkingpage" in h.get("address", "").lower():
            continue
        hosts.append({
            "name": h["name"],
            "type": h["type"],
            "address": h["address"],
            "ttl": h.get("ttl", "1800"),
            "mx_pref": h.get("mx_pref", ""),
        })

    # Add the new TXT record
    hosts.append({
        "name": hostname,
        "type": "TXT",
        "address": txt_value,
        "ttl": "1800",
    })

    return set_dns_hosts(domain_name, hosts)


def set_default_dns(domain_name):
    """Set domain to use Namecheap's default DNS servers (required for host records)."""
    sld, tld = _split_domain(domain_name)
    if not sld or not tld:
        return {"error": f"Could not parse domain: {domain_name}"}

    resp = _api_call("domains.dns.setDefault", {"SLD": sld, "TLD": tld})
    if resp["status"] != "OK":
        return {"error": f"Failed to set default DNS: {resp['errors']}"}
    return {"success": True, "domain": domain_name}


# ============================================================
# EMAIL FORWARDING
# ============================================================

def set_email_forwarding(domain_name, mailbox, forward_to):
    """
    Set email forwarding: mailbox@domain -> forward_to.
    e.g. set_email_forwarding("demanda.co.uk", "info", "your@gmail.com")
    """
    resp = _api_call("domains.dns.setEmailForwarding", {
        "DomainName": domain_name,
        "MailBox1": mailbox,
        "ForwardTo1": forward_to,
    })

    if resp["status"] != "OK":
        return {"error": f"Failed: {resp['errors']}"}

    for node in resp["root"].iter():
        if "SetEmailForwardingResult" in node.tag or "DomainDNSSetEmailForwardingResult" in node.tag:
            return {
                "success": node.attrib.get("IsSuccess", "false").lower() == "true",
                "domain": domain_name,
                "forwarding": f"{mailbox}@{domain_name} -> {forward_to}",
            }

    return {"success": True, "domain": domain_name}


# ============================================================
# ACCOUNT INFO
# ============================================================

def get_balance():
    """Get Namecheap account balance."""
    resp = _api_call("users.getBalances")
    if resp["status"] != "OK":
        return {"error": f"Failed: {resp['errors']}"}

    for node in resp["root"].iter():
        if "GetBalancesResult" in node.tag or "UserGetBalancesResult" in node.tag:
            return {
                "available": node.attrib.get("AvailableBalance", ""),
                "account_balance": node.attrib.get("AccountBalance", ""),
                "earned": node.attrib.get("EarnedAmount", ""),
                "currency": node.attrib.get("Currency", "USD"),
            }

    return {"error": "Could not parse balance", "raw": resp["raw"]}


def get_domain_list():
    """Get list of all domains in the account."""
    resp = _api_call("domains.getList", {"PageSize": "100"})
    if resp["status"] != "OK":
        return {"error": f"Failed: {resp['errors']}"}

    domains = []
    for node in resp["root"].iter():
        if "Domain" in node.tag and node.attrib.get("Name"):
            domains.append({
                "name": node.attrib.get("Name", ""),
                "id": node.attrib.get("ID", ""),
                "expires": node.attrib.get("Expires", ""),
                "is_expired": node.attrib.get("IsExpired", ""),
                "auto_renew": node.attrib.get("AutoRenew", ""),
                "whoisguard": node.attrib.get("WhoisGuard", ""),
            })

    return {"domains": domains, "count": len(domains)}


def get_pricing(tld="com"):
    """Get registration pricing for a specific TLD."""
    resp = _api_call("users.getPricing", {
        "ProductType": "DOMAIN",
        "ProductCategory": "DOMAINS",
        "ActionName": "REGISTER",
        "ProductName": tld,
    })
    if resp["status"] != "OK":
        return {"error": f"Failed: {resp['errors']}"}

    prices = []
    for node in resp["root"].iter():
        if "Price" in node.tag and node.attrib.get("Duration"):
            prices.append({
                "duration": node.attrib.get("Duration", ""),
                "duration_type": node.attrib.get("DurationType", ""),
                "price": node.attrib.get("Price", ""),
                "regular_price": node.attrib.get("RegularPrice", ""),
                "your_price": node.attrib.get("YourPrice", ""),
                "currency": node.attrib.get("Currency", "USD"),
            })

    return {"tld": tld, "prices": prices}


# ============================================================
# WHOIS PRIVACY
# ============================================================

def enable_privacy(domain_name):
    """Enable WHOIS privacy protection for a domain."""
    resp = _api_call("domainprivacy.enable", {"DomainName": domain_name})
    if resp["status"] != "OK":
        return {"error": f"Failed: {resp['errors']}"}
    return {"success": True, "domain": domain_name}
