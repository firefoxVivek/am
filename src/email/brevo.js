import Brevo from "@getbrevo/brevo";

const SENDER = {
  name: "Akalpit",
  email: "akalpitofficial@gmail.com",
};

export const sendEmail = async ({ toEmail, subject, html }) => {
  try {
    const apiInstance = new Brevo.TransactionalEmailsApi();
    apiInstance.setApiKey(
      Brevo.TransactionalEmailsApiApiKeys.apiKey,
      process.env.BREVO_API_KEY
    );

    const sendSmtpEmail = new Brevo.SendSmtpEmail();
    sendSmtpEmail.sender = SENDER;
    sendSmtpEmail.to = [{ email: toEmail }];
    sendSmtpEmail.subject = subject;
    sendSmtpEmail.htmlContent = html;

    const response = await apiInstance.sendTransacEmail(sendSmtpEmail);
    return { success: true, messageId: response?.messageId, response };

  } catch (error) {
    return { success: false, error: error.response?.body || error.message };
  }
};