import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";
import { verifyToken, AuthRequest } from "../lib/middleware";

const router = Router();

router.get("/", async (req: Request, res: Response) => {
  try {
    const { data: charities, error } = await supabase.from("charities").select("*").order("name", { ascending: true });
    if (error) throw error;
    res.json(charities || []);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    res.status(500).json({ error: message });
  }
});

router.post("/select", verifyToken, async (req: AuthRequest, res: Response) => {
  const { charityId } = req.body;
  if (!charityId) return res.status(400).json({ message: "Charity ID is required" });

  try {
    const { data: updatedUser, error } = await supabase
      .from("users")
      .update({ charity_recipient: charityId })
      .eq("id", req.userId)
      .select("id, name, email, role, subscription_status, charity_recipient")
      .single();

    if (error) throw error;
    res.json(updatedUser);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    res.status(500).json({ error: message });
  }
});

export default router;
