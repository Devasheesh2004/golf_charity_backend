import { Router, Request, Response, NextFunction } from "express";
import { supabase } from "../lib/supabase";
import jwt, { JwtPayload } from "jsonwebtoken";

const router = Router();

interface AuthRequest extends Request {
  role?: string;
}

const verifyToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(403).json({ message: "No token provided" });
  jwt.verify(token, process.env.JWT_SECRET || "golf-secret", (err, decoded) => {
    if (err || !decoded || typeof decoded === "string") return res.status(401).json({ message: "Unauthorized" });
    req.role = (decoded as any).role;
    next();
  });
};

// Only admins can trigger draws
router.post("/simulate", verifyToken, async (req: AuthRequest, res: Response) => {
  if (req.role !== "admin") return res.status(403).json({ message: "Forbidden" });

  try {
    const { drawType } = req.body;
    
    // 1. Calculate Winning Numbers
    let winningNumbers: number[] = [];
    if (drawType === "algorithmic") {
      const { data: allScores } = await supabase.from("scores").select("value");
      const counts: Record<number, number> = {};
      allScores?.forEach(s => counts[s.value] = (counts[s.value] || 0) + 1);
      const frequencies = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .map(([val]) => parseInt(val));
      
      while(winningNumbers.length < 5) {
        const leastFrequent = frequencies.slice(-10);
        const r = leastFrequent[Math.floor(Math.random() * leastFrequent.length)] || (Math.floor(Math.random() * 45) + 1);
        if (!winningNumbers.includes(r)) winningNumbers.push(r);
      }
    } else {
      while(winningNumbers.length < 5) {
        const r = Math.floor(Math.random() * 45) + 1;
        if (!winningNumbers.includes(r)) winningNumbers.push(r);
      }
    }

    // 2. Fetch Active Subscribers for Pool Calculation
    const { count: activeSubscribers } = await supabase.from("users").select("*", { count: 'exact', head: true })
      .eq("subscription_status", "active")
      .neq("role", "admin");
    const poolPerSub = 5;
    const totalPrizePool = (activeSubscribers || 0) * poolPerSub || 15000;

    // 3. Find Winners
    const { data: users } = await supabase.from("users").select("id, email, scores(value, date)")
      .eq("subscription_status", "active")
      .neq("role", "admin");
    const winners: any[] = [];
    
    users?.forEach(user => {
      // Get most recent 5 scores
      const userScoreValues = (user.scores as any[] || [])
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 5)
        .map(s => s.value);
        
      const matches = userScoreValues.filter((v: number) => winningNumbers.includes(v)).length;
      
      if (matches >= 3) {
        winners.push({
          user_id: user.id,
          matches: matches,
          prize_amount: 0 
        });
      }
    });

    // 4. Distribute Prizes
    const match5Count = winners.filter(w => w.matches === 5).length;
    const match4Count = winners.filter(w => w.matches === 4).length;
    const match3Count = winners.filter(w => w.matches === 3).length;

    const pool5 = totalPrizePool * 0.40;
    const pool4 = totalPrizePool * 0.35;
    const pool3 = totalPrizePool * 0.25;

    winners.forEach(w => {
      if (w.matches === 5 && match5Count > 0) w.prize_amount = pool5 / match5Count;
      if (w.matches === 4 && match4Count > 0) w.prize_amount = pool4 / match4Count;
      if (w.matches === 3 && match3Count > 0) w.prize_amount = pool3 / match3Count;
    });

    const { data: newDraw, error } = await supabase.from("draws").insert({
      status: "simulated",
      draw_type: drawType || "random",
      winning_numbers: winningNumbers,
      total_prize_pool: totalPrizePool,
      allocations: { match5: pool5, match4: pool4, match3: pool3 }
    }).select().single();

    if (error) throw new Error(error.message);

    // Insert winners
    if (winners.length > 0) {
      await supabase.from("winners").insert(winners.map(w => ({
        draw_id: newDraw.id,
        user_id: w.user_id,
        matches: w.matches,
        prize_amount: w.prize_amount,
        verification_status: "pending"
      })));
    }

    res.json({ ...newDraw, winners });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    res.status(500).json({ error: message });
  }
});

router.post("/publish/:id", verifyToken, async (req: AuthRequest, res: Response) => {
  if (req.role !== "admin") return res.status(403).json({ message: "Forbidden" });
  try {
    const { error } = await supabase.from("draws").update({ status: "completed" }).eq("id", req.params.id);
    if (error) throw error;
    res.json({ message: "Published" });
  } catch (error: unknown) {
    res.status(500).json({ error: "Failed to publish" });
  }
});

router.get("/latest", async (req: Request, res: Response) => {
  try {
    const { data: draw, error } = await supabase
      .from("draws")
      .select("*, winners(*, users(name, email))")
      .eq("status", "completed")
      .order("date", { ascending: false })
      .limit(1)
      .single();

    if (error) throw error;
    res.json(draw);
  } catch (error: unknown) {
    res.status(500).json({ error: "Failed to fetch results" });
  }
});

router.get("/recent", async (req: Request, res: Response) => {
    // Mock recent winners for the track record
    const mockWinners = [
        { name: "John D.", prize: "$500", date: "2 mins ago" },
        { name: "Sarah S.", prize: "$2,500", date: "15 mins ago" },
        { name: "Mike R.", prize: "$100", date: "1 hour ago" },
        { name: "Ellen W.", prize: "$1,200", date: "3 hours ago" },
        { name: "GolfGuy99", prize: "$400", date: "Yesterday" }
    ];
    res.json(mockWinners);
});

export default router;
