import { config } from "dotenv";

config({ path: ".env.test" });

beforeAll(() => {
  process.env.NODE_ENV = "test";
});

afterAll(() => {
  jest.clearAllMocks();
});
