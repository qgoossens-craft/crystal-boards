import { App, Notice, requestUrl } from 'obsidian';
import { ResearchUrl } from './types';

export interface LinkMetadata {
	title: string;
	description: string;
	category: LinkCategory;
	icon: string;
	domain: string;
	originalUrl: string;
	previewData?: LinkPreviewData;
}

export interface LinkPreviewData {
	thumbnail?: string;
	author?: string;
	publishDate?: string;
	duration?: string; // For videos
	readingTime?: string; // For articles
	tags?: string[];
}

export enum LinkCategory {
	YOUTUBE = 'youtube',
	REDDIT = 'reddit',
	GITHUB = 'github',
	STACKOVERFLOW = 'stackoverflow',
	ARTICLE = 'article',
	DOCUMENTATION = 'documentation',
	SOCIAL = 'social',
	TOOL = 'tool',
	OTHER = 'other'
}

export class LinkManager {
	private app: App;
	private cache: Map<string, LinkMetadata> = new Map();

	constructor(app: App) {
		this.app = app;
	}

	/**
	 * Enhance a URL with better metadata and categorization
	 */
	async enhanceUrl(url: string, existingTitle?: string): Promise<LinkMetadata> {
		// Check cache first
		if (this.cache.has(url)) {
			return this.cache.get(url)!;
		}

		try {
			const metadata = await this.extractLinkMetadata(url, existingTitle);
			this.cache.set(url, metadata);
			return metadata;
		} catch (error) {
			console.error('Failed to enhance URL:', url, error);
			// Return basic metadata as fallback
			return this.createBasicMetadata(url, existingTitle);
		}
	}

	/**
	 * Extract metadata from URL
	 */
	private async extractLinkMetadata(url: string, existingTitle?: string): Promise<LinkMetadata> {
		const category = this.categorizeUrl(url);
		const domain = this.extractDomain(url);
		const icon = this.getIconForCategory(category);

		// If we have a custom title, use it
		if (existingTitle && existingTitle.trim()) {
			return {
				title: existingTitle.trim(),
				description: `Link from ${domain}`,
				category,
				icon,
				domain,
				originalUrl: url
			};
		}

		// Try to fetch page title and metadata
		const fetchedMetadata = await this.fetchPageMetadata(url, category);
		
		return {
			title: fetchedMetadata.title || this.generateSmartTitle(url, category),
			description: fetchedMetadata.description || `Link from ${domain}`,
			category,
			icon,
			domain,
			originalUrl: url,
			previewData: fetchedMetadata.previewData
		};
	}

	/**
	 * Categorize URL based on domain and patterns
	 */
	private categorizeUrl(url: string): LinkCategory {
		const urlLower = url.toLowerCase();
		
		if (urlLower.includes('youtube.com') || urlLower.includes('youtu.be')) {
			return LinkCategory.YOUTUBE;
		}
		if (urlLower.includes('reddit.com')) {
			return LinkCategory.REDDIT;
		}
		if (urlLower.includes('github.com')) {
			return LinkCategory.GITHUB;
		}
		if (urlLower.includes('stackoverflow.com') || urlLower.includes('stackexchange.com')) {
			return LinkCategory.STACKOVERFLOW;
		}
		if (urlLower.includes('twitter.com') || urlLower.includes('linkedin.com') || urlLower.includes('facebook.com')) {
			return LinkCategory.SOCIAL;
		}
		if (this.isDocumentationSite(urlLower)) {
			return LinkCategory.DOCUMENTATION;
		}
		if (this.isArticleSite(urlLower)) {
			return LinkCategory.ARTICLE;
		}
		
		return LinkCategory.OTHER;
	}

	/**
	 * Check if URL is a documentation site
	 */
	private isDocumentationSite(url: string): boolean {
		const docPatterns = [
			'docs.', 'documentation.', 'api.', 'developer.',
			'/docs/', '/documentation/', '/api/', '/guide/',
			'readthedocs.', 'gitbook.', 'notion.site'
		];
		return docPatterns.some(pattern => url.includes(pattern));
	}

