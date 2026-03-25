import sgMail from "@sendgrid/mail";
import dotenv from "dotenv";

dotenv.config();

// Initialize SendGrid
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

const EMAIL_FROM = process.env.EMAIL_FROM || "devasheesh.upreti@gmail.com";

export const sendOTP = async (email: string, otp: string) => {
  try {
    if (!process.env.SENDGRID_API_KEY) {
      console.error("CRITICAL: SENDGRID_API_KEY is missing.");
      return false;
    }

    await sgMail.send({
      to: email,
      from: EMAIL_FROM,
      subject: "Your ImpactGolf Verification Code",
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
          <h2 style="color: #10b981; text-align: center;">ImpactGolf</h2>
          <p>Hello,</p>
          <p>Your verification code for ImpactGolf is:</p>
          <div style="background: #f3f4f6; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
            <span style="font-size: 32px; font-weight: 900; letter-spacing: 5px; color: #111827;">${otp}</span>
          </div>
          <p style="color: #6b7280; font-size: 14px;">This code will expire in 10 minutes. If you did not request this code, please ignore this email.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="font-size: 12px; color: #9ca3af; text-align: center;">&copy; 2026 ImpactGolf Subscription Platform</p>
        </div>
      `,
    });
    return true;
  } catch (error: any) {
    console.error("SendGrid OTP Error:", error.response?.body || error.message);
    return false;
  }
};

export const sendSystemUpdate = async (emails: string[], title: string, content: string) => {
    try {
        if (!process.env.SENDGRID_API_KEY) return false;

        await sgMail.send({
            to: emails,
            from: EMAIL_FROM,
            subject: `📢 System Update: ${title}`,
            html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 12px;">
                <h2 style="color: #10b981;">ImpactGolf Update</h2>
                <h3 style="color: #111827;">${title}</h3>
                <div style="color: #374151; line-height: 1.6; font-size: 15px;">
                  ${content}
                </div>
                <p style="margin-top: 20px; font-size: 13px; color: #6b7280;">Log in to your dashboard to see what's new.</p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
                <p style="font-size: 11px; color: #9ca3af; text-align: center;">You're receiving this as part of your ImpactGolf membership.</p>
              </div>
            `,
        });
        return true;
    } catch (err: any) {
        console.error("SendGrid System Update Error:", err.response?.body || err.message);
        return false;
    }
};

export const sendDrawResults = async (emails: string[], winningNumbers: number[], prizePool: number) => {
  try {
    if (!process.env.SENDGRID_API_KEY) return false;

    await sgMail.send({
      to: emails,
      from: EMAIL_FROM,
      subject: "🏆 Monthly Draw Results are In!",
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #10b981; border-radius: 12px; background: #fdfdfd;">
          <h2 style="color: #10b981; text-align: center; font-size: 24px; font-weight: 900; text-transform: uppercase;">ImpactGolf Results</h2>
          <p style="text-align: center; color: #4b5563;">The official monthly draw has been completed!</p>
          
          <div style="background: #111827; padding: 30px; text-align: center; border-radius: 16px; margin: 25px 0;">
            <p style="color: #9ca3af; font-size: 12px; font-weight: 900; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 15px;">Official Winning Numbers</p>
            <div style="display: flex; justify-content: center; gap: 10px;">
              ${winningNumbers.map(n => `<span style="background: #10b981; color: white; width: 40px; height: 40px; line-height: 40px; border-radius: 50%; font-weight: 900; font-size: 18px; margin: 0 4px; display: inline-block;">${n}</span>`).join("")}
            </div>
          </div>
  
          <div style="text-align: center; margin: 20px 0;">
            <p style="font-size: 14px; color: #6b7280;">Total Monthly Prize Pool</p>
            <p style="font-size: 28px; font-weight: 900; color: #10b981; margin: 5px 0;">$${prizePool.toLocaleString()}</p>
          </div>
  
          <div style="text-align: center; margin-top: 30px;">
            <a href="${process.env.FRONTEND_URL}/dashboard" style="background: #10b981; color: white; padding: 15px 30px; border-radius: 12px; text-decoration: none; font-weight: 900; display: inline-block;">Check My Results</a>
          </div>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
          <p style="font-size: 12px; color: #9ca3af; text-align: center;">You're receiving this because you're an active ImpactGolf subscriber. Together we PAR, together we impact.</p>
        </div>
      `,
    });
    console.log(`[SENDGRID] Results sent to ${emails.length} subscribers`);
    return true;
  } catch (err: any) {
    console.error("SendGrid Draw Results Error:", err.response?.body || err.message);
    return false;
  }
};

export const sendWinnerAlert = async (email: string, amount: number, matches: number) => {
  try {
    if (!process.env.SENDGRID_API_KEY) return false;

    await sgMail.send({
      to: email,
      from: EMAIL_FROM,
      subject: "YOU WON! 🥇 Claim Your ImpactGolf Prize",
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #fbbf24; border-radius: 12px; background: #fffcf0;">
          <h2 style="color: #b45309; text-align: center; font-size: 24px; font-weight: 900;">CONGRATULATIONS!</h2>
          <p style="text-align: center; color: #1e293b; font-size: 18px; font-weight: 700;">You matched ${matches} numbers!</p>
          
          <div style="background: #ffffff; border: 2px dashed #fbbf24; padding: 30px; text-align: center; border-radius: 16px; margin: 25px 0;">
            <p style="color: #64748b; font-size: 12px; font-weight: 900; text-transform: uppercase;">Your Estimated Prize</p>
            <p style="font-size: 42px; font-weight: 900; color: #059669; margin: 10px 0;">$${amount.toLocaleString()}</p>
          </div>
  
          <div style="background: #1e293b; color: white; padding: 25px; border-radius: 16px; margin: 20px 0;">
            <h4 style="margin: 0 0 10px 0; color: #fbbf24;">Action Required to Claim:</h4>
            <ol style="margin: 0; padding-left: 20px; font-size: 14px; line-height: 1.6;">
              <li>Log in to your ImpactGolf Dashboard</li>
              <li>Upload a screenshot/ID of your scorecard for verification</li>
              <li>Our team will verify & process your payout manually</li>
            </ol>
          </div>
  
          <div style="text-align: center; margin-top: 30px;">
            <a href="${process.env.FRONTEND_URL}/dashboard" style="background: #fbbf24; color: #451a03; padding: 15px 30px; border-radius: 12px; text-decoration: none; font-weight: 900; display: inline-block;">Verify & Claim Prize</a>
          </div>
        </div>
      `,
    });
    console.log(`[SENDGRID WINNER] Prize alert sent to ${email}`);
    return true;
  } catch (err: any) {
    console.error("SendGrid Winner Alert Error:", err.response?.body || err.message);
    return false;
  }
};
