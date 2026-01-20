"""
PurFacted API - Python SDK Example

A simple client for the PurFacted Source of Trust API.
Requires: requests library (pip install requests)
"""

import requests
from typing import Optional, Dict, List, Any
from dataclasses import dataclass


class PurFactedError(Exception):
    """Exception raised for API errors."""
    def __init__(self, code: str, message: str):
        self.code = code
        self.message = message
        super().__init__(f"{code}: {message}")


class PurFactedClient:
    """Client for the PurFacted Source of Trust API."""

    def __init__(self, api_key: str, base_url: str = "https://purfacted.com/api/v1"):
        self.api_key = api_key
        self.base_url = base_url
        self.session = requests.Session()
        self.session.headers.update({
            "X-API-Key": api_key,
            "Content-Type": "application/json"
        })

    def _request(self, method: str, endpoint: str, **kwargs) -> Dict[str, Any]:
        """Make an API request."""
        url = f"{self.base_url}{endpoint}"
        response = self.session.request(method, url, **kwargs)
        data = response.json()

        if not data.get("success"):
            error = data.get("error", {})
            raise PurFactedError(
                error.get("code", "UNKNOWN"),
                error.get("message", "Unknown error")
            )

        return data

    # Facts API
    def search_facts(
        self,
        q: Optional[str] = None,
        status: Optional[str] = None,
        category: Optional[str] = None,
        sort: Optional[str] = None,
        page: int = 1,
        limit: int = 20
    ) -> Dict[str, Any]:
        """Search and list facts."""
        params = {"page": page, "limit": limit}
        if q:
            params["q"] = q
        if status:
            params["status"] = status
        if category:
            params["category"] = category
        if sort:
            params["sort"] = sort

        return self._request("GET", "/facts", params=params)

    def get_fact(self, fact_id: str) -> Dict[str, Any]:
        """Get detailed information about a specific fact."""
        return self._request("GET", f"/facts/{fact_id}")

    # Sources API
    def get_sources(
        self,
        fact_id: Optional[str] = None,
        source_type: Optional[str] = None,
        min_credibility: Optional[int] = None,
        page: int = 1,
        limit: int = 20
    ) -> Dict[str, Any]:
        """List sources with optional filtering."""
        params = {"page": page, "limit": limit}
        if fact_id:
            params["factId"] = fact_id
        if source_type:
            params["type"] = source_type
        if min_credibility is not None:
            params["minCredibility"] = min_credibility

        return self._request("GET", "/sources", params=params)

    def get_source(self, source_id: str) -> Dict[str, Any]:
        """Get detailed information about a specific source."""
        return self._request("GET", f"/sources/{source_id}")

    # Categories API
    def get_categories(
        self,
        q: Optional[str] = None,
        parent: Optional[str] = None,
        page: int = 1,
        limit: int = 50
    ) -> Dict[str, Any]:
        """List categories with optional filtering."""
        params = {"page": page, "limit": limit}
        if q:
            params["q"] = q
        if parent:
            params["parent"] = parent

        return self._request("GET", "/categories", params=params)

    def get_category(self, category_id: str) -> Dict[str, Any]:
        """Get detailed information about a specific category."""
        return self._request("GET", f"/categories/{category_id}")

    def get_category_tree(self) -> Dict[str, Any]:
        """Get the full category hierarchy as a tree."""
        return self._request("GET", "/categories/tree")

    # Trust API
    def get_trust_metrics(self, fact_id: str) -> Dict[str, Any]:
        """Get comprehensive trust metrics for a fact."""
        return self._request("GET", f"/trust/{fact_id}")

    def batch_trust_metrics(self, fact_ids: List[str]) -> Dict[str, Any]:
        """Get trust metrics for multiple facts at once (max 100)."""
        return self._request("POST", "/trust/batch", json={"factIds": fact_ids})

    def get_platform_stats(self) -> Dict[str, Any]:
        """Get overall platform trust statistics."""
        return self._request("GET", "/trust/stats")

    # Webhooks API
    def list_webhooks(self) -> Dict[str, Any]:
        """List all webhooks for your API key."""
        return self._request("GET", "/webhooks")

    def create_webhook(self, url: str, events: List[str]) -> Dict[str, Any]:
        """Create a new webhook subscription."""
        return self._request("POST", "/webhooks", json={"url": url, "events": events})

    def get_webhook(self, webhook_id: str) -> Dict[str, Any]:
        """Get webhook details and delivery logs."""
        return self._request("GET", f"/webhooks/{webhook_id}")

    def update_webhook(
        self,
        webhook_id: str,
        url: Optional[str] = None,
        events: Optional[List[str]] = None,
        is_active: Optional[bool] = None
    ) -> Dict[str, Any]:
        """Update a webhook subscription."""
        data = {}
        if url is not None:
            data["url"] = url
        if events is not None:
            data["events"] = events
        if is_active is not None:
            data["isActive"] = is_active

        return self._request("PATCH", f"/webhooks/{webhook_id}", json=data)

    def delete_webhook(self, webhook_id: str) -> Dict[str, Any]:
        """Delete a webhook subscription."""
        return self._request("DELETE", f"/webhooks/{webhook_id}")


# ============================================
# Usage Examples
# ============================================

if __name__ == "__main__":
    # Initialize the client
    client = PurFactedClient("your_api_key_here")

    # Search for proven facts about climate
    try:
        facts = client.search_facts(q="climate", status="PROVEN", limit=10)
        print(f"Found {len(facts['data']['facts'])} facts about climate")

        for fact in facts["data"]["facts"]:
            print(f"  - {fact['title']} ({fact['status']})")

    except PurFactedError as e:
        print(f"API Error: {e}")

    # Get trust metrics for a fact
    try:
        fact_id = "some_fact_id"
        trust = client.get_trust_metrics(fact_id)

        print(f"\nTrust Metrics for {fact_id}:")
        print(f"  Status: {trust['data']['status']}")
        print(f"  Weighted Score: {trust['data']['votes']['weightedScore']}")
        print(f"  Total Votes: {trust['data']['votes']['total']}")
        print(f"  Source Credibility: {trust['data']['sources']['averageCredibility']}")

    except PurFactedError as e:
        print(f"API Error: {e}")

    # Get platform statistics
    try:
        stats = client.get_platform_stats()

        print("\nPlatform Statistics:")
        print(f"  Total Facts: {stats['data']['facts']['total']}")
        print(f"  Proven: {stats['data']['facts']['byStatus'].get('PROVEN', 0)}")
        print(f"  Total Sources: {stats['data']['sources']['total']}")
        print(f"  Active Users: {stats['data']['participation']['activeUsers']}")

    except PurFactedError as e:
        print(f"API Error: {e}")

    # Create a webhook for status changes
    try:
        webhook = client.create_webhook(
            url="https://your-server.com/webhook",
            events=["fact.status_changed", "fact.voted"]
        )

        print(f"\nWebhook created!")
        print(f"  ID: {webhook['data']['id']}")
        print(f"  Secret: {webhook['data']['secret']}")
        print("  (Save the secret - it won't be shown again!)")

    except PurFactedError as e:
        print(f"API Error: {e}")
