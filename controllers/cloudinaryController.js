import { v2 as cloudinary } from 'cloudinary';
import mongoose from 'mongoose';
import { userModel } from '../models/User.js';
import sanitizeHtml from 'sanitize-html';
import logger from '../utils/logger.js';
import { sendNotification } from './notificationController.js';

// Constants
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILES_PER_REQUEST = 10;

/**
 * Upload Images
 * @route POST /api/cloudinary/upload
 * @desc Upload one or more images to Cloudinary, returning URLs and public_ids
 * @access Private (requires JWT token)
 */
export const uploadImages = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    if (!req.user) {
      logger.warn('Upload images failed: No user data in request');
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const userId = req.user._id.toString();
    const { files } = req.body; // Expect array of { data: base64, mimeType: string }

    if (!files || !Array.isArray(files) || files.length === 0) {
      logger.warn('Upload images failed: No files provided', { userId });
      return res.status(400).json({ success: false, message: 'At least one file is required' });
    }

    if (files.length > MAX_FILES_PER_REQUEST) {
      logger.warn(`Upload images failed: Too many files (${files.length})`, { userId });
      return res.status(400).json({
        success: false,
        message: `Cannot upload more than ${MAX_FILES_PER_REQUEST} files per request`,
      });
    }

    // Validate and upload images
    const uploadedImages = [];
    for (const file of files) {
      if (!file.data || !file.mimeType) {
        logger.warn('Upload images failed: Invalid file format', { userId });
        return res.status(400).json({ success: false, message: 'Each file must include data and mimeType' });
      }

      // Validate MIME type
      if (!ALLOWED_MIME_TYPES.includes(file.mimeType)) {
        logger.warn(`Upload images failed: Invalid MIME type ${file.mimeType}`, { userId });
        return res.status(400).json({
          success: false,
          message: `Invalid file type. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`,
        });
      }

      // Validate file size (approximate for base64)
      const approximateSize = (file.data.length * 3) / 4; // Base64 to bytes
      if (approximateSize > MAX_FILE_SIZE) {
        logger.warn(`Upload images failed: File too large`, { userId, size: approximateSize });
        return res.status(400).json({
          success: false,
          message: `File exceeds size limit of ${MAX_FILE_SIZE / 1024 / 1024}MB`,
        });
      }

      // Ensure base64 data is clean (remove prefix if present)
      const base64Data = file.data.replace(/^data:image\/\w+;base64,/, '');

      // Upload to Cloudinary
      const uploadResponse = await cloudinary.uploader.upload(`data:${file.mimeType};base64,${base64Data}`, {
        folder: `beifity/users/listings/${userId}`,
        transformation: [
          { width: 800, height: 800, crop: 'limit', quality: 'auto' },
          { format: 'webp' },
        ],
        resource_type: 'image',
      });

      uploadedImages.push({
        url: uploadResponse.secure_url,
        public_id: uploadResponse.public_id,
      });
    }

    // Notify user
    await sendNotification(
      userId,
      'image_uploaded',
      `You successfully uploaded ${uploadedImages.length} image(s) to your account.`,
      null,
      session
    );

    await session.commitTransaction();
    logger.info(`Uploaded ${uploadedImages.length} images by user ${userId}`);
    logger.debug('Uploaded images', { uploadedImages });
    res.status(201).json({
      success: true,
      message: `${uploadedImages.length} image(s) uploaded successfully`,
      data: uploadedImages, // Return array of { url, public_id }
    });
  } catch (error) {
    await session.abortTransaction();
    const errorMessage = error.message || 'Unknown error during image upload';
    logger.error(`Error uploading images: ${errorMessage}`, {
      stack: error.stack,
      userId: req.user?._id,
      body: req.body,
    });
    res.status(500).json({
      success: false,
      message: 'Failed to upload images',
      error: errorMessage,
    });
  } finally {
    session.endSession();
  }
};

/**
 * Delete Image
 * @route DELETE /api/cloudinary/delete
 * @desc Delete an image from Cloudinary by public_id
 * @access Private (requires JWT token)
 */
export const deleteImage = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    if (!req.user) {
      logger.warn('Delete image failed: No user data in request');
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const userId = req.user._id.toString();
    const { public_id } = req.body;

    if (!public_id) {
      logger.warn('Delete image failed: Public ID required', { userId });
      return res.status(400).json({ success: false, message: 'Public ID required' });
    }

    // Delete from Cloudinary
    const result = await cloudinary.uploader.destroy(public_id);
    if (result.result !== 'ok') {
      logger.warn(`Delete image failed: Cloudinary deletion failed for ${public_id}`, { userId });
      return res.status(400).json({ success: false, message: 'Failed to delete image from Cloudinary' });
    }

    // Notify user
    await sendNotification(
      userId,
      'image_deleted',
      `You successfully deleted an image from your account.`,
      null,
      session
    );

    await session.commitTransaction();
    logger.info(`Deleted image ${public_id} by user ${userId}`);
    res.status(200).json({
      success: true,
      message: 'Image deleted successfully',
    });
  } catch (error) {
    await session.abortTransaction();
    const errorMessage = error.message || 'Unknown error during image deletion';
    logger.error(`Error deleting image: ${errorMessage}`, {
      stack: error.stack,
      userId: req.user?._id,
      public_id: req.body?.public_id,
    });
    res.status(500).json({
      success: false,
      message: 'Failed to delete image',
      error: errorMessage,
    });
  } finally {
    session.endSession();
  }
};