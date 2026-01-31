import { test as base } from "@playwright/test";
import { RailwayService } from "../../../src/services/qa-automation/railway.service";
import { PlaywrightService } from "../../../src/services/qa-automation/playwright.service";

type TestFixtures = {
  railwayService: RailwayService;
  playwrightTestService: PlaywrightService;
};

export const test = base.extend<TestFixtures>({
  railwayService: async ({}, use) => {
    const service = new RailwayService();
    await use(service);
  },

  playwrightTestService: async ({}, use) => {
    const service = new PlaywrightService({ headless: true, timeout: 30000 });
    await service.initialize();
    await use(service);
    await service.close();
  },
});

export { expect } from "@playwright/test";
