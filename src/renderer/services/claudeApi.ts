// Real Claude API integration for browser mode
import Anthropic from '@anthropic-ai/sdk';

// Initialize Claude client (you'll need to add your API key)
const getApiKey = () => {
  // Check different sources for API key
  if (typeof window !== 'undefined') {
    return localStorage.getItem('anthropic_api_key') || '';
  }
  return '';
};

const anthropic = new Anthropic({
  apiKey: getApiKey(),
  dangerouslyAllowBrowser: true // Required for browser usage
});

export class ClaudeService {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || localStorage.getItem('anthropic_api_key') || '';
  }

  setApiKey(key: string) {
    this.apiKey = key;
    localStorage.setItem('anthropic_api_key', key);
  }

  async query(prompt: string, options?: any) {
    if (!this.apiKey) {
      throw new Error('API key not set. Please add your Anthropic API key in settings.');
    }

    try {
      const client = new Anthropic({
        apiKey: this.apiKey,
        dangerouslyAllowBrowser: true
      });

      const response = await client.messages.create({
        model: options?.model || 'claude-3-sonnet-20240229',
        max_tokens: options?.maxTokens || 4096,
        temperature: options?.temperature || 0.7,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      });

      return {
        success: true,
        data: response.content[0].type === 'text' ? response.content[0].text : ''
      };
    } catch (error: any) {
      console.error('Claude API error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async* streamQuery(prompt: string, options?: any) {
    if (!this.apiKey) {
      throw new Error('API key not set. Please add your Anthropic API key in settings.');
    }

    try {
      const client = new Anthropic({
        apiKey: this.apiKey,
        dangerouslyAllowBrowser: true
      });

      const stream = await client.messages.create({
        model: options?.model || 'claude-3-sonnet-20240229',
        max_tokens: options?.maxTokens || 4096,
        temperature: options?.temperature || 0.7,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        stream: true
      });

      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
          yield chunk.delta.text;
        }
      }
    } catch (error: any) {
      console.error('Claude API streaming error:', error);
      throw error;
    }
  }
}

export const claudeService = new ClaudeService();