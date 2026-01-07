import express from 'express';
import { generate } from '../controllers/sitemapController';

const sitemapRouter = express.Router();

sitemapRouter.get("/generate-sitemap", generate)

export default sitemapRouter