// Shared Location Schema (to be used in both User and Listing)
const LocationSchema = new mongoose.Schema({
  country: {
    type: String,
    default: 'Kenya',
    required: true,
    enum: ['Kenya'], // Enforce Kenya for now; expand if needed
  },
  county: {
    type: String,
    required: true,
  },
  constituency: {
    type: String,
    required: true,
  },
  fullAddress: {
    type: String,
    default: '',
  },
  coordinates: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point',
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      default: [36.8219, -1.2921], // Default to Nairobi
      index: '2dsphere', // Geo index for spatial queries
    },
  },
}, { _id: false });

// models/Listing.js
import mongoose from 'mongoose';

// AI Finding Schema
const AiFindingSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  action: {
    type: String,
    required: true,
  },
  priority: {
    type: String,
    enum: ['high', 'medium', 'low'],
    required: true,
  },
});

// Product Information Schema
const ProductInfoSchema = new mongoose.Schema({
  productId: {
    type: String,
    unique: true,
    required: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    required: true,
  },
  details: {
    type: String,
    required: true,
  },
  price: {
    type: Number,
    required: true,
    min: 0,
  },
  cancelledPrice: {
    type: Number,
    min: 0,
  },
  images: {
    type: [String],
    required: true,
    validate: {
      validator: (v) => v.length > 0 && v.length <= 5,
      message: 'Images must be between 1 and 5',
    },
  },
  category: {
    type: String,
    required: true,
  },
  subCategory: {
    type: String,
    default: '',
  },
  tags: {
    type: [String],
    default: [],
    validate: {
      validator: (v) => v.length <= 5,
      message: 'Maximum 5 tags allowed',
    },
  },
  onOffer :{
    type: Boolean,
    default: false,
  },
  sizes: {
    type: [String],
    default: [],
    validate: {
      validator: (v) => v.length <= 5,
      message: 'Maximum 5 sizes allowed',
    },
  },
  colors: {
    type: [String],
    default: [],
    validate: {
      validator: (v) => v.length <= 5,
      message: 'Maximum 5 colors allowed',
    },
  },
  usageDuration: {
    type: String,
    default: 'Brand New (0-1 months)',
  },
  condition: {
    type: String,
    enum: ['New', 'Like New', 'Used', 'Refurbished'],
    default: 'New',
  },
  brand: {
    type: String,
    default: '',
    trim: true,
  },
  model: {
    type: String,
    default: '',
    trim: true,
  },
  warranty: {
    type: String,
    default: 'No Warranty',
  },
});

// Seller Information Schema
const SellerInfoSchema = new mongoose.Schema({
  sellerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  sellerNotes: {
    type: String,
    default: '',
    trim: true,
  },
  responseTime: {
    type: Number,
    default: 0,
    min: 0,
  },
  acceptanceRate: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
  },
});

// Analytics Schema (optimized with indexes where applicable)
const AnalyticsSchema = new mongoose.Schema({
  views: {
    total: {
      type: Number,
      default: 0,
    },
    uniqueViewers: {
      type: [String],
      default: [],
    },
  },
  cartAdditions: {
    total: { type: Number, default: 0 },
    userIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', default: [] }],
    guestIds: [{ type: String, default: [] }],
  },
  wishlist: {
    total: { type: Number, default: 0 },
    userIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', default: [] }],
    guestIds: [{ type: String, default: [] }],
  },
  shared: {
    total: {
      type: Number,
      default: 0,
    },
    platforms: {
      type: Map,
      of: Number,
      default: {},
    },
  },
  reportsReceived: {
    type: Number,
    default: 0,
  },
  inquiries: {
    type: Number,
    default: 0,
  },
  negotiationAttempts: {
    type: Number,
    default: 0,
  },
  ordersNumber: {
    type: Number,
    default: 0,
  },
  conversionRate: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
  },
});

// Review Schema
const ReviewSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  comment: {
    type: String,
    trim: true,
    maxlength: 500,
  },
  rating: {
    type: Number,
    min: 1,
    max: 5,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true, // For sorting reviews by date
  },
});

// Main Listing Schema
const ListingSchema = new mongoose.Schema({
  productInfo: {
    type: ProductInfoSchema,
    required: true,
  },
  seller: {
    type: SellerInfoSchema,
    required: true,
  },
  analytics: {
    type: AnalyticsSchema,
    default: () => ({
      views: { total: 0, uniqueViewers: [] },
      cartAdditions: { total: 0, userIds: [], guestIds: [] },
      wishlist: { total: 0, userIds: [], guestIds: [] },
      shared: { total: 0, platforms: {} },
      reportsReceived: 0,
      inquiries: 0,
      negotiationAttempts: 0,
      ordersNumber: 0,
      conversionRate: 0,
    }),
  },
  reviews: {
    type: [ReviewSchema],
    default: [],
  },
  negotiable: {
    type: Boolean,
    default: false,
  },
  verified: {
    type: String,
    default: 'Pending',
    enum: ['Pending', 'Verified', 'Rejected'],
  },
  location: {
    type: LocationSchema,
    required: true,
  },
  isSold: {
    type: Boolean,
    default: false,
  },
  rating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5,
  },
  AgreedToTerms: {
    type: Boolean,
    required: true,
    default: false, // Changed default to false for safety
  },
  featured: {
    type: Boolean,
    default: false,
  },
  promotedUntil: {
    type: Date,
  },
  inventory: {
    type: Number,
    default: 1,
    min: 0,
  },
  shippingOptions: {
    type: [String],
    default: ['Local Pickup', 'Delivery'],
    validate: {
      validator: (v) => v.length > 0 && v.length <= 3,
      message: 'Shipping options must be 1-3',
    },
  },
  expiresAt: {
    type: Date,
    required: true,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  aiFindings: {
    type: [AiFindingSchema],
    default: [],
  },
}, { timestamps: true });

// Compound indexes for efficient queries
ListingSchema.index({ 'seller.sellerId': 1 });
ListingSchema.index({ 'location.coordinates': '2dsphere' });
ListingSchema.index({ category: 1, 'location.county': 1 }); // For category/location searches
ListingSchema.index({ isSold: 1 });

// Pre-save hook to calculate rating
ListingSchema.pre('save', function (next) {
  if (this.isModified('reviews')) {
    const reviews = this.reviews || [];
    const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
    this.rating = reviews.length ? totalRating / reviews.length : 0;
  }

  // Auto-set location from seller if not provided (requires population in controller)
  if (!this.location || !this.location.county) {
    // In controller: await populate seller and set this.location = seller.location
  }

  next();
});

export const listingModel = mongoose.model('Listing', ListingSchema);