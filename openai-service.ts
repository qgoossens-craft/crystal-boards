import { requestUrl, RequestUrlParam } from 'obsidian';
import { ExtractedTask } from './types';

export interface TaskAnalysis {
	context: string;
	description: string;
	nextSteps: string[];
	suggestedSearchQueries?: string[];

}

export interface OpenAIConfig {
	apiKey: string;
	model: 'gpt-3.5-turbo' | 'gpt-4' | 'gpt-4-turbo' | 'gpt-4o' | 'gpt-4o-mini' | 'gpt-4.1' | 'gpt-4.1-mini' | 'gpt-4.1-nano' | 'gpt-5' | 'gpt-5-mini' | 'gpt-5-nano' | 'o3' | 'o3-mini' | 'o1' | 'o1-mini';
	maxTokens: number;
	temperature: number;
}

export class OpenAIService {
	private config: OpenAIConfig;
	private apiEndpoint = 'https://api.openai.com/v1/chat/completions';

	constructor(config: OpenAIConfig) {
		this.config = config;
	}

	/**
	 * Analyze a task using OpenAI to generate context, description, and next steps
	 */
	async analyzeTask(task: ExtractedTask, urlContent?: string): Promise<TaskAnalysis> {
		const prompt = this.buildTaskAnalysisPrompt(task, urlContent);
		
		try {
			const response = await this.callOpenAI(prompt);
			return this.parseTaskAnalysis(response);
		} catch (error) {
			console.error('OpenAI task analysis failed:', error);
			throw new Error(`Failed to analyze task: ${error.message}`);
		}
	}

	/**
	 * Summarize URL content for task context
	 */
	async summarizeURL(url: string, content: string): Promise<string> {
		const prompt = `Extract and summarize the key information from this webpage. Focus on specific details useful for task planning.

URL: ${url}
Content: ${content}

Instructions:
- Extract the main topic, purpose, or subject matter
- Identify specific details, requirements, or actionable items  
- Include relevant names, dates, technologies, or concrete information
- Avoid generic descriptions - be specific about actual content
- If it's a discussion/post, include main points discussed
- Keep concise but informative (2-4 sentences)

Summary:`;

		try {
			const response = await this.callOpenAI(prompt, false); // Don't require JSON for URL summarization
			return response.trim();
		} catch (error) {
			console.error('URL summarization failed:', error);
			return `Unable to summarize content from ${url}: ${error.message}`;
		}
	}

	/**
	 * Build the prompt for task analysis
	 */
	private buildTaskAnalysisPrompt(task: ExtractedTask, urlContent?: string): string {
		// Check if the task is a question
		const isQuestion = this.isQuestion(task.cleanText);
		
		let prompt = `You are an intelligent task assistant. Analyze this task and provide structured insights based on all available information.

Task: "${task.cleanText}"
Tags: ${task.tags.length > 0 ? task.tags.join(', ') : 'none'}
Type: ${isQuestion ? 'QUESTION - Provide a direct answer' : 'TASK'}`;

		if (urlContent) {
			prompt += `

Related Content from URL:
${urlContent}`;
		}

		// Different prompt structure for questions vs regular tasks
		if (isQuestion) {
			prompt += `

This is a QUESTION that needs answering. Based on ${urlContent ? 'the URL content and your knowledge' : 'your knowledge'}, provide:

{
  "context": "One clear sentence explaining the topic of this question",
  "description": "A comprehensive 3-5 sentence answer to the question. Be specific and informative. Include key facts and insights.",
  "nextSteps": [
    "Research task 1: Specific area to explore further",
    "Action task 2: Practical step to apply this knowledge", 
    "Learning task 3: Related topic to investigate",
    "Implementation task 4: How to use this information",
    "Verification task 5: How to validate or test this knowledge"
  ],
  "suggestedSearchQueries": [
    "Specific search query 1 for more information",
    "Specific search query 2 for practical examples",
    "Specific search query 3 for related topics"
  ],

}

Guidelines for QUESTIONS:
- Provide a direct, informative answer in the description
- Generate 5 specific follow-up tasks related to the question topic
- Suggest search queries that would find authoritative sources
- Focus on educational value and practical application
- If you don't have enough information, acknowledge it and suggest research steps`;
		} else {
			prompt += `

Based on the task description ${urlContent ? 'and the URL content above' : ''}, provide your analysis in JSON format:

{
  "context": "One clear sentence explaining what this task involves",
  "description": "2-3 sentences describing the specific purpose, scope, and expected outcome based on ${urlContent ? 'both the task and URL content' : 'the task description'}",
  "nextSteps": [
    "Specific actionable step 1",
    "Specific actionable step 2", 
    "Specific actionable step 3"
  ],

}

Guidelines:
- Use the URL content to provide specific, detailed insights rather than generic descriptions
- Make the context and description highly specific to what was actually found in the content
- Create actionable next steps that reflect the actual content and requirements

- If the URL content is substantial, prioritize it over generic task interpretation
- Respond with valid JSON only`;
		}

		prompt += `

Guidelines:
- Use the URL content to provide specific, detailed insights rather than generic descriptions
- Make the context and description highly specific to what was actually found in the content
- Create actionable next steps that reflect the actual content and requirements

- If the URL content is substantial, prioritize it over generic task interpretation
- Respond with valid JSON only`;

		return prompt;
	}

	private isQuestion(text: string): boolean {
		// Check if the text is a question
		const questionWords = ['what', 'where', 'when', 'why', 'how', 'who', 'which', 'whom', 'whose', 
							   'can', 'could', 'would', 'should', 'is', 'are', 'do', 'does', 'did', 
							   'will', 'shall', 'may', 'might'];
		
		const trimmedText = text.trim().toLowerCase();
		
		// Check if it ends with a question mark
		if (text.trim().endsWith('?')) {
			return true;
		}
		
		// Check if it starts with a question word
		for (const word of questionWords) {
			if (trimmedText.startsWith(word + ' ')) {
				return true;
			}
		}
		
		return false;
	}

