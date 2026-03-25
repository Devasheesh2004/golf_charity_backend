import { Router, Request, Response, NextFunction } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import { supabase } from "../lib/supabase";

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

router.get("/", verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    const { data: scores, error } = await supabase
      .from("scores")
      .select("*")
      .eq("user_id", req.userId)
      .order("date", { ascending: false })
      .limit(5);

    if (error) throw error;
    res.json(scores || []);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error";
    res.status(500).json({ message });
  }
});

router.post("/", verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    const { score } = req.body;
    if (score < 1 || score > 45) return res.status(400).json({ message: "Invalid score range" });

    const { error: insErr } = await supabase.from("scores").insert({
      user_id: req.userId,
      value: score,
      date: new Date().toISOString()
    });

    if (insErr) throw insErr;

    // Return latest 5 for UI consistency
    const { data: latestFive } = await supabase
      .from("scores")
      .select("*")
      .eq("user_id", req.userId)
      .order("date", { ascending: false })
      .limit(5);

    res.json(latestFive);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error";
    res.status(500).json({ message });
  }
});

router.put("/:id", verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { score } = req.body;
    if (score < 1 || score > 45) return res.status(400).json({ message: "Invalid score range" });

    const { error } = await supabase
      .from("scores")
      .update({ value: score })
      .eq("id", id)
      .eq("user_id", req.userId);

    if (error) throw error;

    const { data: latestFive } = await supabase
      .from("scores")
      .select("*")
      .eq("user_id", req.userId)
      .order("date", { ascending: false })
      .limit(5);

    res.json(latestFive || []);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error";
    res.status(500).json({ message });
  }
});

router.delete("/:id", verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from("scores").delete().eq("id", id).eq("user_id", req.userId);
    if (error) throw error;

    const { data: latestFive } = await supabase
      .from("scores")
      .select("*")
      .eq("user_id", req.userId)
      .order("date", { ascending: false })
      .limit(5);

    res.json(latestFive || []);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error";
    res.status(500).json({ message });
  }
});

export default router;
