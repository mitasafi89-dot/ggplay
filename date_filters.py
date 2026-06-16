"""Centralised incorporation-year filtering for Companies House retrieval.

Single source of truth shared by every code path that pulls companies:
  - ``run_pipeline.find_companies_by_nationality``  (bulk CLI / launcher retrieval)
  - ``app.search_companies_page`` / ``app.find_one_company_for_officer``
    (live Server-Sent-Events search)
  - ``wizard_routes.pipeline_run_start``           (request validation + CLI args)

Companies House returns ``date_of_creation`` as an ISO date string
``"YYYY-MM-DD"``. We filter on the incorporation *year* (the 4-digit prefix),
which is the granularity the UI and the existing code expose. All comparisons
are inclusive.

The module is import-path tolerant: it is consumed both as a flat module
(``from date_filters import ...`` when a script's own directory is on the path)
and, in some deployments, as part of a ``ggplay`` package.
"""

from __future__ import annotations

from datetime import datetime

# Guards against typos / malformed input. UK incorporated companies post-date
# the Joint Stock Companies Act 1844; 1850 is a safe, generous lower bound.
_MIN_YEAR = 1850


def current_year() -> int:
    """The current calendar year in the host's local timezone."""
    return datetime.now().astimezone().year


def last_year() -> int:
    """The calendar year one year before today -- the default filter window."""
    return current_year() - 1


def _coerce_year(value) -> "str | None":
    """Return a clean 4-digit year string, or ``None`` if blank / invalid.

    Accepts ints or strings. Rejects anything that is not exactly four digits
    or that falls outside ``[_MIN_YEAR, current_year() + 1]`` (one year of slack
    covers companies incorporated late in the current year across timezones).
    """
    if value is None:
        return None
    s = str(value).strip()
    if not (s.isdigit() and len(s) == 4):
        return None
    y = int(s)
    if y < _MIN_YEAR or y > current_year() + 1:
        return None
    return s


def resolve_year_window(year=None, year_from=None, year_to=None,
                        all_years=False, default_to_last_year=True):
    """Resolve UI / CLI inputs into an inclusive ``(year_from, year_to)`` window.

    Precedence (an explicit choice always beats an implicit default):
      1. ``all_years``            -> ``(None, None)``      [filtering disabled]
      2. ``year`` (single value)  -> ``(year, year)``
      3. ``year_from`` / ``year_to`` -> range (either bound may stay open)
      4. ``default_to_last_year`` -> ``(last_year, last_year)``
      5. otherwise                -> ``(None, None)``

    Returns a tuple of 4-digit strings; ``None`` marks an open or disabled bound.
    Inverted ranges are normalised so callers never have to.
    """
    if all_years:
        return (None, None)

    single = _coerce_year(year)
    if single is not None:
        return (single, single)

    yf = _coerce_year(year_from)
    yt = _coerce_year(year_to)
    if yf is not None or yt is not None:
        if yf is not None and yt is not None and yf > yt:
            yf, yt = yt, yf
        return (yf, yt)

    if default_to_last_year:
        ly = str(last_year())
        return (ly, ly)

    return (None, None)


def incorporated_in_window(date_of_creation, year_from, year_to) -> bool:
    """True if an ISO ``date_of_creation`` falls within the inclusive window.

    With an open window (both bounds ``None``) every company matches. When any
    bound is set, a company whose date is missing or unparseable is *excluded*
    -- we cannot prove it matches, so we do not silently include it.
    """
    if not year_from and not year_to:
        return True
    year = str(date_of_creation or "")[:4].strip()
    if not (year.isdigit() and len(year) == 4):
        return False
    if year_from and year < year_from:
        return False
    if year_to and year > year_to:
        return False
    return True


def describe_window(year_from, year_to) -> str:
    """Human-readable description of a window, for logs and CLI banners."""
    if not year_from and not year_to:
        return "all years"
    if year_from and year_to:
        return year_from if year_from == year_to else f"{year_from}-{year_to}"
    if year_from:
        return f"{year_from} and later"
    return f"{year_to} and earlier"
