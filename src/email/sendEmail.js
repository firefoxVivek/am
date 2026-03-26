
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";;
import { sendEmail } from "./brevo.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const rootPath = path.resolve(__dirname, "../..");

async function getTemplateHtml(htmlPath) {
    try {
        const mailPath = path.resolve(rootPath, htmlPath);
        console.log(">>>>>>>>>>>>>>>>", mailPath)
        const emailContent = await fs.readFile(mailPath, "utf8");
        console.log()
        return emailContent;
    } catch (err) {
        throw new Error("Could not load html template",err);
    }
}

export const signupOtpEmail = async (to, subject, otp) => {
    try {
        const emailContent = await getTemplateHtml("emailTemplate/emailOtp.html");
        // console.log(emailContent)
        const html = emailContent.replace("{{OTP}}", otp);
        await sendEmail({ toEmail: to, subject, html });
    } catch (err) {
        throw err;
    }
};


 

