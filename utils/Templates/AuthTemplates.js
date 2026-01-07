
import sanitizeHtml from 'sanitize-html';

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://www.beifity.com';
// Sanitize-html configuration
const sanitizeConfig = {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'span', 'div', 'hr']),
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    a: ['href', 'style'],
    img: ['src', 'alt', 'style'],
    div: ['style'],
    p: ['style'],
    span: ['style'],
    table: ['style', 'cellpadding', 'cellspacing', 'width', 'role'],
    tr: ['style'],
    td: ['style', 'align'],
    hr: ['style'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  transformTags: {
    a: (tagName, attribs) => ({
      tagName,
      attribs: {
        ...attribs,
        href: attribs.href ? sanitizeHtml(attribs.href, { allowedSchemes: ['http', 'https', 'mailto'] }) : attribs.href,
      },
    }),
  },
};

// Capitalize product names
const capitalizeWords = (str) => {
  return str
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};


// Add these new email template functions to templates.js

// HTML Email Template for New Google User Welcome (User)
export const generateGoogleWelcomeEmail = (userName, email, profilePicture = '') => {
  const sanitizedUserName = sanitizeHtml(userName, sanitizeConfig);
  const sanitizedEmail = sanitizeHtml(email, sanitizeConfig);
  const sanitizedProfilePicture = sanitizeHtml(profilePicture, { ...sanitizeConfig, allowedSchemes: ['https'] });

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Welcome to BeiFity.Com!</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="padding: 20px;">
        <tr>
          <td align="center">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 20px; background-color: #ffffff; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1); text-align: center;">
              <tr>
                <td>
                  <img src="https://www.beifity.com/assets/logo-without-CMu8rsBL.png" alt="BeiFity.Com Logo" style="width: auto; height: 70px; margin-bottom: 30px; display: block; margin-left: auto; margin-right: auto;">
                </td>
              </tr>
              <tr>
                <td>
                  <h2 style="font-size: 20px; font-weight: 700; color: #1e40af; margin-bottom: 20px;">Welcome, ${sanitizedUserName}!</h2>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 15px; font-weight: 600; color: #1e293b; margin-bottom: 25px;">Your BeiFity.Com Account is Ready!</p>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #475569; line-height: 1.6; margin-bottom: 30px;">
                    Hi ${sanitizedUserName},<br><br>
                    Thanks for signing up with Google on <span style="color: #1e40af; font-weight: 600;">BeiF<span style="color: #fbbf24;">ity.Com</span></span>! Your email is already verified, so you're all set to start exploring.<br><br>
                    Add your phone number to complete your profile and unlock full features like chatting with sellers or buyers.
                  </p>
                </td>
              </tr>
              <tr>
                <td>
                  ${sanitizedProfilePicture ? `<img src="${sanitizedProfilePicture}" alt="Your Profile Picture" style="width: 100px; height: 100px; border-radius: 50%; margin-bottom: 20px; display: block; margin-left: auto; margin-right: auto;">` : ''}
                  <div style="background-color: #f0f4f8; padding: 20px; border-radius: 8px; text-align: left; margin-bottom: 30px;">
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Your Account Details:</strong></p>
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Full Name:</strong> ${sanitizedUserName}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0;"><strong>Email:</strong> ${sanitizedEmail}</p>
                  </div>
                </td>
              </tr>
              <tr>
                <td>
                  <a href="${FRONTEND_URL}/edit-profile" style="display: inline-block; background-color: #1e40af; color: #ffffff; font-size: 14px; font-weight: 600; padding: 12px 25px; text-decoration: none; border-radius: 6px; margin-bottom: 10px;">Complete Your Profile</a>
                  <br>
                  <a href="${FRONTEND_URL}/upload-product" style="display: inline-block; background-color: #10b981; color: #ffffff; font-size: 14px; font-weight: 600; padding: 12px 25px; text-decoration: none; border-radius: 6px; margin-bottom: 30px;">List Your First Product</a>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Next Steps:</strong> Update your phone number and start buying or selling today. We're excited to have you!
                  </p>
                  <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Need Help?</strong> Check your dashboard or contact support.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="margin-top: 30px;">
                  <p style="font-size: 14px; color: #64748b; margin: 0;">Happy trading on BeiFity!</p>
                  <span style="color: #1e40af; font-weight: 700; font-size: 14px;">BeiF<span style="color: #fbbf24;">ity.Com</span></span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
};

