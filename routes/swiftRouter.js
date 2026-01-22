import express from 'express';
import { handleSwiftWebhook, verifyTransactions, testSwiftApi  } from '../controllers/swiftController.js';
import { authUser } from '../middlewares/authMiddleware.js';

const swiftRouter = express.Router();

// swiftRouter.post('/subaccount', authUser ,createSubaccount);
swiftRouter.get('/verify/:reference', verifyTransactions);
swiftRouter.get('/test-swift/:reference', testSwiftApi); // Debug endpoint
swiftRouter.post('/webhook/swift', handleSwiftWebhook);
// swiftRouter.get('/check', authUser, checkSubAccount);
// swiftRouter.get('/verify/:reference', verifyPayment);
// swiftRouter.get("/banks", fetchBanks)


export default swiftRouter;