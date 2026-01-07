import express from 'express'
import { authUser } from '../middlewares/authMiddleware.js';
import { createReport, deleteReport, getAllReports, getReportById, updateReportStatus } from '../controllers/reportController.js';

const reportRouter =  express.Router()


reportRouter.post('/create-report', authUser, createReport)
// reportRouter.post('/create-seller-report', authUser, reportingSeller)


// Accessbile by few
reportRouter.get('/get-report/:id', authUser, getReportById)

// Admin only
reportRouter.put('/update-report/:id', authUser, updateReportStatus)
reportRouter.delete('/delete-report/:id', authUser, deleteReport)
reportRouter.get('/get-all-reports', authUser, getAllReports)

export default reportRouter;