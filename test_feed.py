"""Offline checks for real-feed parsing and safe publication failure handling."""

import io
import json
import unittest
from unittest.mock import patch

import fetch_jobs as feed


class FeedTests(unittest.TestCase):
    def fetch_fixture(self, payload, provider):
        with patch.object(feed, "urlopen", return_value=io.StringIO(json.dumps(payload))):
            return feed.fetch("test", "Test company", provider)[0]

    def test_lever_empty_plain_description_uses_html_and_remote_location(self):
        rows = self.fetch_fixture(
            [
                {
                    "text": "HR Analyst",
                    "descriptionPlain": "",
                    "description": "<p>Requires 5 years of experience</p>",
                    "categories": {"location": "India"},
                    "workplaceType": "remote",
                    "hostedUrl": "https://jobs.lever.co/test/job",
                }
            ],
            "Lever",
        )
        self.assertEqual(rows[0]["experience_required"], 5)
        self.assertFalse(rows[0]["early_career"])
        self.assertIn("Remote", rows[0]["location"])

    def test_ashby_html_experience_is_not_lost(self):
        rows = self.fetch_fixture(
            {
                "jobs": [
                    {
                        "title": "Marketing Analyst",
                        "descriptionHtml": "<p>4+ years of experience</p>",
                        "location": "India",
                        "isRemote": True,
                        "jobUrl": "https://jobs.ashbyhq.com/test/job",
                    }
                ]
            },
            "Ashby",
        )
        self.assertEqual(rows[0]["experience_required"], 4)
        self.assertFalse(rows[0]["early_career"])

    def test_unlisted_or_unsafe_links_are_not_published(self):
        jobs = [
            {"title": "HR Analyst", "location": "India", "jobUrl": url, "isListed": listed}
            for url, listed in [
                ("javascript:alert(1)", True),
                ("https://user:secret@example.com/job", True),
                ("https://example.com/job", False),
            ]
        ]
        self.assertEqual(self.fetch_fixture({"jobs": jobs}, "Ashby"), [])

    def test_total_source_failure_does_not_overwrite_feed(self):
        with (
            patch.object(feed, "fetch", side_effect=OSError("offline")),
            patch.object(feed, "fetch_himalayas", side_effect=OSError("offline")),
            patch.object(feed.Path, "write_text") as write,
        ):
            with self.assertRaises(SystemExit):
                feed.main()
            write.assert_not_called()

    def test_smartrecruiters_uses_active_detail_and_its_posting_link(self):
        posting = {"id": "1234", "name": "HR Analyst", "location": {"city": "Bengaluru", "country": "in"}}
        url = "https://jobs.smartrecruiters.com/Test/1234-hr-analyst"
        detail = {
            "active": True,
            "visibility": "PUBLIC",
            "postingUrl": url,
            "jobAd": {"sections": {"qualifications": {"text": "<p>2 years of experience</p>"}}},
        }
        with patch.object(feed, "read_json", side_effect=[{"content": [posting], "totalFound": 1}, detail]):
            rows, scanned = feed.fetch("Test", "Test", "SmartRecruiters")
        self.assertEqual(scanned, 1)
        self.assertEqual(rows[0]["url"], url)
        self.assertEqual(rows[0]["experience_required"], 2)
        self.assertTrue(rows[0]["early_career"])


if __name__ == "__main__":
    unittest.main()
