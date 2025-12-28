import Brevo from "@getbrevo/brevo";
// console.log("global.gConfig.brevoConfig.apiKey",global.gConfig.brevoConfig.apiKey)
const apiInstance = new Brevo.TransactionalEmailsApi();
const brevoConfig = {
    apiKey: "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",
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
