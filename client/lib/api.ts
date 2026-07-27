import axios from 'axios';

const API_BASE = 'http://localhost:5000/api/rooms'; // Your backend URL

export const createRoom = async (name: string) => {
    // This sends the POST request to your backend /api/rooms
    const res = await axios.post(`${API_BASE}/`, { name });
    return res.data; // Should return { roomCode: "..." }
};

export const joinRoom = async (name: string, roomCode: string) => {
    // This sends the POST request to your backend /api/rooms/join
    const res = await axios.post(`${API_BASE}/join`, { name, roomCode });
    return res.data;
};