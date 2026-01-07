import express from "express";
import { getNotifications, markAllAsRead, markAsRead, savePushSubscription } from "../controllers/notificationController.js";
import { authUser } from "../middlewares/authMiddleware.js";
const notificationRouter = express.Router();

notificationRouter.post("/subscribe", authUser,  savePushSubscription);
notificationRouter.get("/:userId", authUser ,getNotifications);
notificationRouter.put("/read/:notificationId",authUser, markAsRead);
notificationRouter.put('/read-all', authUser,markAllAsRead)

export default notificationRouter;