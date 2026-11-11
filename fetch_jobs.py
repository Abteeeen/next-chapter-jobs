"""Public-only Pages feed. No candidate profile, mailbox, credentials or application history."""

import concurrent.futures
import html
import json
import re
from datetime import UTC, datetime
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen

BOARDS = {
    "razorpaysoftwareprivatelimited": "Razorpay",
    "coherehealth": "Cohere Health",
    "redwoodsoftware": "Redwood Software",
    "freshprints": "Fresh Prints",
    "winhomeinspection": "WIN Home Inspection",
    "clearviewhealthcarepartners": "ClearView Healthcare Partners",
    "flix": "Flix",
    "karya": "Karya",
    "stripe": "Stripe",
    "databricks": "Databricks",
    "gitlab": "GitLab",
    "canonical": "Canonical",
    "okta": "Okta",
    "zscaler": "Zscaler",
    "twilio": "Twilio",
    "purestorage": "Pure Storage",
    "rubrik": "Rubrik",
    "elastic": "Elastic",
    "digicert": "DigiCert",
    "zenoti": "Zenoti",
    "coinbase": "Coinbase",
    "launchdarkly": "LaunchDarkly",
    "appian": "Appian",
    "knowbe4": "KnowBe4",
}
SMARTRECRUITERS_BOARDS = {
    "AllegisGlobalSolutions": "Allegis Global Solutions",
    "Assystem": "Assystem",
    "AveryDennison": "Avery Dennison",
    "BoschGroup": "Bosch Group",
    "Eurofins": "Eurofins",
    "Experian": "Experian",
    "Freshworks": "Freshworks",
    "HMGroup": "H&M Group",
    "HitachiSolutions": "Hitachi Solutions",
    "NielsenIQ": "NielsenIQ",
    "ServiceNow": "ServiceNow",
    "SGS": "SGS",
    "Version1": "Version 1",
    "WesternDigital": "Western Digital",
}
TRACKS = {
    "Analytics": r"data analy|business (?:system[s]? )?analyst|reporting analy|power bi|bi analyst|operations analyst|analytics (?:associate|analyst|specialist)",
    "People & HR": r"\bhr\b|\bhris\b|human resources|people analy|people operations|recruit|talent",
    "Automation": r"automation|\bn8n\b|ai engineer|workflow|integration engineer",
    "Marketing": r"marketing|paid media|\bseo\b|growth|campaign",
    "Web": r"wordpress|web developer|frontend|front.end|react developer|next.js",
    "Operations": r"customer success|client success|operations associate|operations executive|project coordinator",
}


def plain(s):
    value = html.unescape(str(s or ""))
    value = re.sub(r"<(script|style)[^>]*>.*?</\1>", "", value, flags=re.IGNORECASE | re.DOTALL)
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", value))).strip()


def experience_required(text):
    text = text.lower().replace("–", "-").replace("—", "-")
    for word, number in {
        "one": 1,
        "two": 2,
        "three": 3,
        "four": 4,
        "five": 5,
        "six": 6,
        "seven": 7,
        "eight": 8,
        "ten": 10,
    }.items():
        text = re.sub(rf"\b{word}\b(?=\s+years?)", str(number), text)
    patterns = [
        r"\b(\d+(?:\.\d+)?)\s*(?:-\s*\d+(?:\.\d+)?|to\s+\d+(?:\.\d+)?)?\s*\+?\s*(?:years?|yrs?)\s*(?:of\s+)?(?:[\w/-]+\s+){0,4}experience",
        r"experience\s*(?:of|:|required|minimum)?\s*(\d+(?:\.\d+)?)\s*(?:-\s*\d+|to\s+\d+)?\s*\+?\s*(?:years?|yrs?)",
    ]
    values = [float(m.group(1)) for pattern in patterns for m in re.finditer(pattern, text)]
    return max(values) if values else None


def read_json(url):
    with urlopen(Request(url, headers={"User-Agent": "NextChapterPublicJobs/1.0"}), timeout=25) as response:
        return json.load(response)


