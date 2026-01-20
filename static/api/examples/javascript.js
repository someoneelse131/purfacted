/**
 * PurFacted API - JavaScript/TypeScript Examples
 *
 * A simple client for the PurFacted Source of Trust API.
 * Works in both Node.js and browser environments.
 */

class PurFactedClient {
  constructor(apiKey, baseUrl = 'https://purfacted.com/api/v1') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      'X-API-Key': this.apiKey,
      ...options.headers
    };

    const response = await fetch(url, {
      ...options,
      headers
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error?.message || 'API request failed');
    }

    return data;
  }

  // Facts API
  async searchFacts(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    return this.request(`/facts${queryString ? `?${queryString}` : ''}`);
  }

  async getFact(factId) {
    return this.request(`/facts/${factId}`);
  }

  // Sources API
  async getSources(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    return this.request(`/sources${queryString ? `?${queryString}` : ''}`);
  }

  async getSource(sourceId) {
    return this.request(`/sources/${sourceId}`);
  }

  // Categories API
  async getCategories(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    return this.request(`/categories${queryString ? `?${queryString}` : ''}`);
  }

  async getCategory(categoryId) {
    return this.request(`/categories/${categoryId}`);
  }

  async getCategoryTree() {
    return this.request('/categories/tree');
  }

  // Trust API
  async getTrustMetrics(factId) {
    return this.request(`/trust/${factId}`);
  }

  async batchTrustMetrics(factIds) {
    return this.request('/trust/batch', {
      method: 'POST',
      body: JSON.stringify({ factIds })
    });
  }

  async getPlatformStats() {
    return this.request('/trust/stats');
  }

  // Webhooks API
  async listWebhooks() {
    return this.request('/webhooks');
  }

  async createWebhook(url, events) {
    return this.request('/webhooks', {
      method: 'POST',
      body: JSON.stringify({ url, events })
    });
  }

  async getWebhook(webhookId) {
    return this.request(`/webhooks/${webhookId}`);
  }

  async updateWebhook(webhookId, data) {
    return this.request(`/webhooks/${webhookId}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    });
  }

  async deleteWebhook(webhookId) {
    return this.request(`/webhooks/${webhookId}`, {
      method: 'DELETE'
    });
  }
}

// ============================================
// Usage Examples
// ============================================

async function examples() {
  const client = new PurFactedClient('your_api_key_here');

  // Search for proven facts about climate
  const facts = await client.searchFacts({
    q: 'climate',
    status: 'PROVEN',
    limit: 10
  });
  console.log('Found facts:', facts.data.facts.length);

  // Get a specific fact with full details
  const fact = await client.getFact('fact_id_here');
  console.log('Fact title:', fact.data.title);
  console.log('Trust score:', fact.data.trust.weightedScore);

  // Get trust metrics for multiple facts at once
  const batchTrust = await client.batchTrustMetrics([
    'fact_id_1',
    'fact_id_2',
    'fact_id_3'
  ]);
  console.log('Trust data retrieved for:', batchTrust.data.found, 'facts');

  // Get the category tree
  const categories = await client.getCategoryTree();
  console.log('Categories:', categories.data.stats.totalCategories);

  // Get platform statistics
  const stats = await client.getPlatformStats();
  console.log('Total facts:', stats.data.facts.total);
  console.log('Proven percentage:', stats.data.facts.provenPercentage + '%');

  // Create a webhook for fact status changes
  const webhook = await client.createWebhook(
    'https://your-server.com/webhook',
    ['fact.status_changed', 'fact.voted']
  );
  console.log('Webhook created with secret:', webhook.data.secret);
}

// Export for module usage
if (typeof module !== 'undefined') {
  module.exports = { PurFactedClient };
}
