import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { generateToken } from '../utils/helper.js';
import env from './env.js';
import { userModel } from '../models/User.js';
import bcryptjs from 'bcryptjs';
import { sendEmail } from '../utils/sendEmail.js';
import { generateGoogleLoginEmail, generateGoogleWelcomeEmail } from '../utils/Templates/AuthTemplates.js';
import { sendNotification } from '../controllers/notificationController.js';

// Updated strategy:
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.CLIENT_ID,
      clientSecret: process.env.CLIENT_SECRET,
      callbackURL: `${process.env.BACKEND_URL}/users/google/callback`,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails[0].value;
        let user = await userModel.findOne({ 'personalInfo.email': email });

        const loginTime = new Date().toLocaleString('en-US', { timeZone: 'Africa/Nairobi' });

        if (!user) {
          // New user
          const hashedPlaceholderPassword = await bcryptjs.hash(profile.id, 10); // Placeholder for OAuth user
          user = new userModel({
            personalInfo: {
              fullname: profile.displayName,
              email: email.toLowerCase(),
              password: hashedPlaceholderPassword, // No real password needed
              profilePicture: profile.photos[0]?.value || '',
              phone: "+254712345678" , // Default; prompt to update later
              verified: true, // Google-verified
            },
            analytics: { lastActive: new Date() },
          });
          const savedUser = await user.save();

          // Send welcome email to new user
          const welcomeEmailSent = await sendEmail(
            savedUser.personalInfo.email,
            'Welcome to BeiFity.Com!',
            generateGoogleWelcomeEmail(savedUser.personalInfo.fullname, savedUser.personalInfo.email, savedUser.personalInfo.profilePicture)
          );
          if (!welcomeEmailSent) {
            console.warn('Failed to send welcome email to new Google user');
          }

          // Notify admin of new signup (via email or in-app notification)
          const admin = await userModel.findOne({ 'personalInfo.isAdmin': true });
          if (admin) {
           
            // Option 2: Or use in-app notification like in signup (uncomment if preferred)
            await sendNotification(
              admin._id.toString(),
              'report',
              `New Google Signup Details:\nFull Name: ${savedUser.personalInfo.fullname}\nEmail: ${savedUser.personalInfo.email}\nSignup Time: ${loginTime}`,
              savedUser._id.toString()
            );
          }

          console.log(`New Google user created: ${savedUser._id}`);
        } else {
          // Existing user login
          await userModel.updateOne(
            { _id: user._id },
            { 'analytics.lastActive': new Date() }
          );

          if(!user.personalInfo.verified){
            user.personalInfo.verified = true;
            await user.save()
          }


          // Send login notification email to user
          const loginEmailSent = await sendEmail(
            user.personalInfo.email,
            'Login Successful on BeiFity.Com',
            generateGoogleLoginEmail(user.personalInfo.fullname, user.personalInfo.email, loginTime)
          );
          if (!loginEmailSent) {
            console.warn('Failed to send login notification email to Google user');
          }

          // Optional: Notify admin of login (uncomment if needed)
          const admin = await userModel.findOne({ 'personalInfo.isAdmin': true });
           await sendNotification(
              admin._id.toString(),
              'report',
              `User Login via Google Details:\nFull Name: ${user.personalInfo.fullname}\nEmail: ${user.personalInfo.email}\nLogin Time: ${loginTime}`,
              user._id.toString()
            );


          console.log(`Google login for existing user: ${user._id}`);
        }

        const token = generateToken(user._id);
        return done(null, { userId: user._id, token });
      } catch (error) {
        console.error('Google Strategy Error:', error);
        return done(error, null);
      }
    }
  )
);

// Rest of the Passport config remains the same
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));