def date_iso(value):
    try:
        if isinstance(value, (int, float)):
            return datetime.fromtimestamp(value, UTC).isoformat()
        return datetime.fromisoformat(value).isoformat()
    except (ValueError, TypeError, OSError, OverflowError):
        return None


def make_job(title, company, location, link, provider, description, checked_at, published_at=None):
    track = next((name for name, pattern in TRACKS.items() if re.search(pattern, title, re.IGNORECASE)), None)
    parsed = urlparse(link)
    if not track or parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        return None
    exp = experience_required(description + " " + title)
    early_associate = (
        bool(re.search(r"\bsenior associate\b", title, re.IGNORECASE)) and exp is not None and exp <= 3
    )
    junior = (
        early_associate
        or not re.search(
            r"\b(senior|sr|lead|principal|director|head|manager|architect)\b", title, re.IGNORECASE
        )
    ) and (exp is None or exp <= 3)
    return {
        "title": title,
        "company": company,
        "location": location or "See listing",
        "url": link,
        "source": provider,
        "track": track,
        "snippet": description[:320],
        "early_career": bool(junior),
        "experience_required": exp,
        "checked_at": checked_at,
        "published_at": published_at,
    }


def fetch(board, company, provider="Greenhouse"):
    if provider == "SmartRecruiters":
        return fetch_smartrecruiters(board, company)
    url = (
        f"https://boards-api.greenhouse.io/v1/boards/{board}/jobs?content=true"
        if provider == "Greenhouse"
        else f"https://api.lever.co/v0/postings/{board}?mode=json"
    )
    if provider == "Ashby":
        url = f"https://api.ashbyhq.com/posting-api/job-board/{board}"
    raw = read_json(url)
    raw = raw["jobs"] if provider in {"Greenhouse", "Ashby"} else raw
    now = datetime.now(UTC).isoformat()
    rows = []
    for j in raw:
        if not j.get("isListed", True):
            continue
        title = plain(j.get("title", j.get("text", "")))
        location = plain(
            j.get("location", {}).get("name", "")
            if provider == "Greenhouse"
            else j.get("categories", {}).get("location", "")
        )
        if provider == "Ashby":
            location = plain(j.get("location", "")) + (" (Remote)" if j.get("isRemote") else "")
        description = plain(
            j.get("content")
            or j.get("descriptionPlain")
            or j.get("description")
            or j.get("descriptionHtml")
            or ""
        )
        if provider == "Lever":
            if j.get("workplaceType") == "remote" and "remote" not in location.lower():
                location += " (Remote)"
            description += " " + " ".join(plain(x.get("content", "")) for x in j.get("lists", []))
            description += " " + plain(j.get("additionalPlain", ""))
        link = j.get("absolute_url", j.get("hostedUrl", ""))
        if provider == "Ashby":
            link = j.get("jobUrl", "")
        published = j.get("first_published") if provider == "Greenhouse" else j.get("publishedAt")
        if provider == "Lever" and isinstance(j.get("createdAt"), (int, float)):
            published = j["createdAt"] / 1000
        job = make_job(title, company, location, link, provider, description, now, date_iso(published))
        if job:
            rows.append(job)
    return rows, len(raw)


def fetch_smartrecruiters(board, company):
    endpoint = f"https://api.smartrecruiters.com/v1/companies/{board}/postings"
    now = datetime.now(UTC).isoformat()
    rows = []
    scanned = 0
    for offset in range(0, 1000, 100):
        data = read_json(f"{endpoint}?country=in&destination=PUBLIC&limit=100&offset={offset}")
        postings = data["content"]
        scanned += len(postings)
        for posting in postings:
            title = plain(posting["name"])
            if not any(re.search(pattern, title, re.IGNORECASE) for pattern in TRACKS.values()):
                continue
            place = posting["location"]
            if place.get("country", "").lower() != "in" or not str(posting["id"]).isdigit():
                continue
            try:
                detail = read_json(f"{endpoint}/{posting['id']}")
            except HTTPError as error:
                if error.code not in (404, 410):
                    raise
                continue
            if detail.get("active") is False or detail.get("visibility") != "PUBLIC":
                continue
            sections = detail.get("jobAd", {}).get("sections", {})
            description = " ".join(
                plain(sections.get(name, {}).get("text")) for name in ("jobDescription", "qualifications")
            ).strip()
            location = ", ".join(
                filter(None, [plain(place.get("city")), plain(place.get("region")), "India"])
            )
            if place.get("remote"):
                location += " (Remote)"
            job = make_job(
                title,
                company,
                location,
                detail.get("postingUrl", ""),
                "SmartRecruiters",
                description,
                now,
                date_iso(posting.get("releasedDate")),
            )
            if job:
                rows.append(job)
        if scanned >= data["totalFound"] or not postings:
            break
    return rows, scanned


