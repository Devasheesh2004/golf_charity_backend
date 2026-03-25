
export interface User {
  id: string; // UUID
  name: string;
  email: string;
  role: "admin" | "subscriber" | "visitor";
  subscription_status: "active" | "inactive" | "canceled" | "past_due";
  subscription_plan?: "monthly" | "yearly";
  subscription_renewal_date?: string;
  charity_contribution_percentage: number;
  total_contribution?: number;
  charity_recipient?: string;
  otp?: string;
  otp_expires?: string; // TIMESTAMPTZ
  created_at: string;
  updated_at: string;
}

export interface Score {
  id: number;
  user_id: string;
  value: number;
  date: string;
}

export interface Charity {
  id: string;
  name: string;
  description?: string;
  logo_url?: string;
  featured: boolean;
  totalRaised: number; // Virtual or aggregated
}

export interface Draw {
  id: string;
  status: 'pending' | 'simulated' | 'completed';
  draw_type: 'random' | 'algorithmic';
  total_prize_pool: number;
  winning_numbers: number[];
  allocations: {
    match5: number;
    match4: number;
    match3: number;
  };
  date: string;
}

export interface Winner {
  id: string;
  draw_id: string;
  user_id: string;
  matches: number;
  prize_amount: number;
  verification_status: 'pending' | 'verified' | 'paid';
  proof_url?: string;
  created_at: string;
}
