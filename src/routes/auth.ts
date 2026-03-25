import { Request, Response, Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { supabase } from "../lib/supabase";
import { sendOTP } from "../lib/email";

const router = Router();

router.post("/register", async (req: Request, res: Response) => {
  try {
    const { name, email, password, role, charity_recipient } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: "Missing fields" });

    const { data: existingUser } = await supabase.from("users").select("id").eq("email", email).single();
    if (existingUser) return res.status(409).json({ message: "User exists" });

    const hashedPassword = await bcrypt.hash(password, 12);
    
    let otp: string | undefined = undefined;
    let otp_expires: string | undefined = undefined;
    
    if (role !== "admin") {
      otp = Math.floor(100000 + Math.random() * 900000).toString();
      otp_expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    }

    const { data: newUser, error } = await supabase.from("users").insert({
      name, 
      email, 
      password: hashedPassword, 
      role: role || "subscriber", 
      charity_recipient,
      otp, 
      otp_expires
    }).select().single();

    if (error) throw new Error(error.message);

    if (otp) {
      const emailSent = await sendOTP(email, otp);
      if (!emailSent) {
        await supabase.from("users").delete().eq("id", newUser.id);
        return res.status(500).json({ message: "Failed to send verification email." });
      }
    }

    res.status(201).json({ 
      message: role === "admin" ? "Account Created" : "Email OTP sent", 
      email, 
      otpRequired: role !== "admin" 
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error";
    res.status(500).json({ message });
  }
});

router.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const { data: user, error } = await supabase.from("users").select("*").eq("email", email).single();

    if (error || !user || !(await bcrypt.compare(password, user.password as string))) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    if (user.role !== "admin") {
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const otp_expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      
      const { error: updErr } = await supabase.from("users").update({ otp, otp_expires }).eq("id", user.id);
      if (updErr) throw new Error(updErr.message);

      const emailSent = await sendOTP(email, otp);
      if (!emailSent) {
        return res.status(500).json({ message: "Failed to send login OTP." });
      }

      return res.json({ message: "OTP required", otpRequired: true, email: user.email });
    }

    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET || "golf-secret", { expiresIn: "1d" });
    res.json({ 
      token, 
      user: { 
        id: user.id, 
        name: user.name, 
        email: user.email, 
        role: user.role,
        subscription_status: user.subscription_status,
        subscription_plan: user.subscription_plan,
        charity_recipient: user.charity_recipient
      } 
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error";
    res.status(500).json({ message });
  }
});

router.post("/verify-otp", async (req: Request, res: Response) => {
  try {
    const { email, otp } = req.body;
    const { data: user, error } = await supabase.from("users").select("*").eq("email", email).single();
    
    if (error || !user || user.otp !== otp || (user.otp_expires && new Date(user.otp_expires) < new Date())) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    await supabase.from("users").update({ otp: null, otp_expires: null }).eq("id", user.id);

    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET || "golf-secret", { expiresIn: "1d" });
    res.json({ 
      token, 
      user: { 
        id: user.id, 
        name: user.name, 
        email: user.email, 
        role: user.role,
        subscription_status: user.subscription_status,
        subscription_plan: user.subscription_plan,
        charity_recipient: user.charity_recipient
      } 
    });
  } catch (err: unknown) {
    res.status(500).json({ message: "OTP verification failed" });
  }
});

import { verifyToken, AuthRequest } from "../lib/middleware";

router.get("/me", verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    const { data: user, error } = await supabase.from("users").select("id, name, email, role, subscription_status, subscription_plan, charity_recipient").eq("id", req.userId).single();
    if (error || !user) throw new Error("User not found");
    res.json(user);
  } catch (err: unknown) {
    res.status(500).json({ message: "Failed to fetch user" });
  }
});

export default router;
