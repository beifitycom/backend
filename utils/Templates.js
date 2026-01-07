// templates.js
import sanitizeHtml from 'sanitize-html';
import { createSlug } from './helper.js';

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


// HTML Email Template Function for Seller (unchanged)
export const generateOrderEmailSeller = (sellerName, buyerName, items, orderTime, deliveryAddress, totalPrice, buyerId, orderId, paymentUrl) => {
  const sanitizedSellerName = sanitizeHtml(sellerName, sanitizeConfig);
  const sanitizedBuyerName = sanitizeHtml(buyerName, sanitizeConfig);
  const sanitizedOrderTime = sanitizeHtml(orderTime, sanitizeConfig);
  const sanitizedCounty = sanitizeHtml(deliveryAddress.county || '', sanitizeConfig);
  const sanitizedNearestTown = sanitizeHtml(deliveryAddress.nearestTown || '', sanitizeConfig);
  const sanitizedCountry = sanitizeHtml(deliveryAddress.country || 'Kenya', sanitizeConfig);
  const sanitizedOrderId = sanitizeHtml(orderId, sanitizeConfig);
  const sanitizedBuyerId = sanitizeHtml(buyerId, sanitizeConfig);
  const sanitizedPaymentUrl = sanitizeHtml(paymentUrl, { ...sanitizeConfig, allowedSchemes: ['https'] });

  const itemDetails = items.map(item => `
    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;">
      <strong>Item Name:</strong> ${sanitizeHtml(item.name, sanitizeConfig)} <br>
      <strong>Quantity:</strong> ${sanitizeHtml(String(item.quantity), sanitizeConfig)} <br>
      <strong>Price:</strong> KES ${sanitizeHtml(String(item.price), sanitizeConfig)} <br>
      <strong>Color:</strong> ${sanitizeHtml(item.color, sanitizeConfig)}${item.size ? ` <br><strong>Size:</strong> ${sanitizeHtml(item.size, sanitizeConfig)}` : ''}
    </p>
  `).join('<hr style="border: 1px solid #e5e7eb; margin: 10px 0;">');

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>New Order Notification</title>
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
                  <h2 style="font-size: 20px; font-weight: 700; color: #1e40af; margin-bottom: 20px;">Exciting News, ${sanitizedSellerName}!</h2>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 15px; font-weight: 600; color: #1e293b; margin-bottom: 25px;">You've Got a New Order!</p>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #475569; line-height: 1.6; margin-bottom: 30px;">
                    Hi ${sanitizedSellerName}, a buyer has placed an order for your item(s) on <span style="color: #1e40af; font-weight: 600;">BeiF<span style="color: #fbbf24;">ity.Com</span></span>. The payment is pending confirmation. Once confirmed, funds will be held until delivery. Here’s the order summary:
                  </p>
                </td>
              </tr>
              <tr>
                <td>
                  <div style="background-color: #f0f4f8; padding: 20px; border-radius: 8px; text-align: left; margin-bottom: 30px;">
                    <p style="font-size: 14px; color: #1e40af; font-weight: 600; margin: 0 0 10px;">Order Summary (Order ID: ${sanitizedOrderId})</p>
                    ${itemDetails}
                    <p style="font-size: 13px; color: #475569; margin: 10px 0 8px;"><strong>Buyer Name:</strong> ${sanitizedBuyerName}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Order Placed On:</strong> ${sanitizedOrderTime}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Total Price:</strong> KES ${sanitizeHtml(String(totalPrice), sanitizeConfig)}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0;"><strong>Shipping Address:</strong> ${sanitizedCounty || sanitizedNearestTown ? `${sanitizedCounty}, ${sanitizedNearestTown}, ` : ''}${sanitizedCountry} (Full details via chat)</p>
                  </div>
                </td>
              </tr>
              <tr>
                <td>
                  <a href="${FRONTEND_URL}/chat/${sanitizedBuyerId}" style="display: inline-block; background-color: #1e40af; color: #ffffff; font-size: 14px; font-weight: 600; padding: 12px 25px; text-decoration: none; border-radius: 6px; margin-bottom: 30px;">Message Buyer Now</a>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Next Steps:</strong> Wait for payment confirmation, then arrange shipping with the buyer via chat. Funds will be released to your M-Pesa account after delivery confirmation.
                  </p>
                  <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Need Assistance?</strong> Visit your seller dashboard or contact support.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="margin-top: 30px;">
                  <p style="font-size: 14px; color: #64748b; margin: 0;">Keep shining on BeiFity!</p>
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

// HTML Email Template Function for Buyer (updated for no payment URL)
export const generateOrderEmailBuyer = (buyerName, items, orderTime, totalPrice, deliveryAddress, orderId, sellerIds, paymentUrl) => {
  const sanitizedBuyerName = sanitizeHtml(buyerName, sanitizeConfig);
  const sanitizedOrderTime = sanitizeHtml(orderTime, sanitizeConfig);
  const sanitizedCounty = sanitizeHtml(deliveryAddress.county || '', sanitizeConfig);
  const sanitizedNearestTown = sanitizeHtml(deliveryAddress.nearestTown || '', sanitizeConfig);
  const sanitizedCountry = sanitizeHtml(deliveryAddress.country || 'Kenya', sanitizeConfig);
  const sanitizedOrderId = sanitizeHtml(orderId, sanitizeConfig);

  const itemDetails = items.map(item => `
    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;">
      <strong>Item Name:</strong> ${sanitizeHtml(item.name, sanitizeConfig)} <br>
      <strong>Quantity:</strong> ${sanitizeHtml(String(item.quantity), sanitizeConfig)} <br>
      <strong>Price:</strong> KES ${sanitizeHtml(String(item.price), sanitizeConfig)} <br>
      <strong>Color:</strong> ${sanitizeHtml(item.color, sanitizeConfig)}${item.size ? ` <br><strong>Size:</strong> ${sanitizeHtml(item.size, sanitizeConfig)}` : ''}
      <strong>Seller ID:</strong> ${sanitizeHtml(item.sellerId._id.toString(), sanitizeConfig)}
    </p>
  `).join('<hr style="border: 1px solid #e5e7eb; margin: 10px 0;">');

  const sellerChatLinks = sellerIds.length > 0 ? `
    <p style="font-size: 13px; color: #475569; margin: 10px 0;">
      <strong>Contact Seller(s):</strong><br>
      ${sellerIds.map(sellerId => `
        <a href="${FRONTEND_URL}/chat/${sanitizeHtml(sellerId._id, sanitizeConfig)}" style="color: #1e40af; text-decoration: underline;">Chat with Seller ${sanitizeHtml(sellerId.personalInfo.fullname, sanitizeConfig)}</a><br>
      `).join('')}
    </p>
  ` : '';

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Your Order Confirmation</title>
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
                  <h2 style="font-size: 20px; font-weight: 700; color: #1e40af; margin-bottom: 20px;">Thank You, ${sanitizedBuyerName}!</h2>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 15px; font-weight: 600; color: #1e293b; margin-bottom: 25px;">Your Order Has Been Placed!</p>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #475569; line-height: 1.6; margin-bottom: 30px;">
                    Hi ${sanitizedBuyerName}, we’re thrilled to confirm your order on <span style="color: #1e40af; font-weight: 600;">BeiF<span style="color: #fbbf24;">ity.Com</span></span>. Check your phone for the M-Pesa STK Push prompt to complete payment.
                  </p>
                </td>
              </tr>
              <tr>
                <td>
                  <div style="background-color: #f0f4f8; padding: 20px; border-radius: 8px; text-align: left; margin-bottom: 30px;">
                    <p style="font-size: 14px; color: #1e40af; font-weight: 600; margin: 0 0 10px;">Order Summary (Order ID: ${sanitizedOrderId})</p>
                    ${itemDetails}
                    <p style="font-size: 13px; color: #475569; margin: 10px 0 8px;"><strong>Order Placed On:</strong> ${sanitizedOrderTime}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Total Price:</strong> KES ${sanitizeHtml(String(totalPrice), sanitizeConfig)}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0;"><strong>Shipping Address:</strong> ${sanitizedCounty || sanitizedNearestTown ? `${sanitizedCounty}, ${sanitizedNearestTown}, ` : ''}${sanitizedCountry}</p>
                    ${sellerChatLinks}
                  </div>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Next Steps:</strong> Enter your M-Pesa PIN on your phone to confirm payment. Once processed, the seller(s) will contact you via chat to arrange shipping. Please verify the product before finalizing delivery.
                  </p>
                  <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Need Help?</strong> Check your buyer dashboard or contact our support team.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="margin-top: 30px;">
                  <p style="font-size: 14px; color: #64748b; margin: 0;">Happy shopping on BeiFity!</p>
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

// HTML Email Template Function for Admin (unchanged)
export const generateOrderEmailAdmin = (buyerName, items, orderTime, totalPrice, deliveryAddress, orderId, buyerId) => {
  const sanitizedBuyerName = sanitizeHtml(buyerName, sanitizeConfig);
  const sanitizedOrderTime = sanitizeHtml(orderTime, sanitizeConfig);
  const sanitizedCounty = sanitizeHtml(deliveryAddress.county || '', sanitizeConfig);
  const sanitizedNearestTown = sanitizeHtml(deliveryAddress.nearestTown || '', sanitizeConfig);
  const sanitizedCountry = sanitizeHtml(deliveryAddress.country || 'Kenya', sanitizeConfig);
  const sanitizedOrderId = sanitizeHtml(orderId, sanitizeConfig);
  const sanitizedBuyerId = sanitizeHtml(buyerId, sanitizeConfig);

  const itemDetails = items.map(item => `
    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;">
      <strong>Item Name:</strong> ${sanitizeHtml(item.name, sanitizeConfig)} <br>
      <strong>Quantity:</strong> ${sanitizeHtml(String(item.quantity), sanitizeConfig)} <br>
      <strong>Price:</strong> KES ${sanitizeHtml(String(item.price), sanitizeConfig)} <br>
      <strong>Color:</strong> ${sanitizeHtml(item.color, sanitizeConfig)}${item.size ? ` <br><strong>Size:</strong> ${sanitizeHtml(item.size, sanitizeConfig)}` : ''} <br>
      <strong>Seller:</strong> <a href="${FRONTEND_URL}/chat/${sanitizeHtml(item.sellerId._id.toString(), sanitizeConfig)}" style="color: #1e40af; text-decoration: underline;">${sanitizeHtml(item.sellerId.personalInfo.fullname.toString(), sanitizeConfig)}</a>
    </p>
  `).join('<hr style="border: 1px solid #e5e7eb; margin: 10px 0;">');

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>New Order Placed - Admin Notification</title>
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
                  <h2 style="font-size: 20px; font-weight: 700; color: #1e40af; margin-bottom: 20px;">New Order Placed on BeiFity!</h2>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 15px; font-weight: 600; color: #1e293b; margin-bottom: 25px;">Order Notification (Payment Pending)</p>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #475569; line-height: 1.6; margin-bottom: 30px;">
                    A new order has been placed on <span style="color: #1e40af; font-weight: 600;">BeiF<span style="color: #fbbf24;">ity.Com</span></span>. The buyer is completing payment via M-Pesa. Funds will be held until delivery confirmation.
                  </p>
                </td>
              </tr>
              <tr>
                <td>
                  <div style="background-color: #f0f4f8; padding: 20px; border-radius: 8px; text-align: left; margin-bottom: 30px;">
                    <p style="font-size: 14px; color: #1e40af; font-weight: 600; margin: 0 0 10px;">Order Summary (Order ID: ${sanitizedOrderId})</p>
                    ${itemDetails}
                    <p style="font-size: 13px; color: #475569; margin: 10px 0 8px;"><strong>Buyer:</strong> <a href="${FRONTEND_URL}/chat/${sanitizedBuyerId}" style="color: #1e40af; text-decoration: underline;">${sanitizedBuyerName}</a></p>
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Order Placed On:</strong> ${sanitizedOrderTime}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Total Price:</strong> KES ${sanitizeHtml(String(totalPrice), sanitizeConfig)}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0;"><strong>Shipping Address:</strong> ${sanitizedCounty || sanitizedNearestTown ? `${sanitizedCounty}, ${sanitizedNearestTown}, ` : ''}${sanitizedCountry}</p>
                  </div>
                </td>
              </tr>
              <tr>
                <td>
                  <a href="${FRONTEND_URL}/admin/orders" style="display: inline-block; background-color: #1e40af; color: #ffffff; font-size: 14px; font-weight: 600; padding: 12px 25px; text-decoration: none; border-radius: 6px; margin-bottom: 30px;">View Order Details</a>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Next Steps:</strong> Monitor payment confirmation and order status in the admin dashboard. Contact the buyer or seller(s) if necessary.
                  </p>
                  <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Need Assistance?</strong> Check the admin dashboard or reach out to the support team.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="margin-top: 30px;">
                  <p style="font-size: 14px; color: #64748b; margin: 0;">Keep managing on BeiFity!</p>
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

// HTML Email Template Function for Order Status Update (updated for M-Pesa)
export const generateOrderStatusEmail = (recipientName, itemName, orderId, status, chatUserId) => {
  const sanitizedRecipientName = sanitizeHtml(recipientName, sanitizeConfig);
  const sanitizedItemName = sanitizeHtml(itemName, sanitizeConfig);
  const sanitizedOrderId = sanitizeHtml(orderId, sanitizeConfig);
  const sanitizedStatus = sanitizeHtml(status, sanitizeConfig);
  const sanitizedChatUserId = sanitizeHtml(chatUserId, sanitizeConfig);

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Order Status Update</title>
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
                  <h2 style="font-size: 20px; font-weight: 700; color: #1e40af; margin-bottom: 20px;">Order Update, ${sanitizedRecipientName}!</h2>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 15px; font-weight: 600; color: #1e293b; margin-bottom: 25px;">Your Order Status Has Changed</p>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #475569; line-height: 1.6; margin-bottom: 30px;">
                    Hi ${sanitizedRecipientName},<br>
                    The status of your order item "<strong>${sanitizedItemName}</strong>" (Order ID: ${sanitizedOrderId}) has been updated to <strong>${sanitizedStatus}</strong>.
                    ${status === 'delivered' ? 'The seller will be paid via M-Pesa.' : status === 'shipped' ? 'Please confirm delivery once received.' : ''}
                  </p>
                </td>
              </tr>
              <tr>
                <td>
                  <a href="${FRONTEND_URL}/chat/${sanitizedChatUserId}" style="display: inline-block; background-color: #1e40af; color: #ffffff; font-size: 14px; font-weight: 600; padding: 12px 25px; text-decoration: none; border-radius: 6px; margin-bottom: 30px;">
                    ${status === 'shipped' ? 'Message Seller' : 'Message Buyer'}
                  </a>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Next Steps:</strong> Contact the ${status === 'shipped' ? 'seller' : 'buyer'} via chat for any questions or to confirm details.
                  </p>
                  <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Need Help?</strong> Visit your ${status === 'shipped' ? 'buyer' : 'seller'} dashboard or contact our support team.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="margin-top: 30px;">
                  <p style="font-size: 14px; color: #64748b; margin: 0;">${status === 'shipped' ? 'Happy shopping' : 'Keep selling'} on BeiFity!</p>
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

// HTML Email Template Function for Order Cancellation (updated for manual refund)
export const generateOrderCancellationEmail = (recipientName, itemName, orderId, cancelledBy, refundMessage, chatUserId) => {
  const sanitizedRecipientName = sanitizeHtml(recipientName, sanitizeConfig);
  const sanitizedItemName = sanitizeHtml(itemName, sanitizeConfig);
  const sanitizedOrderId = sanitizeHtml(orderId, sanitizeConfig);
  const sanitizedCancelledBy = sanitizeHtml(cancelledBy, sanitizeConfig);
  const sanitizedRefundMessage = sanitizeHtml(refundMessage, sanitizeConfig);
  const sanitizedChatUserId = sanitizeHtml(chatUserId, sanitizeConfig);

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Order Item Cancellation</title>
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
                  <h2 style="font-size: 20px; font-weight: 700; color: #1e40af; margin-bottom: 20px;">Order Cancellation Notice</h2>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 15px; font-weight: 600; color: #1e293b; margin-bottom: 25px;">Hi ${sanitizedRecipientName},</p>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #475569; line-height: 1.6; margin-bottom: 30px;">
                    The ${sanitizedCancelledBy} has cancelled the order item "<strong>${sanitizedItemName}</strong>" (Order ID: ${sanitizedOrderId}). ${sanitizedRefundMessage}
                    You can contact them if you have questions.
                  </p>
                </td>
              </tr>
              <tr>
                <td>
                  <a href="${FRONTEND_URL}/chat/${sanitizedChatUserId}" style="display: inline-block; background-color: #1e40af; color: #ffffff; font-size: 14px; font-weight: 600; padding: 12px 25px; text-decoration: none; border-radius: 6px; margin-bottom: 30px;">
                    Message ${sanitizedCancelledBy.charAt(0).toUpperCase() + sanitizedCancelledBy.slice(1)}
                  </a>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Need Assistance?</strong> Visit your ${sanitizedCancelledBy === 'seller' ? 'buyer' : 'seller'} dashboard or contact our support team for help.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="margin-top: 30px;">
                  <p style="font-size: 14px; color: #64748b; margin: 0;">${sanitizedCancelledBy === 'seller' ? 'Happy shopping' : 'Keep selling'} on BeiFity!</p>
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

// New HTML Email Template Function for Refund Notification (Buyer and Seller) (updated for manual)
export const generateRefundEmail = (recipientName, itemName, orderId, refundAmount, isFullRefund, recipientRole, chatUserId) => {
  const sanitizedRecipientName = sanitizeHtml(recipientName, sanitizeConfig);
  const sanitizedItemName = sanitizeHtml(itemName, sanitizeConfig);
  const sanitizedOrderId = sanitizeHtml(orderId, sanitizeConfig);
  const sanitizedRefundAmount = sanitizeHtml(refundAmount.toFixed(2), sanitizeConfig);
  const sanitizedRecipientRole = sanitizeHtml(recipientRole, sanitizeConfig);
  const sanitizedChatUserId = sanitizeHtml(chatUserId, sanitizeConfig);

  const isBuyer = sanitizedRecipientRole.toLowerCase() === 'buyer';
  const title = isBuyer ? 'Refund Initiated' : 'Order Item Refund Notification';
  const message = isBuyer
    ? `A ${isFullRefund ? 'full' : 'partial'} refund of <strong>KES ${sanitizedRefundAmount}</strong> for the item "<strong>${sanitizedItemName}</strong>" (Order ID: ${sanitizedOrderId}) has been initiated manually and will be processed to your M-Pesa account as soon as possible.`
    : `The item "<strong>${sanitizedItemName}</strong>" (Order ID: ${sanitizedOrderId}) has been cancelled by the buyer. An amount of <strong>KES ${sanitizedRefundAmount}</strong> has been deducted from your pending balance as part of the ${isFullRefund ? 'full' : 'partial'} manual refund process.`;

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
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
                  <h2 style="font-size: 20px; font-weight: 700; color: #1e40af; margin-bottom: 20px;">${title}, ${sanitizedRecipientName}!</h2>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 15px; font-weight: 600; color: #1e293b; margin-bottom: 25px;">${isBuyer ? 'Refund Initiated' : 'Refund Processed'}</p>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #475569; line-height: 1.6; margin-bottom: 30px;">
                    Hi ${sanitizedRecipientName},<br>
                    ${message}
                    You can contact the ${isBuyer ? 'seller' : 'buyer'} if you have questions.
                  </p>
                </td>
              </tr>
              <tr>
                <td>
                  <a href="${FRONTEND_URL}/chat/${sanitizedChatUserId}" style="display: inline-block; background-color: #1e40af; color: #ffffff; font-size: 14px; font-weight: 600; padding: 12px 25px; text-decoration: none; border-radius: 6px; margin-bottom: 30px;">
                    Message ${isBuyer ? 'Seller' : 'Buyer'}
                  </a>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Need Assistance?</strong> Visit your ${isBuyer ? 'buyer' : 'seller'} dashboard or contact our support team at <a href="mailto:${isBuyer ? 'customer.care@beifity.com' : 'customer.care@beifity.com'}" style="color: #1e40af; text-decoration: underline;">${isBuyer ? 'customer.care@beifity.com' : 'customer.care@beifity.com'}</a>.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="margin-top: 30px;">
                  <p style="font-size: 14px; color: #64748b; margin: 0;">${isBuyer ? 'Happy shopping' : 'Keep selling'} on BeiFity!</p>
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

// HTML Email Template Function for Payout Notification (Seller) (updated for manual)
export const generatePayoutNotificationEmail = (sellerName, orderId, payoutAmount, itemIds, swiftTransferId) => {
  const sanitizedSellerName = sanitizeHtml(sellerName, sanitizeConfig);
  const sanitizedOrderId = sanitizeHtml(orderId, sanitizeConfig);
  const sanitizedPayoutAmount = sanitizeHtml(payoutAmount.toFixed(2), sanitizeConfig);
  const sanitizedSwiftTransferId = sanitizeHtml(swiftTransferId || 'N/A', sanitizeConfig);
  const sanitizedItemIds = itemIds.map(id => sanitizeHtml(id, sanitizeConfig)).join(', ');

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Payout Processed - BeiFity.Com</title>
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
                  <h2 style="font-size: 20px; font-weight: 700; color: #1e40af; margin-bottom: 20px;">Payout Processed, ${sanitizedSellerName}!</h2>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 15px; font-weight: 600; color: #1e293b; margin-bottom: 25px;">Your Payout Has Been Processed</p>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #475569; line-height: 1.6; margin-bottom: 30px;">
                    Hi ${sanitizedSellerName},<br>
                    A manual payout of <strong>KES ${sanitizedPayoutAmount}</strong> for items (Item IDs: ${sanitizedItemIds}) in Order ID: ${sanitizedOrderId} has been processed to your M-Pesa account.<br>
                    Transaction Reference: <strong>${sanitizedSwiftTransferId}</strong>
                  </p>
                </td>
              </tr>
              <tr>
                <td>
                  <a href="${FRONTEND_URL}/seller/payouts" style="display: inline-block; background-color: #1e40af; color: #ffffff; font-size: 14px; font-weight: 600; padding: 12px 25px; text-decoration: none; border-radius: 6px; margin-bottom: 30px;">
                    View Payout Details
                  </a>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Need Assistance?</strong> Visit your seller dashboard or contact our support team at <a href="mailto:customer.care@beifity.com" style="color: #1e40af; text-decoration: underline;">customer.care@beifity.com</a>.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="margin-top: 30px;">
                  <p style="font-size: 14px; color: #64748b; margin: 0;">Keep selling on BeiFity!</p>
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

// HTML Email Template Function for Transaction Reversal Notification (Buyer and Seller) (updated for manual)
export const generateTransactionReversalEmail = (recipientName, orderId, itemIds, recipientRole, chatUserId) => {
  const sanitizedRecipientName = sanitizeHtml(recipientName, sanitizeConfig);
  const sanitizedOrderId = sanitizeHtml(orderId, sanitizeConfig);
  const sanitizedItemIds = itemIds.map(id => sanitizeHtml(id, sanitizeConfig)).join(', ');
  const sanitizedRecipientRole = sanitizeHtml(recipientRole, sanitizeConfig);
  const sanitizedChatUserId = sanitizeHtml(chatUserId, sanitizeConfig);

  const isBuyer = sanitizedRecipientRole.toLowerCase() === 'buyer';
  const title = isBuyer ? 'Transaction Reversed - Full Refund' : 'Transaction Reversed Notification';
  const message = isBuyer
    ? `The transaction for Order ID: ${sanitizedOrderId} (Items: ${sanitizedItemIds}) has been reversed. A full manual refund has been processed and will be sent to your M-Pesa account as soon as possible.`
    : `The transaction for Order ID: ${sanitizedOrderId} (Items: ${sanitizedItemIds}) has been reversed. The corresponding amounts have been deducted from your pending balance.`;

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
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
                  <h2 style="font-size: 20px; font-weight: 700; color: #1e40af; margin-bottom: 20px;">${title}, ${sanitizedRecipientName}!</h2>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 15px; font-weight: 600; color: #1e293b; margin-bottom: 25px;">Transaction Reversed</p>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #475569; line-height: 1.6; margin-bottom: 30px;">
                    Hi ${sanitizedRecipientName},<br>
                    ${message}<br>
                    You can contact the ${isBuyer ? 'seller' : 'buyer'} if you have questions.
                  </p>
                </td>
              </tr>
              <tr>
                <td>
                  <a href="${FRONTEND_URL}/chat/${sanitizedChatUserId}" style="display: inline-block; background-color: #1e40af; color: #ffffff; font-size: 14px; font-weight: 600; padding: 12px 25px; text-decoration: none; border-radius: 6px; margin-bottom: 30px;">
                    Message ${isBuyer ? 'Seller' : 'Buyer'}
                  </a>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Need Assistance?</strong> Visit your ${isBuyer ? 'buyer' : 'seller'} dashboard or contact our support team at <a href="mailto:${isBuyer ? 'customer.care@beifity.com' : 'customer.care@beifity.com'}" style="color: #1e40af; text-decoration: underline;">${isBuyer ? 'customer.care@beifity.com' : 'customer.care@beifity.com'}</a>.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="margin-top: 30px;">
                  <p style="font-size: 14px; color: #64748b; margin: 0;">${isBuyer ? 'Happy shopping' : 'Keep selling'} on BeiFity!</p>
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
// HTML Email Template Function for Admin Order Status Notification
export const generateOrderStatusEmailAdmin = (adminName, itemName, orderId, status, buyerId, sellerId) => {
  const sanitizedAdminName = sanitizeHtml(adminName, sanitizeConfig);
  const sanitizedItemName = sanitizeHtml(itemName, sanitizeConfig);
  const sanitizedOrderId = sanitizeHtml(orderId, sanitizeConfig);
  const sanitizedStatus = sanitizeHtml(status, sanitizeConfig);
  const sanitizedBuyerId = sanitizeHtml(buyerId, sanitizeConfig);
  const sanitizedSellerId = sanitizeHtml(sellerId, sanitizeConfig);

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Order Status Update - BeiFity.Com Admin</title>
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
                  <h2 style="font-size: 20px; font-weight: 700; color: #1e40af; margin-bottom: 20px;">Order Status Update, ${sanitizedAdminName}!</h2>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 15px; font-weight: 600; color: #1e293b; margin-bottom: 25px;">Order Item Status Changed</p>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #475569; line-height: 1.6; margin-bottom: 30px;">
                    Hi ${sanitizedAdminName},<br>
                    The item "${sanitizedItemName}" in Order ID: ${sanitizedOrderId} has been updated to status: <strong>${sanitizedStatus}</strong>.<br>
                    Buyer ID: ${sanitizedBuyerId}<br>
                    Seller ID: ${sanitizedSellerId}
                  </p>
                </td>
              </tr>
              <tr>
                <td>
                  <a href="${FRONTEND_URL}/admin/orders/${sanitizedOrderId}" style="display: inline-block; background-color: #1e40af; color: #ffffff; font-size: 14px; font-weight: 600; padding: 12px 25px; text-decoration: none; border-radius: 6px; margin-bottom: 30px;">
                    View Order Details
                  </a>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Need Assistance?</strong> Contact our support team at <a href="mailto:customer.care@beifity.com" style="color: #1e40af; text-decoration: underline;">customer.care@beifity.com</a>.
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

// HTML Email Template Function for Admin Order Cancellation Notification (updated for manual refund)
export const generateOrderCancellationEmailAdmin = (adminName, itemName, orderId, cancelledBy, refundMessage, userId) => {
  const sanitizedAdminName = sanitizeHtml(adminName, sanitizeConfig);
  const sanitizedItemName = sanitizeHtml(itemName, sanitizeConfig);
  const sanitizedOrderId = sanitizeHtml(orderId, sanitizeConfig);
  const sanitizedCancelledBy = sanitizeHtml(cancelledBy, sanitizeConfig);
  const sanitizedRefundMessage = sanitizeHtml(refundMessage, sanitizeConfig);
  const sanitizedUserId = sanitizeHtml(userId, sanitizeConfig);

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Order Cancellation Notification - BeiFity.Com Admin</title>
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
                  <h2 style="font-size: 20px; font-weight: 700; color: #1e40af; margin-bottom: 20px;">Order Item Cancelled, ${sanitizedAdminName}!</h2>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 15px; font-weight: 600; color: #1e293b; margin-bottom: 25px;">Order Cancellation Notification</p>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #475569; line-height: 1.6; margin-bottom: 30px;">
                    Hi ${sanitizedAdminName},<br>
                    The item "${sanitizedItemName}" in Order ID: ${sanitizedOrderId} has been cancelled by the ${sanitizedCancelledBy} (User ID: ${sanitizedUserId}).<br>
                    ${sanitizedRefundMessage}
                  </p>
                </td>
              </tr>
              <tr>
                <td>
                  <a href="${FRONTEND_URL}/admin/orders/${sanitizedOrderId}" style="display: inline-block; background-color: #1e40af; color: #ffffff; font-size: 14px; font-weight: 600; padding: 12px 25px; text-decoration: none; border-radius: 6px; margin-bottom: 30px;">
                    View Order Details
                  </a>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Need Assistance?</strong> Contact our support team at <a href="mailto:customer.care@beifity.com" style="color: #1e40af; text-decoration: underline;">customer.care@beifity.com</a>.
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

export const generateMarketingEmail = (recipientName, products) => {
  const sanitizedRecipientName = sanitizeHtml(recipientName || 'Valued Customer', sanitizeConfig);
  const FRONTEND_URL = process.env.FRONTEND_URL || 'https://www.beifity.com';

  const productCards = products
    .map((product) => {
      const sanitizedProductName = sanitizeHtml(capitalizeWords(product.name), sanitizeConfig);
      const sanitizedPrice = sanitizeHtml(product.price.toFixed(2), sanitizeConfig);
      const sanitizedDescription = sanitizeHtml(product.description.slice(0, 100) + (product.description.length > 100 ? '...' : ''), sanitizeConfig);
      const sanitizedImage = sanitizeHtml(product.image || 'https://via.placeholder.com/300x300/ffffff/cccccc?text=No+Image', sanitizeConfig);
      const sanitizedProductUrl = sanitizeHtml(product.url, { ...sanitizeConfig, allowedSchemes: ['https'] });

      return `
        <tr>
          <td style="padding: 0 0 24px 0;">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" class="product-table" style="background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08); border: 1px solid #e2e8f0;">
              <tr>
                <td style="position: relative; text-align: center; padding: 0;">
                  <div style="position: relative; overflow: hidden; border-radius: 12px 12px 0 0; background: #f8fafc; padding: 24px 0;">
                    <img src="${sanitizedImage}" alt="${sanitizedProductName}" style="width: 100%; max-width: 100%; height: auto; display: block; margin: 0 auto;" width="300" height="300">
                    <span style="position: absolute; top: 16px; right: 16px; background: #10b981; color: #ffffff; font-size: 11px; font-weight: 600; padding: 4px 8px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1); white-space: nowrap; text-transform: uppercase; letter-spacing: 0.5px;">In Stock</span>
                  </div>
                </td>
              </tr>
              <tr>
                <td style="padding: 24px 20px; text-align: left;">
                  <h3 style="font-size: 20px; font-weight: 700; color: #1e293b; margin: 0 0 8px 0; line-height: 1.3;">${sanitizedProductName}</h3>
                  <p style="font-size: 18px; font-weight: 700; color: #dc2626; margin: 0 0 12px 0; line-height: 1.2;">KES ${sanitizedPrice}</p>
                  <p style="font-size: 14px; color: #64748b; line-height: 1.6; margin: 0 0 20px 0;">${sanitizedDescription}</p>
                  <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                      <td style="text-align: right;">
                        <a href="${sanitizedProductUrl}" style="display: inline-block; background: #3b82f6; color: #ffffff; font-size: 14px; font-weight: 600; padding: 12px 24px; text-decoration: none; border-radius: 8px; transition: background-color 0.2s ease;">
                          Shop Now
                        </a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      `;
    })
    .join('');

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="X-UA-Compatible" content="IE=edge">
      <meta name="x-apple-disable-message-reformatting">
      <meta name="color-scheme" content="light dark">
      <meta name="supported-color-schemes" content="light dark">
      <title>Exclusive Deals Await at BeiFity.Com</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        body { 
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
          margin: 0; 
          padding: 0; 
          background: #f8fafc; 
          -webkit-text-size-adjust: 100%;
          -ms-text-size-adjust: 100%;
          color: #1e293b;
        }
        table { border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
        .container { max-width: 600px; margin: 0 auto; }
        .button { display: inline-block; text-decoration: none; }
        .button:hover { opacity: 0.9; }
        .product-table:hover { box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12); transform: translateY(-1px); transition: all 0.2s ease; }
        img { max-width: 100%; height: auto; border: 0; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; }
        .social-icon { display: inline-block; margin: 0 8px; width: 32px; height: 32px; border-radius: 50%; transition: transform 0.2s ease; }
        .social-icon:hover { transform: scale(1.05); }
        .preheader { display: none !important; max-height: 0; overflow: hidden; color: #64748b; font-size: 1px; line-height: 1px; }
        /* Dark Mode */
        @media (prefers-color-scheme: dark) {
          body { background: #0f172a; color: #f1f5f9; }
          .container { background: #1e293b; }
          .product-table { background: #334155; border-color: #475569; }
          .hero { background: linear-gradient(135deg, #1e40af, #1d4ed8); }
          .cta-section { background: #334155; }
          .footer { background: #0f172a; color: #94a3b8; }
          .footer a { color: #60a5fa; }
        }
        /* Responsive Styles */
        @media only screen and (max-width: 600px) {
          .container { width: 100% !important; padding: 0 16px !important; }
          .hero { padding: 32px 20px !important; }
          .hero h1 { font-size: 24px !important; line-height: 1.2 !important; }
          .hero p { font-size: 16px !important; line-height: 1.4 !important; }
          .hero .button { padding: 12px 24px !important; font-size: 15px !important; }
          .product-table { margin: 0 !important; width: 100% !important; }
          .product-content { padding: 20px 16px !important; text-align: center !important; }
          .product-name { font-size: 18px !important; margin-bottom: 8px !important; }
          .product-price { font-size: 18px !important; margin-bottom: 8px !important; }
          .product-desc { font-size: 14px !important; margin-bottom: 16px !important; text-align: center !important; }
          .product-button { padding: 10px 20px !important; font-size: 14px !important; }
          .stock-badge { position: static !important; display: block !important; margin: 12px auto 0 !important; transform: none !important; }
          .cta-button { padding: 12px 24px !important; font-size: 15px !important; }
          .footer { padding: 24px 16px !important; }
          .footer-text { font-size: 13px !important; line-height: 1.4 !important; }
        }
        @media only screen and (max-width: 480px) {
          .hero h1 { font-size: 20px !important; }
          .hero p { font-size: 14px !important; }
          .product-name { font-size: 16px !important; }
          .product-price { font-size: 16px !important; }
          .product-desc { font-size: 13px !important; }
          .header-logo { height: 48px !important; }
        }
      </style>
    </head>
    <body style="margin: 0; padding: 0; background: #f8fafc;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="padding: 0;">
        <tr>
          <td class="preheader" style="padding: 20px 0; font-size: 1px; line-height: 1px;">Discover exclusive deals tailored just for you at BeiFity.Com – your go-to for premium shopping in Nairobi.</td>
        </tr>
        <tr>
          <td align="center" style="padding: 40px 20px 0;">
            <table role="presentation" class="container" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background: #ffffff; border-radius: 16px; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08); overflow: hidden; border: 1px solid #e2e8f0;">
              <!-- Header -->
              <tr>
                <td style="padding: 24px 24px 0; text-align: center; background: #ffffff;">
                  <a href="${FRONTEND_URL}" style="text-decoration: none;">
                    <img src="https://www.beifity.com/assets/logo-without-CMu8rsBL.png" alt="BeiFity.Com Logo" class="header-logo" style="width: auto; height: 56px; display: block; margin: 0 auto;" width="160" height="56">
                  </a>
                </td>
              </tr>
              <!-- Hero Section -->
              <tr>
                <td class="hero" style="background: linear-gradient(135deg, #3b82f6, #60a5fa); padding: 40px 24px; text-align: center; color: #ffffff;">
                  <h1 style="font-size: 28px; font-weight: 700; margin: 0 0 8px 0; line-height: 1.3;">Hello, ${sanitizedRecipientName}!</h1>
                  <p style="font-size: 18px; line-height: 1.6; margin: 0 0 24px 0;">Unlock exclusive deals and elevate your style with BeiFity's curated collection.</p>
                  <a href="${FRONTEND_URL}/collection" class="button" style="display: inline-block; background: #fbbf24; color: #1e293b; font-size: 16px; font-weight: 600; padding: 14px 28px; text-decoration: none; border-radius: 8px;">
                    Explore Collection
                  </a>
                </td>
              </tr>
              <!-- Products Section Header -->
              <tr>
                <td style="padding: 32px 24px 16px; text-align: center;">
                  <h2 style="font-size: 24px; font-weight: 600; color: #1e293b; margin: 0 0 4px 0; line-height: 1.3;">Featured Deals</h2>
                  <p style="font-size: 16px; color: #64748b; margin: 0; line-height: 1.5;">Handpicked just for you</p>
                </td>
              </tr>
              <!-- Products -->
              <tr>
                <td style="padding: 0 24px 32px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                    ${productCards}
                  </table>
                </td>
              </tr>
              <!-- CTA Section -->
              <tr>
                <td class="cta-section" style="padding: 32px 24px; text-align: center; background: #f8fafc; border-top: 1px solid #e2e8f0;">
                  <h3 style="font-size: 20px; font-weight: 600; color: #1e293b; margin: 0 0 12px 0; line-height: 1.3;">Ready to Shop More?</h3>
                  <a href="${FRONTEND_URL}/collection" class="button cta-button" style="display: inline-block; background: #3b82f6; color: #ffffff; font-size: 16px; font-weight: 600; padding: 14px 28px; text-decoration: none; border-radius: 8px; text-transform: uppercase; letter-spacing: 0.5px;">
                    View All Deals
                  </a>
                </td>
              </tr>
              <!-- Footer -->
              <tr>
                <td class="footer" style="padding: 32px 24px; text-align: center; background: #f8fafc; border-top: 1px solid #e2e8f0; color: #64748b;">
                  <p style="font-size: 14px; margin: 0 0 12px 0; line-height: 1.5;">
                    <a href="${FRONTEND_URL}/unsubscribe" style="color: #3b82f6; text-decoration: none; font-weight: 500;">Unsubscribe</a> | 
                    <a href="${FRONTEND_URL}/privacy" style="color: #3b82f6; text-decoration: none; font-weight: 500;">Privacy Policy</a>
                  </p>
                  <p style="font-size: 14px; margin: 0 0 16px 0; line-height: 1.5;">
                    BeiFity.Com | P.O. Box 12345, Nairobi, Kenya | <a href="mailto:support@beifity.com" style="color: #3b82f6; text-decoration: none;">support@beifity.com</a>
                  </p>
                  <p style="font-size: 14px; margin: 0 0 20px 0; line-height: 1.5;">
                    <span style="color: #1e293b; font-weight: 600;">BeiF<span style="color: #fbbf24;">ity</span>.Com</span> © ${new Date().getFullYear()} All rights reserved.
                  </p>
                  <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                      <td style="text-align: center;">
                        <a href="https://facebook.com/beifity" class="social-icon" style="background: #1877f2;" aria-label="Facebook">
                          <img src="https://via.placeholder.com/32x32/ffffff/1877f2?text=F" alt="Facebook" style="width: 32px; height: 32px; border-radius: 50%; display: block;">
                        </a>
                        <a href="https://instagram.com/beifity" class="social-icon" style="background: #e4405f;" aria-label="Instagram">
                          <img src="https://via.placeholder.com/32x32/ffffff/e4405f?text=I" alt="Instagram" style="width: 32px; height: 32px; border-radius: 50%; display: block;">
                        </a>
                        <a href="https://twitter.com/beifity" class="social-icon" style="background: #000000;" aria-label="Twitter">
                          <img src="https://via.placeholder.com/32x32/ffffff/000000?text=T" alt="Twitter" style="width: 32px; height: 32px; border-radius: 50%; display: block;">
                        </a>
                      </td>
                    </tr>
                  </table>
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
export const generateMarketingAdminReportEmail = (products, recipients) => {
  const sanitizedRecipients = recipients.slice(0, 5).map(r => sanitizeHtml(r, sanitizeConfig)).join(', ') + (recipients.length > 5 ? ` +${recipients.length - 5} more` : '');
  const FRONTEND_URL = process.env.FRONTEND_URL || 'https://www.beifity.com';
  const campaignDate = new Date().toLocaleString('en-US', { timeZone: 'Africa/Nairobi', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  const productDetails = products
    .map((product) => {
      const sanitizedProductName = sanitizeHtml(capitalizeWords(product.name), sanitizeConfig);
      const sanitizedPrice = sanitizeHtml(product.price.toFixed(2), sanitizeConfig);
      const sanitizedDescription = sanitizeHtml(product.description.slice(0, 100) + (product.description.length > 100 ? '...' : ''), sanitizeConfig);
      const sanitizedImage = sanitizeHtml(product.image || 'https://via.placeholder.com/300x300/ffffff/cccccc?text=No+Image', sanitizeConfig);
      const sanitizedProductUrl = sanitizeHtml(product.url, { ...sanitizeConfig, allowedSchemes: ['https'] });

      return `
        <tr>
          <td style="padding: 0 0 24px 0;">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" class="product-table" style="background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08); border: 1px solid #e2e8f0;">
              <tr>
                <td style="position: relative; text-align: center; padding: 0;">
                  <div style="position: relative; overflow: hidden; border-radius: 12px 12px 0 0; background: #f8fafc; padding: 24px 0;">
                    <img src="${sanitizedImage}" alt="${sanitizedProductName}" style="width: 100%; max-width: 100%; height: auto; display: block; margin: 0 auto;" width="300" height="300">
                    <span style="position: absolute; top: 16px; right: 16px; background: #10b981; color: #ffffff; font-size: 11px; font-weight: 600; padding: 4px 8px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1); white-space: nowrap; text-transform: uppercase; letter-spacing: 0.5px;">In Stock</span>
                  </div>
                </td>
              </tr>
              <tr>
                <td style="padding: 24px 20px; text-align: left;">
                  <h3 style="font-size: 20px; font-weight: 700; color: #1e293b; margin: 0 0 8px 0; line-height: 1.3;">${sanitizedProductName}</h3>
                  <p style="font-size: 18px; font-weight: 700; color: #dc2626; margin: 0 0 12px 0; line-height: 1.2;">KES ${sanitizedPrice}</p>
                  <p style="font-size: 14px; color: #64748b; line-height: 1.6; margin: 0 0 20px 0;">${sanitizedDescription}</p>
                  <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                      <td style="text-align: right;">
                        <a href="${sanitizedProductUrl}" style="display: inline-block; background: #3b82f6; color: #ffffff; font-size: 14px; font-weight: 600; padding: 12px 24px; text-decoration: none; border-radius: 8px; transition: background-color 0.2s ease;">
                          View Product
                        </a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      `;
    })
    .join('');

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="X-UA-Compatible" content="IE=edge">
      <meta name="x-apple-disable-message-reformatting">
      <meta name="color-scheme" content="light dark">
      <meta name="supported-color-schemes" content="light dark">
      <title>Marketing Campaign Report - BeiFity.Com</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        body { 
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
          margin: 0; 
          padding: 0; 
          background: #f8fafc; 
          -webkit-text-size-adjust: 100%;
          -ms-text-size-adjust: 100%;
          color: #1e293b;
        }
        table { border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
        .container { max-width: 600px; margin: 0 auto; }
        .button { display: inline-block; text-decoration: none; }
        .button:hover { opacity: 0.9; }
        .product-table:hover { box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12); transform: translateY(-1px); transition: all 0.2s ease; }
        img { max-width: 100%; height: auto; border: 0; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; }
        .social-icon { display: inline-block; margin: 0 8px; width: 32px; height: 32px; border-radius: 50%; transition: transform 0.2s ease; }
        .social-icon:hover { transform: scale(1.05); }
        .preheader { display: none !important; max-height: 0; overflow: hidden; color: #64748b; font-size: 1px; line-height: 1px; }
        /* Dark Mode */
        @media (prefers-color-scheme: dark) {
          body { background: #0f172a; color: #f1f5f9; }
          .container { background: #1e293b; }
          .product-table { background: #334155; border-color: #475569; }
          .hero { background: linear-gradient(135deg, #1e40af, #1d4ed8); }
          .recipients-section, .cta-section { background: #334155; }
          .footer { background: #0f172a; color: #94a3b8; }
          .footer a { color: #60a5fa; }
        }
        /* Responsive Styles */
        @media only screen and (max-width: 600px) {
          .container { width: 100% !important; padding: 0 16px !important; }
          .hero { padding: 32px 20px !important; }
          .hero h1 { font-size: 24px !important; line-height: 1.2 !important; }
          .hero p { font-size: 16px !important; line-height: 1.4 !important; }
          .hero .button { padding: 12px 24px !important; font-size: 15px !important; }
          .product-table { margin: 0 !important; width: 100% !important; }
          .product-content { padding: 20px 16px !important; text-align: center !important; }
          .product-name { font-size: 18px !important; margin-bottom: 8px !important; }
          .product-price { font-size: 18px !important; margin-bottom: 8px !important; }
          .product-desc { font-size: 14px !important; margin-bottom: 16px !important; text-align: center !important; }
          .product-button { padding: 10px 20px !important; font-size: 14px !important; }
          .stock-badge { position: static !important; display: block !important; margin: 12px auto 0 !important; transform: none !important; }
          .cta-button { padding: 12px 24px !important; font-size: 15px !important; }
          .footer { padding: 24px 16px !important; }
          .footer-text { font-size: 13px !important; line-height: 1.4 !important; }
          .recipients-section { padding: 20px 16px !important; }
          .recipients-text { font-size: 13px !important; }
        }
        @media only screen and (max-width: 480px) {
          .hero h1 { font-size: 20px !important; }
          .hero p { font-size: 14px !important; }
          .product-name { font-size: 16px !important; }
          .product-price { font-size: 16px !important; }
          .product-desc { font-size: 13px !important; }
          .header-logo { height: 48px !important; }
        }
      </style>
    </head>
    <body style="margin: 0; padding: 0; background: #f8fafc;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="padding: 0;">
        <tr>
          <td class="preheader" style="padding: 20px 0; font-size: 1px; line-height: 1px;">Marketing Campaign Report: Overview of sent emails, recipients, and promoted products for BeiFity.Com.</td>
        </tr>
        <tr>
          <td align="center" style="padding: 40px 20px 0;">
            <table role="presentation" class="container" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background: #ffffff; border-radius: 16px; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08); overflow: hidden; border: 1px solid #e2e8f0;">
              <!-- Header -->
              <tr>
                <td style="padding: 24px 24px 0; text-align: center; background: #ffffff;">
                  <a href="${FRONTEND_URL}" style="text-decoration: none;">
                    <img src="https://www.beifity.com/assets/logo-without-CMu8rsBL.png" alt="BeiFity.Com Logo" class="header-logo" style="width: auto; height: 56px; display: block; margin: 0 auto;" width="160" height="56">
                  </a>
                </td>
              </tr>
              <!-- Hero Section -->
              <tr>
                <td class="hero" style="background: linear-gradient(135deg, #3b82f6, #60a5fa); padding: 40px 24px; text-align: center; color: #ffffff;">
                  <h1 style="font-size: 28px; font-weight: 700; margin: 0 0 8px 0; line-height: 1.3;">Campaign Report</h1>
                  <p style="font-size: 18px; line-height: 1.6; margin: 0 0 24px 0;">Sent to <strong>${recipients.length}</strong> users on <strong>${campaignDate}</strong>.</p>
                  <a href="${FRONTEND_URL}/admin/dashboard" class="button" style="display: inline-block; background: #fbbf24; color: #1e293b; font-size: 16px; font-weight: 600; padding: 14px 28px; text-decoration: none; border-radius: 8px;">
                    View Dashboard
                  </a>
                </td>
              </tr>
              <!-- Recipients Section -->
              <tr>
                <td class="recipients-section" style="padding: 32px 24px; text-align: left; background: #f8fafc; border-top: 1px solid #e2e8f0;">
                  <h2 style="font-size: 20px; font-weight: 600; color: #1e293b; margin: 0 0 12px 0; line-height: 1.3;">Recipients Overview</h2>
                  <p style="font-size: 14px; color: #64748b; line-height: 1.6; margin: 0 0 16px 0;">Total: <strong>${recipients.length}</strong></p>
                  <p class="recipients-text" style="font-size: 14px; color: #475569; line-height: 1.5; margin: 0; word-break: break-all;">${sanitizedRecipients}</p>
                </td>
              </tr>
              <!-- Products Section Header -->
              <tr>
                <td style="padding: 32px 24px 16px; text-align: center; border-top: 1px solid #e2e8f0;">
                  <h2 style="font-size: 24px; font-weight: 600; color: #1e293b; margin: 0 0 4px 0; line-height: 1.3;">Promoted Products</h2>
                  <p style="font-size: 16px; color: #64748b; margin: 0; line-height: 1.5;">Featured in this campaign</p>
                </td>
              </tr>
              <!-- Products -->
              <tr>
                <td style="padding: 0 24px 32px; border-top: 1px solid #e2e8f0;">
                  <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                    ${productDetails}
                  </table>
                </td>
              </tr>
              <!-- CTA Section -->
              <tr>
                <td class="cta-section" style="padding: 32px 24px; text-align: center; background: #f8fafc; border-top: 1px solid #e2e8f0;">
                  <h3 style="font-size: 20px; font-weight: 600; color: #1e293b; margin: 0 0 12px 0; line-height: 1.3;">Next Steps</h3>
                  <a href="${FRONTEND_URL}/admin/dashboard" class="button cta-button" style="display: inline-block; background: #3b82f6; color: #ffffff; font-size: 16px; font-weight: 600; padding: 14px 28px; text-decoration: none; border-radius: 8px; text-transform: uppercase; letter-spacing: 0.5px;">
                    Analyze Campaign
                  </a>
                </td>
              </tr>
              <!-- Footer -->
              <tr>
                <td class="footer" style="padding: 32px 24px; text-align: center; background: #f8fafc; border-top: 1px solid #e2e8f0; color: #64748b;">
                  <p style="font-size: 14px; margin: 0 0 12px 0; line-height: 1.5;">
                    <a href="${FRONTEND_URL}/admin/unsubscribe" style="color: #3b82f6; text-decoration: none; font-weight: 500;">Manage Notifications</a> | 
                    <a href="${FRONTEND_URL}/privacy" style="color: #3b82f6; text-decoration: none; font-weight: 500;">Privacy Policy</a>
                  </p>
                  <p style="font-size: 14px; margin: 0 0 16px 0; line-height: 1.5;">
                    BeiFity.Com | P.O. Box 12345, Nairobi, Kenya | <a href="mailto:support@beifity.com" style="color: #3b82f6; text-decoration: none;">support@beifity.com</a>
                  </p>
                  <p style="font-size: 14px; margin: 0 0 20px 0; line-height: 1.5;">
                    <span style="color: #1e293b; font-weight: 600;">BeiF<span style="color: #fbbf24;">ity</span>.Com</span> © ${new Date().getFullYear()} All rights reserved.
                  </p>
                  <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                      <td style="text-align: center;">
                        <a href="https://facebook.com/beifity" class="social-icon" style="background: #1877f2;" aria-label="Facebook">
                          <img src="https://via.placeholder.com/32x32/ffffff/1877f2?text=F" alt="Facebook" style="width: 32px; height: 32px; border-radius: 50%; display: block;">
                        </a>
                        <a href="https://instagram.com/beifity" class="social-icon" style="background: #e4405f;" aria-label="Instagram">
                          <img src="https://via.placeholder.com/32x32/ffffff/e4405f?text=I" alt="Instagram" style="width: 32px; height: 32px; border-radius: 50%; display: block;">
                        </a>
                        <a href="https://twitter.com/beifity" class="social-icon" style="background: #000000;" aria-label="Twitter">
                          <img src="https://via.placeholder.com/32x32/ffffff/000000?text=T" alt="Twitter" style="width: 32px; height: 32px; border-radius: 50%; display: block;">
                        </a>
                      </td>
                    </tr>
                  </table>
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

// Add to templates.js
export const generateProductRequestEmail = (
  name,
  phone,
  productName,
  description,
  preferredPriceRange,
  colors,
  condition,
  additionalNotes
) => {
  const sanitizedName = sanitizeHtml(name, sanitizeConfig);
  const sanitizedPhone = sanitizeHtml(phone, sanitizeConfig);
  const sanitizedProductName = sanitizeHtml(capitalizeWords(productName), sanitizeConfig);
  const sanitizedDescription = sanitizeHtml(description || 'Not provided', sanitizeConfig);
  const sanitizedPreferredPriceRange = sanitizeHtml(Number(preferredPriceRange).toFixed(2), sanitizeConfig);
  const sanitizedColors = colors.length > 0
    ? colors.map(color => sanitizeHtml(color, sanitizeConfig)).join(', ')
    : sanitizeHtml('Not specified', sanitizeConfig);
  const sanitizedCondition = sanitizeHtml(condition, sanitizeConfig);
  const sanitizedAdditionalNotes = sanitizeHtml(additionalNotes || 'Not provided', sanitizeConfig);

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>New Product Request - BeiFity.Com</title>
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
                  <h2 style="font-size: 20px; font-weight: 700; color: #1e40af; margin-bottom: 20px;">New Product Request Received!</h2>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 15px; font-weight: 600; color: #1e293b; margin-bottom: 25px;">A User Has Requested a Product</p>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #475569; line-height: 1.6; margin-bottom: 30px;">
                    A new product request has been submitted on <span style="color: #1e40af; font-weight: 600;">BeiF<span style="color: #fbbf24;">ity.Com</span></span>. Please review the details below and take appropriate action.
                  </p>
                </td>
              </tr>
              <tr>
                <td>
                  <div style="background-color: #f0f4f8; padding: 20px; border-radius: 8px; text-align: left; margin-bottom: 30px;">
                    <p style="font-size: 14px; color: #1e40af; font-weight: 600; margin: 0 0 10px;">Request Details</p>
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Requested By:</strong> ${sanitizedName}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Phone Number:</strong> ${sanitizedPhone}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Product Name:</strong> ${sanitizedProductName}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Description:</strong> ${sanitizedDescription}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Preferred Price Range:</strong> KES ${sanitizedPreferredPriceRange}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Preferred Colors:</strong> ${sanitizedColors}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Condition:</strong> ${sanitizedCondition}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Additional Notes:</strong> ${sanitizedAdditionalNotes}</p>
                  </div>
                </td>
              </tr>
              <tr>
                <td>
                  <a href="${FRONTEND_URL}/admin/requests" style="display: inline-block; background-color: #1e40af; color: #ffffff; font-size: 14px; font-weight: 600; padding: 12px 25px; text-decoration: none; border-radius: 6px; margin-bottom: 30px;">
                    View Product Requests
                  </a>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Next Steps:</strong> Review the request in the admin dashboard and contact the user if necessary to discuss availability or sourcing options.
                  </p>
                  <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Need Assistance?</strong> Contact our support team at <a href="mailto:customer.care@beifity.com" style="color: #1e40af; text-decoration: underline;">customer.care@beifity.com</a>.
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


// HTML Email Template Function for Buyer Negotiation (with seller phone number)
export const generateNegotiationEmailBuyer = (buyerName, listingName, sellerName, sellerPhone, productId) => {
  const sanitizedBuyerName = sanitizeHtml(buyerName, sanitizeConfig);
  const sanitizedListingName = sanitizeHtml(capitalizeWords(listingName), sanitizeConfig);
  const sanitizedSellerName = sanitizeHtml(sellerName, sanitizeConfig);
  const sanitizedSellerPhone = sanitizeHtml(sellerPhone, sanitizeConfig);
  const sanitizedProductId = sanitizeHtml(productId, sanitizeConfig);

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Negotiation Recorded - BeiFity.Com</title>
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
                  <h2 style="font-size: 20px; font-weight: 700; color: #1e40af; margin-bottom: 20px;">Negotiation Recorded, ${sanitizedBuyerName}!</h2>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 15px; font-weight: 600; color: #1e293b; margin-bottom: 25px;">Your Negotiation Attempt Has Been Recorded</p>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #475569; line-height: 1.6; margin-bottom: 30px;">
                    Hi ${sanitizedBuyerName}, we're excited to let you know that your negotiation attempt for "<strong>${sanitizedListingName}</strong>" has been successfully recorded on <span style="color: #1e40af; font-weight: 600;">BeiF<span style="color: #fbbf24;">ity.Com</span></span>.
                  </p>
                </td>
              </tr>
              <tr>
                <td>
                  <div style="background-color: #f0f4f8; padding: 20px; border-radius: 8px; text-align: left; margin-bottom: 30px;">
                    <p style="font-size: 14px; color: #1e40af; font-weight: 600; margin: 0 0 10px;">Negotiation Details</p>
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Product:</strong> ${sanitizedListingName}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Seller Name:</strong> ${sanitizedSellerName}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Seller Phone:</strong> ${sanitizedSellerPhone}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Product ID:</strong> ${sanitizedProductId}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0;"><strong>Date:</strong> ${new Date().toLocaleString('en-US', { timeZone: 'Africa/Nairobi' })}</p>
                  </div>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #475569; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Contact the Seller:</strong> You can now reach out to ${sanitizedSellerName} directly at <strong>${sanitizedSellerPhone}</strong> to discuss the negotiation further.
                  </p>
                </td>
              </tr>
              <tr>
                <td>
                  <a href="${FRONTEND_URL}/product/${createSlug(listingName)}/${sanitizedProductId}" style="display: inline-block; background-color: #1e40af; color: #ffffff; font-size: 14px; font-weight: 600; padding: 12px 25px; text-decoration: none; border-radius: 6px; margin-bottom: 30px;">
                    View Product Again
                  </a>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Next Steps:</strong> The seller has been notified and will get back to you soon. Feel free to contact them directly using the phone number provided above.
                  </p>
                  <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Need Assistance?</strong> Visit your buyer dashboard or contact our support team at <a href="mailto:customer.care@beifity.com" style="color: #1e40af; text-decoration: underline;">customer.care@beifity.com</a>.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="margin-top: 30px;">
                  <p style="font-size: 14px; color: #64748b; margin: 0;">Happy negotiating on BeiFity!</p>
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

// HTML Email Template Function for Seller Negotiation (unchanged but included for completeness)
export const generateNegotiationEmailSeller = (sellerName, listingName, buyerName, buyerPhone, productId) => {
  const sanitizedSellerName = sanitizeHtml(sellerName, sanitizeConfig);
  const sanitizedListingName = sanitizeHtml(capitalizeWords(listingName), sanitizeConfig);
  const sanitizedBuyerName = sanitizeHtml(buyerName, sanitizeConfig);
  const sanitizedBuyerPhone = sanitizeHtml(buyerPhone, sanitizeConfig);
  const sanitizedProductId = sanitizeHtml(productId, sanitizeConfig);

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>New Negotiation Attempt - BeiFity.Com</title>
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
                  <h2 style="font-size: 20px; font-weight: 700; color: #1e40af; margin-bottom: 20px;">New Negotiation Attempt, ${sanitizedSellerName}!</h2>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 15px; font-weight: 600; color: #1e293b; margin-bottom: 25px;">A Buyer Wants to Negotiate Your Listing</p>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #475569; line-height: 1.6; margin-bottom: 30px;">
                    Hi ${sanitizedSellerName}, great news! A potential buyer has expressed interest in negotiating the price of your listing "<strong>${sanitizedListingName}</strong>" on <span style="color: #1e40af; font-weight: 600;">BeiF<span style="color: #fbbf24;">ity.Com</span></span>.
                  </p>
                </td>
              </tr>
              <tr>
                <td>
                  <div style="background-color: #f0f4f8; padding: 20px; border-radius: 8px; text-align: left; margin-bottom: 30px;">
                    <p style="font-size: 14px; color: #1e40af; font-weight: 600; margin: 0 0 10px;">Negotiation Details</p>
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Product:</strong> ${sanitizedListingName}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Buyer Name:</strong> ${sanitizedBuyerName}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Buyer Phone:</strong> ${sanitizedBuyerPhone}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Product ID:</strong> ${sanitizedProductId}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0;"><strong>Date:</strong> ${new Date().toLocaleString('en-US', { timeZone: 'Africa/Nairobi' })}</p>
                  </div>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #475569; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Contact the Buyer:</strong> You can reach out to ${sanitizedBuyerName} directly at <strong>${sanitizedBuyerPhone}</strong> to discuss the negotiation.
                  </p>
                </td>
              </tr>
              <tr>
                <td>
                  <a href="${FRONTEND_URL}/product/${createSlug(listingName)}/${sanitizedProductId}" style="display: inline-block; background-color: #1e40af; color: #ffffff; font-size: 14px; font-weight: 600; padding: 12px 25px; text-decoration: none; border-radius: 6px; margin-bottom: 30px;">
                    View Your Listing
                  </a>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Next Steps:</strong> Please respond to the buyer promptly to discuss the negotiation. Quick responses increase your chances of making a sale!
                  </p>
                  <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Need Assistance?</strong> Visit your seller dashboard or contact our support team at <a href="mailto:customer.care@beifity.com" style="color: #1e40af; text-decoration: underline;">customer.care@beifity.com</a>.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="margin-top: 30px;">
                  <p style="font-size: 14px; color: #64748b; margin: 0;">Keep selling on BeiFity!</p>
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
// HTML Email Template Function for Buyer Inquiry (with seller phone number)
export const generateInquiryEmailBuyer = (buyerName, listingName, sellerName, sellerPhone, productId) => {
  const sanitizedBuyerName = sanitizeHtml(buyerName, sanitizeConfig);
  const sanitizedListingName = sanitizeHtml(capitalizeWords(listingName), sanitizeConfig);
  const sanitizedSellerName = sanitizeHtml(sellerName, sanitizeConfig);
  const sanitizedSellerPhone = sanitizeHtml(sellerPhone, sanitizeConfig);
  const sanitizedProductId = sanitizeHtml(productId, sanitizeConfig);

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Inquiry Recorded - BeiFity.Com</title>
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
                  <h2 style="font-size: 20px; font-weight: 700; color: #1e40af; margin-bottom: 20px;">Inquiry Recorded, ${sanitizedBuyerName}!</h2>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 15px; font-weight: 600; color: #1e293b; margin-bottom: 25px;">Your Product Inquiry Has Been Recorded</p>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #475569; line-height: 1.6; margin-bottom: 30px;">
                    Hi ${sanitizedBuyerName}, we're excited to let you know that your inquiry for "<strong>${sanitizedListingName}</strong>" has been successfully recorded on <span style="color: #1e40af; font-weight: 600;">BeiF<span style="color: #fbbf24;">ity.Com</span></span>.
                  </p>
                </td>
              </tr>
              <tr>
                <td>
                  <div style="background-color: #f0f4f8; padding: 20px; border-radius: 8px; text-align: left; margin-bottom: 30px;">
                    <p style="font-size: 14px; color: #1e40af; font-weight: 600; margin: 0 0 10px;">Inquiry Details</p>
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Product:</strong> ${sanitizedListingName}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Seller Name:</strong> ${sanitizedSellerName}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Seller Phone:</strong> ${sanitizedSellerPhone}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Product ID:</strong> ${sanitizedProductId}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0;"><strong>Inquiry Date:</strong> ${new Date().toLocaleString('en-US', { timeZone: 'Africa/Nairobi' })}</p>
                  </div>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #475569; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Contact the Seller:</strong> You can now reach out to ${sanitizedSellerName} directly at <strong>${sanitizedSellerPhone}</strong> to discuss the product further and get more information.
                  </p>
                </td>
              </tr>
              <tr>
                <td>
                  <a href="${FRONTEND_URL}/product/${createSlug(listingName)}/${sanitizedProductId}" style="display: inline-block; background-color: #1e40af; color: #ffffff; font-size: 14px; font-weight: 600; padding: 12px 25px; text-decoration: none; border-radius: 6px; margin-bottom: 30px;">
                    View Product Details
                  </a>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Next Steps:</strong> The seller has been notified of your interest and will get back to you soon. Feel free to contact them directly using the phone number provided above for quicker response.
                  </p>
                  <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Need Assistance?</strong> Visit your buyer dashboard or contact our support team at <a href="mailto:customer.care@beifity.com" style="color: #1e40af; text-decoration: underline;">customer.care@beifity.com</a>.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="margin-top: 30px;">
                  <p style="font-size: 14px; color: #64748b; margin: 0;">Happy shopping on BeiFity!</p>
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

// HTML Email Template Function for Seller Inquiry (with buyer phone number)
export const generateInquiryEmailSeller = (sellerName, listingName, buyerName, buyerPhone, productId) => {
  const sanitizedSellerName = sanitizeHtml(sellerName, sanitizeConfig);
  const sanitizedListingName = sanitizeHtml(capitalizeWords(listingName), sanitizeConfig);
  const sanitizedBuyerName = sanitizeHtml(buyerName, sanitizeConfig);
  const sanitizedBuyerPhone = sanitizeHtml(buyerPhone, sanitizeConfig);
  const sanitizedProductId = sanitizeHtml(productId, sanitizeConfig);

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>New Product Inquiry - BeiFity.Com</title>
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
                  <h2 style="font-size: 20px; font-weight: 700; color: #1e40af; margin-bottom: 20px;">New Product Inquiry, ${sanitizedSellerName}!</h2>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 15px; font-weight: 600; color: #1e293b; margin-bottom: 25px;">A Buyer is Interested in Your Listing</p>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #475569; line-height: 1.6; margin-bottom: 30px;">
                    Hi ${sanitizedSellerName}, great news! A potential buyer has shown interest in your listing "<strong>${sanitizedListingName}</strong>" on <span style="color: #1e40af; font-weight: 600;">BeiF<span style="color: #fbbf24;">ity.Com</span></span>.
                  </p>
                </td>
              </tr>
              <tr>
                <td>
                  <div style="background-color: #f0f4f8; padding: 20px; border-radius: 8px; text-align: left; margin-bottom: 30px;">
                    <p style="font-size: 14px; color: #1e40af; font-weight: 600; margin: 0 0 10px;">Inquiry Details</p>
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Product:</strong> ${sanitizedListingName}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Buyer Name:</strong> ${sanitizedBuyerName}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Buyer Phone:</strong> ${sanitizedBuyerPhone}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Product ID:</strong> ${sanitizedProductId}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0;"><strong>Inquiry Date:</strong> ${new Date().toLocaleString('en-US', { timeZone: 'Africa/Nairobi' })}</p>
                  </div>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #475569; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Contact the Buyer:</strong> You can reach out to ${sanitizedBuyerName} directly at <strong>${sanitizedBuyerPhone}</strong> to answer their questions and discuss the product further.
                  </p>
                </td>
              </tr>
              <tr>
                <td>
                  <a href="${FRONTEND_URL}/product/${createSlug(listingName)}/${sanitizedProductId}" style="display: inline-block; background-color: #1e40af; color: #ffffff; font-size: 14px; font-weight: 600; padding: 12px 25px; text-decoration: none; border-radius: 6px; margin-bottom: 30px;">
                    View Your Listing
                  </a>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Next Steps:</strong> Please respond to the buyer promptly to answer their questions. Quick responses increase your chances of making a sale!
                  </p>
                  <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Need Assistance?</strong> Visit your seller dashboard or contact our support team at <a href="mailto:customer.care@beifity.com" style="color: #1e40af; text-decoration: underline;">customer.care@beifity.com</a>.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="margin-top: 30px;">
                  <p style="font-size: 14px; color: #64748b; margin: 0;">Keep selling on BeiFity!</p>
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