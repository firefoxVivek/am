import Brevo from "@getbrevo/brevo";
// console.log("global.gConfig.brevoConfig.apiKey",global.gConfig.brevoConfig.apiKey)
const apiInstance = new Brevo.TransactionalEmailsApi();
const brevoConfig = {
    apiKey: process.env.BREVO_API_KEY,
    
    senderName: "Penverse",
    senderEmail: "noreplypenverse@gmail.com"
}
apiInstance.setApiKey(
    Brevo.TransactionalEmailsApiApiKeys.apiKey,
    brevoConfig.apiKey
);

const SENDER = {
    name: brevoConfig.senderName,
    email: brevoConfig.senderEmail,
};
export const sendEmail = async ({ toEmail, subject, html }) => {
    // console.log("called")
    try {
        const sendSmtpEmail = new Brevo.SendSmtpEmail();
        sendSmtpEmail.sender = SENDER;
        sendSmtpEmail.to = [{ email: toEmail }];
        sendSmtpEmail.subject = subject;
        sendSmtpEmail.htmlContent = html;
        // console.log(sendSmtpEmail)
        const response = await apiInstance.sendTransacEmail(sendSmtpEmail);
        // console.log(response)
        return { success: true, messageId: response?.messageId, response };
    } catch (error) {
        // console.log(error)
        return { success: false, error: error.response?.body || error.message, };
    }
};