	/**
	 * Make API call to OpenAI
	 */
	async callOpenAI(prompt: string, requireJson = true): Promise<string> {
		if (!this.config.apiKey) {
			throw new Error('OpenAI API key not configured');
		}

		if (!this.config.apiKey.startsWith('sk-')) {
			throw new Error('Invalid API key format - OpenAI keys should start with "sk-"');
		}

		console.log('Making OpenAI API call with model:', this.config.model);
		console.log('API key present:', this.config.apiKey ? 'Yes' : 'No');
		console.log('API key format valid:', this.config.apiKey.startsWith('sk-') ? 'Yes' : 'No');

		const requestParams: RequestUrlParam = {
			url: this.apiEndpoint,
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${this.config.apiKey}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				model: this.config.model,
				messages: [
					{
						role: 'system',
						content: 'You are a helpful assistant that analyzes tasks and provides structured, actionable insights.'
					},
					{
						role: 'user',
						content: prompt
					}
				],
				max_tokens: this.config.maxTokens,
				temperature: this.config.temperature,
				...(requireJson ? { response_format: { type: "json_object" } } : {})
			})
		};

		try {
			console.log('Sending request to OpenAI...');
			const response = await requestUrl(requestParams);
			console.log('OpenAI response status:', response.status);
			
			if (response.status !== 200) {
				console.error('OpenAI API error response:', response.text);
				
				// Try to parse error details
				let errorMessage = `OpenAI API error: ${response.status}`;
				try {
					const errorData = response.json;
					if (errorData?.error?.message) {
						errorMessage = errorData.error.message;
					} else if (errorData?.error?.code) {
						errorMessage = `${errorData.error.code}: ${errorData.error.type || 'Unknown error'}`;
					}
				} catch (e) {
					console.error('Could not parse error response:', e);
				}
				
				throw new Error(errorMessage);
			}

			const data = response.json;
			console.log('OpenAI response received, choices count:', data.choices?.length || 0);
			
			if (!data.choices || data.choices.length === 0) {
				throw new Error('No response from OpenAI');
			}

			return data.choices[0].message.content;
		} catch (error) {
			console.error('OpenAI API call failed:', error);
			
			if (error.message.includes('401')) {
				throw new Error('Invalid API key - please check your OpenAI API key');
			} else if (error.message.includes('429')) {
				throw new Error('Rate limit exceeded. Please try again later.');
			} else if (error.message.includes('503')) {
				throw new Error('OpenAI service is temporarily unavailable. Please try again in a few minutes.');
			} else if (error.message.includes('500')) {
				throw new Error('OpenAI server error. Please try again later.');
			} else if (error.message.includes('insufficient_quota')) {
				throw new Error('OpenAI API quota exceeded - please check your billing');
			} else if (error.message.includes('model_not_found')) {
				throw new Error(`Model "${this.config.model}" not found. Please select a different model.`);
			} else if (error.message.includes('NetworkError') || error.message.includes('fetch')) {
				throw new Error('Network error - please check your internet connection');
			}
			
			// Re-throw the error with the original message if no specific handling
			throw new Error(error.message || 'Unknown API error');
		}
	}

	/**
	 * Parse the OpenAI response into TaskAnalysis
	 */
	private parseTaskAnalysis(response: string): TaskAnalysis {
		try {
			const parsed = JSON.parse(response);
			
			// Validate and sanitize the response
			return {
				context: parsed.context || 'Task context unclear',
				description: parsed.description || 'No description generated',
				nextSteps: Array.isArray(parsed.nextSteps) ? parsed.nextSteps.slice(0, 5) : [],
				suggestedSearchQueries: Array.isArray(parsed.suggestedSearchQueries) ? parsed.suggestedSearchQueries : [],

			};
		} catch (error) {
			console.error('Failed to parse OpenAI response:', response);
			throw new Error('Invalid response format from OpenAI');
		}
	}

	/**
	 * Test the API connection
	 */
	async testConnection(): Promise<boolean> {
		try {
			console.log('Testing OpenAI connection...');
			console.log('Using model:', this.config.model);
			console.log('Max tokens:', this.config.maxTokens);
			
			const response = await this.callOpenAI('Respond with valid JSON containing only: {"status": "ok", "message": "Connection test successful"}');
			
			console.log('Test response received:', response);
			
			// Try to parse the response
			const parsed = JSON.parse(response);
			const success = parsed.status === 'ok' || response.toLowerCase().includes('ok') || response.toLowerCase().includes('success');
			
			console.log('Connection test result:', success ? 'SUCCESS' : 'FAILED');
			return success;
		} catch (error) {
			console.error('OpenAI connection test failed with error:', error);
			console.error('Error details:', {
				message: error.message,
				name: error.name,
				stack: error.stack
			});
			return false;
		}
	}

	/**
	 * Update configuration
	 */
	/**
	 * Analyze YouTube video content with specialized prompts
	 */
	/**
	 * Analyze YouTube video using OpenAI Vision (GPT-4V) as primary method
	 * This method extracts key frames from the video and uses vision models for analysis
	 */
	/**
	 * Enhanced YouTube analysis using Innertube API for transcript extraction
	 * This method gets actual transcript data and provides detailed, actionable insights
	 */
	async analyzeYouTubeVideoWithInnertube(params: {
		videoId: string;
		metadata: any;
		task: string;
		fallbackContent?: string;
	}): Promise<TaskAnalysis & { keyTakeaways?: string[]; analysisMethod: string; transcript?: string }> {
		const { videoId, metadata, task, fallbackContent } = params;
		
		console.log('[DEBUG] Starting Innertube API analysis for YouTube video');
		
		try {
			// Step 1: Extract transcript using Innertube API
			const transcriptData = await this.extractTranscriptViaInnertube(videoId);
			
			if (transcriptData && transcriptData.segments && transcriptData.segments.length > 0) {
				console.log(`[DEBUG] Successfully extracted ${transcriptData.segments.length} transcript segments`);
				
				// Step 2: Analyze transcript with specialized AI prompts
				const analysis = await this.analyzeTranscriptContent({
					transcript: transcriptData.fullText,
					segments: transcriptData.segments,
					metadata,
					task
				});
				
				return {
					...analysis,
					analysisMethod: 'innertube_transcript',
					transcript: transcriptData.fullText
				};
				
			} else {
				console.warn('[DEBUG] No transcript available via Innertube, falling back to rich content');
				throw new Error('No transcript available');
			}
			
		} catch (error) {
			console.warn('[DEBUG] Innertube analysis failed:', error.message);
			console.log('[DEBUG] Falling back to rich content analysis');
			
			// Fall back to existing rich content analysis
			const fallbackAnalysis = await this.analyzeYouTubeVideo({
				transcript: fallbackContent || '',
				metadata: metadata || { title: null, channel: null },
				task,
				hasTranscript: false,
				transcriptReason: 'Innertube extraction failed, using fallback method',
				analysisType: 'rich_content',
				contentRichness: metadata?.contentRichness || 2
			});

			return {
				...fallbackAnalysis,
				analysisMethod: 'fallback'
			};
		}
	}

	/**
	 * Extract transcript using YouTube's Innertube API
	 * Based on the 2025 working method using Android client spoofing
	 */
	private async extractTranscriptViaInnertube(videoId: string): Promise<{
		fullText: string;
		segments: Array<{
			text: string;
			startTime: number;
			endTime: number;
		}>;
	} | null> {
		try {
			console.log(`[DEBUG] Extracting transcript via Innertube API for video: ${videoId}`);
			
			// Step 1: Get the INNERTUBE_API_KEY from the video page
			const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
			// Use Obsidian's requestUrl to bypass CORS in Electron environment
			const pageResponse = await (global as any).requestUrl({
				url: videoUrl,
				method: 'GET',
				headers: {
					'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
				}
			});
			
			if (pageResponse.status !== 200) {
				throw new Error(`Failed to fetch video page: ${pageResponse.status}`);
			}
			
			const html = pageResponse.text;
			const apiKeyMatch = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
			
			if (!apiKeyMatch) {
				throw new Error('INNERTUBE_API_KEY not found in page');
			}
			
			const apiKey = apiKeyMatch[1];
			console.log('[DEBUG] Successfully extracted Innertube API key');
			
			// Step 2: Call the player API with Android client context
			const playerEndpoint = `https://www.youtube.com/youtubei/v1/player?key=${apiKey}`;
			const playerBody = {
				context: {
					client: {
						clientName: "ANDROID",
						clientVersion: "20.10.38"
					}
				},
				videoId: videoId
			};
			
			const playerResponse = await (global as any).requestUrl({
				url: playerEndpoint,
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'User-Agent': 'com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip'
				},
				body: JSON.stringify(playerBody)
			});
			
			if (playerResponse.status !== 200) {
				throw new Error(`Player API request failed: ${playerResponse.status}`);
			}
			
			const playerData = playerResponse.json;
			console.log('[DEBUG] Successfully called Innertube player API');
			
			// Step 3: Extract caption tracks
			const tracks = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
			if (!tracks || tracks.length === 0) {
				throw new Error('No caption tracks found in player response');
			}
			
			// Find English track (or first available)
			let track = tracks.find((t: any) => t.languageCode === 'en');
			if (!track) {
				track = tracks[0]; // Use first available language
				console.log(`[DEBUG] English not available, using: ${track.languageCode}`);
			}
			
			// Step 4: Fetch and parse the caption XML
			let baseUrl = track.baseUrl;
			// Remove fmt parameter if present to get raw XML
			baseUrl = baseUrl.replace(/&fmt=\w+$/, '');
			
			console.log('[DEBUG] Fetching caption XML from:', baseUrl.substring(0, 100) + '...');
			
			const captionResponse = await (global as any).requestUrl({
				url: baseUrl,
				method: 'GET',
				headers: {
					'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
				}
			});
			
			if (captionResponse.status !== 200) {
				throw new Error(`Caption fetch failed: ${captionResponse.status}`);
			}
			
			const xml = captionResponse.text;
			console.log(`[DEBUG] Successfully fetched caption XML (${xml.length} characters)`);
			
			// Step 5: Parse XML and extract segments
			return this.parseInnertubeTranscriptXML(xml);
			
		} catch (error) {
			console.error('[DEBUG] Innertube transcript extraction failed:', error.message);
			return null;
		}
	}

	/**
	 * Parse Innertube transcript XML into structured segments
	 */
	private parseInnertubeTranscriptXML(xml: string): {
		fullText: string;
		segments: Array<{
			text: string;
			startTime: number;
			endTime: number;
		}>;
	} | null {
		try {
			// Extract text segments from XML
			// Format: <text start="1.2" dur="2.5">Hello world</text>
			const textMatches = xml.match(/<text[^>]*start="([^"]*)"[^>]*dur="([^"]*)"[^>]*>([^<]*)<\/text>/g);
			
			if (!textMatches || textMatches.length === 0) {
				console.log('[DEBUG] No text segments found in XML');
				return null;
			}
			
			const segments = [];
			let fullText = '';
			
			for (const match of textMatches) {
				const segmentMatch = match.match(/<text[^>]*start="([^"]*)"[^>]*dur="([^"]*)"[^>]*>([^<]*)<\/text>/);
				
				if (segmentMatch) {
					const startTime = parseFloat(segmentMatch[1]);
					const duration = parseFloat(segmentMatch[2]);
					const text = this.decodeHtmlEntities(segmentMatch[3].trim());
					
					if (text && text.length > 0) {
						segments.push({
							text: text,
							startTime: startTime,
							endTime: startTime + duration
						});
						fullText += (fullText ? ' ' : '') + text;
					}
				}
			}
			
			console.log(`[DEBUG] Parsed ${segments.length} transcript segments, total text: ${fullText.length} characters`);
			
			return {
				fullText: fullText,
				segments: segments
			};
			
		} catch (error) {
			console.error('[DEBUG] Failed to parse Innertube XML:', error);
			return null;
		}
	}

	/**
	 * Decode HTML entities in transcript text
	 */
	private decodeHtmlEntities(text: string): string {
		const entityMap: { [key: string]: string } = {
			'&amp;': '&',
			'&lt;': '<',
			'&gt;': '>',
			'&quot;': '"',
			'&#39;': "'",
			'&apos;': "'"
		};
		
		return text.replace(/&(?:amp|lt|gt|quot|#39|apos);/g, match => entityMap[match] || match);
	}

	/**
	 * Analyze transcript content with intelligent, context-aware AI prompts
	 * Provides specific, actionable insights based on video content type
	 */
	/**
	 * Analyze transcript content with intelligent, context-aware AI prompts
	 * Provides specific, actionable insights based on video content type
	 */
	private async analyzeTranscriptContent(params: {
		transcript: string;
		segments: Array<{ text: string; startTime: number; endTime: number }>;
		metadata: any;
		task: string;
	}): Promise<TaskAnalysis & { keyTakeaways?: string[]; specificTools?: string[] }> {
		const { transcript, segments, metadata, task } = params;
		
		// Detect video type for specialized analysis
		const videoType = this.detectVideoType(transcript, metadata || {});
		console.log(`[DEBUG] Detected video type: ${videoType}`);
		
		// Create context-specific prompt
		const prompt = this.buildIntelligentPrompt(videoType, transcript, metadata || {}, task);
		
		try {
			// Use Obsidian's requestUrl to avoid CORS issues
			const response = await (global as any).requestUrl({
				url: this.apiEndpoint,
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${this.config.apiKey}`,
				},
				body: JSON.stringify({
					model: this.config.model,
					messages: [
						{
							role: 'user',
							content: prompt
						}
					],
					max_tokens: Math.min(this.config.maxTokens, 2000),
					temperature: 0.2, // Lower temperature for more factual, consistent responses
				})
			});

			if (response.status !== 200) {
				throw new Error(`OpenAI API error: ${response.status}`);
			}

			const data = response.json;
			const content = data.choices[0].message.content;
			
			// Parse structured response
			const parsedResponse = this.parseIntelligentResponse(content, videoType);
			
			// Generate topic-specific URLs if we have specific tools
			let topicUrls: Array<{ url: string; title: string }> = [];
			if (parsedResponse.specificTools && parsedResponse.specificTools.length > 0) {
				topicUrls = await this.generateTopicSpecificUrls(
					parsedResponse.specificTools, 
					parsedResponse.keyTakeaways || []
				);
			}
			
			// Add topic URLs to suggested search queries
			if (topicUrls.length > 0) {
				const existingQueries = parsedResponse.suggestedSearchQueries || [];
				const topicTitles = topicUrls.map(url => url.title);
				parsedResponse.suggestedSearchQueries = [...existingQueries, ...topicTitles];
			}
			
			return {
				...parsedResponse,
				topicUrls // Add this for use in the card generation
			} as any;
			
		} catch (error) {
			console.error('[DEBUG] Intelligent analysis failed:', error);
			// Fallback to basic analysis
			return {
				context: `YouTube Video - ${videoType} Analysis`,
				description: this.truncateAtSentenceEnd(`Analysis of ${(metadata || {}).title || 'YouTube video'} transcript. ${transcript}`, 2000),
				nextSteps: ['Review the full transcript', 'Watch key sections of the video', 'Research related topics'],
				suggestedSearchQueries: [`${(metadata || {}).title || 'video topic'} tutorial`, `${(metadata || {}).channel || 'channel'} similar videos`],
				keyTakeaways: [],
				specificTools: []
			};
		}
	}

	/**
	 * Detect video type based on transcript content and metadata
	 */
	private detectVideoType(transcript: string, metadata: any): string {
		const text = (transcript + ' ' + ((metadata || {}).title || '') + ' ' + ((metadata || {}).description || '')).toLowerCase();
		
		// Technical tutorials
		if (text.match(/(tutorial|how to|step by step|install|setup|configure|guide)/)) {
			if (text.match(/(terminal|command|cli|bash|shell|code|programming|development)/)) {
				return 'technical_tutorial';
			}
			return 'tutorial';
		}
		
		// Lectures and educational content
		if (text.match(/(lecture|course|lesson|learn|education|explain|concept|theory)/)) {
			return 'educational';
		}
		
		// Reviews and comparisons
		if (text.match(/(review|comparison|vs|better|worse|pros|cons|recommend)/)) {
			return 'review';
		}
		
		// Presentations and talks
		if (text.match(/(presentation|talk|conference|keynote|demo|show)/)) {
			return 'presentation';
		}
		
		// News and updates
		if (text.match(/(news|update|announcement|release|breaking|latest)/)) {
			return 'news';
		}
		
		return 'general';
	}

	/**
	 * Build intelligent, context-aware prompts based on video type
	 */
	/**
	 * Build intelligent, context-aware prompts based on video type
	 */
	private buildIntelligentPrompt(videoType: string, transcript: string, metadata: any, task: string): string {
		const baseInfo = `
Video: ${(metadata || {}).title || 'YouTube Video'}
Channel: ${(metadata || {}).channel || 'Unknown'}
User's Interest: ${task}
Duration: ${(metadata || {}).duration || 'Unknown'}

Transcript:
${transcript.length > 8000 ? transcript.substring(0, 8000) + '...' : transcript}
`;

		const formattingInstructions = `

CRITICAL FORMATTING REQUIREMENTS:
- Create clean, professional markdown WITHOUT excessive line breaks
- Use exactly ONE blank line between sections (not multiple \\n\\n)
- Structure content logically with clear, concise headers
- Use bullet points (•) for lists, keeping them tight and readable
- NO redundant "Research Summary" or analysis method labels in content
- Keep descriptions concise and well-structured
- Use proper markdown syntax: ## for headers, • for bullets, \`code\` for commands
- Focus on actionable, specific information rather than verbose explanations`;

		switch (videoType) {
			case 'technical_tutorial':
				return `${baseInfo}${formattingInstructions}

This appears to be a technical tutorial. Extract and format the following information:

Provide a JSON response with this structure:
{
	"description": "## Overview\\nBrief, clear paragraph about what this tutorial covers and its main goal.\\n\\n## Key Steps\\n• Step 1: Specific action with key tools/commands\\n• Step 2: Specific action with key tools/commands\\n• Step 3: Specific action with key tools/commands\\n\\n## Important Commands\\n• \`command-name\`: Clear purpose and usage\\n• \`another-command\`: Clear purpose and usage\\n\\n## Prerequisites\\n• Required tool or setup item\\n• Required knowledge or skill",
	"keyTakeaways": ["specific technical insight with tool name", "important command or configuration tip", "key concept or best practice"],
	"nextSteps": ["install and configure [specific tool]", "practice [specific skill/command]", "explore [specific advanced topic]"],
	"suggestedSearchQueries": ["[specific tool] documentation", "[tool combination] tutorial", "[advanced concept] guide"],
	"specificTools": ["tool1", "tool2", "framework", "library"],
	"commands": ["exact-command-shown", "configuration-example"],
	"troubleshooting": ["common issue with solution", "potential problem and fix"]
}`;

			case 'tutorial':
				return `${baseInfo}${formattingInstructions}

This is an instructional tutorial. Focus on extracting clear, actionable information:

JSON Response:
{
	"description": "## What You'll Learn\\nClear description of skills and outcomes from this tutorial.\\n\\n## Requirements\\n• Required material or tool\\n• Required skill or setup\\n\\n## Process Highlights\\n• **Step 1**: Key action with specific details\\n• **Step 2**: Key action with specific details\\n• **Step 3**: Key action with specific details\\n\\n## Pro Tips\\n• Important technique or shortcut\\n• Best practice or common mistake to avoid",
	"keyTakeaways": ["main skill with specific tools", "important technique", "key best practice"],
	"nextSteps": ["practice with [specific tool/method]", "try [specific variation/application]", "learn [next level skill]"],
	"suggestedSearchQueries": ["[skill] advanced techniques", "[tool] best practices", "[topic] troubleshooting"],
	"specificTools": ["tool1", "software2", "resource3"]
}`;

			case 'educational':
				return `${baseInfo}${formattingInstructions}

This is educational content. Extract key concepts and practical applications:

JSON Response:
{
	"description": "## Core Concepts\\n• **Concept 1**: Clear, concise explanation\\n• **Concept 2**: Clear, concise explanation\\n\\n## Key Examples\\n• Practical example demonstrating concept A\\n• Real-world application of concept B\\n\\n## Applications\\n• How this applies in [specific context]\\n• Use cases in [specific field/situation]",
	"keyTakeaways": ["key concept with practical example", "important principle with application", "memorable insight with context"],
	"nextSteps": ["explore [specific topic] in depth", "apply [concept] to [specific situation]", "research [related area]"],
	"suggestedSearchQueries": ["[concept] practical applications", "[topic] case studies", "[principle] examples"],
	"specificTools": ["research tool", "methodology", "framework"]
}`;

			case 'review':
				return `${baseInfo}${formattingInstructions}

This is a review or comparison. Extract clear, actionable insights:

JSON Response:
{
	"description": "## What's Reviewed\\nClear identification of product/service and its main purpose.\\n\\n## Key Strengths\\n• Specific strength with evidence\\n• Notable feature with benefit\\n\\n## Main Weaknesses\\n• Specific limitation with context\\n• Area for improvement\\n\\n## Recommendation\\nClear verdict with reasoning and target audience.",
	"keyTakeaways": ["main verdict with specific reasoning", "key strength with evidence", "notable limitation with impact"],
	"nextSteps": ["research [specific alternative]", "compare with [specific competitor]", "test [specific feature]"],
	"suggestedSearchQueries": ["[product] vs [alternative]", "[product] user reviews", "[category] comparison"],
	"specificTools": ["reviewed product", "mentioned alternative", "comparison tool"]
}`;

			default:
				return `${baseInfo}${formattingInstructions}

Analyze this video content and provide clean, actionable insights:

JSON Response:
{
	"description": "## Overview\\nClear, concise summary of the video's main topic and key value.\\n\\n## Key Points\\n• Important insight with specific details\\n• Actionable advice with context\\n• Notable fact or discovery\\n\\n## Practical Applications\\n• How to apply this information\\n• Specific steps or recommendations\\n\\n## Resources Mentioned\\n• **Tool/Resource**: Brief description of relevance\\n• **Reference**: Why it's important",
	"keyTakeaways": ["important insight with specifics", "practical advice with context", "key fact with implications"],
	"nextSteps": ["specific action with named tools", "research [specific topic]", "try [specific approach/method]"],
	"suggestedSearchQueries": ["[specific tool/concept] guide", "[topic] best practices", "[subject] examples"],
	"specificTools": ["tool1", "resource2", "platform3"]
}`;
		}
	}

	/**
	 * Parse the intelligent AI response with robust error handling
	 */
	/**
	 * Parse the intelligent AI response with robust error handling
	 */
	private parseIntelligentResponse(content: string, videoType: string): TaskAnalysis & { 
		keyTakeaways?: string[]; 
		specificTools?: string[];
		commands?: string[];
		troubleshooting?: string[];
		urls?: string[];
	} {
		try {
			// Try to extract JSON from the response
			const jsonMatch = content.match(/\{[\s\S]*\}/);
			let parsedResponse;
			
			if (jsonMatch) {
				try {
					parsedResponse = JSON.parse(jsonMatch[0]);
				} catch (parseError) {
					console.warn('[DEBUG] Failed to parse JSON, trying manual extraction');
					parsedResponse = this.extractResponseFields(content);
				}
			} else {
				parsedResponse = this.extractResponseFields(content);
			}
			
			// Clean up the description formatting
			let cleanDescription = parsedResponse.description || content.substring(0, 2000);
			
			// Remove excessive line breaks and clean up formatting
			cleanDescription = this.cleanUpDescription(cleanDescription);
			
			// Ensure description is properly truncated at sentence boundaries
			const formattedDescription = this.truncateAtSentenceEnd(cleanDescription, 3000);
			
			return {
				context: `YouTube Video Analysis`,
				description: formattedDescription,
				keyTakeaways: parsedResponse.keyTakeaways || [],
				nextSteps: parsedResponse.nextSteps || ['Review the video content', 'Research related topics'],
				suggestedSearchQueries: parsedResponse.suggestedSearchQueries || [],
				specificTools: parsedResponse.specificTools || [],
				commands: parsedResponse.commands || [],
				troubleshooting: parsedResponse.troubleshooting || [],
				urls: parsedResponse.urls || []
			};
			
		} catch (error) {
			console.error('[DEBUG] Response parsing failed:', error);
			const fallbackDescription = this.truncateAtSentenceEnd(content, 2000);
			
			return {
				context: `YouTube Video Analysis`,
				description: this.cleanUpDescription(fallbackDescription),
				keyTakeaways: [],
				nextSteps: ['Review the video content'],
				suggestedSearchQueries: [],
				specificTools: [],
				commands: [],
				troubleshooting: [],
				urls: []
			};
		}
	}

	/**
	 * Clean up description formatting to remove excessive line breaks and improve readability
	 */
	private cleanUpDescription(description: string): string {
		if (!description) return '';
		
		// Remove the problematic "Research Summary" sections that appear in descriptions
		let cleaned = description
			// Remove research summary sections with their markers
			.replace(/\\n\\n📚\s*\*\*Research Summary:\*\*\\n\\n[\s\S]*?(?=\\n\\n##|$)/g, '')
			.replace(/📚\s*\*\*Research Summary:\*\*[\s\S]*?(?=\n\n##|$)/g, '')
			// Remove analysis method indicators from descriptions
			.replace(/🎯\s*\*\*Analysis Method\*\*:\s*[A-Z\s_]+\\n\\n/g, '')
			.replace(/📺\s*YouTube Video Analysis\\n\\n/g, '')
			// Clean up excessive line breaks
			.replace(/\\n\\n\\n+/g, '\\n\\n')
			.replace(/\n\n\n+/g, '\n\n')
			// Remove duplicate headers
			.replace(/##\s*📋\s*Overview\\n\\n##\s*Overview/g, '## Overview')
			.replace(/##\s*Key Steps\\n\\n##\s*Key Steps/g, '## Key Steps')
			// Clean up spacing around headers
			.replace(/\\n\\n##/g, '\\n\\n## ')
			.replace(/\n\n##/g, '\n\n## ')
			// Remove empty bullet points
			.replace(/•\s*\\n/g, '')
			.replace(/•\s*\n/g, '')
			// Clean up spacing
			.replace(/^\s+|\s+$/g, '')
			.trim();
		
		// If the cleaned description is too short or empty, provide a fallback
		if (!cleaned || cleaned.length < 50) {
			cleaned = "## Overview\nYouTube video analysis completed with key insights and actionable information extracted.";
		}
		
		// Ensure proper markdown formatting
		if (!cleaned.startsWith('## ')) {
			cleaned = '## Overview\n' + cleaned;
		}
		
		return cleaned;
	}

	/**
	 * Manual field extraction when JSON parsing fails
	 */
	private extractResponseFields(content: string): any {
		const result: any = {};
		
		// Extract description
		const descMatch = content.match(/description["\s:]*([^"]*(?:"[^"]*"[^"]*)*[^"]*)/i);
		if (descMatch) {
			result.description = descMatch[1].substring(0, 800);
		}
		
		// Extract arrays using regex patterns
		const extractArray = (fieldName: string): string[] => {
			const pattern = new RegExp(`${fieldName}[\\s\\S]*?\\[([\\s\\S]*?)\\]`, 'i');
			const match = content.match(pattern);
			if (match) {
				return match[1]
					.split(/[,\n]/)
					.map(item => item.replace(/^[\s"]*|[\s"]*$/g, ''))
					.filter(item => item.length > 0)
					.slice(0, 5); // Limit to 5 items
			}
			return [];
		};
		
		result.keyTakeaways = extractArray('keyTakeaways');
		result.nextSteps = extractArray('nextSteps');
		result.suggestedSearchQueries = extractArray('suggestedSearchQueries');
		
		return result;
	}

	/**
	 * Generate topic-specific URLs based on tools and technologies mentioned
	 */
	private async generateTopicSpecificUrls(specificTools: string[], keyTakeaways: string[]): Promise<Array<{ url: string; title: string }>> {
		const urls: Array<{ url: string; title: string }> = [];
		
		// Common tool URL mappings
		const toolUrlMap: { [key: string]: { url: string; title: string } } = {
			// Terminal/CLI Tools
			'fzf': { url: 'https://github.com/junegunn/fzf', title: 'fzf - Command-line fuzzy finder' },
			'bat': { url: 'https://github.com/sharkdp/bat', title: 'bat - A cat clone with syntax highlighting' },
			'ripgrep': { url: 'https://github.com/BurntSushi/ripgrep', title: 'ripgrep - Fast text search tool' },
			'rg': { url: 'https://github.com/BurntSushi/ripgrep', title: 'ripgrep - Fast text search tool' },
			'exa': { url: 'https://github.com/ogham/exa', title: 'exa - Modern replacement for ls' },
			'fd': { url: 'https://github.com/sharkdp/fd', title: 'fd - Simple, fast find alternative' },
			'zoxide': { url: 'https://github.com/ajeetdsouza/zoxide', title: 'zoxide - Smarter cd command' },
			'starship': { url: 'https://starship.rs/', title: 'Starship - Cross-shell prompt' },
			'tmux': { url: 'https://github.com/tmux/tmux/wiki', title: 'tmux - Terminal multiplexer' },
			'neovim': { url: 'https://neovim.io/', title: 'Neovim - Hyperextensible Vim-based text editor' },
			'nvim': { url: 'https://neovim.io/', title: 'Neovim - Hyperextensible Vim-based text editor' },
			'vim': { url: 'https://www.vim.org/', title: 'Vim - Text editor' },
			'zsh': { url: 'https://www.zsh.org/', title: 'Zsh - Extended Bourne shell' },
			'fish': { url: 'https://fishshell.com/', title: 'Fish - Smart and user-friendly command line shell' },
			'git': { url: 'https://git-scm.com/', title: 'Git - Version control system' },
			'docker': { url: 'https://docs.docker.com/', title: 'Docker - Containerization platform' },
			'kubernetes': { url: 'https://kubernetes.io/', title: 'Kubernetes - Container orchestration' },
			'k8s': { url: 'https://kubernetes.io/', title: 'Kubernetes - Container orchestration' },
			
			// Fonts
			'iosevka': { url: 'https://typeof.net/Iosevka/', title: 'Iosevka - Versatile typeface for code' },
			'jetbrains mono': { url: 'https://www.jetbrains.com/lp/mono/', title: 'JetBrains Mono - Developer font' },
			'fira code': { url: 'https://github.com/tonsky/FiraCode', title: 'Fira Code - Font with programming ligatures' },
			'cascadia code': { url: 'https://github.com/microsoft/cascadia-code', title: 'Cascadia Code - Microsoft monospaced font' },
			
			// Development Tools
			'vscode': { url: 'https://code.visualstudio.com/', title: 'Visual Studio Code - Code editor' },
			'vs code': { url: 'https://code.visualstudio.com/', title: 'Visual Studio Code - Code editor' },
			'sublime text': { url: 'https://www.sublimetext.com/', title: 'Sublime Text - Text editor' },
			'atom': { url: 'https://atom.io/', title: 'Atom - Hackable text editor' },
			'emacs': { url: 'https://www.gnu.org/software/emacs/', title: 'Emacs - Extensible text editor' },
			'intellij': { url: 'https://www.jetbrains.com/idea/', title: 'IntelliJ IDEA - Java IDE' },
			'pycharm': { url: 'https://www.jetbrains.com/pycharm/', title: 'PyCharm - Python IDE' },
			
			// Package Managers
			'homebrew': { url: 'https://brew.sh/', title: 'Homebrew - macOS package manager' },
			'brew': { url: 'https://brew.sh/', title: 'Homebrew - macOS package manager' },
			'apt': { url: 'https://wiki.debian.org/Apt', title: 'APT - Debian package manager' },
			'yum': { url: 'https://access.redhat.com/documentation/en-us/red_hat_enterprise_linux/6/html/deployment_guide/ch-yum', title: 'YUM - RPM package manager' },
			'pacman': { url: 'https://wiki.archlinux.org/title/Pacman', title: 'Pacman - Arch Linux package manager' },
			'npm': { url: 'https://www.npmjs.com/', title: 'npm - Node.js package manager' },
			'yarn': { url: 'https://yarnpkg.com/', title: 'Yarn - JavaScript package manager' },
			'pip': { url: 'https://pip.pypa.io/', title: 'pip - Python package installer' },
			'cargo': { url: 'https://doc.rust-lang.org/cargo/', title: 'Cargo - Rust package manager' },
			
			// Programming Languages & Frameworks
			'react': { url: 'https://reactjs.org/', title: 'React - JavaScript library for UI' },
			'vue': { url: 'https://vuejs.org/', title: 'Vue.js - Progressive JavaScript framework' },
			'angular': { url: 'https://angular.io/', title: 'Angular - Platform for building apps' },
			'node': { url: 'https://nodejs.org/', title: 'Node.js - JavaScript runtime' },
			'nodejs': { url: 'https://nodejs.org/', title: 'Node.js - JavaScript runtime' },
			'python': { url: 'https://www.python.org/', title: 'Python - Programming language' },
			'rust': { url: 'https://www.rust-lang.org/', title: 'Rust - Systems programming language' },
			'go': { url: 'https://golang.org/', title: 'Go - Programming language by Google' },
			'golang': { url: 'https://golang.org/', title: 'Go - Programming language by Google' },
			'typescript': { url: 'https://www.typescriptlang.org/', title: 'TypeScript - Typed JavaScript' },
			'javascript': { url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript', title: 'JavaScript - Programming language' },
			'java': { url: 'https://www.oracle.com/java/', title: 'Java - Programming language' },
			'c++': { url: 'https://isocpp.org/', title: 'C++ - Programming language' },
			'c#': { url: 'https://docs.microsoft.com/en-us/dotnet/csharp/', title: 'C# - Programming language' },
			'ruby': { url: 'https://www.ruby-lang.org/', title: 'Ruby - Programming language' },
			'php': { url: 'https://www.php.net/', title: 'PHP - Server-side scripting language' },
			'swift': { url: 'https://swift.org/', title: 'Swift - Programming language by Apple' },
			'kotlin': { url: 'https://kotlinlang.org/', title: 'Kotlin - Modern programming language' },
			
			// Databases
			'postgresql': { url: 'https://www.postgresql.org/', title: 'PostgreSQL - Advanced open source database' },
			'mysql': { url: 'https://www.mysql.com/', title: 'MySQL - Open source database' },
			'mongodb': { url: 'https://www.mongodb.com/', title: 'MongoDB - Document database' },
			'redis': { url: 'https://redis.io/', title: 'Redis - In-memory data store' },
			'sqlite': { url: 'https://www.sqlite.org/', title: 'SQLite - Embedded database' },
			
			// Cloud & Infrastructure
			'aws': { url: 'https://aws.amazon.com/', title: 'AWS - Cloud computing services' },
			'azure': { url: 'https://azure.microsoft.com/', title: 'Microsoft Azure - Cloud platform' },
			'gcp': { url: 'https://cloud.google.com/', title: 'Google Cloud Platform - Cloud services' },
			'terraform': { url: 'https://www.terraform.io/', title: 'Terraform - Infrastructure as code' },
			'ansible': { url: 'https://www.ansible.com/', title: 'Ansible - Automation platform' },
			
			// Operating Systems
			'linux': { url: 'https://www.kernel.org/', title: 'Linux - Open source operating system' },
			'ubuntu': { url: 'https://ubuntu.com/', title: 'Ubuntu - Linux distribution' },
			'debian': { url: 'https://www.debian.org/', title: 'Debian - Universal operating system' },
			'centos': { url: 'https://www.centos.org/', title: 'CentOS - Enterprise-class Linux' },
			'fedora': { url: 'https://getfedora.org/', title: 'Fedora - Linux distribution' },
			'arch': { url: 'https://archlinux.org/', title: 'Arch Linux - Lightweight distribution' },
			'macos': { url: 'https://www.apple.com/macos/', title: 'macOS - Apple operating system' },
			'windows': { url: 'https://www.microsoft.com/windows/', title: 'Windows - Microsoft operating system' }
		};
		
		// Extract tools from specificTools array and text content
		const allTools = new Set<string>();
		
		// Add tools from the specificTools array
		if (specificTools && Array.isArray(specificTools)) {
			specificTools.forEach(tool => {
				if (tool && typeof tool === 'string') {
					allTools.add(tool.toLowerCase().trim());
				}
			});
		}
		
		// Extract tools from keyTakeaways text
		if (keyTakeaways && Array.isArray(keyTakeaways)) {
			const textContent = keyTakeaways.join(' ').toLowerCase();
			Object.keys(toolUrlMap).forEach(tool => {
				if (textContent.includes(tool)) {
					allTools.add(tool);
				}
			});
		}
		
		// Generate URLs for matched tools
		allTools.forEach(tool => {
			const toolInfo = toolUrlMap[tool];
			if (toolInfo) {
				urls.push(toolInfo);
			}
		});
		
		// Remove duplicates and limit to 5 URLs
		const uniqueUrls = urls.filter((url, index, self) => 
			index === self.findIndex(u => u.url === url.url)
		).slice(0, 5);
		
		console.log(`[DEBUG] Generated ${uniqueUrls.length} topic-specific URLs for tools:`, Array.from(allTools));
		
		return uniqueUrls;
	}

	/**
	 * Smart text truncation that preserves complete sentences
	 */
	private truncateAtSentenceEnd(text: string, maxLength: number): string {
		if (!text || text.length <= maxLength) {
			return text;
		}
		
		// Find the last complete sentence before maxLength
		const truncated = text.substring(0, maxLength);
		
		// Look for sentence endings (., !, ?)
		const sentenceEndings = /[.!?]\s/g;
		let lastSentenceEnd = -1;
		let match;
		
		while ((match = sentenceEndings.exec(truncated)) !== null) {
			lastSentenceEnd = match.index + 1;
		}
		
		// If we found a sentence ending, truncate there
		if (lastSentenceEnd > maxLength * 0.7) { // Only if it's not too short (70% of maxLength)
			return text.substring(0, lastSentenceEnd).trim();
		}
		
		// Otherwise, look for the last complete word
		const lastSpace = truncated.lastIndexOf(' ');
		if (lastSpace > maxLength * 0.8) { // Only if it's not too short (80% of maxLength)
			return text.substring(0, lastSpace).trim() + '...';
		}
		
		// Fallback: hard truncate with ellipsis
		return text.substring(0, maxLength - 3).trim() + '...';
	}

	/**
	 * Generate YouTube thumbnail URLs for different moments in the video
	 * YouTube provides several thumbnail options we can use for vision analysis
	 */
	private generateYouTubeThumbnails(videoId: string): string[] {
		return [
			// High quality default thumbnail (usually from middle of video)
			`https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
			// Alternative high quality
			`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
			// Thumbnail from different moments (YouTube generates these automatically)
			`https://img.youtube.com/vi/${videoId}/1.jpg`, // ~25% through video
			`https://img.youtube.com/vi/${videoId}/2.jpg`, // ~50% through video  
			`https://img.youtube.com/vi/${videoId}/3.jpg`, // ~75% through video
		];
	}

	async analyzeYouTubeVideo(params: {
		transcript: string;
		metadata: any;
		task: string;
		hasTranscript: boolean;
		transcriptReason?: string;
		analysisType?: string;
		contentRichness?: number;
	}): Promise<TaskAnalysis & { keyTakeaways?: string[] }> {
		const { transcript, metadata, task, hasTranscript, transcriptReason, analysisType, contentRichness } = params;
		
		let prompt = '';
		let context = '';
		
		if (hasTranscript && analysisType === 'transcript') {
			// Full transcript analysis (best case)
			context = 'YouTube Video Analysis';
			prompt = `Analyze this YouTube video transcript and generate a comprehensive summary with actionable insights.

Video Title: ${metadata.title || 'Unknown'}
Channel: ${metadata.channel || 'Unknown'}
Duration: ${metadata.duration || 'Unknown'}
Task Context: ${task}

Transcript:
${transcript}

Please provide:
1. A comprehensive summary (2-3 paragraphs) covering the main topics and key points
2. 3-5 key takeaways or important points
3. 3-5 actionable next steps based on the video content
4. 2-3 search queries for further research on topics mentioned in the video

IMPORTANT: Return ONLY valid JSON. Follow these rules:
- Escape quotes inside strings as \\"
- Replace newlines in strings with \\n  
- Do not include any text before or after the JSON
- Ensure all strings are properly terminated
- Test that your JSON is valid before responding

Format your response as JSON:
{
	"description": "comprehensive summary here",
	"keyTakeaways": ["takeaway 1", "takeaway 2", "takeaway 3"],
	"nextSteps": ["step 1", "step 2", "step 3"],
	"suggestedSearchQueries": ["query 1", "query 2"]
}`;
		} else if (analysisType === 'rich_content' && (contentRichness || 0) >= 3) {
			// Rich content analysis (good alternative)
			context = `YouTube Video - Rich Content Analysis`;
			prompt = `Analyze this YouTube video based on available rich content and generate actionable insights.

Video Title: ${metadata.title || 'Unknown'}
Channel: ${metadata.channel || 'Unknown'}
Duration: ${metadata.duration || 'Unknown'}
Task Context: ${task}

Available Content:
${transcript}

Based on this rich content (video description, chapters, comments), please:
1. Provide a comprehensive analysis (2-3 paragraphs) of what this video covers based on the available information
2. Extract 3-5 key takeaways from the content provided
3. Generate 3-5 actionable next steps that would be relevant for someone interested in this topic
4. Suggest 2-3 research topics for further exploration

Focus on the actual content provided rather than generic advice. Use the video description, chapter structure, and community insights to provide specific, relevant guidance.

IMPORTANT: Return ONLY valid JSON. Follow these rules:
- Escape quotes inside strings as \\"
- Replace newlines in strings with \\n  
- Do not include any text before or after the JSON
- Ensure all strings are properly terminated
- Test that your JSON is valid before responding

Format your response as JSON:
{
	"description": "analysis based on available content",
	"keyTakeaways": ["specific takeaway 1", "specific takeaway 2", "specific takeaway 3"],
	"nextSteps": ["actionable step 1", "actionable step 2", "actionable step 3"],
	"suggestedSearchQueries": ["related topic 1", "related topic 2"]
}`;
		} else {
			// Basic metadata only (fallback)
			context = `YouTube Video - ${transcriptReason || 'Limited Content Available'}`;
			prompt = `Based on basic YouTube video metadata, provide practical guidance for manual analysis.

Video Title: ${metadata.title || 'Unknown'}
Channel: ${metadata.channel || 'Unknown'}
Duration: ${metadata.duration || 'Unknown'}
Views: ${metadata.viewCount || 'Unknown'}
Task Context: ${task}
Content Status: ${transcriptReason || 'Transcript and rich content not available'}

Since detailed content is not available, provide:
1. Context about what this video might cover based on the title and channel
2. Specific steps for manual analysis (watching and note-taking strategies)
3. Suggest what to look for while watching based on the title and context
4. Recommend follow-up research topics related to the apparent subject matter

Be explicit about limitations - clearly state what information you have vs. what would require watching the video.

IMPORTANT: Return ONLY valid JSON. Follow these rules:
- Escape quotes inside strings as \\"
- Replace newlines in strings with \\n  
- Do not include any text before or after the JSON
- Ensure all strings are properly terminated
- Test that your JSON is valid before responding

Format your response as JSON:
{
	"description": "practical guidance for manual analysis",
	"keyTakeaways": ["what to look for while watching", "analysis strategy", "key areas of focus"],
	"nextSteps": ["Watch the video and take structured notes", "specific viewing strategy", "follow-up action"],
	"suggestedSearchQueries": ["related topic 1", "related topic 2"]
}`;
		}
		
		try {
			const response = await this.callOpenAI(prompt);
			
			// Robust JSON parsing with multiple fallback strategies
			let parsed = null;
			
			try {
				// First attempt: direct parsing
				parsed = JSON.parse(response);
			} catch (parseError1) {
				console.log('[DEBUG] Direct JSON parse failed, trying cleanup:', parseError1.message);
				
				try {
					// Second attempt: clean up common issues
					let cleanedResponse = response
						.replace(/[\r\n]+/g, ' ') // Replace newlines with spaces
						.replace(/\t+/g, ' ') // Replace tabs with spaces  
						.replace(/\s+/g, ' ') // Normalize whitespace
						.trim();
					
					// Try to extract JSON from response if it has extra text
					const jsonMatch = cleanedResponse.match(/\{.*\}/s);
					if (jsonMatch) {
						cleanedResponse = jsonMatch[0];
					}
					
					parsed = JSON.parse(cleanedResponse);
					console.log('[DEBUG] JSON cleanup successful');
				} catch (parseError2) {
					console.log('[DEBUG] JSON cleanup failed, trying manual extraction:', parseError2.message);
					
					try {
						// Third attempt: manual field extraction using regex
						const description = this.extractField(response, 'description');
						const keyTakeaways = this.extractArrayField(response, 'keyTakeaways');
						const nextSteps = this.extractArrayField(response, 'nextSteps');
						const suggestedSearchQueries = this.extractArrayField(response, 'suggestedSearchQueries');
						
						if (description) {
							parsed = {
								description,
								keyTakeaways: keyTakeaways || [],
								nextSteps: nextSteps || [],
								suggestedSearchQueries: suggestedSearchQueries || []
							};
							console.log('[DEBUG] Manual field extraction successful');
						}
					} catch (parseError3) {
						console.log('[DEBUG] Manual extraction failed:', parseError3.message);
					}
				}
			}
			
			if (parsed && parsed.description) {
				return {
					context,
					description: parsed.description || 'Unable to generate summary',
					nextSteps: Array.isArray(parsed.nextSteps) ? parsed.nextSteps : [],
					suggestedSearchQueries: Array.isArray(parsed.suggestedSearchQueries) ? parsed.suggestedSearchQueries : [],
					keyTakeaways: Array.isArray(parsed.keyTakeaways) ? parsed.keyTakeaways : []
				};
			} else {
				// Final fallback: use raw response as description
				console.log('[DEBUG] Using raw response as fallback');
				return {
					context,
					description: response.substring(0, 1000) + (response.length > 1000 ? '...' : ''),
					nextSteps: this.getDefaultNextSteps(analysisType),
					suggestedSearchQueries: [],
					keyTakeaways: []
				};
			}
		} catch (error) {
			console.error('OpenAI YouTube analysis failed:', error);
			throw new Error(`Failed to analyze YouTube video: ${error.message}`);
		}
	}

	/**
	 * Get appropriate default next steps based on analysis type
	 */
	private getDefaultNextSteps(analysisType?: string): string[] {
		switch (analysisType) {
			case 'transcript':
				return ['Review the transcript for key points', 'Research mentioned topics', 'Create summary notes'];
			case 'rich_content':
				return ['Review the video description thoroughly', 'Watch key chapters identified', 'Research topics mentioned in description'];
			default:
				return ['Watch the video and take detailed notes', 'Check video description for resources', 'Research the topic area'];
		}
	}

	/**
	 * Extract a string field from malformed JSON using regex
	 */
	/**
	 * Extract a string field from malformed JSON using regex
	 */
	private extractField(text: string, fieldName: string): string | null {
		const pattern = new RegExp(`"${fieldName}"\\s*:\\s*"([^"]*(?:\\\\.[^"]*)*)"`, 'i');
		const match = text.match(pattern);
		if (match) {
			const rawText = match[1].replace(/\\"/g, '"').replace(/\\n/g, '\n');
			// Apply smart truncation to extracted fields
			return this.truncateAtSentenceEnd(rawText, 3000);
		}
		return null;
	}

	/**
	 * Extract an array field from malformed JSON using regex
	 */
	private extractArrayField(text: string, fieldName: string): string[] | null {
		const pattern = new RegExp(`"${fieldName}"\\s*:\\s*\\[([^\\]]+)\\]`, 'i');
		const match = text.match(pattern);
		if (!match) return null;
		
		try {
			// Extract items between quotes
			const itemsText = match[1];
			const items = [];
			const itemPattern = /"([^"]*(?:\\.[^"]*)*)"/g;
			let itemMatch;
			
			while ((itemMatch = itemPattern.exec(itemsText)) !== null) {
				items.push(itemMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n'));
			}
			
			return items.length > 0 ? items : null;
		} catch (e) {
			console.log('[DEBUG] Array extraction failed:', e.message);
			return null;
		}
	}

	updateConfig(config: Partial<OpenAIConfig>): void {
		this.config = { ...this.config, ...config };
	}
}