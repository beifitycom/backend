import fs from 'fs';
import path from 'path';
import listingModel from "../models/Listing.js"
import userModel from "../models/User.js"


// Static routes from your provided array (filtered for indexable routes)
const staticRoutes = [
  { path: '/', changefreq: 'daily', priority: 1.0 },
  { path: '/messages', changefreq: 'daily', priority: 0.6 },
  { path: '/verify-email', changefreq: 'monthly', priority: 0.6 },
  { path: '/notifications', changefreq: 'daily', priority: 0.6 },
  { path: '/upload-product', changefreq: 'weekly', priority: 0.7 },
  { path: '/edit-profile', changefreq: 'weekly', priority: 0.6 },
  { path: '/collection', changefreq: 'daily', priority: 0.8 },
  { path: '/cart', changefreq: 'daily', priority: 0.6 },
  { path: '/about', changefreq: 'monthly', priority: 0.8 },
  { path: '/login', changefreq: 'monthly', priority: 0.6 },
  { path: '/sign-up', changefreq: 'monthly', priority: 0.6 },
  { path: '/dashboard', changefreq: 'weekly', priority: 0.6 },
  { path: '/contact', changefreq: 'monthly', priority: 0.8 },
  { path: '/user-profile', changefreq: 'weekly', priority: 0.6 },
  { path: '/listings', changefreq: 'daily', priority: 0.7 },
  { path: '/analysis', changefreq: 'weekly', priority: 0.6 },
  { path: '/placed-order', changefreq: 'daily', priority: 0.6 },
  { path: '/your-orders', changefreq: 'daily', priority: 0.6 },
  { path: '/privacy-policy', changefreq: 'monthly', priority: 0.8 },
  { path: '/user-agreement', changefreq: 'monthly', priority: 0.8 },
  { path: '/terms-of-service', changefreq: 'monthly', priority: 0.8 },
];

// Function to generate sitemap
export const generateSitemap = async() => {
  const baseUrl = 'https://www.beifity.com';
  const currentDate = new Date().toISOString().split('T')[0]; // e.g., 2025-06-09

  // Fetch dynamic data
  const products = await listingModel.find().select('productInfo.productId productInfo.productName updatedAt');
  const sellers = await userModel.find().select('username  updatedAt')
  const realSellers = await sellers.filter(sellers => sellers.listings.length > 0);

  // Start XML structure
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

  // Add static routes
  staticRoutes.forEach(route => {
    xml += `  <url>\n`;
    xml += `    <loc>${baseUrl}${route.path}</loc>\n`;
    xml += `    <lastmod>${currentDate}</lastmod>\n`;
    xml += `    <changefreq>${route.changefreq}</changefreq>\n`;
    xml += `    <priority>${route.priority}</priority>\n`;
    xml += `  </url>\n`;
  });

  // Add product listings
  products.forEach(product => {
    const slug = encodeURIComponent(product.name.replace(/\s+/g, '-').toLowerCase());
    const url = `${baseUrl}/product/${slug}/${product._id}`;
    const lastmod = product.updatedAt ? new Date(product.updatedAt).toISOString().split('T')[0] : currentDate;
    xml += `  <url>\n`;
    xml += `    <loc>${url}</loc>\n`;
    xml += `    <lastmod>${lastmod}</lastmod>\n`;
    xml += `    <changefreq>daily</changefreq>\n`;
    xml += `    <priority>0.9</priority>\n`;
    xml += `  </url>\n`;
  });

  // Add seller stores
  realSellers.forEach(seller => {
    const url = `${baseUrl}/store/${encodeURIComponent(seller.username)}/${seller.sid}`;
    const lastmod = seller.updatedAt ? new Date(seller.updatedAt).toISOString().split('T')[0] : currentDate;
    xml += `  <url>\n`;
    xml += `    <loc>${url}</loc>\n`;
    xml += `    <lastmod>${lastmod}</lastmod>\n`;
    xml += `    <changefreq>weekly</changefreq>\n`;
    xml += `    <priority>0.8</priority>\n`;
    xml += `  </url>\n`;
  });

  // Close XML
  xml += '</urlset>';

  // Write to file
  const filePath = path.join(__dirname, 'public', 'sitemap.xml');
  fs.writeFileSync(filePath, xml, 'utf8');
  console.log('Sitemap generated successfully!');
}
export const generate = async (req, res) => {
  try {
    await generateSitemap();
    res.status(200).json({ success: true ,message: 'Sitemap generated successfully' });
  } catch (error) {
    console.error('Error generating sitemap:', error);
    res.status(500).json({ success: false , error: 'Failed to generate sitemap' });
 }
}
// Express endpoint to trigger sitemap generation