	/**
	 * Check if URL is an article site
	 */
	private isArticleSite(url: string): boolean {
		const articlePatterns = [
			'medium.com', 'dev.to', 'hashnode.com', 'substack.com',
			'blog.', 'news.', 'article.', '/blog/', '/articles/',
			'wikipedia.org'
		];
		return articlePatterns.some(pattern => url.includes(pattern));
	}

	/**
	 * Get icon for link category
	 */
	private getIconForCategory(category: LinkCategory): string {
		const iconMap = {
			[LinkCategory.YOUTUBE]: '📺',
			[LinkCategory.REDDIT]: '🔗',
			[LinkCategory.GITHUB]: '💻',
			[LinkCategory.STACKOVERFLOW]: '❓',
			[LinkCategory.ARTICLE]: '📖',
			[LinkCategory.DOCUMENTATION]: '📚',
			[LinkCategory.SOCIAL]: '👥',
			[LinkCategory.TOOL]: '🔧',
			[LinkCategory.OTHER]: '🌐'
		};
		return iconMap[category];
	}

	/**
	 * Fetch page metadata (with fallbacks for different sites)
	 */
	private async fetchPageMetadata(url: string, category: LinkCategory): Promise<{
		title?: string;
		description?: string;
		previewData?: LinkPreviewData;
	}> {
		try {
			// For specific categories, use specialized extraction
			switch (category) {
				case LinkCategory.YOUTUBE:
					return await this.extractYouTubeMetadata(url);
				case LinkCategory.REDDIT:
					return await this.extractRedditMetadata(url);
				case LinkCategory.GITHUB:
					return await this.extractGitHubMetadata(url);
				default:
					return await this.extractGenericMetadata(url);
			}
		} catch (error) {
			console.warn('Failed to fetch metadata for:', url, error);
			return {};
		}
	}

	/**
	 * Extract YouTube video metadata
	 */
	private async extractYouTubeMetadata(url: string): Promise<{
		title?: string;
		description?: string;
		previewData?: LinkPreviewData;
	}> {
		// Extract video ID from URL
		const videoId = this.extractYouTubeVideoId(url);
		if (!videoId) {
			return { title: 'YouTube Video' };
		}

		try {
			// Try to get title from the URL page (basic approach)
			const response = await requestUrl({ url, method: 'GET' });
			const html = response.text;
			
			const titleMatch = html.match(/<title>(.*?)<\/title>/i);
			let title = titleMatch ? titleMatch[1].replace(' - YouTube', '') : 'YouTube Video';
			
			// Clean up YouTube title
			title = title.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
			
			return {
				title,
				description: 'YouTube video',
				previewData: {
					thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
					author: 'YouTube'
				}
			};
		} catch (error) {
			return { title: 'YouTube Video' };
		}
	}

	/**
	 * Extract Reddit post metadata
	 */
	private async extractRedditMetadata(url: string): Promise<{
		title?: string;
		description?: string;
	}> {
		try {
			// Add .json to Reddit URL to get JSON response
			const jsonUrl = url.replace(/\/$/, '') + '.json';
			const response = await requestUrl({ url: jsonUrl });
			const data = response.json;
			
			if (data && data[0] && data[0].data && data[0].data.children && data[0].data.children[0]) {
				const post = data[0].data.children[0].data;
				return {
					title: post.title || 'Reddit Post',
					description: `r/${post.subreddit} • ${post.score} upvotes`
				};
			}
		} catch (error) {
			// Fallback to basic title extraction
		}
		
		return { title: 'Reddit Post' };
	}

	/**
	 * Extract GitHub repository metadata
	 */
	private async extractGitHubMetadata(url: string): Promise<{
		title?: string;
		description?: string;
	}> {
		// Extract repo info from URL
		const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
		if (!match) {
			return { title: 'GitHub Link' };
		}
		
		const [, owner, repo] = match;
		return {
			title: `${owner}/${repo}`,
			description: 'GitHub Repository'
		};
	}

