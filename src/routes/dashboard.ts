import { Request, Response, Router } from "express";
import { supabase } from "../lib/supabase";
import { verifyToken, AuthRequest } from "../lib/middleware";

const router = Router();

router.get("/stats", verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    // Attempt with fallback for potentially missing columns
    const { data: user, error: userErr } = await supabase
      .from("users")
      .select("*")
      .eq("id", req.userId)
      .single();

    if (userErr || !user) throw new Error(userErr?.message || "User not found");

    // Fetch charity separately using correct column names
    let charityInfo = { name: "None", percentage: 10, total_contributed: 0 };
    if (user.charity_recipient) {
        const { data: charity } = await supabase
          .from("charities")
          .select("name, total_raised")
          .eq("id", user.charity_recipient)
          .single();
        if (charity) {
            charityInfo = {
                name: charity.name,
                percentage: user.charity_contribution_percentage || 10,
                total_contributed: parseFloat(charity.total_raised?.toString() || "0")
            };
        }
    }

    // Fetch next draw date
    const { data: draws } = await supabase
      .from("draws")
      .select("date")
      .eq("status", "pending")
      .order("date", { ascending: true })
      .limit(1);

    const nextDraw = draws && draws[0] ? draws[0].date : null;

    // Participation count (completed draws)
    const { count: drawsEntered } = await supabase
      .from("draws")
      .select("*", { count: "exact", head: true })
      .eq("status", "completed");

    // Winnings
    const { data: wins } = await supabase
      .from("winners")
      .select("prize_amount")
      .eq("user_id", req.userId)
      .eq("verification_status", "paid");
    const totalWon = wins?.reduce((sum: number, w: { prize_amount: number }) => sum + Number(w.prize_amount), 0) || 0;

    res.json({
      subscription: {
        status: user.subscription_status || "inactive",
        plan: user.subscription_plan || "none",
        renewal_date: user.subscription_renewal_date,
      },
      charity: charityInfo,
      participation: {
        total_draws_entered: drawsEntered || 0,
        next_draw_date: nextDraw,
      },
      winnings: {
        total_won: totalWon,
      }
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Error";
    console.error("Dashboard Stats Error:", errorMsg);
    res.status(500).json({ 
        message: `Dashboard Error: ${errorMsg}`, 
    });
  }
});

router.put("/update-contribution", verifyToken, async (req: AuthRequest, res: Response) => {
    const { percentage } = req.body;
    if (percentage < 10) return res.status(400).json({ message: "Minimum 10% Required" });

    const { error } = await supabase.from("users").update({ 
        charity_contribution_percentage: percentage   // fixed column name
    }).eq("id", req.userId);

    if (error) return res.status(500).json({ message: error.message });
    res.json({ success: true });
});

router.put("/select-charity", verifyToken, async (req: AuthRequest, res: Response) => {
    const { charityId } = req.body;
    if (!charityId) return res.status(400).json({ message: "Charity ID Required" });

    const { error } = await supabase.from("users").update({ 
        charity_recipient: charityId 
    }).eq("id", req.userId);

    if (error) return res.status(500).json({ message: error.message });
    res.json({ success: true });
});

// Winner Verification routes
router.get("/winnings", verifyToken, async (req: AuthRequest, res: Response) => {
    try {
        const { data: wins, error } = await supabase
            .from("winners")
            .select("*, draws(date, winning_numbers)")
            .eq("user_id", req.userId)
            .order("created_at", { ascending: false });
        
        if (error) throw error;
        res.json(wins || []);
    } catch (err: unknown) {
        res.status(500).json({ message: "Failed to fetch winnings" });
    }
});

router.post("/winnings/:winId/verify", verifyToken, async (req: AuthRequest, res: Response) => {
    const { proofUrl } = req.body;
    const { winId } = req.params;

    if (!proofUrl) return res.status(400).json({ message: "Proof screenshot URL is required" });

    try {
        // Ensure user owns this win
        const { data: win, error: checkErr } = await supabase
            .from("winners")
            .select("*")
            .eq("id", winId)
            .eq("user_id", req.userId)
            .single();
        
        if (checkErr || !win) return res.status(404).json({ message: "Winning record not found or unauthorized" });

        const { error: updateErr } = await supabase
            .from("winners")
            .update({ 
                proof_url: proofUrl,
                verification_status: "verified" // User submitted, now pending admin review
            })
            .eq("id", winId);

        if (updateErr) throw updateErr;
        res.json({ success: true, message: "Proof submitted for verification" });
    } catch (err: unknown) {
        res.status(500).json({ message: "Failed to submit verification" });
    }
});

export default router;
