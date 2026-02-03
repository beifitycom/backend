// models/User.js
import mongoose from 'mongoose';

// Shared Location Schema (imported or defined here if not shared)
const LocationSchema = new mongoose.Schema({
  country: {
    type: String,
    default: 'Kenya',
    enum: ['Kenya'],
  },
  county: {
    type: String,
    required: true,
  },
  constituency: {
    type: String,
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
      default: [36.8219, -1.2921],
      index: '2dsphere',
    },
  },
}, { _id: false });

const UserSchema = new mongoose.Schema(
  {
    // Personal info
    personalInfo: {
      username: {
        type: String,
        unique: true,
        sparse: true,
        trim: true,
        minlength: 3,
        maxlength: 30,
      },
      fullname: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100,
      },
      email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
      },
      verified: {
        type: Boolean,
        default: false,
      },
      password: {
        type: String,
        required: true,
        select: false,
      },
      profilePicture: {
        type: String,
        default: 'https://img.freepik.com/free-vector/blue-circle-with-white-user_78370-4707.jpg?semt=ais_hybrid&w=740&q=80',
      },
      phone: {
        type: String,
        validate: {
          validator: (v) => /^\+?[0-9]{7,15}$/.test(v),
          message: 'Invalid phone number',
        },
      },
      location: {
        type: LocationSchema,
      },
      bio: {
        type: String,
        default: '',
        trim: true,
        maxlength: 500,
      },
      socialLinks: {
        facebook: { type: String, default: '' },
        twitter: { type: String, default: '' },
        instagram: { type: String, default: '' },
        website: { type: String, default: '' },
      },
      profileCompleteness: {
        type: Number,
        default: 0,
        min: 0,
        max: 100,
      },
      recipient_code: { type: String, default: null }, // Paystack only
      mobileMoneyDetails: {
        provider: { type: String, enum: ['M-Pesa'], default: 'M-Pesa' },
        phoneNumber: { 
          type: String, 
          validate: { 
            validator: (v) => /^\+?254[17]\d{8}$/.test(v), 
            message: 'Invalid Kenyan M-Pesa number' 
          } 
        },
        accountName: { type: String, trim: true },
        verified: { type: Boolean, default: false },
      },
      isAdmin: {
        type: Boolean,
        default: false,
      },
      deviceToken: { type: String },
    },
    
    // Payment/Financial
  
    
    // Push and activity
    pushSubscription: { type: Object },
    lastSeen: { type: Date, default: Date.now, index: true },
    
    // Analytics (with indexes)
    analytics: {
      totalSales: {
        amount: { type: Number, default: 0, min: 0 },
        history: [
          {
            amount: { type: Number, required: true, min: 0 },
            listingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing' },
            date: { type: Date, default: Date.now, index: true },
          },
        ],
      },
      salesCount: { type: Number, default: 0 },
      orderCount: { type: Number, default: 0 },
      profileViews: {
        total: { type: Number, default: 0 },
        uniqueViewers: { type: [String], default: [] },
        history: [
          {
            viewerId: { type: String },
            date: { type: Date, default: Date.now },
          },
        ],
      },
      lastActive: { type: Date, default: Date.now, index: true },
      listingViews: { type: Number, default: 0 },
      wishlistCount: { type: Number, default: 0 },
      cartAdditions: { type: Number, default: 0 },
      shares: {
        total: { type: Number, default: 0 },
        platforms: { type: Map, of: Number, default: {} },
      },
      responseTimeAvg: { type: Number, default: 0, min: 0 },
      reportsSubmitted: { type: Number, default: 0 },
      reportsReceived: { type: Number, default: 0 },
    },
    
    // Rating
    rating: {
      average: { type: Number, default: 0, min: 0, max: 5 },
      reviewCount: { type: Number, default: 0 },
    },
    
    // References
    listings: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Listing' }],
    orders: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Orders' }],
    wishlist: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Listing' }],
    
    // Stats
    stats: {
      activeListingsCount: { type: Number, default: 0 },
      soldListingsCount: { type: Number, default: 0 },
      pendingOrdersCount: { type: Number, default: 0 },
      completedOrdersCount: { type: Number, default: 0 },
      failedOrdersCount: { type: Number, default: 0 },
      listingFeesPaid: { type: Number, default: 0, min: 0 },
    },
    
    // Features
    isFeatured: { type: Boolean, default: false },
    badges: {
      type: [String],
      enum: ['Top Seller', 'Verified', 'Fast Responder', 'New User', 'Trusted Buyer', 'Referrer'],
      default: [],
    },
    
    // Preferences
    preferences: {
      emailNotifications: { type: Boolean, default: true },
      smsNotifications: { type: Boolean, default: false },
      marketingEmails: { type: Boolean, default: true },
    },
    
    // Referral
    referralCode: {
      type: String,
      unique: true,
      default: () => `REF${Math.random().toString(36).substr(2, 8).toUpperCase()}`,
    },
    referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    
    // Reviews
    reviews: [
      {
        reviewer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        comment: { type: String, trim: true, maxlength: 500 },
        rating: { type: Number, min: 1, max: 5, required: true },
        createdAt: { type: Date, default: Date.now, index: true },
      },
    ],
    
    // Financials
   // Financials
    financials: {
      balance: { type: Number, default: 0, min: 0 },
      swiftTransferId: { type: String },
      payoutHistory: [
        {
          amount: { type: Number, min: -Infinity }, // Allow negatives for refunds; adjust min if needed
          date: { type: Date, default: Date.now, index: true },
          method: { type: String, enum: ['M-Pesa', 'Bank'] },
          status: { type: String, enum: ['pending', 'manual_pending', 'completed', 'failed', 'refunded'], default: 'pending' },
        },
      ],
    },
  },
  { timestamps: true }
);

// Indexes for efficiency
UserSchema.index({ 'personalInfo.email': 1 });
UserSchema.index({ 'personalInfo.phone': 1 });
UserSchema.index({ 'personalInfo.location.coordinates': '2dsphere' });
UserSchema.index({ 'analytics.lastActive': -1 }); // For recent activity
UserSchema.index({ 'stats.listingFeesPaid': -1 }); // For top payers
UserSchema.index({ 'analytics.reportsReceived': 1 });
UserSchema.index({ 'analytics.reportsSubmitted': 1 });
UserSchema.index({ 'personalInfo.referralCode': 1 });
UserSchema.index({ 'listings': 1 }); // For user listings query
UserSchema.index({ rating: -1 }); // For top rated users

// Pre-save hooks
UserSchema.pre('save', function (next) {
  if (this.isModified('reviews')) {
    const reviews = this.reviews || [];
    const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
    this.rating.average = reviews.length ? totalRating / reviews.length : 0;
    this.rating.reviewCount = reviews.length;
  }

  // Profile completeness calculation (simplified)
  const locationComplete = this.personalInfo.location && this.personalInfo.location.county;
  const fields = [
    this.personalInfo.username,
    this.personalInfo.fullname,
    this.personalInfo.email,
    this.personalInfo.phone,
    this.personalInfo.profilePicture !== this.constructor.schema.paths['personalInfo.profilePicture'].defaultValue,
    this.personalInfo.bio && this.personalInfo.bio.trim().length > 0,
    locationComplete,
    Object.values(this.personalInfo.socialLinks).some(link => link && link.trim().length > 0),
  ];
  this.personalInfo.profileCompleteness = Math.round((fields.filter(Boolean).length / fields.length) * 100);

  // Update lastSeen on save if active
  this.lastSeen = new Date();

  next();
});

export const userModel = mongoose.model('User', UserSchema);