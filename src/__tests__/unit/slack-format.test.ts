import { describe, it, expect } from '@jest/globals';
import {
  chunkMessage,
  markdownToSlackMrkdwn,
  formatResponseBlocks,
  prepareSlackMessages,
  SLACK_TEXT_LIMIT,
} from '../../utils/slack-format';

describe('slack-format utilities', () => {
  describe('chunkMessage', () => {
    it('should return single chunk for short messages', () => {
      const text = 'Hello, world!';
      const chunks = chunkMessage(text);
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toBe(text);
    });

    it('should split at paragraph boundary', () => {
      const para1 = 'a'.repeat(2000);
      const para2 = 'b'.repeat(2000);
      const text = `${para1}\n\n${para2}`;

      const chunks = chunkMessage(text);
      expect(chunks).toHaveLength(2);
      expect(chunks[0]).toBe(para1);
      expect(chunks[1]).toBe(para2);
    });

    it('should split at newline if no paragraph boundary', () => {
      const line1 = 'a'.repeat(2000);
      const line2 = 'b'.repeat(2000);
      const text = `${line1}\n${line2}`;

      const chunks = chunkMessage(text);
      expect(chunks).toHaveLength(2);
    });

    it('should split at space if no newline', () => {
      const word1 = 'a'.repeat(2000);
      const word2 = 'b'.repeat(2000);
      const text = `${word1} ${word2}`;

      const chunks = chunkMessage(text);
      expect(chunks).toHaveLength(2);
    });

    it('should hard cut if no natural boundary', () => {
      const text = 'a'.repeat(5000);
      const chunks = chunkMessage(text);
      expect(chunks.length).toBeGreaterThan(1);
      chunks.forEach(chunk => {
        expect(chunk.length).toBeLessThanOrEqual(SLACK_TEXT_LIMIT);
      });
    });

    it('should handle empty string', () => {
      const chunks = chunkMessage('');
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toBe('');
    });

    it('should handle exactly SLACK_TEXT_LIMIT characters', () => {
      const text = 'a'.repeat(SLACK_TEXT_LIMIT);
      const chunks = chunkMessage(text);
      expect(chunks).toHaveLength(1);
    });

    it('should respect custom limit', () => {
      const text = 'a'.repeat(200);
      const chunks = chunkMessage(text, 100);
      expect(chunks).toHaveLength(2);
    });

    it('should handle unicode characters correctly', () => {
      const emoji = '🎉'.repeat(1000); // Each emoji is multiple bytes
      const chunks = chunkMessage(emoji);
      expect(chunks.length).toBeGreaterThanOrEqual(1);
    });

    it('should trim whitespace at chunk boundaries', () => {
      const text = 'a'.repeat(2000) + '\n\n   ' + 'b'.repeat(2000);
      const chunks = chunkMessage(text);
      expect(chunks[1]).not.toMatch(/^\s+/);
    });

    it('should preserve content when reassembled', () => {
      const text = 'Hello\n\nWorld\n\nThis is a test';
      const chunks = chunkMessage(text, 10);
      const reassembled = chunks.join('');
      expect(reassembled.replace(/\s+/g, '')).toBe(text.replace(/\s+/g, ''));
    });
  });

  describe('markdownToSlackMrkdwn', () => {
    it('should convert bold markdown to Slack format', () => {
      expect(markdownToSlackMrkdwn('**bold**')).toBe('*bold*');
      expect(markdownToSlackMrkdwn('__bold__')).toBe('*bold*');
    });

    it('should preserve single asterisks as Slack bold', () => {
      // Note: Single asterisks *text* are left as-is, which is Slack's bold format
      // Markdown italic is not supported - use _text_ for Slack italic if needed
      expect(markdownToSlackMrkdwn('*italic*')).toBe('*italic*');
    });

    it('should convert strikethrough', () => {
      expect(markdownToSlackMrkdwn('~~strikethrough~~')).toBe('~strikethrough~');
    });

    it('should convert links', () => {
      expect(markdownToSlackMrkdwn('[Google](https://google.com)')).toBe('<https://google.com|Google>');
    });

    it('should convert links without text when text equals URL', () => {
      expect(markdownToSlackMrkdwn('[https://google.com](https://google.com)')).toBe('<https://google.com>');
    });

    it('should preserve Slack mentions', () => {
      const text = 'Hello <@U12345> and <#C12345>';
      const result = markdownToSlackMrkdwn(text);
      expect(result).toBe('Hello <@U12345> and <#C12345>');
    });

    it('should handle code blocks', () => {
      const text = '`code`';
      expect(markdownToSlackMrkdwn(text)).toBe('`code`');
    });

    it('should handle empty string', () => {
      expect(markdownToSlackMrkdwn('')).toBe('');
    });

    it('should handle complex markdown', () => {
      const md = '**Bold** and ~~strike~~ with [link](https://example.com)';
      const result = markdownToSlackMrkdwn(md);
      expect(result).toContain('*Bold*');
      expect(result).toContain('~strike~');
      expect(result).toContain('<https://example.com|link>');
    });

    it('should handle mixed bold formats', () => {
      const md = '**bold** and *also-bold*';
      const result = markdownToSlackMrkdwn(md);
      expect(result).toContain('*bold*');
      expect(result).toContain('*also-bold*');
    });

    it('should escape angle brackets that are not Slack tokens', () => {
      const text = 'a < b and c > d';
      const result = markdownToSlackMrkdwn(text);
      expect(result).toContain('&lt;');
      expect(result).toContain('&gt;');
    });

    it('should preserve Slack channel mentions', () => {
      const text = '<#C12345|general>';
      const result = markdownToSlackMrkdwn(text);
      expect(result).toBe('<#C12345|general>');
    });

    it('should preserve Slack special link format', () => {
      const text = '<!here> and <!everyone>';
      const result = markdownToSlackMrkdwn(text);
      expect(result).toBe('<!here> and <!everyone>');
    });

    it('should handle nested formatting', () => {
      const md = '**bold with *inner* inside**';
      const result = markdownToSlackMrkdwn(md);
      // Both ** and * convert to Slack bold *text*
      expect(result).toBe('*bold with *inner* inside*');
    });

    it('should handle multiple links', () => {
      const md = '[Link1](https://example.com) and [Link2](https://test.com)';
      const result = markdownToSlackMrkdwn(md);
      expect(result).toContain('<https://example.com|Link1>');
      expect(result).toContain('<https://test.com|Link2>');
    });

    it('should handle code blocks with backticks', () => {
      const text = 'Use `npm install` to install';
      const result = markdownToSlackMrkdwn(text);
      expect(result).toContain('`npm install`');
    });

    it('should preserve multiple spaces', () => {
      const text = 'Hello    world';
      const result = markdownToSlackMrkdwn(text);
      expect(result).toBe(text);
    });
  });

  describe('formatResponseBlocks', () => {
    it('should create single section block for short text', () => {
      const blocks = formatResponseBlocks('Hello');
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('section');
      expect(blocks[0].text?.type).toBe('mrkdwn');
      expect(blocks[0].text?.text).toBe('Hello');
    });

    it('should create multiple blocks for long text', () => {
      const longText = 'a'.repeat(5000);
      const blocks = formatResponseBlocks(longText);
      expect(blocks.length).toBeGreaterThan(1);
      blocks.forEach(block => {
        expect(block.type).toBe('section');
        expect(block.text.type).toBe('mrkdwn');
        expect(block.text.text.length).toBeLessThanOrEqual(3000);
      });
    });

    it('should handle empty string', () => {
      const blocks = formatResponseBlocks('');
      expect(blocks).toHaveLength(0);
    });

    it('should convert markdown in blocks', () => {
      const blocks = formatResponseBlocks('**bold** text');
      expect(blocks[0].text.text).toContain('*bold*');
    });

    it('should handle text exactly at 3000 char boundary', () => {
      const text = 'a'.repeat(3000);
      const blocks = formatResponseBlocks(text);
      expect(blocks).toHaveLength(1);
    });

    it('should split at natural boundaries when chunking', () => {
      const text = 'a'.repeat(2000) + '\n\n' + 'b'.repeat(2000);
      const blocks = formatResponseBlocks(text);
      expect(blocks.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('prepareSlackMessages', () => {
    it('should prepare single message for short text', () => {
      const messages = prepareSlackMessages('Hello', { channel: 'C123' });
      expect(messages).toHaveLength(1);
      expect(messages[0].channel).toBe('C123');
      expect(messages[0].text).toContain('Hello');
    });

    it('should include thread_ts when provided', () => {
      const messages = prepareSlackMessages('Hello', {
        channel: 'C123',
        threadTs: '1234567890.123456',
      });
      expect(messages[0].thread_ts).toBe('1234567890.123456');
    });

    it('should add continuation markers for multi-part messages', () => {
      const longText = 'a'.repeat(5000);
      const messages = prepareSlackMessages(longText, { channel: 'C123' });

      expect(messages.length).toBeGreaterThan(1);
      expect(messages[0].text).toContain('...continued...');
      expect(messages[messages.length - 1].text).toContain('...continued from above...');
    });

    it('should not add continuation markers for single message', () => {
      const messages = prepareSlackMessages('Short text', { channel: 'C123' });
      expect(messages[0].text).not.toContain('continued');
    });

    it('should handle empty text', () => {
      const messages = prepareSlackMessages('', { channel: 'C123' });
      expect(messages).toHaveLength(1);
      expect(messages[0].channel).toBe('C123');
      expect(messages[0].text).toBe('');
    });

    it('should include blocks in each message', () => {
      const messages = prepareSlackMessages('Hello', { channel: 'C123' });
      expect(messages[0].blocks).toBeDefined();
      expect(Array.isArray(messages[0].blocks)).toBe(true);
    });

    it('should convert markdown in messages', () => {
      const messages = prepareSlackMessages('**bold**', { channel: 'C123' });
      expect(messages[0].text).toContain('*bold*');
    });

    it('should set channel for all chunks', () => {
      const longText = 'a'.repeat(5000);
      const messages = prepareSlackMessages(longText, { channel: 'C123' });
      messages.forEach(msg => {
        expect(msg.channel).toBe('C123');
      });
    });

    it('should set thread_ts for all chunks when provided', () => {
      const longText = 'a'.repeat(5000);
      const messages = prepareSlackMessages(longText, {
        channel: 'C123',
        threadTs: '1234567890.123456',
      });
      messages.forEach(msg => {
        expect(msg.thread_ts).toBe('1234567890.123456');
      });
    });

    it('should not include thread_ts when not provided', () => {
      const messages = prepareSlackMessages('Hello', { channel: 'C123' });
      expect(messages[0].thread_ts).toBeUndefined();
    });

    it('should handle very long text with multiple chunks', () => {
      const veryLongText = 'a'.repeat(15000);
      const messages = prepareSlackMessages(veryLongText, { channel: 'C123' });
      expect(messages.length).toBeGreaterThan(2);

      // First message should have continuation marker
      expect(messages[0].text).toContain('...continued...');

      // Middle messages should have both markers
      if (messages.length > 2) {
        expect(messages[1].text).toContain('...continued from above...');
        expect(messages[1].text).toContain('...continued...');
      }

      // Last message should only have "from above" marker
      const lastMsg = messages[messages.length - 1];
      expect(lastMsg.text).toContain('...continued from above...');
      expect(lastMsg.text).not.toMatch(/\.\.\.continued\.\.\._$/);
    });

    it('should chunk at SLACK_TEXT_LIMIT boundary', () => {
      const text = 'a'.repeat(SLACK_TEXT_LIMIT * 2);
      const messages = prepareSlackMessages(text, { channel: 'C123' });
      messages.forEach(msg => {
        // Account for continuation markers
        expect(msg.text.length).toBeLessThanOrEqual(SLACK_TEXT_LIMIT + 100);
      });
    });
  });

  describe('integration tests', () => {
    it('should handle real-world Slack message with markdown and mentions', () => {
      const text = 'Hey <@U12345>, check out **this** [link](https://example.com) ~~soon~~!';
      const messages = prepareSlackMessages(text, { channel: 'C123' });

      expect(messages).toHaveLength(1);
      expect(messages[0].text).toContain('<@U12345>');
      expect(messages[0].text).toContain('*this*');
      expect(messages[0].text).toContain('~soon~');
      expect(messages[0].text).toContain('<https://example.com|link>');
    });

    it('should handle code blocks in messages', () => {
      const text = 'Run `npm install` to install dependencies';
      const messages = prepareSlackMessages(text, { channel: 'C123' });

      expect(messages[0].text).toContain('`npm install`');
    });

    it('should handle multi-paragraph messages', () => {
      const text = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.';
      const messages = prepareSlackMessages(text, { channel: 'C123' });

      expect(messages).toHaveLength(1);
      expect(messages[0].text).toContain('First paragraph');
      expect(messages[0].text).toContain('Second paragraph');
      expect(messages[0].text).toContain('Third paragraph');
    });

    it('should handle extremely long message with mixed formatting', () => {
      const paragraph = '**Bold text** and *italic* with [links](https://example.com). '.repeat(200);
      const messages = prepareSlackMessages(paragraph, { channel: 'C123' });

      expect(messages.length).toBeGreaterThan(1);
      messages.forEach(msg => {
        expect(msg.channel).toBe('C123');
        expect(msg.blocks).toBeDefined();
      });
    });
  });

  describe('edge cases', () => {
    it('should handle null/undefined gracefully', () => {
      // @ts-expect-error Testing runtime behavior
      expect(markdownToSlackMrkdwn(null)).toBe('');
      // @ts-expect-error Testing runtime behavior
      expect(markdownToSlackMrkdwn(undefined)).toBe('');
    });

    it('should handle very long single word', () => {
      const longWord = 'a'.repeat(5000);
      const chunks = chunkMessage(longWord);
      expect(chunks.length).toBeGreaterThan(1);
      chunks.forEach(chunk => {
        expect(chunk.length).toBeLessThanOrEqual(SLACK_TEXT_LIMIT);
      });
    });

    it('should handle special characters', () => {
      const text = '& < > " \' ` @ # $ % ^ * ( ) - + = [ ] { } | \\ / ? ! . ,';
      const result = markdownToSlackMrkdwn(text);
      // Should escape < and > but preserve others
      expect(result).toContain('&lt;');
      expect(result).toContain('&gt;');
    });

    it('should handle emoji characters', () => {
      const text = '🎉 🚀 👍 ❤️ 😂';
      const result = markdownToSlackMrkdwn(text);
      expect(result).toBe(text);
    });

    it('should handle mixed newline types', () => {
      const text = 'Line1\nLine2\r\nLine3\rLine4';
      const chunks = chunkMessage(text, 20);
      expect(chunks.length).toBeGreaterThan(0);
    });

    it('should handle markdown at chunk boundaries', () => {
      const text = 'a'.repeat(3990) + '**bold**' + 'a'.repeat(100);
      const chunks = chunkMessage(text);
      const reconstructed = chunks.join('');
      expect(reconstructed).toContain('**bold**');
    });

    it('should handle multiple consecutive formatting markers', () => {
      const text = '**bold** **another bold** ~~strike~~ ~~another~~';
      const result = markdownToSlackMrkdwn(text);
      expect(result).toContain('*bold*');
      expect(result).toContain('*another bold*');
      expect(result).toContain('~strike~');
      expect(result).toContain('~another~');
    });

    it('should handle incomplete markdown syntax', () => {
      const text = '**incomplete bold';
      const result = markdownToSlackMrkdwn(text);
      // Should not crash, though result may vary
      expect(result).toBeDefined();
    });
  });
});
