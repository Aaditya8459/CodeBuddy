import express from 'express';
import {
    createRoom,
    joinRoom,
    getRoom
} from '../controllers/roomController';

const router = express.Router();

// Create a new room
router.post('/', createRoom);

// Join an existing room
router.post('/join', joinRoom);

// Get/load an existing room by ID
router.get('/:id', getRoom);

export default router;