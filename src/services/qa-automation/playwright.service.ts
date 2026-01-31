import { chromium, BrowserContext, Page } from "playwright";
import path from "path";
import fs from "fs/promises";

export interface PlaywrightServiceConfig {
  headless?: boolean;
  userDataDir?: string;
  viewport?: { width: number; height: number };
  timeout?: number;
}

export class PlaywrightService {
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private config: Required<PlaywrightServiceConfig>;

  constructor(config: PlaywrightServiceConfig = {}) {
    this.config = {
      headless: config.headless ?? process.env.PLAYWRIGHT_HEADLESS === "true",
      userDataDir: config.userDataDir ?? "./playwright-data",
      viewport: config.viewport ?? { width: 1280, height: 720 },
      timeout: config.timeout ?? 30000,
    };
  }

  /**
   * Initialize the browser context and create a new page
   */
  async initialize(): Promise<void> {
    try {
      // Ensure user data directory exists
      await fs.mkdir(this.config.userDataDir, { recursive: true });

      // Launch persistent context to maintain login sessions
      this.context = await chromium.launchPersistentContext(this.config.userDataDir, {
        channel: "chrome",
        headless: this.config.headless,
        viewport: this.config.viewport,
        // Additional options for better stability
        args: ["--disable-blink-features=AutomationControlled", "--disable-dev-shm-usage"],
      });

      // Create a new page
      this.page = await this.context.newPage();
      this.page.setDefaultTimeout(this.config.timeout);

      console.log("✓ Playwright service initialized");
    } catch (error) {
      await this.captureErrorScreenshot("initialization-error");
      throw new Error(
        `Failed to initialize Playwright service: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Navigate to Claude.ai and wait for the chat interface to load
   */
  async navigateToClaude(): Promise<void> {
    if (!this.page) {
      throw new Error("Playwright service not initialized. Call initialize() first.");
    }

    try {
      console.log("Navigating to Claude.ai...");
      await this.page.goto("https://claude.ai", { waitUntil: "networkidle" });

      // Wait for chat input to be available
      // Claude.ai uses a contenteditable div for input
      await this.page.waitForSelector('[contenteditable="true"]', {
        state: "visible",
        timeout: this.config.timeout,
      });

      console.log("✓ Successfully navigated to Claude.ai");
    } catch (error) {
      await this.captureErrorScreenshot("navigation-error");
      throw new Error(
        `Failed to navigate to Claude.ai: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Send a prompt to Claude and wait for the response
   * @param prompt The prompt to send
   * @returns The response text from Claude
   */
  async sendPrompt(prompt: string): Promise<string> {
    if (!this.page) {
      throw new Error("Playwright service not initialized. Call initialize() first.");
    }

    try {
      console.log(`Sending prompt: "${prompt.substring(0, 50)}..."`);

      // Find the chat input (contenteditable div)
      const inputSelector = '[contenteditable="true"]';
      await this.page.waitForSelector(inputSelector, { state: "visible" });

      // Clear any existing content and type the prompt
      await this.page.fill(inputSelector, prompt);

      // Press Enter to send
      await this.page.press(inputSelector, "Enter");

      // Wait for the response to appear
      // Claude.ai typically shows a loading indicator, then the response
      // We'll wait for a new message to appear in the chat
      const responseSelector =
        '[data-testid="chat-message"], .font-claude-message, [class*="message"]';

      try {
        // Wait for response with timeout
        await this.page.waitForSelector(responseSelector, {
          state: "visible",
          timeout: this.config.timeout,
        });

        // Wait a bit for the response to fully render
        await this.page.waitForTimeout(1000);

        // Get the last message (Claude's response)
        const messages = await this.page.locator(responseSelector).all();
        if (messages.length === 0) {
          throw new Error("No messages found in chat");
        }

        const lastMessage = messages[messages.length - 1];
        const responseText = await lastMessage.textContent();

        console.log("✓ Received response from Claude");
        return responseText?.trim() || "";
      } catch (timeoutError) {
        await this.captureErrorScreenshot("response-timeout");
        throw new Error(`Timeout waiting for Claude response after ${this.config.timeout}ms`);
      }
    } catch (error) {
      await this.captureErrorScreenshot("send-prompt-error");
      throw new Error(
        `Failed to send prompt: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Capture a screenshot at the specified path
   * @param screenshotPath Path where the screenshot should be saved
   */
  async screenshot(screenshotPath: string): Promise<void> {
    if (!this.page) {
      throw new Error("Playwright service not initialized. Call initialize() first.");
    }

    try {
      // Ensure directory exists
      const dir = path.dirname(screenshotPath);
      await fs.mkdir(dir, { recursive: true });

      // Capture full-page screenshot
      await this.page.screenshot({
        path: screenshotPath,
        fullPage: true,
      });

      console.log(`✓ Screenshot saved to ${screenshotPath}`);
    } catch (error) {
      throw new Error(
        `Failed to capture screenshot: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Capture an error screenshot with timestamp
   * @param errorType Type of error for filename
   */
  private async captureErrorScreenshot(errorType: string): Promise<void> {
    if (!this.page) return;

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const screenshotPath = path.join("./screenshots", `error-${errorType}-${timestamp}.png`);
      await this.screenshot(screenshotPath);
      console.log(`Error screenshot saved: ${screenshotPath}`);
    } catch (screenshotError) {
      console.error("Failed to capture error screenshot:", screenshotError);
    }
  }

  /**
   * Close the browser context and clean up resources
   */
  async close(): Promise<void> {
    try {
      if (this.page) {
        await this.page.close();
        this.page = null;
      }

      if (this.context) {
        await this.context.close();
        this.context = null;
      }

      console.log("✓ Playwright service closed cleanly");
    } catch (error) {
      throw new Error(
        `Failed to close Playwright service: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Get the current page instance (for advanced usage)
   */
  getPage(): Page | null {
    return this.page;
  }

  /**
   * Get the current browser context (for advanced usage)
   */
  getContext(): BrowserContext | null {
    return this.context;
  }
}
