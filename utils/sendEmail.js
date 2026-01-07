import { Resend } from "resend";
import env from "../config/env.js";

export const sendEmail = async (email, subject, text) => {
  try {
    // Initialize Resend client
    const resend = new Resend(process.env.RESEND_API_KEY);

    // Send email
    const { data, error } = await resend.emails.send({
      from: `"BeiFity.Com" <customer.care@beifity.com>`, // Replace with your verified domain
      to: email, // Recipient address
      subject: subject, // Email subject
      html: text, // Email body (HTML)
    });

    if (error) {
      console.error("Error sending email:", error);
      return false;
    }

    console.log("Email sent successfully:", data);
    return true;
  } catch (error) {
    console.error("Error sending email:", error);
    return false;
  }
};