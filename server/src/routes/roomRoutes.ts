import express from 'express';
import { createRoom, joinRoom } from '../controllers/roomController';

const router = express.Router();

// Ensure these point to the correct functions
router.post('/', createRoom); 
router.post('/join', joinRoom);

export default router;