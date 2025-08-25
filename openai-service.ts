import { requestUrl, RequestUrlParam } from 'obsidian';
import { ExtractedTask } from './types';

export interface TaskAnalysis {
	context: string;
	description: string;
	nextSteps: string[];
	confidence: number;
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
		let prompt = `You are an intelligent task assistant. Analyze this task and provide structured insights based on all available information.

Task: "${task.cleanText}"
Tags: ${task.tags.length > 0 ? task.tags.join(', ') : 'none'}`;

		if (urlContent) {
			prompt += `

Related Content from URL:
${urlContent}`;
		}

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
  "confidence": 0.85
}

Guidelines:
- Use the URL content to provide specific, detailed insights rather than generic descriptions
- Make the context and description highly specific to what was actually found in the content
- Create actionable next steps that reflect the actual content and requirements
- Set confidence based on how much concrete information you have
- If the URL content is substantial, prioritize it over generic task interpretation
- Respond with valid JSON only`;

		return prompt;
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
				confidence: typeof parsed.confidence === 'number' ? 
					Math.min(1, Math.max(0, parsed.confidence)) : 0.5
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
	updateConfig(config: Partial<OpenAIConfig>): void {
		this.config = { ...this.config, ...config };
	}
}