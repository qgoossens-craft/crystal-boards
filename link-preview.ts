import { App } from 'obsidian';
import { LinkManager, LinkMetadata } from './link-manager';

export class LinkPreviewManager {
	private app: App;
	private linkManager: LinkManager;
	private previewCache: Map<string, HTMLElement> = new Map();

	constructor(app: App, linkManager: LinkManager) {
		this.app = app;
		this.linkManager = linkManager;
	}

	/**
	 * Add hover preview to an element containing a URL
	 */
	addHoverPreview(element: HTMLElement, url: string): void {
		let hoverTimeout: NodeJS.Timeout | null = null;
		let previewEl: HTMLElement | null = null;

		const showPreview = async () => {
			try {
				// Get enhanced metadata for the URL
				const metadata = await this.linkManager.enhanceUrl(url);
				
				// Create or get cached preview element
				previewEl = await this.createPreviewElement(metadata);
				
				// Position the preview
				this.positionPreview(previewEl, element);
				
				// Add to DOM
				document.body.appendChild(previewEl);
				
				// Animate in
				previewEl.classList.add('crystal-link-preview-visible');
				
			} catch (error) {
				console.warn('Failed to create link preview:', error);
			}
		};

		const hidePreview = () => {
			if (hoverTimeout) {
				clearTimeout(hoverTimeout);
				hoverTimeout = null;
			}
			
			if (previewEl) {
				previewEl.classList.remove('crystal-link-preview-visible');
				setTimeout(() => {
					if (previewEl && previewEl.parentNode) {
						previewEl.parentNode.removeChild(previewEl);
					}
				}, 200); // Match CSS transition duration
				previewEl = null;
			}
		};

		// Add event listeners
		element.addEventListener('mouseenter', () => {
			hoverTimeout = setTimeout(showPreview, 500); // 500ms delay
		});

		element.addEventListener('mouseleave', hidePreview);
		
		// Also hide on scroll or click
		window.addEventListener('scroll', hidePreview, { passive: true });
		element.addEventListener('click', hidePreview);
	}

	/**
	 * Create preview element for a URL
	 */
	private async createPreviewElement(metadata: LinkMetadata): Promise<HTMLElement> {
		// Check cache first
		const cacheKey = metadata.originalUrl;
		if (this.previewCache.has(cacheKey)) {
			return this.previewCache.get(cacheKey)!.cloneNode(true) as HTMLElement;
		}

		const preview = document.createElement('div');
		preview.className = 'crystal-link-preview';

		// Preview header with icon and category
		const header = preview.createEl('div', { cls: 'crystal-preview-header' });
		
		const categoryBadge = header.createEl('span', { 
			cls: 'crystal-preview-category',
			text: `${metadata.icon} ${metadata.category}`
		});
		
		const domain = header.createEl('span', { 
			cls: 'crystal-preview-domain',
			text: metadata.domain
		});

		// Title
		const title = preview.createEl('h3', { 
			cls: 'crystal-preview-title',
			text: metadata.title
		});

		// Description
		if (metadata.description) {
			const description = preview.createEl('p', { 
				cls: 'crystal-preview-description',
				text: metadata.description
			});
		}

		// Preview data (thumbnails, author info, etc.)
		if (metadata.previewData) {
			this.addPreviewData(preview, metadata);
		}

		// Actions
		const actions = preview.createEl('div', { cls: 'crystal-preview-actions' });
		
		const openBtn = actions.createEl('button', {
			cls: 'crystal-preview-action',
			text: '🔗 Open Link'
		});
		openBtn.onclick = () => {
			window.open(metadata.originalUrl, '_blank');
		};

		// Cache the preview
		this.previewCache.set(cacheKey, preview.cloneNode(true) as HTMLElement);

		return preview;
	}

	/**
	 * Add preview-specific data (thumbnails, metadata, etc.)
	 */
	private addPreviewData(preview: HTMLElement, metadata: LinkMetadata): void {
		if (!metadata.previewData) return;

		const previewData = preview.createEl('div', { cls: 'crystal-preview-data' });

		// Thumbnail for videos/images
		if (metadata.previewData.thumbnail) {
			const thumbnail = previewData.createEl('img', {
				cls: 'crystal-preview-thumbnail',
				attr: {
					src: metadata.previewData.thumbnail,
					alt: 'Preview thumbnail',
					loading: 'lazy'
				}
			});
			
			// Handle image load errors
			thumbnail.onerror = () => {
				thumbnail.style.display = 'none';
			};
		}

		// Author info
		if (metadata.previewData.author) {
			const authorInfo = previewData.createEl('div', { cls: 'crystal-preview-meta' });
			authorInfo.createEl('span', { text: `By ${metadata.previewData.author}` });
		}

		// Duration for videos
		if (metadata.previewData.duration) {
			const metaInfo = previewData.querySelector('.crystal-preview-meta') || 
							 previewData.createEl('div', { cls: 'crystal-preview-meta' });
			metaInfo.createEl('span', { text: `Duration: ${metadata.previewData.duration}` });
		}

		// Reading time for articles
		if (metadata.previewData.readingTime) {
			const metaInfo = previewData.querySelector('.crystal-preview-meta') || 
							 previewData.createEl('div', { cls: 'crystal-preview-meta' });
			metaInfo.createEl('span', { text: `${metadata.previewData.readingTime} read` });
		}

		// Tags
		if (metadata.previewData.tags && metadata.previewData.tags.length > 0) {
			const tagsContainer = previewData.createEl('div', { cls: 'crystal-preview-tags' });
			metadata.previewData.tags.slice(0, 5).forEach(tag => {
				tagsContainer.createEl('span', { 
					cls: 'crystal-preview-tag',
					text: tag
				});
			});
		}
	}

	/**
	 * Position the preview relative to the target element
	 */
	private positionPreview(preview: HTMLElement, target: HTMLElement): void {
		const targetRect = target.getBoundingClientRect();
		const viewportWidth = window.innerWidth;
		const viewportHeight = window.innerHeight;
		
		// Default positioning
		let left = targetRect.left;
		let top = targetRect.bottom + 10;

		// Adjust if preview would go off screen horizontally
		const previewWidth = 320; // Default width from CSS
		if (left + previewWidth > viewportWidth - 20) {
			left = viewportWidth - previewWidth - 20;
		}
		if (left < 20) {
			left = 20;
		}

		// Adjust if preview would go off screen vertically
		const previewHeight = 200; // Approximate height
		if (top + previewHeight > viewportHeight - 20) {
			top = targetRect.top - previewHeight - 10;
		}
		if (top < 20) {
			top = 20;
		}

		preview.style.left = `${left}px`;
		preview.style.top = `${top}px`;
	}

	/**
	 * Clear the preview cache (for memory management)
	 */
	clearCache(): void {
		this.previewCache.clear();
	}

	/**
	 * Create a simple link preview for cards in board view
	 */
	createInlinePreview(metadata: LinkMetadata): HTMLElement {
		const preview = document.createElement('div');
		preview.className = 'crystal-inline-link-preview';

		// Icon and title
		const header = preview.createEl('div', { cls: 'crystal-inline-header' });
		header.createEl('span', { 
			cls: 'crystal-inline-icon',
			text: metadata.icon
		});
		header.createEl('span', { 
			cls: 'crystal-inline-title',
			text: metadata.title
		});

		// Domain
		preview.createEl('div', { 
			cls: 'crystal-inline-domain',
			text: metadata.domain
		});

		// Make clickable
		preview.onclick = () => {
			window.open(metadata.originalUrl, '_blank');
		};

		return preview;
	}
}