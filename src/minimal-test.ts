import express from "express";

const app = express();
const port = parseInt(process.env.PORT || "3000", 10);

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    message: "Minimal test server is working!",
    timestamp: new Date().toISOString(),
    env: {
      NODE_ENV: process.env.NODE_ENV,
      PORT: process.env.PORT,
      DATABASE_URL: process.env.DATABASE_URL ? "SET" : "MISSING",
    },
  });
});

app.get("/", (_req, res) => {
  res.json({
    message: "Hello from Railway!",
    time: new Date().toISOString(),
  });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`✅ Minimal test server listening on ${port}`);
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
});
