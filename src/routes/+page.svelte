<script lang="ts">
	export let data;
</script>

<svelte:head>
	<title>PurFacted - Community Fact Verification</title>
	<meta name="description" content="Community-driven fact verification platform where users submit, verify, and discuss facts with weighted voting." />
</svelte:head>

<main>
	<!-- Hero Section -->
	<section class="bg-gradient-to-b from-blue-600 to-blue-800 text-white">
		<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
			<div class="text-center">
				<h1 class="text-4xl sm:text-5xl lg:text-6xl font-bold mb-6">
					Verify Facts Together
				</h1>
				<p class="text-xl sm:text-2xl text-blue-100 mb-8 max-w-3xl mx-auto">
					A community-driven platform where experts and everyday users collaborate to verify information and fight misinformation.
				</p>
				<div class="flex flex-col sm:flex-row gap-4 justify-center">
					<a
						href="/facts"
						class="inline-flex items-center justify-center px-8 py-3 text-lg font-medium rounded-md bg-white text-blue-600 hover:bg-blue-50 transition-colors"
					>
						Browse Facts
					</a>
					{#if !data.user}
						<a
							href="/auth/register"
							class="inline-flex items-center justify-center px-8 py-3 text-lg font-medium rounded-md border-2 border-white text-white hover:bg-white hover:text-blue-600 transition-colors"
						>
							Join Now
						</a>
					{:else}
						<a
							href="/facts/new"
							class="inline-flex items-center justify-center px-8 py-3 text-lg font-medium rounded-md border-2 border-white text-white hover:bg-white hover:text-blue-600 transition-colors"
						>
							Submit a Fact
						</a>
					{/if}
				</div>
			</div>
		</div>
	</section>

	<!-- Features Section -->
	<section class="py-16 sm:py-24">
		<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
			<h2 class="text-3xl font-bold text-center text-gray-900 mb-12">
				How It Works
			</h2>
			<div class="grid md:grid-cols-3 gap-8">
				<div class="text-center p-6">
					<div class="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
						<svg class="w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
						</svg>
					</div>
					<h3 class="text-xl font-semibold text-gray-900 mb-2">Submit Facts</h3>
					<p class="text-gray-600">
						Share claims with credible sources. Our grammar check ensures quality submissions.
					</p>
				</div>
				<div class="text-center p-6">
					<div class="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
						<svg class="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
						</svg>
					</div>
					<h3 class="text-xl font-semibold text-gray-900 mb-2">Verify Together</h3>
					<p class="text-gray-600">
						Community votes determine truth. Expert votes carry more weight based on trust scores.
					</p>
				</div>
				<div class="text-center p-6">
					<div class="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
						<svg class="w-8 h-8 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
						</svg>
					</div>
					<h3 class="text-xl font-semibold text-gray-900 mb-2">Discuss & Debate</h3>
					<p class="text-gray-600">
						Engage in civil debates. Pro and contra arguments help everyone understand different perspectives.
					</p>
				</div>
			</div>
		</div>
	</section>

	<!-- Trust System Section -->
	<section class="bg-white py-16 sm:py-24">
		<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
			<div class="lg:grid lg:grid-cols-2 lg:gap-16 items-center">
				<div>
					<h2 class="text-3xl font-bold text-gray-900 mb-6">
						Trust-Based Verification
					</h2>
					<p class="text-lg text-gray-600 mb-6">
						Not all votes are equal. Our weighted voting system ensures that verified experts, PhDs, and trusted community members have more influence on fact verification.
					</p>
					<ul class="space-y-4">
						<li class="flex items-start">
							<svg class="w-6 h-6 text-green-500 mr-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
							</svg>
							<span class="text-gray-600">Expert verification through credential review</span>
						</li>
						<li class="flex items-start">
							<svg class="w-6 h-6 text-green-500 mr-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
							</svg>
							<span class="text-gray-600">Trust scores based on accuracy history</span>
						</li>
						<li class="flex items-start">
							<svg class="w-6 h-6 text-green-500 mr-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
							</svg>
							<span class="text-gray-600">Organization accounts for official responses</span>
						</li>
						<li class="flex items-start">
							<svg class="w-6 h-6 text-green-500 mr-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
							</svg>
							<span class="text-gray-600">Veto system for challenging wrong verdicts</span>
						</li>
					</ul>
				</div>
				<div class="mt-10 lg:mt-0">
					<div class="bg-gray-50 rounded-lg p-6 sm:p-8">
						<h3 class="text-lg font-semibold text-gray-900 mb-4">Vote Weight by User Type</h3>
						<div class="space-y-3">
							<div class="flex justify-between items-center">
								<span class="text-gray-600">Organization</span>
								<div class="flex items-center">
									<div class="w-32 bg-gray-200 rounded-full h-2 mr-3">
										<div class="bg-blue-600 h-2 rounded-full" style="width: 100%"></div>
									</div>
									<span class="text-sm font-medium text-gray-900">100x</span>
								</div>
							</div>
							<div class="flex justify-between items-center">
								<span class="text-gray-600">PhD</span>
								<div class="flex items-center">
									<div class="w-32 bg-gray-200 rounded-full h-2 mr-3">
										<div class="bg-blue-600 h-2 rounded-full" style="width: 8%"></div>
									</div>
									<span class="text-sm font-medium text-gray-900">8x</span>
								</div>
							</div>
							<div class="flex justify-between items-center">
								<span class="text-gray-600">Expert</span>
								<div class="flex items-center">
									<div class="w-32 bg-gray-200 rounded-full h-2 mr-3">
										<div class="bg-blue-600 h-2 rounded-full" style="width: 5%"></div>
									</div>
									<span class="text-sm font-medium text-gray-900">5x</span>
								</div>
							</div>
							<div class="flex justify-between items-center">
								<span class="text-gray-600">Verified</span>
								<div class="flex items-center">
									<div class="w-32 bg-gray-200 rounded-full h-2 mr-3">
										<div class="bg-blue-600 h-2 rounded-full" style="width: 2%"></div>
									</div>
									<span class="text-sm font-medium text-gray-900">2x</span>
								</div>
							</div>
							<div class="flex justify-between items-center">
								<span class="text-gray-600">Anonymous</span>
								<div class="flex items-center">
									<div class="w-32 bg-gray-200 rounded-full h-2 mr-3">
										<div class="bg-gray-400 h-2 rounded-full" style="width: 0.1%"></div>
									</div>
									<span class="text-sm font-medium text-gray-900">0.1x</span>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- CTA Section -->
	<section class="bg-blue-600 py-16">
		<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
			<h2 class="text-3xl font-bold text-white mb-4">
				Ready to Fight Misinformation?
			</h2>
			<p class="text-xl text-blue-100 mb-8 max-w-2xl mx-auto">
				Join thousands of fact-checkers working together to verify information and promote truth.
			</p>
			{#if !data.user}
				<a
					href="/auth/register"
					class="inline-flex items-center justify-center px-8 py-3 text-lg font-medium rounded-md bg-white text-blue-600 hover:bg-blue-50 transition-colors"
				>
					Create Free Account
				</a>
			{:else}
				<a
					href="/facts"
					class="inline-flex items-center justify-center px-8 py-3 text-lg font-medium rounded-md bg-white text-blue-600 hover:bg-blue-50 transition-colors"
				>
					Start Verifying
				</a>
			{/if}
		</div>
	</section>

	<!-- Footer -->
	<footer class="bg-gray-900 text-gray-400 py-12">
		<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
			<div class="grid md:grid-cols-4 gap-8">
				<div>
					<h3 class="text-white font-semibold mb-4">PurFacted</h3>
					<p class="text-sm">Community-driven fact verification for a more informed world.</p>
				</div>
				<div>
					<h4 class="text-white font-semibold mb-4">Platform</h4>
					<ul class="space-y-2 text-sm">
						<li><a href="/facts" class="hover:text-white">Browse Facts</a></li>
						<li><a href="/categories" class="hover:text-white">Categories</a></li>
						<li><a href="/debates" class="hover:text-white">Debates</a></li>
						<li><a href="/stats" class="hover:text-white">Statistics</a></li>
					</ul>
				</div>
				<div>
					<h4 class="text-white font-semibold mb-4">Account</h4>
					<ul class="space-y-2 text-sm">
						{#if !data.user}
							<li><a href="/auth/login" class="hover:text-white">Sign In</a></li>
							<li><a href="/auth/register" class="hover:text-white">Register</a></li>
						{:else}
							<li><a href="/user/profile" class="hover:text-white">Profile</a></li>
							<li><a href="/user/settings" class="hover:text-white">Settings</a></li>
						{/if}
					</ul>
				</div>
				<div>
					<h4 class="text-white font-semibold mb-4">Legal</h4>
					<ul class="space-y-2 text-sm">
						<li><a href="/privacy" class="hover:text-white">Privacy Policy</a></li>
						<li><a href="/terms" class="hover:text-white">Terms of Service</a></li>
					</ul>
				</div>
			</div>
			<div class="border-t border-gray-800 mt-8 pt-8 text-sm text-center">
				&copy; {new Date().getFullYear()} PurFacted. All rights reserved.
			</div>
		</div>
	</footer>
</main>
