import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/auth";
import scoreRoutes from "./routes/score";
import charityRoutes from "./routes/charity";
import subscriptionRoutes from "./routes/subscription";
import drawRoutes from "./routes/draw";
import adminRoutes from "./routes/admin";
import dashboardRoutes from "./routes/dashboard";

dotenv.config();

const app = express();
app.use(cors());
app.use((req, res, next) => {
  console.log(`[REQUEST] ${req.method} ${req.originalUrl}`);
  next();
});

// Global JSON parsing with raw body capture for Stripe
app.use(express.json({
  verify: (req: any, res, buf) => {
    if (req.originalUrl.includes("/webhook")) {
      console.log(`Webhook raw body captured for: ${req.originalUrl}`);
      req.rawBody = buf;
    }
  }
}));

app.use("/api/auth", authRoutes);
app.use("/api/score", scoreRoutes);
app.use("/api/charity", charityRoutes);
app.use("/api/subscription", subscriptionRoutes);
app.use("/api/draw", drawRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/dashboard", dashboardRoutes);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Supabase-powered Backend Server running on port ${PORT}`);
});
