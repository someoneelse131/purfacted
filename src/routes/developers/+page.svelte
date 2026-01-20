<script lang="ts">
	import { page } from '$app/stores';

	export let data;

	const tiers = [
		{
			name: 'Free',
			requests: '100/day',
			price: 'Free',
			features: ['Basic access to all endpoints', 'Rate limited to 100 requests/day', 'Community support']
		},
		{
			name: 'Basic',
			requests: '1,000/day',
			price: '$19/month',
			features: [
				'1,000 requests per day',
				'Batch lookup support',
				'Email support',
				'Usage analytics dashboard'
			]
		},
		{
			name: 'Premium',
			requests: '10,000/day',
			price: '$99/month',
			features: [
				'10,000 requests per day',
				'Webhook notifications',
				'Priority support',
				'Extended caching',
				'Custom integrations'
			]
		}
	];

	const endpoints = [
		{ method: 'GET', path: '/api/v1/facts', description: 'Search and list facts' },
		{ method: 'GET', path: '/api/v1/facts/:id', description: 'Get fact details' },
		{ method: 'GET', path: '/api/v1/sources', description: 'List sources' },
		{ method: 'GET', path: '/api/v1/sources/:id', description: 'Get source details' },
		{ method: 'GET', path: '/api/v1/categories', description: 'List categories' },
		{ method: 'GET', path: '/api/v1/categories/:id', description: 'Get category details' },
		{ method: 'GET', path: '/api/v1/categories/tree', description: 'Get category tree' },
		{ method: 'GET', path: '/api/v1/trust/:factId', description: 'Get trust metrics' },
		{ method: 'POST', path: '/api/v1/trust/batch', description: 'Batch trust lookup' },
		{ method: 'GET', path: '/api/v1/trust/stats', description: 'Platform statistics' },
		{ method: 'GET', path: '/api/v1/webhooks', description: 'List webhooks' },
		{ method: 'POST', path: '/api/v1/webhooks', description: 'Create webhook' },
		{ method: 'GET', path: '/api/v1/webhooks/:id', description: 'Get webhook details' },
		{ method: 'PATCH', path: '/api/v1/webhooks/:id', description: 'Update webhook' },
		{ method: 'DELETE', path: '/api/v1/webhooks/:id', description: 'Delete webhook' }
	];

	let activeTab = 'curl';
</script>

<svelte:head>
	<title>Developer Portal - PurFacted API</title>
	<meta name="description" content="Access the PurFacted Source of Trust API for fact verification data." />
</svelte:head>

