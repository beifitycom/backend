// jobs/expireListings.js
import mongoose from 'mongoose';
import cron from 'node-cron';
import { listingModel } from '../models/Listing.js';
import { userModel } from '../models/User.js';
import { emailLogModel } from '../models/EmailLog.js';
import { sendEmail } from './sendEmail.js';
import { generateMarketingEmail, generateMarketingAdminReportEmail } from './Templates.js';
import logger from './logger.js';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import sanitizeHtml from 'sanitize-html';

// Initialize Google Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'AIzaSyBlFGT7JBMIAnA5QxPPhd3dcQ_MmrMhDLk');
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

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

// Function to slugify product names for URLs
const slugify = (text) => {
  return text
    .toString()
    .toLowerCase()
    .replace(/\s+/g, '-') // Replace spaces with -
    .replace(/[^\w\-]+/g, '') // Remove non-word chars
    .replace(/\-\-+/g, '-') // Replace multiple - with single -
    .replace(/^-+/, '') // Trim - from start
    .replace(/-+$/, ''); // Trim - from end
};

// Marketing Email Job
export const marketingEmailJob = cron.schedule('0 */5 * * *', async () => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    // Fetch users who opted into marketing emails
    const allUsers = await userModel
      .find({
        'preferences.marketingEmails': true,
        'personalInfo.email': { $exists: true, $ne: null },
        _id: { $exists: true }
      })
      .select('personalInfo.email personalInfo.fullname _id')
      .session(session);

    if (allUsers.length === 0) {
      logger.warn('Marketing email job: No valid users found with marketing emails enabled');
      await session.commitTransaction();
      return;
    }

    // Fetch recent email logs to exclude recently contacted users
    const recentEmails = await emailLogModel
      .find({ emailType: 'marketing' })
      .sort({ sentAt: -1 })
      .limit(allUsers.length)
      .select('userId')
      .session(session);

    const recentUserIds = recentEmails.map(log => log.userId.toString());
    let eligibleUsers = allUsers
      .filter(user => !recentUserIds.includes(user._id.toString()))
      .slice(0, 5); // Take up to 5 users

    // If no eligible users, reset rotation by selecting least recently contacted
    if (eligibleUsers.length === 0) {
      logger.info('No eligible users found; resetting rotation to least recently contacted');
      eligibleUsers = await userModel
        .find({
          'preferences.marketingEmails': true,
          'personalInfo.email': { $exists: true, $ne: null },
          _id: { $exists: true }
        })
        .sort({ 'analytics.lastActive': 1 }) // Prioritize least active
        .limit(5)
        .select('personalInfo.email personalInfo.fullname _id')
        .session(session);
    }

    if (eligibleUsers.length === 0) {
      logger.warn('Marketing email job: No eligible users available after reset');
      await session.commitTransaction();
      return;
    }

    // Log eligible users for debugging
    logger.info(`Eligible users: ${eligibleUsers.map(u => u.personalInfo.email).join(', ')}`);

    // Fetch 3 random active, verified listings with inventory
    const listings = await listingModel
      .find({
        isActive: true,
        verified: 'Verified',
        inventory: { $gt: 0 },
        expiresAt: { $gt: new Date() },
      })
      .limit(3)
      .select('productInfo.name productInfo.price productInfo.images productInfo.description productInfo.productId')
      .session(session);

    if (listings.length === 0) {
      logger.warn('Marketing email job: No active, verified listings available');
      await session.commitTransaction();
      return;
    }

    // Enhance product descriptions with Gemini
    const products = [];
    for (const listing of listings) {
      const productInfo = listing.productInfo;
      const prompt = `
        You are a marketing assistant for Beifity.com, an e-commerce platform in Kenya. Enhance the product description for the following item to make it more engaging, persuasive, and concise for a marketing email. The tone should be friendly, professional, and appealing to Kenyan shoppers. Use vivid, positive wording to highlight the product's benefits.

        **Product Details**:
        - Name: ${productInfo.name}
        - Price: KES ${productInfo.price}
        - Original Description: ${productInfo.description}

        **Instructions**:
        - Generate a description of 100-150 characters.
        - Emphasize the product's unique features and benefits.
        - Keep the tone friendly and persuasive, suitable for an email.
        - Avoid altering factual details (e.g., do not change the product type or core features).
        - Return the enhanced description as plain text.

        **Example**:
        Original: "Grey Chester Bed, comfortable, modern design."
        Enhanced: "Transform your bedroom with the sleek Grey Chester Bed! Enjoy cozy comfort and modern style at an unbeatable price."
      `;

      let enhancedDescription = productInfo.description; // Fallback to original
      try {
        const result = await model.generateContent({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.8,
            maxOutputTokens: 150,
          },
          safetySettings: [
            {
              category: HarmCategory.HARM_CATEGORY_HARASSMENT,
              threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
            },
            {
              category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
              threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
            },
            {
              category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
              threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
            },
          ],
        });

        enhancedDescription = result.response.text().trim();
        enhancedDescription = sanitizeHtml(enhancedDescription, sanitizeConfig);
        logger.info(`Enhanced description for ${productInfo.name}: ${enhancedDescription}`);
      } catch (error) {
        logger.error(`Failed to enhance description for ${productInfo.name}: ${error.message}`);
      }

      products.push({
        name: productInfo.name,
        price: productInfo.price,
        description: enhancedDescription,
        image: productInfo.images[0] || 'https://via.placeholder.com/150',
        url: `${process.env.FRONTEND_URL || 'https://www.beifity.com'}/product/${slugify(productInfo.name)}/${productInfo.productId}`,
      });
    }

    // Prepare Gemini prompt for dynamic email content
    const emailPrompt = `
      You are a marketing assistant for Beifity.com, an e-commerce platform in Kenya. Generate a catchy email subject line and a short introductory paragraph for a marketing email promoting ${listings.length} products. The tone should be engaging, friendly, and encourage users to explore the products.

      **Products**:
      ${products
        .map(
          (product, index) => `
        Product ${index + 1}:
        - Name: ${product.name}
        - Price: KES ${product.price}
        - Description: ${product.description}
      `
        )
        .join('\n')}

      **Instructions**:
      - Subject: Max 60 characters, compelling and relevant, optionally personalized with {{fullname}}.
      - Intro: 1-2 sentences, max 100 characters, personalized with {{fullname}}.
      - Return a JSON object:
        {
          "subject": "Email subject line",
          "intro": "Introductory paragraph"
        }
    `;

    let subject = 'Discover Amazing Deals on BeiFity.Com!';
    let intro = `Hello {{fullname}}, Discover Top Picks!`;

    try {
      const result = await model.generateContent({
        contents: [{ parts: [{ text: emailPrompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 200,
        },
        safetySettings: [
          {
            category: HarmCategory.HARM_CATEGORY_HARASSMENT,
            threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
          },
          {
            category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
            threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
          },
          {
            category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
            threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
          },
        ],
      });

      const response = JSON.parse(result.response.text().replace(/```json\s*|\s*```/g, '').trim());
      subject = response.subject;
      intro = response.intro;
    } catch (error) {
      logger.error(`Failed to parse Gemini response for email content: ${error.message}`);
    }

    // Send emails to each user and track success
    const sentEmails = [];
    for (const user of eligibleUsers) {
      // Validate user data before sending
      if (!user._id || !user.personalInfo.email) {
        logger.error(`Invalid user data: ID=${user._id}, Email=${user.personalInfo.email}`);
        continue;
      }

      const recipientName = user.personalInfo.fullname || 'Valued Customer';
      logger.debug(`Recipient Name for ${user.personalInfo.email}: ${recipientName}`);
      const sanitizedRecipientName = sanitizeHtml(recipientName, sanitizeConfig);
      logger.debug(`Sanitized Recipient Name for ${user.personalInfo.email}: ${sanitizedRecipientName}`);
      
      // Personalize subject line
      const personalizedSubject = subject.replace('{{fullname}}', sanitizedRecipientName);
      logger.debug(`Personalized Subject for ${user.personalInfo.email}: ${personalizedSubject}`);
      
      const emailHtml = generateMarketingEmail(recipientName, products);
      logger.debug(`Email HTML for ${user.personalInfo.email}: ${emailHtml.slice(0, 300)}...`);

      const success = await sendEmail(user.personalInfo.email, personalizedSubject, emailHtml);
      if (success) {
        await emailLogModel.create(
          [{
            userId: user._id,
            emailType: 'marketing',
            productIds: listings.map(l => l.productInfo.productId),
            sentAt: new Date(),
          }],
          { session }
        );
        sentEmails.push(user.personalInfo.email);
        logger.info(`Marketing email sent to ${user.personalInfo.email}`);
      } else {
        logger.error(`Failed to send marketing email to ${user.personalInfo.email}`);
      }
    }

    // Send admin notification if at least 1 email was sent successfully
    if (sentEmails.length > 0) {
      const adminEmail = process.env.ADMIN_EMAIL || 'beifitycom@gmail.com';
      const adminEmailHtml = generateMarketingAdminReportEmail(products, sentEmails);
      const adminSuccess = await sendEmail(adminEmail, 'Marketing Campaign Report - BeiFity.Com', adminEmailHtml);
      if (adminSuccess) {
        logger.info(`Admin marketing report email sent to ${adminEmail}`);
      } else {
        logger.error(`Failed to send admin marketing report email to ${adminEmail}`);
      }
    } else {
      logger.warn('Admin email not sent: No user emails were sent successfully');
    }

    await session.commitTransaction();
    logger.info(`Marketing email job completed: Sent to ${sentEmails.length} users, promoted ${listings.length} listings`);
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Error in marketing email job: ${error.message}`, { stack: error.stack });
  } finally {
    session.endSession();
  }
});