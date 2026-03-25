import { Router, Request, Response, NextFunction } from "express";
import { supabase } from "../lib/supabase";
import jwt, { JwtPayload } from "jsonwebtoken";
import { sendWinnerAlert, sendDrawResults } from "../lib/email";

const router = Router();

interface AuthRequest extends Request {
  role?: string;
}

const verifyAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(403).json({ message: "No token provided" });
  jwt.verify(token, process.env.JWT_SECRET || "golf-secret", (err: unknown, decoded: unknown) => {
    if (err || !decoded || typeof decoded === "string") return res.status(401).json({ message: "Unauthorized" });
    const payload = decoded as JwtPayload;
    if (payload.role !== "admin") return res.status(401).json({ message: "Unauthorized" });
    next();
  });
};

// User Management
router.get("/users", verifyAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { data: users, error: userErr } = await supabase.from("users")
      .select("id, name, email, role, subscription_status, subscription_plan, created_at, charity_recipient")
      .neq("role", "admin");
    
    if (userErr) throw userErr;

    const { data: charities, error: charErr } = await supabase.from("charities").select("id, name");
    const charityMap = Object.fromEntries((charities || []).map(c => [c.id, c.name]));

    const mappedUsers = (users || []).map(u => ({
        ...u,
        charity: { 
            name: u.charity_recipient ? (charityMap[u.charity_recipient] || "Unknown Charity") : "Not Selected" 
        }
    }));
    
    res.json(mappedUsers);
  } catch (err: unknown) {
    res.status(500).json({ error: "Fetch failed" });
  }
});

router.put("/users/:id", verifyAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { data: updated, error } = await supabase.from("users").update(req.body).eq("id", req.params.id).select().single();
    if (error) throw error;
    res.json(updated);
  } catch (err: unknown) {
    res.status(500).json({ error: "Update failed" });
  }
});

// ─── Charity CRUD Management ─────────────────────────────────────────────────

// Create new charity
router.post("/charities", verifyAdmin, async (req: AuthRequest, res: Response) => {
  const { name, description, featured } = req.body;
  if (!name) return res.status(400).json({ message: "Name is required" });
  try {
    const { data, error } = await supabase.from("charities").insert({
      name,
      description: description || "",
      featured: featured ?? false,
      total_raised: 0
    }).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Create failed";
    res.status(500).json({ error: message });
  }
});

// Update charity
router.put("/charities/:id", verifyAdmin, async (req: AuthRequest, res: Response) => {
  const { name, description, featured } = req.body;
  try {
    const { data, error } = await supabase.from("charities")
      .update({ name, description, featured })
      .eq("id", req.params.id)
      .select().single();
    if (error) throw error;
    res.json(data);
  } catch (err: unknown) {
    res.status(500).json({ error: "Update failed" });
  }
});

// Delete charity
router.delete("/charities/:id", verifyAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { error } = await supabase.from("charities").delete().eq("id", req.params.id);
    if (error) throw error;
    res.json({ message: "Charity deleted successfully" });
  } catch (err: unknown) {
    res.status(500).json({ error: "Delete failed" });
  }
});

// Winner Verification
router.get("/winners", verifyAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { data: winners, error } = await supabase
      .from("winners")
      .select("*, users(name, email), draws(date, draw_type)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    res.json(winners);
  } catch (err: unknown) {
    res.status(500).json({ error: "Fetch failed" });
  }
});

router.post("/verify-payout", verifyAdmin, async (req: AuthRequest, res: Response) => {
  const { winnerId, status } = req.body;
  const newStatus = status === "verified" ? "paid" : "rejected";
  try {
    const { data: winner, error } = await supabase
      .from("winners")
      .update({ verification_status: newStatus })
      .eq("id", winnerId)
      .select().single();
      
    if (error) throw error;
    res.json(winner);
  } catch (err: unknown) {
    res.status(500).json({ error: "Verification failed" });
  }
});