	/**
	 * Extract generic page metadata
	 */
	private async extractGenericMetadata(url: string): Promise<{
		title?: string;
		description?: string;
	}> {
		try {
			const response = await requestUrl({ 
				url, 
				method: 'GET',
				headers: {
					'User-Agent': 'Mozilla/5.0 (compatible; Crystal Boards Link Preview)'
				}
			});
			
			const html = response.text;
			
			// Extract title
			const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
			let title = titleMatch ? titleMatch[1].trim() : undefined;
			
			// Extract meta description
			const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)/i);
			const description = descMatch ? descMatch[1].trim() : undefined;
			
			// Clean up title
			if (title) {
				title = title.replace(/&quot;/g, '"')
					.replace(/&#39;/g, "'")
					.replace(/&amp;/g, '&')
					.replace(/&lt;/g, '<')
					.replace(/&gt;/g, '>');
			}
			
			return { title, description };
		} catch (error) {
			return {};
		}
	}

	/**
	 * Generate smart title based on URL and category
	 */
	private generateSmartTitle(url: string, category: LinkCategory): string {
		const domain = this.extractDomain(url);
		
		switch (category) {
			case LinkCategory.YOUTUBE:
				return 'YouTube Video';
			case LinkCategory.REDDIT:
				return 'Reddit Post';
			case LinkCategory.GITHUB:
				// Try to extract repo name from URL
				const match = url.match(/github\.com\/[^\/]+\/([^\/]+)/);
				return match ? `GitHub: ${match[1]}` : 'GitHub Repository';
			case LinkCategory.STACKOVERFLOW:
				return 'Stack Overflow Question';
			default:
				return `Link from ${domain}`;
		}
	}

	/**
	 * Create basic metadata as fallback
	 */
	private createBasicMetadata(url: string, existingTitle?: string): LinkMetadata {
		const category = this.categorizeUrl(url);
		const domain = this.extractDomain(url);
		
		return {
			title: existingTitle || this.generateSmartTitle(url, category),
			description: `Link from ${domain}`,
			category,
			icon: this.getIconForCategory(category),
			domain,
			originalUrl: url
		};
	}

	/**
	 * Extract domain from URL
	 */
	private extractDomain(url: string): string {
		try {
			const urlObj = new URL(url);
			return urlObj.hostname.replace('www.', '');
		} catch {
			return 'unknown';
		}
	}

	/**
	 * Extract YouTube video ID from URL
	 */
	private extractYouTubeVideoId(url: string): string | null {
		const patterns = [
			/(?:youtube\.com\/watch\?v=)([^&\n?#]+)/,
			/(?:youtu\.be\/)([^&\n?#]+)/,
			/(?:youtube\.com\/embed\/)([^&\n?#]+)/
		];
		
		for (const pattern of patterns) {
			const match = url.match(pattern);
			if (match) {
				return match[1];
			}
		}
		
		return null;
	}

	/**
	 * Convert enhanced URL to ResearchUrl format
	 */
	createResearchUrl(metadata: LinkMetadata): ResearchUrl {
		return {
			id: `url-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
			title: `${metadata.icon} ${metadata.title}`,
			url: metadata.originalUrl,
			description: metadata.description,
			created: Date.now()
		};
	}

	/**
	 * Batch enhance multiple URLs
	 */
	async enhanceUrls(urls: { url: string; title?: string }[]): Promise<LinkMetadata[]> {
		const promises = urls.map(({ url, title }) => 
			this.enhanceUrl(url, title).catch(error => {
				console.warn('Failed to enhance URL:', url, error);
				return this.createBasicMetadata(url, title);
			})
		);
		
		return Promise.all(promises);
	}

	/**
	 * Clear cache (for testing or memory management)
	 */
	clearCache(): void {
		this.cache.clear();
	}
}