// HTML Email Template for Google Login Notification (User)
export const generateGoogleLoginEmail = (userName, email, loginTime) => {
  const sanitizedUserName = sanitizeHtml(userName, sanitizeConfig);
  const sanitizedEmail = sanitizeHtml(email, sanitizeConfig);
  const sanitizedLoginTime = sanitizeHtml(loginTime, sanitizeConfig);

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Login Successful - BeiFity.Com</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="padding: 20px;">
        <tr>
          <td align="center">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 20px; background-color: #ffffff; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1); text-align: center;">
              <tr>
                <td>
                  <img src="https://www.beifity.com/assets/logo-without-CMu8rsBL.png" alt="BeiFity.Com Logo" style="width: auto; height: 70px; margin-bottom: 30px; display: block; margin-left: auto; margin-right: auto;">
                </td>
              </tr>
              <tr>
                <td>
                  <h2 style="font-size: 20px; font-weight: 700; color: #1e40af; margin-bottom: 20px;">Welcome Back, ${sanitizedUserName}!</h2>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 15px; font-weight: 600; color: #1e293b; margin-bottom: 25px;">You Logged In Successfully</p>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #475569; line-height: 1.6; margin-bottom: 30px;">
                    Hi ${sanitizedUserName},<br><br>
                    We're glad to see you back on <span style="color: #1e40af; font-weight: 600;">BeiF<span style="color: #fbbf24;">ity.Com</span></span>! You just signed in using Google at ${sanitizedLoginTime}.<br><br>
                    If this wasn't you, please secure your account immediately.
                  </p>
                </td>
              </tr>
              <tr>
                <td>
                  <div style="background-color: #f0f4f8; padding: 20px; border-radius: 8px; text-align: left; margin-bottom: 30px;">
                    <p style="font-size: 14px; color: #1e40af; font-weight: 600; margin: 0 0 10px;">Login Details</p>
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Account Email:</strong> ${sanitizedEmail}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0;"><strong>Login Time:</strong> ${sanitizedLoginTime}</p>
                  </div>
                </td>
              </tr>
              <tr>
                <td>
                  <a href="${FRONTEND_URL}/user-profile" style="display: inline-block; background-color: #1e40af; color: #ffffff; font-size: 14px; font-weight: 600; padding: 12px 25px; text-decoration: none; border-radius: 6px; margin-bottom: 10px;">Go to Profile</a>
                  <br>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Next Steps:</strong> Continue browsing products or manage your listings.
                  </p>
                  <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Need Help?</strong> Contact our support team.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="margin-top: 30px;">
                  <p style="font-size: 14px; color: #64748b; margin: 0;">See you soon on BeiFity!</p>
                  <span style="color: #1e40af; font-weight: 700; font-size: 14px;">BeiF<span style="color: #fbbf24;">ity.Com</span></span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
};

