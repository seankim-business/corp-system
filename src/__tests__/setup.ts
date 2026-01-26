import { config } from "dotenv";

config({ path: ".env.test" });

jest.mock("google-auth-library", () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    getToken: jest.fn(),
    setCredentials: jest.fn(),
    verifyIdToken: jest.fn().mockResolvedValue({
      getPayload: () => null,
    }),
  })),
}));

beforeAll(() => {
  process.env.NODE_ENV = "test";
});

afterAll(() => {
  jest.clearAllMocks();
});
