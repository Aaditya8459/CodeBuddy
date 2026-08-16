import express from 'express';
import cors from 'cors';
import { runCode } from './executor.ts';

const app = express();
app.use(cors());
app.use(express.json());

app.post('/execute', async (req, res) => {
    const { code, language } = req.body;
    try {
        const output = await runCode(code, language);
        res.json({ output });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(4000, () => console.log("Worker Service running on port 4000"));