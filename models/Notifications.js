import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId, // Reference to the User model
    ref: "User", // Assuming you have a User model
    required: true,
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId, // Reference to the User model
    ref: "User", // Assuming you have a User model
    required: true, 
  },
  type: {
    type: String, // e.g., "message", "order", "new_product"
    required: true,
  },
  content: {
    type: String, // Notification message
    required: true,
  },
  isRead: {
    type: Boolean,
    default: false, // Track if the user has read it
  },
  createdAt: {
    type: Date,
    default: Date.now, // Timestamp of creation
  },
});

export const notificationModel =  mongoose.model("Notification", notificationSchema);