def fetch_himalayas():
    now = datetime.now(UTC)
    jobs = {}
    for query in (
        "data analyst",
        "human resources",
        "automation",
        "marketing",
        "web developer",
        "customer success",
    ):
        params = urlencode(
            {"q": query, "country": "IN", "seniority": "Entry-level,Mid-level", "sort": "recent"}
        )
        try:
            data = read_json(f"https://himalayas.app/jobs/api/search?{params}")
        except HTTPError as error:
            if error.code != 429 or not jobs:
                raise
            break
        for posting in data["jobs"]:
            jobs[posting["guid"]] = posting
    rows = []
    for posting in jobs.values():
        countries = posting.get("locationRestrictions") or []
        zones = posting.get("timezoneRestrictions") or []
        if countries and "India" not in countries or zones and 5.5 not in zones:
            continue
        if posting.get("expiryDate") and posting["expiryDate"] <= now.timestamp():
            continue
        if (urlparse(posting["applicationLink"]).hostname or "") != "himalayas.app":
            continue
        location = "India (Remote)" if countries else "Remote (India eligible)"
        row = make_job(
            plain(posting["title"]),
            plain(posting["companyName"]),
            location,
            posting["applicationLink"],
            "Himalayas",
            plain(posting.get("description") or posting.get("excerpt")),
            now.isoformat(),
            date_iso(posting.get("pubDate")),
        )
        if row:
            rows.append(row)
    return rows, len(jobs)


def main():
    jobs, sources, errors, scanned = [], [], [], 0
    requests = (
        [(board, company, "Greenhouse") for board, company in BOARDS.items()]
        + [
            ("aleph", "Aleph", "Lever"),
            ("mindtickle", "Mindtickle", "Lever"),
            ("weekdayworks", "Weekday", "Lever"),
            ("protolabs", "Protolabs", "Lever"),
            ("cred", "CRED", "Lever"),
            ("pebl", "Pebl", "Ashby"),
            ("headout", "Headout", "Ashby"),
        ]
        + [(board, company, "SmartRecruiters") for board, company in SMARTRECRUITERS_BOARDS.items()]
    )
    with concurrent.futures.ThreadPoolExecutor(max_workers=7) as pool:
        futures = {pool.submit(fetch, *item): item for item in requests}
        futures[pool.submit(fetch_himalayas)] = ("himalayas", "Himalayas", "Himalayas")
        for future in concurrent.futures.as_completed(futures):
            _board, company, provider = futures[future]
            try:
                rows, count = future.result()
                jobs.extend(rows)
                scanned += count
                sources.append({"name": company, "provider": provider, "count": count})
            except (OSError, ValueError, KeyError, TypeError) as exc:
                errors.append({"source": company, "error": type(exc).__name__})
    if not sources:
        raise SystemExit("All sources failed; refusing to publish an empty replacement feed")
    unique = {j["url"]: j for j in jobs}
    payload = {
        "generated_at": datetime.now(UTC).isoformat(),
        "scanned": scanned,
        "sources": sources,
        "errors": errors,
        "jobs": sorted(unique.values(), key=lambda j: (j["company"], j["title"])),
    }
    Path(__file__).with_name("jobs.json").write_text(
        json.dumps(payload, ensure_ascii=False), encoding="utf-8"
    )
    print(
        f"Published feed: {len(unique)} relevant listings from {len(sources)} sources; {len(errors)} errors"
    )


if __name__ == "__main__":
    main()