// Stats for Reports & Analytics
router.get("/stats", verifyAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { count: activeSubs } = await supabase.from("users").select("*", { count: 'exact', head: true })
      .eq("subscription_status", "active")
      .neq("role", "admin");
    
    // Aggregate total prize pool from draws
    const { data: draws } = await supabase.from("draws").select("total_prize_pool");
    const totalPrizePool = draws?.reduce((sum, d) => sum + Number(d.total_prize_pool), 0) || 0;
    
    // Aggregate total raised for charities
    const { data: charities } = await supabase.from("charities").select("total_raised");
    const totalRaised = charities?.reduce((sum, c) => sum + Number(c.total_raised || 0), 0) || 0;
    
    // Count pending proofs in winners table
    let pendingProofs = 0;
    const { count: proofsCount, error: proofsErr } = await supabase.from("winners").select("*", { count: 'exact', head: true }).eq("verification_status", "pending");
    if (!proofsErr) {
       pendingProofs = proofsCount || 0;
    }

    res.json({
      activeSubs: activeSubs || 0,
      totalPrizePool,
      totalRaised,
      pendingProofs
    });
  } catch (err: unknown) {
    res.status(500).json({ error: "Stats failed" });
  }
});

// Draw Management
router.get("/draws", verifyAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { data, error } = await supabase.from("draws").select("*").order("date", { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err: unknown) {
    res.status(500).json({ error: "Fetch draws failed" });
  }
});

router.post("/draws/simulate", verifyAdmin, async (req: AuthRequest, res: Response) => {
  const { logic } = req.body;
  try {
    // 1. Calculate real prize pool from active subscriptions
    const { data: activeUsers } = await supabase.from("users")
      .select("subscription_plan")
      .eq("subscription_status", "active")
      .neq("role", "admin");

    const planPrices: Record<string, number> = {
      standard_monthly: 19, pro_monthly: 49,
      standard_yearly: 190 / 12, pro_yearly: 490 / 12
    };

    const monthlyRevenue = (activeUsers || []).reduce((sum, u) => {
      return sum + (planPrices[u.subscription_plan] || 5);
    }, 0);

    // Initial prize pool = 40% of monthly revenue (min 500 for testing)
    let totalPrizePool = Math.max(Math.round(monthlyRevenue * 0.4), 500);

    // ─── Jackpot Rollover Logic ──────────────────────────────────────────────
    // Check if the previous draw had any jackpot winners
    const { data: lastDraw } = await supabase.from("draws").select("id, total_prize_pool")
      .eq("status", "completed")
      .order("date", { ascending: false })
      .limit(1)
      .single();

    let rolloverAmount = 0;
    if (lastDraw) {
        const { count: lastJackpotWinners } = await supabase.from("winners")
            .select("*", { count: 'exact', head: true })
            .eq("draw_id", lastDraw.id)
            .eq("matches", 5);
        
        if (!lastJackpotWinners || lastJackpotWinners === 0) {
            // Carry over 40% of the previous pool (the jackpot tier)
            rolloverAmount = lastDraw.total_prize_pool * 0.40;
            totalPrizePool += rolloverAmount;
        }
    }

    // 2. Generate Winning Numbers based on logic
    let winningNumbers: number[] = [];
    if (logic === "algorithmic") {
      // Use least-frequent scores for fairness
      const { data: allScores } = await supabase.from("scores").select("value");
      const counts: Record<number, number> = {};
      allScores?.forEach(s => counts[s.value] = (counts[s.value] || 0) + 1);
      const sorted = Object.entries(counts)
        .sort((a, b) => a[1] - b[1])  // ascending frequency (rare first)
        .map(([val]) => parseInt(val));
      while (winningNumbers.length < 5) {
        const pick = sorted[winningNumbers.length] ?? (Math.floor(Math.random() * 45) + 1);
        if (!winningNumbers.includes(pick)) winningNumbers.push(pick);
      }
      // Fill remaining with randoms if not enough scores
      while (winningNumbers.length < 5) {
        const r = Math.floor(Math.random() * 45) + 1;
        if (!winningNumbers.includes(r)) winningNumbers.push(r);
      }
    } else {
      while (winningNumbers.length < 5) {
        const r = Math.floor(Math.random() * 45) + 1;
        if (!winningNumbers.includes(r)) winningNumbers.push(r);
      }
    }

    // 3. Preview winner count (don't commit yet)
    const { data: users } = await supabase.from("users")
      .select("id, scores(value)")
      .eq("subscription_status", "active")
      .neq("role", "admin");

    let match5 = 0, match4 = 0, match3 = 0;
    (users || []).forEach(u => {
      const vals = (u.scores as { value: number }[] || []).map(s => s.value);
      const hits = vals.filter(v => winningNumbers.includes(v)).length;
      if (hits === 5) match5++;
      else if (hits === 4) match4++;
      else if (hits === 3) match3++;
    });

    const pool5 = totalPrizePool * 0.40;
    const pool4 = totalPrizePool * 0.35;
    const pool3 = totalPrizePool * 0.25;

    res.json({
      status: "simulation",
      logic: logic || "random",
      estimated_pool: totalPrizePool,
      rollover: rolloverAmount,
      winning_numbers: winningNumbers,
      allocations: { match5: pool5, match4: pool4, match3: pool3 },
      preview_winners: { match5, match4, match3 }
    });
  } catch (err: unknown) {
    res.status(500).json({ error: "Simulation failed" });
  }
});

