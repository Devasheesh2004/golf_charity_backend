import express, { Router, Request, Response, NextFunction } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import { supabase } from "../lib/supabase";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2023-10-16" as any,
});

const router = Router();

interface AuthRequest extends Request {
  userId?: string;
}

const verifyToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(403).json({ message: "No token provided" });
  jwt.verify(token, process.env.JWT_SECRET || "golf-secret", (err: unknown, decoded: unknown) => {
    if (err || !decoded || typeof decoded === "string") return res.status(401).json({ message: "Unauthorized" });
    const payload = decoded as JwtPayload;
    req.userId = payload.id;
    next();
  });
};

router.post("/create-checkout-session", verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    const { plan } = req.body;
    const { data: user } = await supabase.from("users").select("email").eq("id", req.userId).single();
    
    if (!user) return res.status(404).json({ message: "User not found" });

    const isYearly = plan && String(plan).toLowerCase().includes("yearly");
    const isPro = plan && String(plan).toLowerCase().includes("pro");
    const unitAmount = isPro 
      ? (isYearly ? 49000 : 4900) 
      : (isYearly ? 19000 : 1900);

    console.log(`Checkout Config - Plan: ${plan}, isYearly: ${isYearly}, isPro: ${isPro}, Amount: ${unitAmount}`);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `ImpactGolf ${isPro ? "Pro" : "Standard"} ${isYearly ? "Yearly" : "Monthly"} Membership`,
              description: "Access to all prize draws and charity selections.",
            },
            unit_amount: unitAmount,
            recurring: { interval: isYearly ? "year" : "month" },
          },
          quantity: 1,
        },
      ],
      mode: "subscription",
      customer_email: user.email,
      success_url: `${process.env.FRONTEND_URL}/checkout/success`,
      cancel_url: `${process.env.FRONTEND_URL}/checkout/cancel`,
      metadata: {
        userId: req.userId || "",
        plan: plan,
      },
    });

    console.log(`Checkout Session Created: ${session.id} with metadata:`, session.metadata);

    return res.json({ url: session.url });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    res.status(500).json({ error: message });
  }
});

router.get("/webhook", (req, res) => {
  res.send("Webhook endpoint is active and waiting for Stripe POST requests.");
});

// Webhook to handle successful payments
router.post("/webhook", async (req: any, res: Response) => {
  const sig = req.headers["stripe-signature"] || "";
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET || ""
    );
  } catch (err: any) {
    console.error(`Webhook Error: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log(`Received Webhook: ${event.type}`);

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as any;
    const { userId, plan } = session.metadata;
    console.log(`[STRIPE WEBHOOK] Checkout Successfully Completed! SessionID: ${session.id}`);
    console.log(`[STRIPE WEBHOOK] User=${userId}, Plan=${plan}, Total Amount: $${session.amount_total/100}`);

    if (userId) {
      const renewalDate = new Date();
      if (plan && plan.includes("yearly")) renewalDate.setFullYear(renewalDate.getFullYear() + 1);
      else renewalDate.setMonth(renewalDate.getMonth() + 1);

      // Update user subscription status
      console.log(`[DATABASE] Updating subscription status for User ${userId}...`);
      const { data: updatedRecord, error: updErr } = await supabase.from("users").update({
        subscription_status: "active",
        subscription_plan: plan,
        subscription_renewal_date: renewalDate.toISOString()
      }).eq("id", userId).select("id, name, email, charity_recipient, charity_contribution_percentage").single();
      
      if (updErr) {
        console.error("[DATABASE ERROR] User Update Failed:", updErr.message);
      } else {
        console.log("[DATABASE] User status updated to active!", updatedRecord.email);

        // Handle Charity Impact
        const recipientId = updatedRecord?.charity_recipient;
        const totalCents = session.amount_total;
        
        if (recipientId && totalCents) {
          const userPercentage = updatedRecord?.charity_contribution_percentage || 10;
          const impactAmount = (totalCents / 100) * (userPercentage / 100);
          
          console.log(`[IMPACT] Calculating contribution for Charity ${recipientId}...`);
          console.log(`[IMPACT] Breakdown: $${totalCents/100} * ${userPercentage}% = $${impactAmount}`);

          // Fetch current charity stats
          const { data: charityData, error: fetchErr } = await supabase
            .from("charities")
            .select("total_raised")
            .eq("id", recipientId)
            .single();

          if (fetchErr) {
            console.error(`[DATABASE ERROR] Error fetching charity ${recipientId}:`, fetchErr.message);
          } else {
            const currentTotal = parseFloat(charityData?.total_raised?.toString() || "0");
            const newTotal = currentTotal + impactAmount;

            console.log(`[DATABASE] Updating Charity Total: ${currentTotal} -> ${newTotal}`);

            const { error: charErr } = await supabase
              .from("charities")
              .update({ total_raised: newTotal })
              .eq("id", recipientId);

            if (charErr) {
              console.error(`[DATABASE ERROR] CRITICAL: Failed to update charity raised amount:`, charErr.message);
            } else {
              console.log(`[SUCCESS] Distributed $${impactAmount} to charity ${recipientId}`);
            }
          }
        } else {
          console.warn(`[IMPACT WARNING] Insufficient data for impact: recipientId=${recipientId}, totalCents=${totalCents}`);
        }
      }
    } else {
      console.warn("[STRIPE WEBHOOK WARNING] Received but no userId found in metadata");
    }
  } else {
    console.log(`Bypassing event type: ${event.type}`);
  }

  res.json({ received: true });
});

export default router;
