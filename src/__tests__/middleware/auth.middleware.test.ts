jest.mock("../../db/client", () => ({
  db: {
    user: {
      findUnique: jest.fn(),
    },
    membership: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock("bcrypt", () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

jest.mock("google-auth-library", () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    getToken: jest.fn(),
    setCredentials: jest.fn(),
    verifyIdToken: jest.fn(),
  })),
}));

const { authenticate } = require("../../middleware/auth.middleware");
const { db } = require("../../db/client");
const { AuthService } = require("../../auth/auth.service");

function createRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe("authenticate middleware", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = "test-secret";
  });

  it("should return 401 when token missing", async () => {
    const req: any = { cookies: {}, headers: {} };
    const res = createRes();
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized" });
    expect(next).not.toHaveBeenCalled();
  });

  it("should return 401 when token invalid", async () => {
    const req: any = { cookies: { session: "bad" }, headers: {} };
    const res = createRes();
    const next = jest.fn();

    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    await authenticate(req, res, next);

    errorSpy.mockRestore();

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Invalid token" });
    expect(next).not.toHaveBeenCalled();
  });

  it("should return 401 when user not found", async () => {
    const authService = new AuthService();
    const token = authService.createSessionToken({
      userId: "u1",
      organizationId: "org-1",
      role: "member",
    });

    const req: any = { cookies: { session: token }, headers: {} };
    const res = createRes();
    const next = jest.fn();
    (db.user.findUnique as jest.Mock).mockResolvedValue(null);

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "User not found" });
    expect(next).not.toHaveBeenCalled();
  });

  it("should return 403 when membership not found", async () => {
    const authService = new AuthService();
    const token = authService.createSessionToken({
      userId: "u1",
      organizationId: "org-1",
      role: "member",
    });

    const req: any = { cookies: { session: token }, headers: {} };
    const res = createRes();
    const next = jest.fn();
    (db.user.findUnique as jest.Mock).mockResolvedValue({ id: "u1", email: "a@b.com" });
    (db.membership.findUnique as jest.Mock).mockResolvedValue(null);

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "Membership not found" });
    expect(next).not.toHaveBeenCalled();
  });

  it("should attach user context and call next on success", async () => {
    const authService = new AuthService();
    const token = authService.createSessionToken({
      userId: "u1",
      organizationId: "org-1",
      role: "member",
    });

    const req: any = { cookies: { session: token }, headers: {} };
    const res = createRes();
    const next = jest.fn();
    (db.user.findUnique as jest.Mock).mockResolvedValue({ id: "u1", email: "a@b.com" });
    (db.membership.findUnique as jest.Mock).mockResolvedValue({
      id: "m1",
      role: "member",
      organization: { id: "org-1", slug: "acme" },
    });

    await authenticate(req, res, next);

    expect(req.user.id).toBe("u1");
    expect(req.user.organizationId).toBe("org-1");
    expect(req.organization.id).toBe("org-1");
    expect(req.membership.id).toBe("m1");
    expect(req.currentOrganizationId).toBe("org-1");
    expect(next).toHaveBeenCalledTimes(1);
  });
});
