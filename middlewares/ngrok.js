import ngrok from '@ngrok/ngrok';
import dotenv from 'dotenv';
dotenv.config();

let domain = null;

export const connectNgrok = async (req, res, next) => {
    console.log('Connecting to Ngrok...');
    try {
        domain = process.env.DOMAIN || null;
        const authToken = process.env.NGROK_AUTH_TOKEN;
        console.log('Ngrok auth token:', authToken ? 'Present' : 'Not Set');

        if (!authToken) {
            console.warn('Ngrok auth token not set in environment variables.');
            return res.status(500).json({ success: false, message: 'Ngrok auth token missing' });
        }

        if (!domain) {
            console.log('No DOMAIN set, establishing new Ngrok tunnel...');
            const url = await ngrok.connect({
                addr: process.env.PORT || 4000,
                authtoken: authToken,   // ✅ use correct variable     
            }); 
            console.log('Ngrok URL:', url.url());         
            process.env.DOMAIN = url.url()    // ✅ assign directly
            console.log(`Ngrok tunnel established at: ${domain}`);
        } else {
            console.log(`Using provided domain: ${domain}`);
        }
        console.log(`Request domain set to: ${process.env.DOMAIN}`);
        next();
    } catch (error) {
        console.error('Error connecting to Ngrok:', error);
        res.status(500).json({ success: false, message: 'Failed to connect to Ngrok', error: error.message });
    }
};
