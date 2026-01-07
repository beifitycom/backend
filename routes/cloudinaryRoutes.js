import express from 'express';
import { deleteImage, uploadImages } from '../controllers/cloudinaryController.js';
import { authUser } from '../middlewares/authMiddleware.js';

const cloudinaryRouter = express.Router();

cloudinaryRouter.post('/upload', authUser, uploadImages);
cloudinaryRouter.post('/delete-image', authUser, deleteImage);

export default cloudinaryRouter;