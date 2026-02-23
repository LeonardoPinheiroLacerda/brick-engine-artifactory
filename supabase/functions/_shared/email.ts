export const resendEmail = async (to: string, subject: string, html: string) => {
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  
  if (!resendApiKey) {
    console.error("RESEND_API_KEY is not set.");
    return false;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Brick Engine <notifications@resend.dev>", // Ou usar um domínio verificado
        to,
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error("Failed to send email via Resend:", errorText);
      return false;
    }

    const data = await res.json();
    console.log("Email sent successfully:", data);
    return true;
  } catch (err) {
    console.error("Error sending email:", err);
    return false;
  }
};
