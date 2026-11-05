"""Public-only Pages feed. No candidate profile, mailbox, credentials or application history."""

import concurrent.futures
import html
import json
import re
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen

BOARDS = {
    "razorpaysoftwareprivatelimited": "Razorpay",
    "coherehealth": "Cohere Health",
    "redwoodsoftware": "Redwood Software",
    "freshprints": "Fresh Prints",
    "winhomeinspection": "WIN Home Inspection",
    "clearviewhealthcarepartners": "ClearView Healthcare Partners",
}
TRACKS = {
    "Analytics": r"data analyst|business analyst|reporting analyst|power bi|bi analyst|operations analyst",
    "People & HR": r"\bhr\b|human resources|people analy|people operations|recruit|talent",
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


def fetch(board, company, provider="Greenhouse"):
    url = (
        f"https://boards-api.greenhouse.io/v1/boards/{board}/jobs?content=true"
        if provider == "Greenhouse"
        else f"https://api.lever.co/v0/postings/{board}?mode=json"
    )
    with urlopen(Request(url, headers={"User-Agent": "NextChapterPublicJobs/1.0"}), timeout=30) as response:
        raw = json.load(response)
    raw = raw["jobs"] if provider == "Greenhouse" else raw
    now = datetime.now(UTC).isoformat()
    rows = []
    for j in raw:
        title = plain(j.get("title", j.get("text", "")))
        track = next(
            (name for name, pattern in TRACKS.items() if re.search(pattern, title, re.IGNORECASE)), None
        )
        if not track:
            continue
        location = plain(
            j.get("location", {}).get("name", "")
            if provider == "Greenhouse"
            else j.get("categories", {}).get("location", "")
        )
        description = plain(j.get("content", j.get("descriptionPlain", "")))
        link = j.get("absolute_url", j.get("hostedUrl", ""))
        parsed = urlparse(link)
        if parsed.scheme != "https" or parsed.username or parsed.password:
            continue
        exp = experience_required(description + " " + title)
        junior = not re.search(
            r"\b(senior|sr|lead|principal|director|head|manager|architect)\b", title, re.IGNORECASE
        ) and (exp is None or exp <= 3)
        rows.append(
            {
                "title": title,
                "company": company,
                "location": location or "See listing",
                "url": link,
                "source": provider,
                "track": track,
                "snippet": description[:320],
                "early_career": bool(junior),
                "experience_required": exp,
                "checked_at": now,
            }
        )
    return rows, len(raw)


def main():
    jobs, sources, errors, scanned = [], [], [], 0
    requests = [(board, company, "Greenhouse") for board, company in BOARDS.items()] + [
        ("aleph", "Aleph", "Lever")
    ]
    with concurrent.futures.ThreadPoolExecutor(max_workers=7) as pool:
        futures = {pool.submit(fetch, *item): item for item in requests}
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