// HTML Email Template for Admin New Google Signup Notification
export const generateAdminGoogleSignupEmail = (adminName, newUserName, newUserEmail, signupTime) => {
  const sanitizedAdminName = sanitizeHtml(adminName, sanitizeConfig);
  const sanitizedNewUserName = sanitizeHtml(newUserName, sanitizeConfig);
  const sanitizedNewUserEmail = sanitizeHtml(newUserEmail, sanitizeConfig);
  const sanitizedSignupTime = sanitizeHtml(signupTime, sanitizeConfig);

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>New Google Signup - Admin Notification</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="padding: 20px;">
        <tr>
          <td align="center">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 20px; background-color: #ffffff; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1); text-align: center;">
              <tr>
                <td>
                  <img src="https://www.beifity.com/assets/logo-without-CMu8rsBL.png" alt="BeiFity.Com Logo" style="width: auto; height: 70px; margin-bottom: 30px; display: block; margin-left: auto; margin-right: auto;">
                </td>
              </tr>
              <tr>
                <td>
                  <h2 style="font-size: 20px; font-weight: 700; color: #1e40af; margin-bottom: 20px;">New User Signup via Google</h2>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 15px; font-weight: 600; color: #1e293b; margin-bottom: 25px;">Admin Notification</p>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #475569; line-height: 1.6; margin-bottom: 30px;">
                    Hi ${sanitizedAdminName},<br><br>
                    A new user has signed up on <span style="color: #1e40af; font-weight: 600;">BeiF<span style="color: #fbbf24;">ity.Com</span></span> using Google OAuth.
                  </p>
                </td>
              </tr>
              <tr>
                <td>
                  <div style="background-color: #f0f4f8; padding: 20px; border-radius: 8px; text-align: left; margin-bottom: 30px;">
                    <p style="font-size: 14px; color: #1e40af; font-weight: 600; margin: 0 0 10px;">New User Details</p>
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Full Name:</strong> ${sanitizedNewUserName}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Email:</strong> ${sanitizedNewUserEmail}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0;"><strong>Signup Time:</strong> ${sanitizedSignupTime}</p>
                  </div>
                </td>
              </tr>
              <tr>
                <td>
                  <a href="${FRONTEND_URL}/admin/users" style="display: inline-block; background-color: #1e40af; color: #ffffff; font-size: 14px; font-weight: 600; padding: 12px 25px; text-decoration: none; border-radius: 6px; margin-bottom: 30px;">View Users Dashboard</a>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Next Steps:</strong> Monitor the new user's activity in the admin dashboard.
                  </p>
                  <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Need Assistance?</strong> Reach out to the support team.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="margin-top: 30px;">
                  <p style="font-size: 14px; color: #64748b; margin: 0;">Manage your platform on BeiFity!</p>
                  <span style="color: #1e40af; font-weight: 700; font-size: 14px;">BeiF<span style="color: #fbbf24;">ity.Com</span></span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
};

// HTML Email Template for Admin Google Login Notification (Optional - if you want to notify admin on every login)
export const generateAdminGoogleLoginEmail = (adminName, userName, userEmail, loginTime) => {
  const sanitizedAdminName = sanitizeHtml(adminName, sanitizeConfig);
  const sanitizedUserName = sanitizeHtml(userName, sanitizeConfig);
  const sanitizedUserEmail = sanitizeHtml(userEmail, sanitizeConfig);
  const sanitizedLoginTime = sanitizeHtml(loginTime, sanitizeConfig);

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>User Login via Google - Admin Notification</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="padding: 20px;">
        <tr>
          <td align="center">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 20px; background-color: #ffffff; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1); text-align: center;">
              <tr>
                <td>
                  <img src="https://www.beifity.com/assets/logo-without-CMu8rsBL.png" alt="BeiFity.Com Logo" style="width: auto; height: 70px; margin-bottom: 30px; display: block; margin-left: auto; margin-right: auto;">
                </td>
              </tr>
              <tr>
                <td>
                  <h2 style="font-size: 20px; font-weight: 700; color: #1e40af; margin-bottom: 20px;">User Login via Google</h2>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 15px; font-weight: 600; color: #1e293b; margin-bottom: 25px;">Admin Notification</p>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #475569; line-height: 1.6; margin-bottom: 30px;">
                    Hi ${sanitizedAdminName},<br><br>
                    A user has logged in on <span style="color: #1e40af; font-weight: 600;">BeiF<span style="color: #fbbf24;">ity.Com</span></span> using Google OAuth.
                  </p>
                </td>
              </tr>
              <tr>
                <td>
                  <div style="background-color: #f0f4f8; padding: 20px; border-radius: 8px; text-align: left; margin-bottom: 30px;">
                    <p style="font-size: 14px; color: #1e40af; font-weight: 600; margin: 0 0 10px;">Login Details</p>
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>User Name:</strong> ${sanitizedUserName}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Email:</strong> ${sanitizedUserEmail}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0;"><strong>Login Time:</strong> ${sanitizedLoginTime}</p>
                  </div>
                </td>
              </tr>
              <tr>
                <td>
                  <a href="${FRONTEND_URL}/admin/users" style="display: inline-block; background-color: #1e40af; color: #ffffff; font-size: 14px; font-weight: 600; padding: 12px 25px; text-decoration: none; border-radius: 6px; margin-bottom: 30px;">View Users Dashboard</a>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Next Steps:</strong> Review user activity if needed.
                  </p>
                  <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Need Assistance?</strong> Contact support.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="margin-top: 30px;">
                  <p style="font-size: 14px; color: #64748b; margin: 0;">Manage your platform on BeiFity!</p>
                  <span style="color: #1e40af; font-weight: 700; font-size: 14px;">BeiF<span style="color: #fbbf24;">ity.Com</span></span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
};