router.post("/draws/publish", verifyAdmin, async (req: AuthRequest, res: Response) => {
  const { logic, winning_numbers, prize_pool } = req.body;
  try {
    // 1. Create the draw record
    const { data: draw, error: drawErr } = await supabase.from("draws").insert([{
      status: 'completed',
      draw_type: logic,
      total_prize_pool: prize_pool,
      winning_numbers: winning_numbers,
      allocations: {
        match5: prize_pool * 0.4,
        match4: prize_pool * 0.35,
        match3: prize_pool * 0.25
      }
    }]).select().single();

    if (drawErr) throw drawErr;

    // 2. Identify Winners and count them for fair distribution
    const { data: usersWithScores } = await supabase.from("users")
      .select("id, email, scores(value)")
      .eq("subscription_status", "active")
      .neq("role", "admin");
    
    const winners: { id: string, matches: number }[] = [];
    let count5 = 0, count4 = 0, count3 = 0;

    (usersWithScores || []).forEach(u => {
      const vals = (u.scores as { value: number }[] || []).map(s => s.value);
      const hits = vals.filter(v => winning_numbers.includes(v)).length;
      if (hits >= 3) {
        winners.push({ id: u.id, matches: hits });
        if (hits === 5) count5++;
        else if (hits === 4) count4++;
        else if (hits === 3) count3++;
      }
    });

    // 3. Create Winner Records and prepare winner notifications
    const winnerNotifications: Promise<boolean>[] = [];
    
    for (const w of winners) {
      let prize = 0;
      if (w.matches === 5) prize = (prize_pool * 0.40) / (count5 || 1);
      else if (w.matches === 4) prize = (prize_pool * 0.35) / (count4 || 1);
      else if (w.matches === 3) prize = (prize_pool * 0.25) / (count3 || 1);

      const roundedPrize = Math.round(prize * 100) / 100;

      await supabase.from("winners").insert([{
        draw_id: draw.id,
        user_id: w.id,
        matches: w.matches,
        prize_amount: roundedPrize,
        verification_status: 'pending'
      }]);

      // Fetch user email for winner notification
      const { data: winnerUser } = await supabase.from("users").select("email").eq("id", w.id).single();
      if (winnerUser?.email) {
        winnerNotifications.push(sendWinnerAlert(winnerUser.email, roundedPrize, w.matches));
      }
    }

    // 4. Send Global Results Notification to all active subscribers
    const activeEmails = (usersWithScores || []).map(u => u.email).filter(Boolean);
    if (activeEmails.length > 0) {
        // Send global results and winner alerts in background
        Promise.all([
            sendDrawResults(activeEmails, winning_numbers, prize_pool),
            ...winnerNotifications
        ]).catch(e => console.error("Async Email Error:", e));
    }

    res.json({ message: "Draw published and notifications sent", draw, winnersCount: winners.length });
  } catch (err: unknown) {
    res.status(500).json({ error: "Publish failed" });
  }
});

export default router;