<div class="max-w-6xl mx-auto px-4 py-8">
	<header class="text-center mb-12">
		<h1 class="text-4xl font-bold text-gray-900 mb-4">PurFacted Developer Portal</h1>
		<p class="text-xl text-gray-600 max-w-2xl mx-auto">
			Integrate verified fact data into your applications with our Source of Trust API.
		</p>
	</header>

	<!-- Quick Start -->
	<section class="mb-12 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-8">
		<h2 class="text-2xl font-bold text-gray-900 mb-4">Quick Start</h2>
		<div class="grid md:grid-cols-3 gap-6">
			<div class="bg-white rounded-lg p-6 shadow-sm">
				<div class="text-3xl font-bold text-blue-600 mb-2">1</div>
				<h3 class="font-semibold mb-2">Get API Key</h3>
				<p class="text-gray-600 text-sm">
					{#if data.user}
						<a href="/developers/keys" class="text-blue-600 hover:underline">Manage your API keys</a>
					{:else}
						<a href="/auth/login?redirect=/developers/keys" class="text-blue-600 hover:underline">Sign in</a> to get your free API key.
					{/if}
				</p>
			</div>
			<div class="bg-white rounded-lg p-6 shadow-sm">
				<div class="text-3xl font-bold text-blue-600 mb-2">2</div>
				<h3 class="font-semibold mb-2">Make Requests</h3>
				<p class="text-gray-600 text-sm">
					Include your key in the <code class="bg-gray-100 px-1 rounded">X-API-Key</code> header.
				</p>
			</div>
			<div class="bg-white rounded-lg p-6 shadow-sm">
				<div class="text-3xl font-bold text-blue-600 mb-2">3</div>
				<h3 class="font-semibold mb-2">Build Something</h3>
				<p class="text-gray-600 text-sm">
					Integrate fact verification into your app, website, or service.
				</p>
			</div>
		</div>
	</section>

	<!-- Code Example -->
	<section class="mb-12">
		<h2 class="text-2xl font-bold text-gray-900 mb-4">Example Request</h2>
		<div class="bg-gray-900 rounded-lg overflow-hidden">
			<div class="flex border-b border-gray-700">
				<button
					class="px-4 py-2 text-sm {activeTab === 'curl' ? 'text-white bg-gray-800' : 'text-gray-400 hover:text-white'}"
					on:click={() => activeTab = 'curl'}
				>cURL</button>
				<button
					class="px-4 py-2 text-sm {activeTab === 'javascript' ? 'text-white bg-gray-800' : 'text-gray-400 hover:text-white'}"
					on:click={() => activeTab = 'javascript'}
				>JavaScript</button>
				<button
					class="px-4 py-2 text-sm {activeTab === 'python' ? 'text-white bg-gray-800' : 'text-gray-400 hover:text-white'}"
					on:click={() => activeTab = 'python'}
				>Python</button>
			</div>
			{#if activeTab === 'curl'}
				<pre class="p-4 text-green-400 text-sm overflow-x-auto"><code>curl -X GET "https://purfacted.com/api/v1/facts?q=climate&status=PROVEN" \
  -H "X-API-Key: your_api_key_here"</code></pre>
			{:else if activeTab === 'javascript'}
				<pre class="p-4 text-green-400 text-sm overflow-x-auto"><code>const response = await fetch(
  'https://purfacted.com/api/v1/facts?q=climate&status=PROVEN',
  {'{'}
    headers: {'{'} 'X-API-Key': 'your_api_key_here' {'}'}
  {'}'}
);
const data = await response.json();
console.log(data.data.facts);</code></pre>
			{:else if activeTab === 'python'}
				<pre class="p-4 text-green-400 text-sm overflow-x-auto"><code>import requests

response = requests.get(
    'https://purfacted.com/api/v1/facts',
    params={'{'}'q': 'climate', 'status': 'PROVEN'{'}'},
    headers={'{'}'X-API-Key': 'your_api_key_here'{'}'}
)
data = response.json()
print(data['data']['facts'])</code></pre>
			{/if}
		</div>
		<div class="mt-2 text-sm text-gray-500">
			Download full SDK examples:
			<a href="/api/examples/curl.sh" class="text-blue-600 hover:underline">cURL</a> |
			<a href="/api/examples/javascript.js" class="text-blue-600 hover:underline">JavaScript</a> |
			<a href="/api/examples/python.py" class="text-blue-600 hover:underline">Python</a>
		</div>
		<div class="mt-4 bg-gray-50 rounded-lg p-4">
			<h3 class="font-semibold mb-2">Response</h3>
			<pre class="text-sm overflow-x-auto"><code>{`{
  "success": true,
  "data": {
    "facts": [
      {
        "id": "clx...",
        "title": "Climate change is caused by human activity",
        "status": "PROVEN",
        "trust": {
          "weightedScore": 42.5,
          "upvotePercentage": 87
        }
      }
    ]
  },
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 156
  }
}`}</code></pre>
		</div>
	</section>

	<!-- API Endpoints -->
	<section class="mb-12">
		<h2 class="text-2xl font-bold text-gray-900 mb-4">API Endpoints</h2>
		<div class="bg-white rounded-lg shadow overflow-hidden">
			<table class="w-full">
				<thead class="bg-gray-50">
					<tr>
						<th class="px-4 py-3 text-left text-sm font-semibold text-gray-600">Method</th>
						<th class="px-4 py-3 text-left text-sm font-semibold text-gray-600">Endpoint</th>
						<th class="px-4 py-3 text-left text-sm font-semibold text-gray-600">Description</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-200">
					{#each endpoints as endpoint}
						<tr>
							<td class="px-4 py-3">
								<span class="px-2 py-1 text-xs font-semibold rounded {endpoint.method === 'GET' ? 'bg-blue-100 text-blue-700' : endpoint.method === 'POST' ? 'bg-green-100 text-green-700' : endpoint.method === 'PATCH' ? 'bg-yellow-100 text-yellow-700' : endpoint.method === 'DELETE' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'}">
									{endpoint.method}
								</span>
							</td>
							<td class="px-4 py-3 font-mono text-sm text-gray-700">{endpoint.path}</td>
							<td class="px-4 py-3 text-sm text-gray-600">{endpoint.description}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<div class="mt-4 text-center">
			<a href="/api/openapi.json" class="text-blue-600 hover:underline" target="_blank">
				View full OpenAPI specification
			</a>
		</div>
	</section>

	<!-- Pricing Tiers -->
	<section class="mb-12">
		<h2 class="text-2xl font-bold text-gray-900 mb-4">API Tiers</h2>
		<div class="grid md:grid-cols-3 gap-6">
			{#each tiers as tier, i}
				<div class="bg-white rounded-lg shadow-lg p-6 {i === 1 ? 'ring-2 ring-blue-500' : ''}">
					{#if i === 1}
						<div class="text-xs font-semibold text-blue-600 uppercase mb-2">Most Popular</div>
					{/if}
					<h3 class="text-xl font-bold text-gray-900">{tier.name}</h3>
					<div class="text-3xl font-bold text-gray-900 my-4">{tier.price}</div>
					<div class="text-sm text-gray-600 mb-4">{tier.requests}</div>
					<ul class="space-y-2">
						{#each tier.features as feature}
							<li class="flex items-start">
								<svg class="w-5 h-5 text-green-500 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
									<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
								</svg>
								<span class="text-sm text-gray-600">{feature}</span>
							</li>
						{/each}
					</ul>
					<button class="w-full mt-6 py-2 px-4 rounded-lg {i === 1 ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'} font-semibold">
						{i === 0 ? 'Get Started Free' : 'Coming Soon'}
					</button>
				</div>
			{/each}
		</div>
	</section>

	<!-- Authentication -->
	<section class="mb-12">
		<h2 class="text-2xl font-bold text-gray-900 mb-4">Authentication</h2>
		<div class="bg-white rounded-lg shadow p-6">
			<p class="text-gray-600 mb-4">
				All API requests require authentication. Include your API key using one of these methods:
			</p>
			<div class="space-y-4">
				<div>
					<h3 class="font-semibold text-gray-900 mb-2">Header (Recommended)</h3>
					<code class="block bg-gray-100 p-3 rounded text-sm">X-API-Key: your_api_key_here</code>
				</div>
				<div>
					<h3 class="font-semibold text-gray-900 mb-2">Bearer Token</h3>
					<code class="block bg-gray-100 p-3 rounded text-sm">Authorization: Bearer your_api_key_here</code>
				</div>
				<div>
					<h3 class="font-semibold text-gray-900 mb-2">Query Parameter</h3>
					<code class="block bg-gray-100 p-3 rounded text-sm">?api_key=your_api_key_here</code>
				</div>
			</div>
		</div>
	</section>

	<!-- Rate Limiting -->
	<section class="mb-12">
		<h2 class="text-2xl font-bold text-gray-900 mb-4">Rate Limiting</h2>
		<div class="bg-white rounded-lg shadow p-6">
			<p class="text-gray-600 mb-4">
				API responses include rate limit headers:
			</p>
			<ul class="space-y-2 text-sm text-gray-600">
				<li><code class="bg-gray-100 px-2 py-1 rounded">X-RateLimit-Limit</code> - Your daily request limit</li>
				<li><code class="bg-gray-100 px-2 py-1 rounded">X-RateLimit-Remaining</code> - Requests remaining today</li>
				<li><code class="bg-gray-100 px-2 py-1 rounded">X-RateLimit-Reset</code> - When your limit resets (ISO 8601)</li>
			</ul>
			<p class="mt-4 text-gray-600">
				Rate limits reset at midnight UTC. If you exceed your limit, you'll receive a <code class="bg-gray-100 px-1 rounded">429 Too Many Requests</code> response.
			</p>
		</div>
	</section>

	<!-- CTA -->
	<section class="text-center bg-blue-600 rounded-lg p-8 text-white">
		<h2 class="text-2xl font-bold mb-4">Ready to Get Started?</h2>
		<p class="mb-6 text-blue-100">
			Get your free API key and start integrating fact verification into your applications.
		</p>
		{#if data.user}
			<a href="/developers/keys" class="inline-block bg-white text-blue-600 px-6 py-3 rounded-lg font-semibold hover:bg-blue-50">
				Manage API Keys
			</a>
		{:else}
			<a href="/auth/register?redirect=/developers/keys" class="inline-block bg-white text-blue-600 px-6 py-3 rounded-lg font-semibold hover:bg-blue-50">
				Create Free Account
			</a>
		{/if}
	</section>
</div>
